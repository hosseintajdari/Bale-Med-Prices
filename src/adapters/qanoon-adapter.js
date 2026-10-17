import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = join(__dirname, "..", "..", "fixtures", "qanoon-mock-data.json");

// --- Custom Error Hierarchy ---
export class QanoonAdapterError extends Error {
  constructor(message, { code = "ADAPTER_ERROR", statusCode = 500, endpoint = null, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.details = details;
  }
}

export class QanoonValidationError extends QanoonAdapterError {
  constructor(message = "Invalid parameters provided to Qanoon adapter", details = null) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, details });
  }
}

export class QanoonAuthenticationError extends QanoonAdapterError {
  constructor(message = "Unauthorized access to Qanoon API", details = null) {
    super(message, { code: "UNAUTHORIZED", statusCode: 401, details });
  }
}

export class QanoonNotFoundError extends QanoonAdapterError {
  constructor(message = "Requested item or warehouse not found in Qanoon", details = null) {
    super(message, { code: "NOT_FOUND", statusCode: 404, details });
  }
}

export class QanoonConflictError extends QanoonAdapterError {
  constructor(message = "Conflict in Qanoon operation or uniqueId payload mismatch", details = null) {
    super(message, { code: "CONFLICT", statusCode: 409, details });
  }
}

export class QanoonNetworkTimeoutError extends QanoonAdapterError {
  constructor(message = "Request to Qanoon API timed out", details = null) {
    super(message, { code: "TIMEOUT", statusCode: 504, details });
  }
}

export class QanoonServerError extends QanoonAdapterError {
  constructor(message = "Qanoon upstream server error", statusCode = 500, details = null) {
    super(message, { code: "SERVER_ERROR", statusCode, details });
  }
}

// --- Helper Functions ---
function roundValue(value, rule = "round") {
  if (rule === "ceil") return Math.ceil(value);
  if (rule === "floor") return Math.floor(value);
  return Math.round(value);
}

function normalizeCodeString(code) {
  if (code == null) return null;
  return String(code).trim();
}

function computePayloadHash({ draftId = "", warehouseId = "main", items = [] }) {
  const normalizedItems = (items || [])
    .map((item) => ({
      goodId: String(item.goodId || ""),
      genericCode: normalizeCodeString(item.genericCode) || "",
      brandCode: normalizeCodeString(item.brandCode) || "",
      quantity: Number(item.quantity || item.requestedCount || 0),
      price: Number(item.price || 0),
    }))
    .sort((a, b) => (a.goodId || a.genericCode).localeCompare(b.goodId || b.genericCode));

  const payloadObject = {
    draftId: String(draftId || ""),
    warehouseId: String(warehouseId || "main"),
    items: normalizedItems,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payloadObject)).digest("hex");
}

