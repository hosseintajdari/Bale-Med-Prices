# Milestone 1 Independent Code & Adversarial Review

**Target Repository:** `/home/admin/PanelPH`  
**Reviewer:** `m1_reviewer_1` (Roles: Reviewer, Adversarial Critic)  
**Date:** 2026-10-14T09:56:00Z  
**Reviewed Artifacts:**
- `src/adapters/qanoon-adapter.js` (615 lines)
- `fixtures/qanoon-mock-data.json` (359 lines)
- `docs/qanoon-api-spec.md` (359 lines)
- `test/qanoon-adapter.test.js` (508 lines)

---

## Review Summary

**Verdict**: **APPROVE**

Milestone 1 delivers a robust, cleanly decoupled, and fully functional adapter boundary for legacy Qanoon webservices. All interface contracts specified in `PROJECT.md` and `ORIGINAL_REQUEST.md` are satisfied. The implementation contains genuine domain logic, deterministic 7-step pricing with exact 75/25 VAT/toll math, multi-stage inventory checking, 24-hour idempotency protection, and strict string preservation for national drug codes. The codebase is backed by 39 unit tests and passes 83 out of 85 tests in the project test suite with 0 failures (the 2 skipped tests are Milestone 2 REST endpoints). No integrity violations, dummy facades, or hardcoded shortcuts were detected.

---

## Integrity & Anti-Cheating Verification

In accordance with reviewer instructions, the code and test suites were audited for integrity violations:
- **Hardcoded Test Outputs:** None. Price calculations, stock availability, and SHA-256 payload digests were tested with arbitrary inputs (wholesale quantities, decimal values, permuted batch items) and dynamically evaluated.
- **Dummy / Facade Implementations:** None. Full business logic is implemented in `src/adapters/qanoon-adapter.js`, supporting both offline mock mode and live HTTP fetch transport.
- **Task Shortcuts & Bypasses:** None. All required adapter methods, fixtures, and documentation were constructed from scratch within the project boundaries.
- **Fabricated Verifications:** None. All test runs were executed independently and confirmed via live Node.js runner output.

**Integrity Finding:** Clean / PASSED.

---

## Findings

### [Minor] Finding 1: Whitespace-Only Query in `searchGoods` Returns All Catalog Items
- **What**: Querying `searchGoods({ query: "   " })` with whitespace-only input returns all catalog goods (up to limit), whereas `searchGoods({ query: "" })` returns an empty array `[]`.
- **Where**: `src/adapters/qanoon-adapter.js`, line 526:
  ```javascript
  if (!query || typeof query !== "string") return [];
  const normalized = query.trim().toLowerCase();
  ```
- **Why**: When `query` is `"   "`, `normalized` evaluates to `""`. In JavaScript, `string.includes("")` evaluates to `true` for all strings. This creates inconsistent behavior between empty string input and whitespace string input.
- **Suggestion**: Update guard to check trimmed query:
  ```javascript
  if (!query || typeof query !== "string' || !query.trim()) return [];
  ```

### [Minor] Finding 2: In-Memory Idempotency Cache Uses Passive Expiration Only
- **What**: The in-memory `idempotencyCache` Map purges expired records only when a specific `uniqueId` is resubmitted after expiry (`now >= cached.expiresAt`), or when `clearIdempotencyCache()` is explicitly called.
- **Where**: `src/adapters/qanoon-adapter.js`, lines 110, 454-473:
  ```javascript
  this.idempotencyCache = new Map();
  ```
- **Why**: In long-running production environments with high order volume and distinct unique IDs that never repeat, uncollected expired keys could accumulate in memory over time.
- **Suggestion**: In a future hardening phase (Milestone 5), introduce a lightweight periodic interval sweeper or use an LRU-bounded cache structure (e.g., maximum 10,000 entries).

### [Positive Observation] 1: Exact Tax/Toll Sum Equality Invariant
- In Step 3 of `calculatePrice`, defining `tollAmount = totalTax - vatAmount` guarantees that `vatAmount + tollAmount === totalTax` without rounding divergence or fractional penny drift across any rounding policy (`round`, `ceil`, `floor`).

### [Positive Observation] 2: Idempotency Payload Hash Permutation Resilience
- In `computePayloadHash`, batch items are explicitly sorted by `(goodId || genericCode)` prior to serialization and hashing. This ensures that legitimate network retries with reordered item arrays correctly match the cached payload digest instead of causing false `409 Conflict` errors.

### [Positive Observation] 3: Strict Leading-Zero String Preservation
- Generic codes (`genericCode`, e.g., `"00001"`, `"08234"`) and brand codes (`brandCode`, e.g., `"00001"`, `"00020"`) are safeguarded against numeric coercion throughout search, pricing, stock checking, and batch creation.

---

## Verified Claims

