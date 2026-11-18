import test from "node:test";
import assert from "node:assert/strict";
import { truncateUtf8Bytes } from "./bot-response-presenter.ts";

test("truncateUtf8Bytes leaves short labels untouched (#36)", () => {
  assert.equal(truncateUtf8Bytes("مطمئن نیستم"), "مطمئن نیستم");
});

test("truncateUtf8Bytes caps long labels at 64 bytes without splitting code points (#36)", () => {
  const longLabel = "آموکسی سیلین ۵۰۰ میلی‌گرم کپسول خوراکی بسته‌ی صد عددی داروخانه‌ای";
  const truncated = truncateUtf8Bytes(longLabel);

  assert.ok(Buffer.byteLength(truncated, "utf8") <= 64);
  assert.ok(truncated.length < longLabel.length);
  // No dangling surrogate halves.
  assert.doesNotThrow(() => encodeURIComponent(truncated));
});
