import assert from "node:assert/strict";
import {
  searchCatalog,
  resolveItem,
  normalizeDigits,
  normalizeText,
  normalizeCodeString,
  createCatalogResolver,
} from "../../../src/catalog-resolver.js";
import {
  readJsonBody,
  runExportBatch,
  startServer,
} from "../../../src/server.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Readable } from "node:stream";

console.log("=== STARTING ADVERSARIAL INTEGRITY VERIFICATION ===");

// TEST 1: Boundary & Type Handling in catalog-resolver
console.log("Test 1: Boundary & Type Handling in catalog-resolver...");
assert.deepStrictEqual(searchCatalog(""), []);
assert.deepStrictEqual(searchCatalog("   "), []);
assert.deepStrictEqual(searchCatalog(null), []);
assert.deepStrictEqual(searchCatalog(undefined), []);
assert.deepStrictEqual(searchCatalog(12345), []);

assert.strictEqual(normalizeDigits(null), "");
assert.strictEqual(normalizeDigits(undefined), "");
assert.strictEqual(normalizeDigits(123), "123");
assert.strictEqual(normalizeCodeString(null), "");
assert.strictEqual(normalizeCodeString("  00120  "), "00120");
assert.strictEqual(normalizeCodeString(120), "120");

// TEST 2: Dynamic scoring without hardcoded cheats
console.log("Test 2: Dynamic scoring verification with randomized data...");
const customCatalog = [
  {
    goodId: "rand-999",
    genericCode: "00077",
    brandCode: "00088",
    barcode: "6260000000771",
    title: "Randomized Pharma Formulation A",
    persianTitle: "فرمول دارویی تصادفی الف",
    dosageForm: "کپسول",
    strength: "250 mg",
    sellPrice: 50000,
    aliases: ["فرمول الف", "random A"],
  },
  {
    goodId: "rand-888",
    genericCode: "00078",
    brandCode: "00089",
    barcode: "6260000000782",
    title: "Randomized Pharma Formulation B",
    persianTitle: "فرمول دارویی تصادفی ب",
    dosageForm: "قرص",
    strength: "500 mg",
    sellPrice: 75000,
    aliases: ["فرمول ب", "random B"],
  },
];

const resolver = createCatalogResolver({ catalog: customCatalog });
const rCode = resolver.searchCatalog("00077");
assert.strictEqual(rCode.length, 1);
assert.strictEqual(rCode[0].genericCode, "00077");
assert.strictEqual(rCode[0].score, 1.0);

const rPersian = resolver.searchCatalog("فرمول ب");
assert.ok(rPersian.length >= 1);
assert.strictEqual(rPersian[0].genericCode, "00078");
assert.strictEqual(rPersian[0].score, 0.97);

// Ambiguity test on custom catalog
const customAmbiguous = [
  { genericCode: "00001", brandCode: "00001", title: "Amox 500", aliases: ["آموکس"] },
  { genericCode: "00002", brandCode: "00001", title: "Amox 250", aliases: ["آموکس"] },
];
const ambRes = resolveItem("آموکس", null, { catalog: customAmbiguous });
assert.strictEqual(ambRes.isAmbiguous, true);
assert.strictEqual(ambRes.resolved, false);
console.log("✔ Dynamic scoring & ambiguity logic passed on arbitrary inputs.");

// TEST 3: REST Server live interaction & security limits
console.log("Test 3: REST Server live execution and payload limit enforcement...");
const dir = await mkdtemp(join(tmpdir(), "panelph-adv-"));
const statePath = join(dir, "draft.json");
const server = startServer({ port: 0, statePath });
await once(server, "listening");
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // Check readJsonBody 413 error directly
  const fakeStream = Readable.from([Buffer.alloc(1024 * 1024 + 50, "x")]);
  await assert.rejects(
    async () => readJsonBody(fakeStream, { maxBytes: 1024 * 1024 }),
    (err) => err.statusCode === 413 && err.code === "PAYLOAD_TOO_LARGE"
  );
  console.log("✔ 413 Payload Too Large correctly rejected by readJsonBody.");

  // Check 404 for invalid route
  const notFound = await fetch(`${baseUrl}/api/unknown-endpoint`);
  assert.strictEqual(notFound.status, 404);
  console.log("✔ 404 returned for unknown API route.");

  // Check CORS headers on REST
  const corsRes = await fetch(`${baseUrl}/api/draft`, { method: "OPTIONS" });
  assert.strictEqual(corsRes.status, 204);
  assert.strictEqual(corsRes.headers.get("access-control-allow-origin"), "*");
  console.log("✔ CORS preflight valid.");

  // Verify full export-batch discrepancy logic
  // 1. Add need
  const needRes = await fetch(`${baseUrl}/api/draft/needs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "داروی ناموجود", quantity: 5 }),
  });
  const needData = await needRes.json();
  const needId = needData.need.id;

  // 2. Resolve need with out-of-stock item (g-1006 from fixtures: availableCount = 0)
  await fetch(`${baseUrl}/api/draft/needs/${needId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reference: {
        goodId: "g-1006",
        title: "داروی ناموجود در انبار",
        genericCode: "00999",
        brandCode: "00099",
      },
    }),
  });

  // 3. Export batch -> should fail due to out-of-stock discrepancy
  const exportRes = await fetch(`${baseUrl}/api/orders/export-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId: "current-order-draft" }),
  });
  const exportData = await exportRes.json();
  assert.strictEqual(exportData.success, false, "Must block export for out of stock items");
  assert.strictEqual(exportData.status, "DISCREPANCIES_DETECTED");
  assert.ok(
    exportData.discrepancies.some((d) => d.includes("کسری موجودی")),
    "Discrepancies must include out-of-stock warning"
  );
  console.log("✔ Out-of-stock discrepancy barrier successfully blocked export.");

} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}

console.log("=== ALL ADVERSARIAL VERIFICATIONS PASSED SUCCESSFULLY ===");