| Claim | Verification Method | Result |
|---|---|---|
| Unit tests pass with 0 failures | Executed `node --test test/qanoon-adapter.test.js` | **PASS** (39 passed, 0 failed, 338ms) |
| Full project test suite passes with exit code 0 | Executed `node --test` | **PASS** (83 passed, 2 skipped [M2], 0 failed, 4501ms) |
| JavaScript syntax validity | Executed `node --check src/adapters/qanoon-adapter.js test/qanoon-adapter.test.js` | **PASS** (Exit code 0) |
| Interface conformance to `PROJECT.md` | Inspected signatures and return shapes for `checkStock`, `calculatePrice`, `createBatchOrder`, and `searchGoods` | **PASS** (All required fields present and typed) |
| 7-step pricing logic correctness | Evaluated `calculatePrice` on standard pharma (`g-1001`), tempPrice (`g-1003`), non-pharma (`g-1002`), historical rates (2025 vs 2026), and TTAC divergence (`g-1004`) | **PASS** (Calculations match exact formula) |
| Idempotency cache with 24h TTL and 409 mismatch | Tested first submission (`SUBMITTED`), replay (`CACHED`), modified payload (`409 Conflict`), and expired TTL | **PASS** (Behaviors conform to spec) |
| Two-stage stock verification | Tested Stage 1 advisory check (`in_stock`, `low_stock`, `out_of_stock`, expired lot filtering) and Stage 2 pre-batch barrier | **PASS** (Correct stockStatus and discrepancy compilation) |
| Offline mock mode zero external network | Ran tests with network disabled; verified default offline mode loads `fixtures/qanoon-mock-data.json` without TCP connections | **PASS** |

---

## Coverage Gaps

- **Live Remote Qanoon Endpoint**: Live HTTP communication against a real production Qanoon server was not tested because no live server URL or credentials are provided (development/offline boundary per `ORIGINAL_REQUEST.md` and `PROJECT.md`). Risk level: Low, as live transport logic is cleanly isolated in `_fetch()` and uses standard `fetch` with `AbortSignal.timeout(5000)`.

---

## Unverified Items

- None within the Milestone 1 scope.

---

## Adversarial Review & Challenge Report

### Challenge Summary

**Overall Risk Assessment**: **LOW**

### Challenges

#### [Low] Challenge 1: Whitespace Query Inconsistency
- **Assumption challenged**: User search query is non-empty and non-whitespace.
- **Attack scenario**: User or client submits `query: "   "`.
- **Blast radius**: Adapter returns 8 matches instead of 0 matches, potentially surprising the consumer UI with an unfiltered catalog list.
- **Mitigation**: Add `!query.trim()` check in `searchGoods`.

#### [Low] Challenge 2: Long-Term Memory Buildup in Idempotency Cache
- **Assumption challenged**: Process lifespan is short or memory is unbounded.
- **Attack scenario**: High-volume continuous operation where hundreds of thousands of unique orders are created and never re-read.
- **Blast radius**: Memory usage of `idempotencyCache` increases monotonically.
- **Mitigation**: Add LRU cap or periodic TTL sweep.

### Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Pass/Fail |
|---|---|---|---|
| Extreme wholesale quantity ($1{,}000{,}000$ units) | Correct final price calculation without integer overflow ($209{,}100{,}000{,}000$ Rials) | Computed $209{,}100{,}000{,}000$ Rials | **PASS** |
| Fractional quantity ($2.5$ units) | Correct decimal scaling of base price, tax, and technical fee | Computed $522{,}750$ Rials | **PASS** |
| Rounding rule variation (`ceil`, `floor`, `round`) | Math rounding respects rule and preserves `vatAmount + tollAmount === totalTax` | Invariant preserved across all 3 rules | **PASS** |
| Document date prior to oldest tax table (`2010-01-01`) | Graceful warning emission without exception | Emitted `"No tax rate matched..."` and `"Technical fee... no applicable rule..."` | **PASS** |
| Stock check for non-existent item | Return `inStock: false`, `availableCount: 0`, `stockStatus: "out_of_stock"` | Returned expected status and advisory warning | **PASS** |
| Stock check with leading-zero code (`"00001"`) | String preserved, correctly matches record with `"00001"` | Code remained string `"00001"` | **PASS** |
| Permuted batch items in idempotent replay | Permuted items produce identical SHA-256 payload hash; returns `CACHED` | Returned `status: "CACHED"`, `isIdempotentReplay: true` | **PASS** |
| Expired medicine lot (`earliestExpDate` in the past) | Expired lot marked out of stock with expiration warning | Returned `stockStatus: "out_of_stock"`, expiration advisory warning | **PASS** |

### Unchallenged Areas

- Live network timeout recovery against real gateway latency spikes (simulated via mock mode and unit tests; live server credentials unavailable).

---

## Conclusion & Next Steps

Milestone 1 satisfies all requirements and quality gates. The code is well-structured, modular, and safely tested. Milestone 2 (Operational Backend & MCP Tools) may proceed immediately.
