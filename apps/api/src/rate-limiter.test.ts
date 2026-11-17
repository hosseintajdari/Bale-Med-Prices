import test from "node:test";
import assert from "node:assert/strict";
import { isRateLimited, resetForTest } from "./rate-limiter.ts";

function fakeRequest(ip) {
  return {
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip }
  };
}

test("rate limiter allows bursts then blocks (#34)", () => {
  resetForTest();
  process.env.RATE_LIMIT_CAPACITY = "3";
  process.env.RATE_LIMIT_REFILL_PER_SECOND = "0.0001";

  try {
    const request = fakeRequest("10.0.0.1");
    assert.equal(isRateLimited(request), false);
    assert.equal(isRateLimited(request), false);
    assert.equal(isRateLimited(request), false);
    assert.equal(isRateLimited(request), true);
  } finally {
    delete process.env.RATE_LIMIT_CAPACITY;
    delete process.env.RATE_LIMIT_REFILL_PER_SECOND;
    resetForTest();
  }
});

test("rate limiter tracks clients independently (#34)", () => {
  resetForTest();
  process.env.RATE_LIMIT_CAPACITY = "1";
  process.env.RATE_LIMIT_REFILL_PER_SECOND = "0.0001";

  try {
    assert.equal(isRateLimited(fakeRequest("10.0.0.2")), false);
    assert.equal(isRateLimited(fakeRequest("10.0.0.2")), true);
    assert.equal(isRateLimited(fakeRequest("10.0.0.3")), false);
  } finally {
    delete process.env.RATE_LIMIT_CAPACITY;
    delete process.env.RATE_LIMIT_REFILL_PER_SECOND;
    resetForTest();
  }
});
