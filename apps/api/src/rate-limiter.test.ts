import test from "node:test";
import assert from "node:assert/strict";
import { isPrescriptionRateLimited, isRateLimited, resetForTest } from "./rate-limiter.ts";

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

function fakePrescriptionRequest(ip, basketId) {
  const query = basketId ? `?action=add&basketId=${basketId}` : "?action=start";
  return {
    url: `/bot/prescription${query}`,
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip }
  };
}

test("prescription rate limiter keys by basket, not by shared IP (A5)", () => {
  resetForTest();
  process.env.RATE_LIMIT_CAPACITY = "2";
  process.env.RATE_LIMIT_REFILL_PER_SECOND = "0.0001";

  try {
    // One host (the bot layer) serves many users: each basket gets its
    // own bucket, so one user's traffic never starves another's.
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), false);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), false);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), true);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-2")), false);

    // The basket path has its own bucket: it neither drains nor is
    // drained by the generic per-IP bucket.
    assert.equal(isRateLimited(fakeRequest("10.0.0.9")), false);
  } finally {
    delete process.env.RATE_LIMIT_CAPACITY;
    delete process.env.RATE_LIMIT_REFILL_PER_SECOND;
    resetForTest();
  }
});

test("prescription route: forged basket ids from one IP cannot escape the route IP ceiling (N1)", () => {
  resetForTest();
  process.env.RATE_LIMIT_CAPACITY = "60";
  process.env.RATE_LIMIT_REFILL_PER_SECOND = "0.0001";
  process.env.RATE_LIMIT_PRESCRIPTION_IP_CAPACITY = "10";
  process.env.RATE_LIMIT_PRESCRIPTION_IP_REFILL_PER_SECOND = "0.0001";

  try {
    // Every forged basketId mints a fresh per-basket bucket, so only a
    // route-wide per-IP ceiling can bound this flood: of 70 forged
    // requests from one IP, exactly the ceiling's worth may pass.
    const results = [];
    for (let index = 0; index < 70; index += 1) {
      results.push(
        isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.77", `rx-forged-${index}`))
      );
    }

    assert.equal(results.filter((limited) => !limited).length, 10);
    assert.equal(results[10], true);
    assert.equal(results[69], true);

    // The ceiling is per IP: another caller is unaffected.
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.78", "rx-forged-0")), false);
  } finally {
    delete process.env.RATE_LIMIT_CAPACITY;
    delete process.env.RATE_LIMIT_REFILL_PER_SECOND;
    delete process.env.RATE_LIMIT_PRESCRIPTION_IP_CAPACITY;
    delete process.env.RATE_LIMIT_PRESCRIPTION_IP_REFILL_PER_SECOND;
    resetForTest();
  }
});

test("prescription route: two real baskets from one IP stay independent under the IP ceiling (N1)", () => {
  resetForTest();
  process.env.RATE_LIMIT_CAPACITY = "2";
  process.env.RATE_LIMIT_REFILL_PER_SECOND = "0.0001";
  process.env.RATE_LIMIT_PRESCRIPTION_IP_CAPACITY = "50";
  process.env.RATE_LIMIT_PRESCRIPTION_IP_REFILL_PER_SECOND = "0.0001";

  try {
    // Basket rx-1 exhausts its own per-basket bucket…
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), false);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), false);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-1")), true);

    // …while basket rx-2 on the same host keeps its own allowance, and
    // a basket-less start from the same host still goes through.
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9", "rx-2")), false);
    assert.equal(isPrescriptionRateLimited(fakePrescriptionRequest("10.0.0.9")), false);
  } finally {
    delete process.env.RATE_LIMIT_CAPACITY;
    delete process.env.RATE_LIMIT_REFILL_PER_SECOND;
    delete process.env.RATE_LIMIT_PRESCRIPTION_IP_CAPACITY;
    delete process.env.RATE_LIMIT_PRESCRIPTION_IP_REFILL_PER_SECOND;
    resetForTest();
  }
});
