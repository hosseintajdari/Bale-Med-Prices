"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";

const defaultDate = "2026-06-24";
const defaultApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface SearchItem {
  id: string;
  internalCode: string;
  barcode: string;
  genericCode: string;
  title: string;
  brand: string;
  sellPrice: number;
  tempPrice?: number;
  nonPharma: boolean;
}

interface SearchResponse {
  items: SearchItem[];
  total: number;
}

interface PricingResult {
  goodId: string;
  quantity: number;
  unitBasePrice: number;
  basePrice: number;
  taxAmount: number;
  tollAmount: number;
  totalTax: number;
  technicalFee: number;
  finalPrice: number;
  avgCost: number | null;
  profitAmount: number | null;
  profitPercent: number | null;
  appliedTaxDate: string | null;
  appliedTechnicalFeeDate: string | null;
  warnings: string[];
}

interface PricingFormState {
  goodId: string;
  documentDate: string;
  quantity: string;
  warehouseId: string;
  includeTechnicalFee: boolean;
}

function formatCurrency(value: number | null) {
  if (value == null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

async function readJson(response: Response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export function PricingWorkbench() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedGood, setSelectedGood] = useState<SearchItem | null>(null);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [form, setForm] = useState<PricingFormState>({
    goodId: "",
    documentDate: defaultDate,
    quantity: "1",
    warehouseId: "main",
    includeTechnicalFee: true
  });

  useEffect(() => {
    let ignore = false;

    async function runSearch() {
      try {
        setIsSearching(true);
        setSearchError(null);

        const term = deferredQuery.trim();
        const response = await fetch(
          `${defaultApiBaseUrl}/goods/search?q=${encodeURIComponent(term)}`
        );
        const payload = (await readJson(response)) as SearchResponse;

        if (ignore) {
          return;
        }

        startTransition(() => {
          setSearchResults(payload.items);
        });
      } catch (error) {
        if (ignore) {
          return;
        }

        startTransition(() => {
          setSearchResults([]);
          setSearchError(error instanceof Error ? error.message : "Search failed");
        });
      } finally {
        if (!ignore) {
          setIsSearching(false);
        }
      }
    }

    runSearch();

    return () => {
      ignore = true;
    };
  }, [deferredQuery]);

  function selectGood(good: SearchItem) {
    setSelectedGood(good);
    setForm((current) => ({
      ...current,
      goodId: good.id
    }));
    setPricingResult(null);
    setPricingError(null);
  }

  function updateField<Key extends keyof PricingFormState>(
    key: Key,
    value: PricingFormState[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    async function runCalculation() {
      try {
        setIsCalculating(true);
        setPricingError(null);

        const response = await fetch(`${defaultApiBaseUrl}/pricing/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            goodId: form.goodId,
            documentDate: form.documentDate,
            quantity: Number(form.quantity),
            warehouseId: form.warehouseId,
            includeTechnicalFee: form.includeTechnicalFee
          })
        });

        const payload = (await readJson(response)) as PricingResult;
        startTransition(() => {
          setPricingResult(payload);
        });
      } catch (error) {
        startTransition(() => {
          setPricingResult(null);
          setPricingError(error instanceof Error ? error.message : "Calculation failed");
        });
      } finally {
        setIsCalculating(false);
      }
    }

    runCalculation();
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 24,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        alignItems: "start"
      }}
    >
      <div
        style={{
          borderRadius: 24,
          padding: 20,
          background:
            "linear-gradient(180deg, rgba(246,250,245,1) 0%, rgba(233,245,239,1) 100%)",
          border: "1px solid rgba(56, 110, 87, 0.14)"
        }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Search goods</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, barcode, generic code, internal code"
              style={{
                borderRadius: 14,
                border: "1px solid #bdd3c7",
                padding: "12px 14px",
                background: "#ffffff"
              }}
            />
          </label>

          {searchError ? (
            <p style={{ margin: 0, color: "#a33f1f" }}>{searchError}</p>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            {isSearching ? (
              <p style={{ margin: 0, color: "#436255" }}>Searching...</p>
            ) : null}

            {searchResults.map((good) => {
              const isActive = selectedGood?.id === good.id;

              return (
                <button
                  key={good.id}
                  type="button"
                  onClick={() => selectGood(good)}
                  style={{
                    textAlign: "left",
                    borderRadius: 18,
                    border: isActive ? "1px solid #1a6b4d" : "1px solid #d9e6de",
                    background: isActive ? "#edf8f2" : "#ffffff",
                    padding: 14,
                    cursor: "pointer"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 6 }}>{good.title}</strong>
                  <span style={{ display: "block", color: "#456356", fontSize: 13 }}>
                    {good.brand} · {good.genericCode}
                  </span>
                  <span style={{ display: "block", color: "#5e7c6c", fontSize: 12, marginTop: 4 }}>
                    {good.id} · {good.barcode}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          borderRadius: 24,
          padding: 24,
          background: "#fffdf8",
          border: "1px solid rgba(118, 90, 42, 0.12)",
          display: "grid",
          gap: 20
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 24 }}>Pricing Workbench</h2>
          <p style={{ margin: 0, color: "#5d594f" }}>
            Pick a good from the left, review inputs, and calculate the final price.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
          }}
        >
          <label style={{ display: "grid", gap: 8 }}>
            <span>Good id</span>
            <input
              value={form.goodId}
              onChange={(event) => updateField("goodId", event.target.value)}
              placeholder="g-1001"
              style={{ borderRadius: 14, border: "1px solid #d8d1c2", padding: "12px 14px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>Document date</span>
            <input
              value={form.documentDate}
              onChange={(event) => updateField("documentDate", event.target.value)}
              placeholder={defaultDate}
              style={{ borderRadius: 14, border: "1px solid #d8d1c2", padding: "12px 14px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>Quantity</span>
            <input
              min="1"
              type="number"
              value={form.quantity}
              onChange={(event) => updateField("quantity", event.target.value)}
              style={{ borderRadius: 14, border: "1px solid #d8d1c2", padding: "12px 14px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>Warehouse</span>
            <input
              value={form.warehouseId}
              onChange={(event) => updateField("warehouseId", event.target.value)}
              style={{ borderRadius: 14, border: "1px solid #d8d1c2", padding: "12px 14px" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              gridColumn: "1 / -1"
            }}
          >
            <input
              checked={form.includeTechnicalFee}
              onChange={(event) => updateField("includeTechnicalFee", event.target.checked)}
              type="checkbox"
            />
            <span>Include technical fee</span>
          </label>

          <button
            type="submit"
            style={{
              gridColumn: "1 / -1",
              borderRadius: 16,
              border: "none",
              background: "#174d38",
              color: "#ffffff",
              padding: "14px 18px",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            {isCalculating ? "Calculating..." : "Calculate final price"}
          </button>
        </form>

        {selectedGood ? (
          <div
            style={{
              borderRadius: 18,
              background: "#f5f1e7",
              padding: 16,
              color: "#4a4336"
            }}
          >
            <strong style={{ display: "block", marginBottom: 6 }}>{selectedGood.title}</strong>
            <span>
              {selectedGood.brand} · sell price {formatCurrency(selectedGood.sellPrice)}
            </span>
          </div>
        ) : null}

        {pricingError ? <p style={{ margin: 0, color: "#a33f1f" }}>{pricingError}</p> : null}

        {pricingResult ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
            }}
          >
            {[
              ["Base price", formatCurrency(pricingResult.basePrice)],
              ["Tax amount", formatCurrency(pricingResult.taxAmount)],
              ["Toll amount", formatCurrency(pricingResult.tollAmount)],
              ["Technical fee", formatCurrency(pricingResult.technicalFee)],
              ["Final price", formatCurrency(pricingResult.finalPrice)],
              ["Average cost", formatCurrency(pricingResult.avgCost)],
              ["Profit amount", formatCurrency(pricingResult.profitAmount)],
              [
                "Profit percent",
                pricingResult.profitPercent == null ? "Unavailable" : `${pricingResult.profitPercent}%`
              ]
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  borderRadius: 18,
                  padding: 16,
                  background: "#f8f8f6",
                  border: "1px solid #ebe6d9"
                }}
              >
                <span style={{ display: "block", color: "#6c675c", marginBottom: 6 }}>{label}</span>
                <strong style={{ fontSize: 20 }}>{value}</strong>
              </div>
            ))}

            <div
              style={{
                gridColumn: "1 / -1",
                borderRadius: 18,
                padding: 16,
                background: "#fcfaf4",
                border: "1px solid #ebe6d9"
              }}
            >
              <strong style={{ display: "block", marginBottom: 8 }}>Applied rules</strong>
              <div style={{ color: "#645f53" }}>
                Tax date: {pricingResult.appliedTaxDate ?? "Unavailable"}
              </div>
              <div style={{ color: "#645f53" }}>
                Technical fee date: {pricingResult.appliedTechnicalFeeDate ?? "Unavailable"}
              </div>
              {pricingResult.warnings.length > 0 ? (
                <ul style={{ margin: "12px 0 0", paddingInlineStart: 18 }}>
                  {pricingResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