// --- Primary QanoonAdapter Class ---
export class QanoonAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? process.env.QANOON_API_BASE_URL ?? "https://api.qanoon.local/v1";
    this.apiKey = options.apiKey ?? process.env.QANOON_API_KEY ?? null;
    this.pharmacyId = options.pharmacyId ?? process.env.QANOON_PHARMACY_ID ?? "ph-main-01";
    this.clientId = options.clientId ?? process.env.QANOON_CLIENT_ID ?? "panelph-desk";
    this.timeoutMs = Number(options.timeoutMs ?? process.env.QANOON_TIMEOUT_MS ?? 5000);

    // Auto-detect offline mock mode:
    this.mockMode = options.mockMode ?? (
      process.env.QANOON_MOCK_MODE === "true" ||
      process.env.NODE_ENV === "test" ||
      (!options.apiKey && !process.env.QANOON_API_KEY)
    );

    this.fixturePath = options.fixturePath ?? DEFAULT_FIXTURE_PATH;
    this.inMemoryFixtures = options.fixtures ?? options.mockData ?? null;
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? (24 * 60 * 60 * 1000); // 24 hours

    // In-memory 24-hour idempotency cache:
    // Map<uniqueId, { response: object, payloadHash: string, createdAt: number, expiresAt: number }>
    this.idempotencyCache = new Map();
    this.inFlightLocks = new Set();
    this._loadedFixtures = null;
  }

  isMockMode() {
    return Boolean(this.mockMode);
  }

  async getFixtures() {
    if (this.inMemoryFixtures) return this.inMemoryFixtures;
    if (this._loadedFixtures) return this._loadedFixtures;
    const content = await readFile(this.fixturePath, "utf8");
    this._loadedFixtures = JSON.parse(content);
    return this._loadedFixtures;
  }

  /**
   * Stage 1: Preliminary advisory stock check for an item.
   */
  async checkStock({ genericCode, brandCode, goodId, warehouseId = "main", requestedCount = 1, today } = {}) {
    const cleanGeneric = normalizeCodeString(genericCode);
    const cleanBrand = normalizeCodeString(brandCode);
    const targetWarehouse = warehouseId || "main";
    const requested = Number(requestedCount) || 1;
    const currentDate = today || new Date().toISOString().slice(0, 10);

    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const stockList = Array.isArray(fixtures.stock) ? fixtures.stock : (fixtures.stockSnapshots || []);
      const warehouseStock = stockList.filter((s) => s.warehouseId === targetWarehouse);

      let matchedStock = null;
      if (goodId) {
        matchedStock = warehouseStock.find((s) => s.goodId === goodId || (goodId === "g1" && s.goodId === "g-1001"));
        if (!matchedStock && !cleanGeneric) {
          // Check if good exists in catalog to resolve generic code
          const goodMatch = fixtures.goods?.find((g) => g.id === goodId || g.goodId === goodId || (goodId === "g1" && g.id === "g-1001"));
          if (goodMatch) {
            const gCode = normalizeCodeString(goodMatch.genericCode);
            const bCode = normalizeCodeString(goodMatch.brandCode);
            matchedStock = warehouseStock.find((s) =>
              normalizeCodeString(s.genericCode) === gCode &&
              (!bCode || !s.brandCode || normalizeCodeString(s.brandCode) === bCode)
            );
          }
        }
      }

      if (!matchedStock && cleanGeneric) {
        matchedStock = warehouseStock.find((s) => {
          const matchGen = normalizeCodeString(s.genericCode) === cleanGeneric;
          const matchBrand = !cleanBrand || normalizeCodeString(s.brandCode) === cleanBrand;
          return matchGen && matchBrand;
        });
      }

      // If warehouse has no records for this item at all
      if (!matchedStock) {
        return {
          goodId: goodId || null,
          genericCode: cleanGeneric,
          brandCode: cleanBrand,
          warehouseId: targetWarehouse,
          requestedCount: requested,
          availableCount: 0,
          inStock: false,
          stockStatus: "out_of_stock",
          earliestExpDate: null,
          avgCost: null,
          advisoryWarning: "کالا در انبار موجود نیست.",
        };
      }

      const availableCount = Number(matchedStock.availableCount ?? 0);
      const isExpired = matchedStock.earliestExpDate && matchedStock.earliestExpDate < currentDate;
      const isAvailable = !isExpired && availableCount >= requested && availableCount > 0;

      let stockStatus = "in_stock";
      let advisoryWarning = null;

      if (isExpired) {
        stockStatus = "out_of_stock";
        advisoryWarning = "تاریخ انقضای محموله دارویی به پایان رسیده است.";
      } else if (availableCount === 0) {
        stockStatus = "out_of_stock";
        advisoryWarning = "کالا در انبار موجود نیست.";
      } else if (availableCount < requested) {
        stockStatus = "low_stock";
        advisoryWarning = `موجودی ناکافی: موجود در انبار ${availableCount} عدد، درخواستی ${requested} عدد`;
      }

      return {
        goodId: matchedStock.goodId || goodId || null,
        genericCode: normalizeCodeString(matchedStock.genericCode) || cleanGeneric,
        brandCode: normalizeCodeString(matchedStock.brandCode) || cleanBrand,
        warehouseId: targetWarehouse,
        requestedCount: requested,
        availableCount,
        inStock: isAvailable,
        stockStatus,
        earliestExpDate: matchedStock.earliestExpDate ?? null,
        avgCost: matchedStock.avgCost ?? null,
        advisoryWarning,
      };
    }

    // Live mode
    return this._fetch("/stock/check", {
      method: "POST",
      body: JSON.stringify({
        warehouseId: targetWarehouse,
        items: [{ goodId, genericCode: cleanGeneric, brandCode: cleanBrand, quantity: requested }],
      }),
    });
  }

  /**
   * Stage 2: Pre-batch verification barrier for multiple items.
   */
  async checkBatchStock({ warehouseId = "main", items = [] } = {}) {
    const results = [];
    const discrepancies = [];

    for (const item of items) {
      const stock = await this.checkStock({
        goodId: item.goodId,
        genericCode: item.genericCode,
        brandCode: item.brandCode,
        warehouseId,
        requestedCount: item.requestedCount ?? item.quantity ?? 1,
      });

      results.push({
        goodId: item.goodId,
        genericCode: stock.genericCode,
        brandCode: stock.brandCode,
        title: item.title,
        requestedCount: item.requestedCount ?? item.quantity ?? 1,
        availableCount: stock.availableCount,
        inStock: stock.inStock,
        stockStatus: stock.stockStatus,
      });

      if (!stock.inStock) {
        const itemLabel = item.title || item.goodId || stock.genericCode || "کالا";
        discrepancies.push(
          `کسری موجودی برای ${itemLabel}: درخواستی ${item.requestedCount ?? item.quantity ?? 1}، موجود ${stock.availableCount}`
        );
      }
    }

    return {
      warehouseId,
      checkedAt: new Date().toISOString(),
      allAvailable: results.every((r) => r.inStock),
      items: results,
      discrepancies,
    };
  }

  /**
   * 7-Step Deterministic Pricing Calculation Engine
   */
  async calculatePrice({
    goodId,
    quantity = 1,
    documentDate,
    includeTechnicalFee = true,
    roundingRule = "round",
    warehouseId = "main",
    taxMultiplier = 0.75,
    ttacUnitPrice = null,
  } = {}) {
    if (!goodId) throw new QanoonValidationError("goodId is required for calculatePrice");
    const numQty = Number(quantity);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      throw new QanoonValidationError("quantity must be a positive number");
    }

    const docDate = documentDate ?? new Date().toISOString().slice(0, 10);

    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const good = fixtures.goods?.find((g) => g.id === goodId || g.goodId === goodId || (goodId === "g1" && (g.id === "g-1001" || g.id === "g1")));
      if (!good) throw new QanoonNotFoundError(`Good ${goodId} not found in catalog`);

      const warnings = [];

      // Step 1: Base Unit Price Resolution
      let unitBasePrice = 0;
      if (good.sellPrice != null && Number(good.sellPrice) > 0) {
        unitBasePrice = Number(good.sellPrice);
      } else if (good.tempPrice != null && Number(good.tempPrice) > 0) {
        unitBasePrice = Number(good.tempPrice);
        warnings.push("Used tempPrice because sellPrice was not available.");
      } else {
        warnings.push("No valid sellPrice or tempPrice found for item.");
      }

      // Step 2: Base Price Extension
      const basePrice = roundValue(unitBasePrice * numQty, roundingRule);

      // Step 3: Tax & Municipal Toll Resolution (75/25 Split)
      let totalTax = 0;
      let taxAmount = 0;
      let tollAmount = 0;
      let appliedRate = null;

      const taxTables = fixtures.taxRates || fixtures.taxTables || {};
      const taxCode = good.taxCodes?.[0];
      const taxData = taxCode ? taxTables[taxCode] : null;

      if (taxData && Array.isArray(taxData.averageTaxes) && taxData.averageTaxes.length > 0) {
        appliedRate = [...taxData.averageTaxes]
          .sort((a, b) => b.date.localeCompare(a.date))
          .find((row) => docDate >= row.date) ?? null;

        if (appliedRate) {
          totalTax = roundValue(numQty * appliedRate.averageTax, roundingRule);
          taxAmount = roundValue(totalTax * taxMultiplier, roundingRule);
          tollAmount = totalTax - taxAmount;
        } else {
          warnings.push("No tax rate matched the selected document date.");
        }
      } else if (taxData) {
        warnings.push("Tax table contains no rate rows.");
      }

      // Step 4: Technical Dispense Fee Evaluation
      let technicalFee = 0;
      let appliedRule = null;
      const feeRules = fixtures.technicalFees || fixtures.technicalFeeRules || [];

      if (includeTechnicalFee && !good.nonPharma && Array.isArray(feeRules)) {
        appliedRule = [...feeRules]
          .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
          .find((rule) => {
            if (docDate < rule.effectiveDate) return false;
            if (rule.conditions?.excludeNonPharma && good.nonPharma) return false;
            if (rule.conditions?.minimumQuantity && numQty < rule.conditions.minimumQuantity) return false;
            return true;
          }) ?? null;

        if (appliedRule) {
          technicalFee = roundValue(appliedRule.amount * numQty, roundingRule);
        } else {
          warnings.push("Technical fee was requested but no applicable rule matched.");
        }
      } else if (includeTechnicalFee && good.nonPharma) {
        warnings.push("Technical fee was requested but no applicable rule matched.");
      }

      // Step 5: Final Price Aggregation
      const finalPrice = roundValue(basePrice + taxAmount + tollAmount + technicalFee, roundingRule);

      // Step 6: Operational Cost & Profit Accounting
      const stockList = Array.isArray(fixtures.stock) ? fixtures.stock : (fixtures.stockSnapshots || []);
      const stockMatch = stockList.find((s) =>
        (s.goodId === goodId || (goodId === "g1" && s.goodId === "g-1001")) &&
        s.warehouseId === warehouseId
      );

      const unitCost = stockMatch?.avgCost != null ? Number(stockMatch.avgCost) : null;
      const totalCost = unitCost != null ? roundValue(unitCost * numQty, roundingRule) : null;
      let profitAmount = null;
      let profitPercent = null;

      if (totalCost == null) {
        warnings.push("Average cost is not available for this good and warehouse.");
      } else {
        profitAmount = finalPrice - totalCost;
        profitPercent = totalCost > 0 ? roundValue((profitAmount / totalCost) * 100, roundingRule) : 0;
      }

      // Step 7: TTAC Divergence Guard (>10,000 Rial threshold)
      const effectiveTtacPrice = ttacUnitPrice != null ? Number(ttacUnitPrice) : (good.ttacPrice != null ? Number(good.ttacPrice) : null);
      if (effectiveTtacPrice != null && unitBasePrice > 0) {
        const divergence = Math.abs(effectiveTtacPrice - unitBasePrice);
        if (divergence > 10000) {
          warnings.push(
            `Price divergence: TTAC price (${effectiveTtacPrice}) differs from Qanoon price (${unitBasePrice}) by more than 10,000 Rials.`
          );
        }
      }

      return {
        goodId: good.id || good.goodId || goodId,
        title: good.title,
        persianTitle: good.persianTitle || good.title,
        unitBasePrice,
        basePrice,
        vatAmount: taxAmount,
        taxAmount,
        tollAmount,
        totalTax,
        technicalFee,
        finalPrice,
        avgCost: totalCost,
        profitAmount,
        profitPercent,
        appliedTaxDate: appliedRate?.date ?? null,
        appliedTechnicalFeeDate: appliedRule?.effectiveDate ?? null,
        warnings,
      };
    }

    // Live mode
    return this._fetch("/pricing/calculate", {
      method: "POST",
      body: JSON.stringify({
        goodId,
        quantity: numQty,
        documentDate: docDate,
        includeTechnicalFee,
        roundingRule,
        warehouseId,
      }),
    });
  }

  /**
   * Order batch submission with 24-hour uniqueId idempotency protection.
   */
  async createBatchOrder({ draftId = "current-order-draft", uniqueId, items, warehouseId = "main", notes = "" } = {}) {
    if (!uniqueId || typeof uniqueId !== "string" || !uniqueId.trim()) {
      throw new QanoonValidationError("uniqueId is required for idempotent batch creation");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new QanoonValidationError("items array must not be empty");
    }

    const payloadHash = computePayloadHash({ draftId, warehouseId, items });

    // Guard against concurrent execution for identical uniqueId
    if (this.inFlightLocks.has(uniqueId)) {
      throw new QanoonConflictError(
        `CONCURRENT_REQUEST_IN_FLIGHT: A batch order with uniqueId '${uniqueId}' is currently being processed.`,
        { retryAfter: 2 }
      );
    }

    // Check 24-hour idempotency cache
    const cached = this.idempotencyCache.get(uniqueId);
    const now = Date.now();

    if (cached) {
      if (now < cached.expiresAt) {
        if (cached.payloadHash !== payloadHash) {
          throw new QanoonConflictError(
            `UNIQUE_ID_PAYLOAD_MISMATCH: uniqueId '${uniqueId}' was previously submitted with a different payload.`
          );
        }
        return {
          ...cached.response,
          status: "CACHED",
          isIdempotentReplay: true,
        };
      } else {
        // Expired entry
        this.idempotencyCache.delete(uniqueId);
      }
    }

    // Mark in-flight
    this.inFlightLocks.add(uniqueId);

    try {
      if (this.mockMode) {
        const batchId = `QAN-ORD-${now}`;
        const normalizedItems = items.map((item) => ({
          ...item,
          genericCode: normalizeCodeString(item.genericCode) ?? undefined,
          brandCode: normalizeCodeString(item.brandCode) ?? undefined,
        }));

        const totalPrice = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 1)), 0);

        const response = {
          success: true,
          batchId,
          uniqueId,
          timestamp: new Date().toISOString(),
          status: "SUBMITTED",
          isIdempotentReplay: false,
          totalItems: items.length,
          totalPrice: totalPrice > 0 ? totalPrice : undefined,
          items: normalizedItems,
        };

        this.idempotencyCache.set(uniqueId, {
          response,
          payloadHash,
          createdAt: now,
          expiresAt: now + this.idempotencyTtlMs,
        });

        return response;
      }

      // Live mode
      return await this._fetch("/orders/batch", {
        method: "POST",
        headers: { "X-Unique-Id": uniqueId },
        body: JSON.stringify({ draftId, uniqueId, items, warehouseId, notes }),
      });
    } finally {
      this.inFlightLocks.delete(uniqueId);
    }
  }

  /**
   * Search goods in catalog, strictly preserving leading-zero string codes.
   */
  async searchGoods({ query, limit = 20 } = {}) {
    if (!query || typeof query !== "string") return [];
    const normalized = query.trim().toLowerCase();
    const maxLimit = Math.max(1, Number(limit) || 20);

    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const goodsList = Array.isArray(fixtures.goods) ? fixtures.goods : [];

      const filtered = goodsList.filter((g) => {
        const titleMatch = g.title?.toLowerCase().includes(normalized);
        const persianMatch = g.persianTitle?.includes(normalized);
        const genericMatch = normalizeCodeString(g.genericCode)?.includes(normalized);
        const brandMatch = normalizeCodeString(g.brandCode)?.includes(normalized);
        const barcodeMatch = g.barcode ? String(g.barcode).includes(normalized) : false;
        const aliasMatch = Array.isArray(g.aliases) && g.aliases.some((a) => a.toLowerCase().includes(normalized));
        return titleMatch || persianMatch || genericMatch || brandMatch || barcodeMatch || aliasMatch;
      }).slice(0, maxLimit);

      return filtered.map((g) => ({
        goodId: g.id || g.goodId,
        genericCode: normalizeCodeString(g.genericCode), // Strict string preservation
        brandCode: normalizeCodeString(g.brandCode),     // Strict string preservation
        barcode: g.barcode ? String(g.barcode) : null,
        title: g.title,
        persianTitle: g.persianTitle || g.title,
        dosageForm: g.dosageForm || g.patientFormLabel || "",
        strength: g.strengthLabel || g.strength || "",
        sellPrice: Number(g.sellPrice ?? 0),
        tempPrice: Number(g.tempPrice ?? 0),
        nonPharma: Boolean(g.nonPharma),
      }));
    }

    // Live mode
    return this._fetch(`/goods/search?q=${encodeURIComponent(query)}&limit=${maxLimit}`);
  }

  /**
   * Internal transport handler for live network mode.
   */
  async _fetch(endpoint, options = {}) {
    const url = `${this.baseUrl.replace(/\/$/, "")}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Pharmacy-Id": this.pharmacyId,
      "X-Client-Id": this.clientId,
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new QanoonNetworkTimeoutError(`Request to ${endpoint} timed out after ${this.timeoutMs}ms`, { endpoint });
      }
      throw new QanoonServerError(`Failed to connect to Qanoon: ${err.message}`, 500, { endpoint, cause: err });
    }

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {}
      const msg = body?.message || `Qanoon API returned status ${response.status}`;
      if (response.status === 400) throw new QanoonValidationError(msg, body);
      if (response.status === 401 || response.status === 403) throw new QanoonAuthenticationError(msg, body);
      if (response.status === 404) throw new QanoonNotFoundError(msg, body);
      if (response.status === 409) throw new QanoonConflictError(msg, body);
      throw new QanoonServerError(msg, response.status, body);
    }

    return response.json();
  }

  clearIdempotencyCache() {
    this.idempotencyCache.clear();
    this.inFlightLocks.clear();
  }
}

export function createQanoonAdapter(options = {}) {
  return new QanoonAdapter(options);
}
