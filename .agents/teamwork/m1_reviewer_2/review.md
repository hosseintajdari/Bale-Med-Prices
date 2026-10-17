# Code Review & Adversarial Challenge Report: Milestone 1

**Reviewer**: `m1_reviewer_2` (Roles: reviewer, critic)  
**Target Repository**: `/home/admin/PanelPH`  
**Milestone**: Milestone 1 (Qanoon Adapter Boundary & API Specification)  
**Date**: 2026-10-14T09:56:00Z  

---

## 1. Review Summary

**Verdict**: **APPROVE**

Milestone 1 work products have been thoroughly and independently inspected, executed, and stress-tested. The deliverables meet all architectural, operational, and documentation requirements defined in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `DISPATCH.md`:
- `src/adapters/qanoon-adapter.js` (615 lines) provides an isolated, decoupled adapter boundary with full error classification, two-stage stock checking, 7-step deterministic pricing, 24-hour SHA-256 idempotency caching, and robust offline mock execution.
- `fixtures/qanoon-mock-data.json` (359 lines) provides rich test fixtures covering standard pharma, non-pharma/cosmetics, tempPrice fallbacks, multi-warehouse inventory, TTAC price divergence, dated VAT tables, and dated dispense fee rules.
- `docs/qanoon-api-spec.md` (359 lines) provides complete 8-section documentation including Mermaid flow diagrams, standard transport headers, schemas, error envelopes, and national drug code invariants.
- `test/qanoon-adapter.test.js` (508 lines, 39 tests) and full repository test runner (`node --test`, 85 tests) pass with exit code 0.

---

## 2. Integrity Verification

As an adversarial reviewer and critic, work was inspected for integrity violations:
- **Hardcoded Test Results / Cheat Paths**: Checked `src/adapters/qanoon-adapter.js` for hardcoded conditionals tied to specific test inputs. The calculations (unit price resolution, extension, 75/25 VAT/toll split, technical fee applicability, cost & profit margin, and TTAC divergence guard) execute generic, dynamic business logic driven by data records, not static returns.
- **Dummy / Facade Implementations**: Checked whether mock mode merely returns static stubs. The mock mode executes real SHA-256 payload hashing, in-flight mutex tracking, expiration date checking (FEFO), stock availability filtering across warehouses, and tax rate date-range matching.
- **Shortcuts & External Leakage**: Zero live external network connections occur in mock mode (`mockMode: true` or `NODE_ENV === "test"` or absent API key). Live network transport uses `node:crypto`, `fetch`, and `AbortSignal.timeout(5000)`.
- **Verification Authenticity**: Independently executed `node --test` (83 passed, 2 skipped for M2 REST endpoints, 0 failed) and `node --test test/qanoon-adapter.test.js` (39 passed, 0 failed).

**Integrity Finding**: **NO INTEGRITY VIOLATIONS DETECTED.**

---

## 3. Findings & Observations

### [Minor] Finding 1: Unbounded In-Memory Idempotency Cache Growth in Long-Running Daemons
- **What**: `this.idempotencyCache` in `QanoonAdapter` is an un-bounded `Map`. Expired entries (`now >= cached.expiresAt`) are purged lazily only when the exact same `uniqueId` is resubmitted.
- **Where**: `src/adapters/qanoon-adapter.js`, lines 111, 454-473, 501-506.
- **Why**: If a client submits high volumes of single-use `uniqueId`s over weeks without restarting the daemon, keys that are never re-queried will persist in memory.
- **Suggestion**: In a future hardening pass (or Milestone 5), introduce a maximum cache capacity (e.g., LRU with `max: 5000`) or a periodic background cleanup sweep to prune expired entries.

### [Minor] Finding 2: `today` Parameter Omission in `checkBatchStock`
- **What**: The Stage 1 advisory check `checkStock` accepts a `today` parameter for historical expiration simulation, but Stage 2 pre-batch barrier `checkBatchStock` does not forward a `today` argument.
- **Where**: `src/adapters/qanoon-adapter.js`, lines 231-243.
- **Why**: Minor inconsistency in parameter pass-through during historical batch simulation tests. Runtime behavior defaults safely to `new Date().toISOString().slice(0, 10)`.
- **Suggestion**: Forward `today` from `checkBatchStock({ warehouseId, items, today })` to each `this.checkStock(...)` invocation.

---

## 4. Adversarial Challenges & Stress-Test Results

