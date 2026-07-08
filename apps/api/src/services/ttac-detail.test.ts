import assert from "node:assert/strict";
import test from "node:test";
import { buildTtacDetailUrl } from "./ttac-detail.ts";

test("buildTtacDetailUrl replaces ttacCode placeholder", () => {
  const previous = process.env.TTAC_DETAIL_URL_TEMPLATE;
  process.env.TTAC_DETAIL_URL_TEMPLATE = "https://example.com/ttac/{ttacCode}";

  try {
    assert.equal(
      buildTtacDetailUrl("TTAC-ACET-500-TAB"),
      "https://example.com/ttac/TTAC-ACET-500-TAB"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.TTAC_DETAIL_URL_TEMPLATE;
    } else {
      process.env.TTAC_DETAIL_URL_TEMPLATE = previous;
    }
  }
});

test("buildTtacDetailUrl returns undefined when template is missing", () => {
  const previous = process.env.TTAC_DETAIL_URL_TEMPLATE;
  delete process.env.TTAC_DETAIL_URL_TEMPLATE;

  try {
    assert.equal(buildTtacDetailUrl("TTAC-1"), undefined);
  } finally {
    if (previous !== undefined) {
      process.env.TTAC_DETAIL_URL_TEMPLATE = previous;
    }
  }
});
