import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { goodsController } from "../controllers/goods-controller.ts";
import { pricingController } from "../controllers/pricing-controller.ts";
import { goodsService } from "./goods-service.ts";
import { pricingService } from "./pricing-service.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";

async function invokeGoodsSearchController(url) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  await goodsController.search({ url }, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(body)
  };
}

function invokeGoodsGetByIdController(url) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  goodsController.getById({ url }, response);

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

const patientSearchQualityCases = [
  {
    name: "common Persian misspelling",
    query: "استامنوفن",
    expectedIds: ["g-1006"]
  },
  {
    name: "Arabic digits in strength",
    query: "استامینوفن ٥٠٠",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "strength joined to medicine name",
    query: "استامینوفن۵۰۰",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "punctuation between medicine and strength",
    query: "استامینوفن-۵۰۰",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "joined Persian strength unit",
    query: "استامینوفن ۵۰۰میلیگرم",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "abbreviated Persian strength unit",
    query: "استامینوفن 500مگ",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "English strength unit with Persian name",
    query: "استامینوفن 500mg",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "Arabic alef variant",
    query: "آستامینوفن",
    expectedIds: ["g-1006"]
  },
  {
    name: "extra spaces inside medicine name",
    query: "استا مینو فن ۵۰۰",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "Persian multiplier word in strength",
    query: "ویتامین د ۳ هزار",
    expectedFirstId: "g-1005",
    expectedTotal: 1
  },
  {
    name: "Persian diacritics and kashida marks",
    query: "اِستـامینوفن",
    expectedIds: ["g-1006"]
  },
  {
    name: "dot between strength and unit",
    query: "استامینوفن 500.mg",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "parenthesized strength",
    query: "استامینوفن (۵۰۰)",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "slash between medicine and strength",
    query: "استامینوفن/۵۰۰",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  },
  {
    name: "English medicine with joined strength",
    query: "acetaminophen500",
    expectedFirstId: "g-1006",
    expectedTotal: 1
  }
];

for (const searchCase of patientSearchQualityCases) {
  test(`goodsService search handles patient input: ${searchCase.name}`, () => {
    const result = goodsService.search({ query: searchCase.query });

    if (searchCase.expectedTotal != null) {
      assert.equal(result.total, searchCase.expectedTotal);
    } else {
      assert.ok(result.total >= searchCase.expectedIds.length);
    }

    if (searchCase.expectedFirstId) {
      assert.equal(result.items[0].id, searchCase.expectedFirstId);
    }

    if (searchCase.expectedIds) {
      for (const expectedId of searchCase.expectedIds) {
        assert.ok(result.items.some((item) => item.id === expectedId));
      }
    }
  });
}

test("goodsService search ranks the requested strength first when several medicines match", () => {
  const result = goodsService.search({ query: "استامینوفن ۳۲۵" });

  assert.ok(result.total > 1);
  assert.equal(result.items[0].id, "g-1007");
});

test("goodsService search tolerates small typos in patient-entered dosage forms", () => {
  const result = goodsService.search({ query: "استامینوفن قرث" });

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["g-1006", "g-1007"]
  );
});

test("goodsController can return telegram-friendly search payload", async () => {
  const result = await invokeGoodsSearchController("/goods/search?q=vit&format=telegram");

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.copyReady, true);
  assert.equal(result.body.total, 1);
  assert.match(result.body.text, /دارو پیدا شد/);
  assert.match(result.body.text, /ویتامین د/);
  assert.equal(result.body.items[0].id, "g-1005");
});

test("goodsController default search keeps source metadata but hides internal fields", async () => {
  const result = await invokeGoodsSearchController("/goods/search?q=los");

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].id, "g-1003");
  assert.equal(result.body.items[0].consumerUnitPrice, 96000);
  assert.equal(result.body.items[0].sources[0].key, "internal");
  assert.equal(result.body.items[0].sources[1].key, "ttac");
  assert.equal("internalCode" in result.body.items[0], false);
  assert.equal("barcode" in result.body.items[0], false);
  assert.equal("genericCode" in result.body.items[0], false);
  assert.equal("sellPrice" in result.body.items[0], false);
  assert.equal("tempPrice" in result.body.items[0], false);
  assert.equal("nonPharma" in result.body.items[0], false);
});

test("goodsController getById returns patient-safe fields only", () => {
  const result = invokeGoodsGetByIdController("/goods/g-1003");

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.id, "g-1003");
  assert.equal(result.body.brand, "Sobhan");
  assert.equal(result.body.sources[0].key, "internal");
  assert.equal(result.body.sources[1].key, "ttac");
  assert.equal("internalCode" in result.body, false);
  assert.equal("barcode" in result.body, false);
  assert.equal("genericCode" in result.body, false);
  assert.equal("sellPrice" in result.body, false);
  assert.equal("tempPrice" in result.body, false);
  assert.equal("nonPharma" in result.body, false);
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
  assert.equal(result.sourceHints[0].key, "internal");
  assert.equal(result.sourceHints[1].key, "ttac");
  assert.equal("telegram" in result, false);
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
  assert.match(result.body.text, /لوزارتان/);
  assert.match(result.body.text, /قیمت هر قرص:/);
  assert.match(result.body.text, /به‌روزرسانی:/);
});

test("goodsService search applies learned selection history to ranking", () => {
  selectionHistoryStore.resetForTest();
  selectionHistoryStore.recordSuccessfulSelection("استامینوفن", "g-1007");

  const result = goodsService.search({ query: "استامینوفن" });

  assert.ok(result.total >= 2);
  assert.equal(result.items[0].id, "g-1007");
});
