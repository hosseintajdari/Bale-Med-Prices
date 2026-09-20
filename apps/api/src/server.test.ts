import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { server } from "./server.ts";

let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

test("HTTP server handles OPTIONS requests with CORS headers", async () => {
  const response = await fetch(`${baseUrl}/goods/search`, { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
});

test("HTTP server serves static index.html on root path", async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const text = await response.text();
  assert.ok(text.includes("<html") || text.includes("<!DOCTYPE") || text.length > 0);
});

test("HTTP server handles goods search endpoint", async () => {
  const response = await fetch(`${baseUrl}/goods/search?q=aspirin`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data);
  assert.ok("items" in data);
  assert.ok(Array.isArray(data.items));
});

test("HTTP server handles bot lookup endpoint", async () => {
  const response = await fetch(`${baseUrl}/bot/lookup?q=amoxicillin`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data);
  assert.ok("replyText" in data || "kind" in data || "items" in data || "text" in data);
});

test("HTTP server handles /health liveness probe", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "ok");
  assert.equal(data.service, "bale-med-prices");
  assert.ok(data.timestamp);
});

test("HTTP server returns 404 for unknown routes", async () => {
  const response = await fetch(`${baseUrl}/non-existent-route-for-test`);
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.equal(text, "Not found");
});

test("HTTP server returns 400 for malformed JSON in pricing calculate", async () => {
  const response = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid-json{{{"
  });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.ok(data.error);
});

test("HTTP server handles goods getById endpoint", async () => {
  const searchRes = await fetch(`${baseUrl}/goods/search?q=amoxicillin`);
  const searchData = await searchRes.json();
  assert.ok(searchData.items.length > 0);
  const targetId = searchData.items[0].id;

  const itemRes = await fetch(`${baseUrl}/goods/${targetId}`);
  assert.equal(itemRes.status, 200);
  const itemData = await itemRes.json();
  assert.equal(itemData.id, targetId);
  assert.ok(itemData.title);

  const missingRes = await fetch(`${baseUrl}/goods/non-existent-id-9999`);
  assert.equal(missingRes.status, 404);
  const missingData = await missingRes.json();
  assert.ok(missingData.error);
});

test("HTTP server returns 503 for telegram webhook when bot unconfigured", async () => {
  const response = await fetch(`${baseUrl}/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ update_id: 100 })
  });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.ok(data.error);
});

test("HTTP server handles bot select endpoint and callback data validation", async () => {
  const invalidRes = await fetch(`${baseUrl}/bot/select?callbackData=bad-format`);
  assert.equal(invalidRes.status, 400);
  const invalidData = await invalidRes.json();
  assert.ok(invalidData.error);

  const lookupRes = await fetch(`${baseUrl}/bot/lookup?q=amoxicillin`);
  assert.equal(lookupRes.status, 200);
  const lookupData = await lookupRes.json();

  if (lookupData.sessionId && lookupData.choices?.length > 0) {
    const choiceId = lookupData.choices[0].id;
    const selectRes = await fetch(
      `${baseUrl}/bot/select?sessionId=${lookupData.sessionId}&choiceId=${choiceId}`
    );
    assert.equal(selectRes.status, 200);
    const selectData = await selectRes.json();
    assert.equal(selectData.type, "resolved");
    assert.ok(selectData.pricing);
  }
});

test("HTTP server validates pricing calculation input fields", async () => {
  // Missing goodId
  const missingGoodRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentDate: "2026-03-01" })
  });
  assert.equal(missingGoodRes.status, 400);
  const missingGoodData = await missingGoodRes.json();
  assert.match(missingGoodData.error, /goodId/i);

  // Missing documentDate
  const missingDateRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goodId: "g1" })
  });
  assert.equal(missingDateRes.status, 400);
  const missingDateData = await missingDateRes.json();
  assert.match(missingDateData.error, /documentDate/i);

  // Invalid quantity
  const invalidQtyRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goodId: "g1", documentDate: "2026-03-01", quantity: -5 })
  });
  assert.equal(invalidQtyRes.status, 400);
  const invalidQtyData = await invalidQtyRes.json();
  assert.match(invalidQtyData.error, /quantity/i);
});

test("HTTP server handles telegram-formatted goods search", async () => {
  const response = await fetch(`${baseUrl}/goods/search?q=amoxicillin&format=telegram`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.copyReady, true);
  assert.ok(typeof data.text === "string");
  assert.match(data.text, /Search:/);
});

test("HTTP server performs price response caching with X-Cache headers and stats", async () => {
  // Clear cache initially
  const clearRes = await fetch(`${baseUrl}/pricing/cache/clear`, { method: "POST" });
  assert.equal(clearRes.status, 200);

  const payload = {
    goodId: "g-1004",
    documentDate: "2026-06-24",
    quantity: 2,
    includeTechnicalFee: true
  };

  // 1. Initial request -> Cache MISS
  const firstRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(firstRes.status, 200);
  assert.equal(firstRes.headers.get("x-cache"), "MISS");
  const firstData = await firstRes.json();
  assert.ok(firstData.consumerTotalPrice);

  // 2. Subsequent identical request -> Cache HIT
  const secondRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(secondRes.status, 200);
  assert.equal(secondRes.headers.get("x-cache"), "HIT");
  const secondData = await secondRes.json();
  assert.deepEqual(secondData, firstData);

  // 3. Bypass cache via Cache-Control: no-cache header
  const bypassRes = await fetch(`${baseUrl}/pricing/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache"
    },
    body: JSON.stringify(payload)
  });
  assert.equal(bypassRes.status, 200);
  assert.equal(bypassRes.headers.get("x-cache"), "MISS");

  // 4. Inspect cache stats endpoint
  const statsRes = await fetch(`${baseUrl}/pricing/cache/stats`);
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json();
  assert.ok(stats.hits >= 1);
  assert.ok(stats.size >= 1);
});


