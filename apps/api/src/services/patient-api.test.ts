import test from "node:test";
import assert from "node:assert/strict";
import { goodsService } from "./goods-service.ts";
import { pricingService } from "./pricing-service.ts";

test("goodsService search supports Persian and English aliases", () => {
  const englishResult = goodsService.search("/goods/search?q=amox");
  const persianResult = goodsService.search("/goods/search?q=لوزارتان");

  assert.equal(englishResult.total, 1);
  assert.equal(englishResult.items[0].id, "g-1001");
  assert.equal(englishResult.items[0].unitLabel, "capsule");

  assert.equal(persianResult.total, 1);
  assert.equal(persianResult.items[0].id, "g-1003");
  assert.equal(persianResult.items[0].persianTitle, "لوزارتان ۵۰ میلی گرم");
});

test("goodsService can return telegram-friendly search payload", () => {
  const result = goodsService.search("/goods/search?q=vit&format=telegram");

  assert.equal(result.copyReady, true);
  assert.equal(result.total, 1);
  assert.match(result.text, /Search: vit/);
  assert.match(result.text, /Vitamin D3 1000 IU/);
  assert.equal(result.items[0].id, "g-1005");
});

test("pricingService returns patient-facing consumer pricing fields", () => {
  const result = pricingService.calculate({
    goodId: "g-1004",
    documentDate: "2026-06-24",
    quantity: 2,
    warehouseId: "branch-2",
    includeTechnicalFee: true
  });

  assert.equal(result.goodId, "g-1004");
  assert.equal(result.persianTitle, "شربت سرفه ۱۲۰ میلی لیتر");
  assert.equal(result.unitLabel, "bottle");
  assert.equal(result.consumerUnitPrice, 128000);
  assert.equal(result.consumerTotalPrice, 256000);
  assert.equal(result.finalConsumerPrice, 304200);
  assert.equal(result.packEstimatedPrice, 304200);
  assert.equal(result.sourceHints[0].key, "qanoon");
  assert.equal(result.sourceHints[1].key, "ttac");
  assert.equal(result.telegram.copyReady, true);
  assert.match(result.telegram.text, /Unit price:/);
});

test("pricingService can return telegram-friendly compact payload", () => {
  const result = pricingService.calculate({
    goodId: "g-1003",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true,
    format: "telegram"
  });

  assert.equal(result.goodId, "g-1003");
  assert.equal(result.copyReady, true);
  assert.equal(result.parseMode, "plain_text");
  assert.match(result.text, /Losartan 50mg Tablet/);
  assert.match(result.text, /Unit price:/);
});
