import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { goodsController } from "../controllers/goods-controller.ts";
import { pricingController } from "../controllers/pricing-controller.ts";
import { goodsService } from "./goods-service.ts";
import { pricingService } from "./pricing-service.ts";

function invokeGoodsSearchController(url) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  goodsController.search({ url }, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(body)
  };
}

async function invokePricingController(url, payload) {
  let body = "";
  const request = Readable.from([Buffer.from(JSON.stringify(payload))]);
  request.url = url;

  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  await pricingController.calculate(request, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(body)
  };
}

test("goodsService search supports Persian and English aliases", () => {
  const englishResult = goodsService.search({ query: "amox" });
  const persianResult = goodsService.search({ query: "لوزارتان" });

  assert.equal(englishResult.total, 1);
  assert.equal(englishResult.items[0].id, "g-1001");
  assert.equal(englishResult.items[0].unitLabel, "capsule");

  assert.equal(persianResult.total, 1);
  assert.equal(persianResult.items[0].id, "g-1003");
  assert.equal(persianResult.items[0].persianTitle, "لوزارتان ۵۰ میلی گرم");
});

test("goodsController can return telegram-friendly search payload", () => {
  const result = invokeGoodsSearchController("/goods/search?q=vit&format=telegram");

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.copyReady, true);
  assert.equal(result.body.total, 1);
  assert.match(result.body.text, /Search: vit/);
  assert.match(result.body.text, /Vitamin D3 1000 IU/);
  assert.equal(result.body.items[0].id, "g-1005");
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
  assert.match(result.telegram.text, /قیمت هر شربت:/);
});

test("pricingController can return telegram-friendly compact payload", async () => {
  const result = await invokePricingController("/pricing/calculate?format=telegram", {
    goodId: "g-1003",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.goodId, "g-1003");
  assert.equal(result.body.copyReady, true);
  assert.equal(result.body.parseMode, "plain_text");
  assert.match(result.body.text, /Losartan 50mg Tablet/);
  assert.match(result.body.text, /قیمت هر قرص:/);
});