| # | Challenge Scenario | Hypothesis / Attack Vector | Predicted Result | Verified Actual Result | Status |
|:---:|:---|:---|:---|:---|:---:|
| **C1** | Concurrent Duplicate Requests | Dispatch simultaneous batch order with identical `uniqueId` before initial request completes. | Throws `QanoonConflictError` (`CONCURRENT_REQUEST_IN_FLIGHT`, status 409). | Verified: in-flight lock triggers 409 conflict error; prevents race conditions. | **PASS** |
| **C2** | Bulk Wholesale Quantity (1,000,000) | Request pricing for wholesale quantity (1M units). | Handles large integers without arithmetic overflow or `NaN`. | Verified: `finalPrice = 209,100,000,000` calculated deterministically without drift. | **PASS** |
| **C3** | Fractional / Decimal Quantity (2.5) | Request pricing for fractional units (e.g. bulk liquid or weight). | Handles decimal multiplication and rounding rules properly. | Verified: `finalPrice = 522,750` with `roundingRule: "round"`. | **PASS** |
| **C4** | Invalid Negative Quantity | Pass negative quantity (`quantity: -5`) to `calculatePrice`. | Rejects with `QanoonValidationError` (status 400). | Verified: throws `QanoonValidationError("quantity must be a positive number")`. | **PASS** |
| **C5** | Live Wire Timeout | Trigger live fetch against non-routable host with 50ms timeout. | Aborts socket via `AbortSignal.timeout` and throws `QanoonNetworkTimeoutError` (status 504). | Verified: caught as `QanoonNetworkTimeoutError TIMEOUT 504` (Task task-56). | **PASS** |
| **C6** | Non-JSON Error Response | Upstream server returns HTML error page (e.g. 502 Bad Gateway). | Safely falls back to status-based error message without unhandled JSON parse crash. | Verified: `try { body = await response.json(); } catch {}` protects server from uncaught exceptions. | **PASS** |
| **C7** | 75/25 VAT/Toll Sum Equality | Check whether `vatAmount + tollAmount` drifts from `totalTax`. | `tollAmount = totalTax - vatAmount` guarantees strict arithmetic equality. | Verified: `taxAmount + tollAmount === totalTax` across all tested quantities and rounding rules. | **PASS** |
| **C8** | Leading-Zero String Preservation | Pass drug code `"00001"` and `"08234"`. | Codes remain strings and are never coerced to numbers `1` or `8234`. | Verified: strict string identity preserved in catalog search, stock checks, and batch orders. | **PASS** |

---

## 5. Verified Claims

1. **Claim**: All 8 required sections are present in `docs/qanoon-api-spec.md`.  
   → *Verified*: Inspected lines 1 to 359; confirmed Sections 1 (Architecture & Mermaid), 2 (Transport & Headers), 3 (Stock Check), 4 (7-Step Pricing), 5 (Goods Search), 6 (Batch Order & Idempotency), 7 (Error Codes), and 8 (Leading-Zero Invariants). **PASS**
2. **Claim**: Typed errors inherit from `Error` and `QanoonAdapterError`.  
   → *Verified*: Checked class inheritance in `src/adapters/qanoon-adapter.js` and ran assertions in `test/qanoon-adapter.test.js`. **PASS**
3. **Claim**: Timeouts use `AbortSignal.timeout`.  
   → *Verified*: Inspected line 581 of `src/adapters/qanoon-adapter.js` (`signal: AbortSignal.timeout(this.timeoutMs)`), and verified timeout abortion with exit code 0 in Task task-56. **PASS**
4. **Claim**: Mock mode executes 100% offline without live network dependencies.  
   → *Verified*: Executed `node --test` with all external networking disabled; 83 passing tests executed entirely against fixtures. **PASS**
5. **Claim**: Unit tests pass with exit code 0.  
   → *Verified*: Executed `node --test test/qanoon-adapter.test.js` (39 tests, 0 failures, 347ms). **PASS**
6. **Claim**: Full repository tests pass with exit code 0.  
   → *Verified*: Executed `node --test` (85 tests, 83 passed, 2 skipped for Milestone 2 REST endpoints, 0 failed, 4067ms). **PASS**

---

## 6. Coverage Gaps & Unverified Items

- **Coverage Gaps**: None within Milestone 1 scope. The 2 skipped tests in the full test runner are explicitly guarded for Milestone 2 REST endpoints (`/api/draft` and `/api/orders/export-batch`).
- **Unverified Items**: Live production Qanoon ERP deployment endpoints (cannot and must not be called in development environment per architectural guardrails).

---

## 7. Conclusion

Milestone 1 is ready for production merge into the PanelPH operational baseline. Work product is robust, modular, cleanly decoupled, well-documented, and fully verified.
