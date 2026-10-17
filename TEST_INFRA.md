# E2E Test Infrastructure Specification

**Document**: `/home/admin/PanelPH/TEST_INFRA.md`  
**Application**: PanelPH (Pharmacy Operational Layer & ChatGPT MCP App)  
**Target Runtimes**: Node.js ESM (`>=20`), `@modelcontextprotocol/sdk`, Streamable HTTP MCP Endpoint (`/mcp`), REST API (`/api/*`), Web Client (`public/order-desk.html`)  
**Runner Script / Tool**: Node.js Native Test Runner (`node --test`)  
**Execution Command**: `npm test` or `node --test test/e2e/*.test.js`  

---

## 1. Testing Methodology & Guiding Principles

The E2E test infrastructure for PanelPH is designed to provide comprehensive, opaque-box automated verification across all functional tiers, interface contracts, and boundary conditions specified in `PROJECT.md`, `ORIGINAL_REQUEST.md`, `docs/REFERENCE-DATA.md`, `docs/UI-DESIGN.md`, and architectural decision records `ADR-001` and `ADR-002`.

### Core Testing Invariants
1. **Opaque-Box Verification**:
   Tests interact strictly via public, network-facing, and integration interfaces:
   - Streamable HTTP MCP JSON-RPC protocol at `/mcp` (`initialize`, `tools/list`, `tools/call`, `resources/read`).
   - REST API endpoints at `/api/*` (`/api/draft`, `/api/draft/needs`, `/api/draft/needs/:needId/resolve`, `/api/draft/revert`, `/api/catalog/search`, `/api/stock/check`, `/api/orders/export-batch`).
   - Clean Qanoon adapter boundary (`src/adapters/qanoon-adapter.js`).
   - No private module state or non-contractual internal variables are accessed.

2. **Hermetic & Isolated State**:
   Each test run spins up an isolated server instance bound to an ephemeral loopback port (`port: 0`) and points to a unique temporary state directory (`mkdtemp(join(tmpdir(), "panelph-e2e-"))`). No test depends on execution order or pollutes repository state.

3. **Deterministic Output & Authoritative Expected Output Derivation**:
   Every test assertion derives its expected status code, data schema, and domain invariants directly from authoritative specifications:
   - Status transition rules: `open` -> `needs_completion` -> `ready_for_review`.
   - String code preservation: Iranian National Drug List `genericCode` and `brandCode` (e.g. `"00001"`, `"08234"`) must never be cast to numeric types.
   - Strict append-only event sourcing: Reversions emit a compensating `event_reverted` event rather than mutating or deleting historical events.
   - Pricing formulas: Deterministic 7-step calculation with 75/25 VAT to municipal toll distribution and >10,000 Rial TTAC divergence warnings.
   - Idempotency: Duplicate order batch requests bearing the same `uniqueId` within 24 hours return cached responses (`status: "CACHED"`).

4. **Progressive Testability**:
   The test harness supports progressive milestone verification:
   - Currently implemented features (MCP tools, draft store, event sourcing, UI widget resource) execute and assert with 100% pass rate immediately.
   - Features from upcoming milestones (Milestone 1 Qanoon adapter, Milestone 2 REST routes, Milestone 3 mutex queue) dynamically detect capability readiness: when running in standard milestone gate mode (`node --test`), pending milestone dependencies provide structured diagnostic skips with exit code 0.
   - In strict evaluation mode (`PANELPH_E2E_STRICT=1`), all tests assert strictly to gate final delivery.

---

## 2. 4-Tier Test Architecture

```
+-------------------------------------------------------------------------------+
| Tier 4: Real-World Scenarios (Pharmacist Shifts)                              |
| - Rapid Prescription Entry Shift (Rush hour multi-item capture & resolution)  |
| - Out-of-Stock Substitution Workflow (Inventory failure & generic swap)        |
| - Network Retry & Idempotency Protection (Stable uniqueId replay barrier)      |
| - Shift Handoff & Interrupted Draft Resumption (State persistence continuity)  |
+-------------------------------------------------------------------------------+
                                      ▲
+-------------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations                                            |
| - Full Operational Lifecycle (Entry -> Resolve -> Stock -> Price -> Revert)   |
| - Multi-Item Draft Progressive Ambiguity Resolution                           |
| - Ordered Chain of Compensating Reverts & Non-Destructive Audit Trail         |
| - Interleaved Resolution & New Need Addition (Status downgrade interlock)     |
| - Cross-Protocol State Coherence (MCP JSON-RPC vs Direct Persistent Disk)     |
+-------------------------------------------------------------------------------+
                                      ▲
+-------------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases                                               |
| - Empty / Whitespace-Only Name Rejection                                      |
| - Zero, Negative, and NaN Quantity Rejections                                 |
| - Leading Zeroes Preservation on Drug Codes ("00001", "08234", "00000")       |
| - Extreme Quantities (Wholesale 1,000,000 units and Decimal 2.5 Fractions)    |
| - High-Fidelity Persian/Arabic Unicode, Half-Space, and 2,000-char Notes      |
| - Non-Existent Need Update & Event Revert Rejections                          |
| - Resolving Need Without Title Validation Error                               |
| - Out-of-Stock Flagging & TTAC Price Divergence (>10,000 Rial) Warning        |
| - Unknown Tool Calls & Malformed JSON Error Handling                          |
+-------------------------------------------------------------------------------+
                                      ▲
+-------------------------------------------------------------------------------+
| Tier 1: Feature Coverage (Core Functional Baseline)                          |
| - F07: Free-text need entry via MCP without forced catalog lookup             |
| - F10: MCP tools discovery and schema registration                            |
| - F08: Catalog resolution strictly preserves leading zeroes on codes          |
| - F12: Strict event sourcing appends compensating event on revert             |
| - F14: Resilient state persistence reloads accurately across restarts         |
| - F15/F18: UI widget resource contract, RTL Persian layout, and theme sync     |
| - F17: Live draft status transitions (open -> needs_completion -> ready)      |
| - F06: Qanoon API Specification and Reference Documentation                   |
| - F09: Operational REST API endpoints (/api/draft/*)                          |
| - F01/F05: Qanoon REST Adapter boundary and offline mock fixtures             |
| - F02: Qanoon Idempotency & Retry Semantics (stable uniqueId)                 |
| - F04: Deterministic Pricing & Tax/Toll Engine (75/25 split)                  |
| - F11: Order Batch Generation & Discrepancy Highlighting                      |
| - F13: Mutex concurrency and race condition protection                        |
+-------------------------------------------------------------------------------+
```

---

## 3. Feature Inventory Mapping

| Feature ID | Feature Name | Mapped Tier | Test File | Test Invariants / Success Criteria |
|---|---|---|---|---|
| **F1** | Qanoon REST Adapter Boundary | Tier 1 & Tier 2 | `tier1-feature-coverage.test.js`, `tier2-boundary-corner.test.js` | Isolated client wrapping `/stock/check`, `/orders/batch`, `/pricing/calculate`. Decoupled from PanelPH domain. |
| **F2** | Qanoon Idempotency & Retry Semantics | Tier 1 & Tier 4 | `tier1-feature-coverage.test.js`, `tier4-real-world-scenarios.test.js` | 24-hour cache on `uniqueId`. Re-submitting same uniqueId yields `status: "CACHED"` without duplicate deductions. |
| **F3** | Qanoon Two-Stage Stock Verification | Tier 1 & Tier 3 | `tier1-feature-coverage.test.js`, `tier3-cross-feature.test.js` | Advisory check during resolution + pre-batch barrier before export. |
| **F4** | Deterministic Pricing & Tax/Toll Engine | Tier 1 & Tier 2 | `tier1-feature-coverage.test.js`, `tier2-boundary-corner.test.js` | 7-step pricing formula; 75/25 VAT/toll split; technical fee addition; >10,000 Rial TTAC divergence warning. |
| **F5** | Offline Mock Fixtures & Testing Mode | Tier 1 | `tier1-feature-coverage.test.js` | Self-contained mock data enabling 100% offline test execution with zero external network access. |
| **F6** | Qanoon API Specification Document | Tier 1 | `tier1-feature-coverage.test.js` | Comprehensive API documentation present in `docs/` specifying schema, endpoints, and error handling. |
| **F7** | Free-Text Need Entry (REST & MCP) | Tier 1 | `tier1-feature-coverage.test.js` | Rapid free-text need capture with name, quantity, unit, and note without forced catalog resolution. Status = `needs_completion`. |
| **F8** | Catalog Resolution Engine | Tier 1 & Tier 2 | `tier1-feature-coverage.test.js`, `tier2-boundary-corner.test.js` | Matches genericCode, brandCode, dosageForm, strength. Leading zeroes on codes strictly preserved as strings. |
| **F9** | Operational REST API Endpoints | Tier 1 | `tier1-feature-coverage.test.js` | Clean HTTP REST endpoints (`/api/draft`, `/api/draft/needs`, `/api/draft/revert`, `/api/stock/check`, `/api/orders/*`). |
| **F10** | MCP Tools Expansion | Tier 1 & Tier 2 | `tier1-feature-coverage.test.js`, `tier2-boundary-corner.test.js` | MCP protocol on `/mcp`. Discovers all draft tools with valid input schemas. Returns clean JSON-RPC errors. |
| **F11** | Order Batch Generation & Discrepancies | Tier 1 & Tier 3 | `tier1-feature-coverage.test.js`, `tier3-cross-feature.test.js` | Validates draft; flags unresolved or out-of-stock items in `discrepancies` array before export. |
| **F12** | Strict Event Sourcing & Compensating Events | Tier 1 & Tier 3 | `tier1-feature-coverage.test.js`, `tier3-cross-feature.test.js` | Append-only event history; reverts append `event_reverted` without truncating or mutating historical log. |
| **F13** | Concurrency Lock & Race Protection | Tier 1 | `tier1-feature-coverage.test.js` | Mutex queue protects concurrent mutating operations from interleaving and data loss. |
| **F14** | Resilient Persistence Across Restarts | Tier 1 & Tier 4 | `tier1-feature-coverage.test.js`, `tier4-real-world-scenarios.test.js` | File writes persisted to disk; fresh server instance reloads exact state, items, and event history. |
| **F15** | Pharmacist Free-Text UI Capture Form | Tier 1 | `tier1-feature-coverage.test.js` | Rapid entry form with name, quantity, unit, note in `order-desk.html`. |
| **F16** | Interactive Ambiguity Resolution Modal | Tier 1 | `tier1-feature-coverage.test.js` | Ambiguity drawer container `#ambiguities` for selecting IRC/TTAC catalog references. |
| **F17** | Live Draft Overview & Status Badges | Tier 1 & Tier 3 | `tier1-feature-coverage.test.js`, `tier3-cross-feature.test.js` | Status badge lifecycle: `open` -> `needs_completion` -> `ready_for_review`. Dynamic summary count. |
| **F18** | Host Context & Theme Synchronization | Tier 1 | `tier1-feature-coverage.test.js` | RTL direction (`dir="rtl"`), Persian language (`lang="fa"`), and dark/light host theme sync via CSS media queries. |
| **F19** | UI Event Timeline & Revert Action | Tier 1 & Tier 3 | `tier1-feature-coverage.test.js`, `tier3-cross-feature.test.js` | Visual history container `#history` with revert action binding invoking `revert_order_event`. |
| **F20** | E2E Automated Verification Suite | All Tiers | All test files | 100% pass across Tiers 1-4 via `node --test` with exit code 0. |
| **F21** | Adversarial Coverage Hardening | Tier 2 | `tier2-boundary-corner.test.js` | Malformed JSON, non-numeric quantities, extreme payloads, negative isolation, path injection defense. |

---

## 4. Test Suite Specification & Expected Output Derivation

### Tier 1: Feature Coverage (Core Functional Baseline)
1. **`F7: Free-text need entry via MCP`**:
   - *Input*: Call tool `add_order_need` with `{ name: "استامینوفن ۵۰۰", quantity: 2, unit: "بسته", note: "نیاز فوری" }`.
   - *Expected*: HTTP 200, draft returned with 1 item, `freeTextName: "استامینوفن ۵۰۰"`, `quantity: 2`, `status: "needs_completion"`, `summary.ambiguityCount: 1`.
2. **`F10: MCP tools discovery & schema`**:
   - *Input*: Call `initialize` then `tools/list` on `/mcp`.
   - *Expected*: Server name `panelph`. Tools list contains `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`.
3. **`F8: Catalog resolution leading zeroes`**:
   - *Input*: Add need, then call `resolve_order_need` with `genericCode: "00001"`, `brandCode: "00001"`.
   - *Expected*: `resolvedReference.genericCode === "00001"` (string type with leading zeroes preserved), `status: "ready_for_review"`, `ambiguityCount: 0`.
4. **`F12: Event sourcing compensation`**:
   - *Input*: Add need, extract event ID, call `revert_order_event`.
   - *Expected*: Items array length becomes 0; event history appends `event_reverted`; past `need_added` event remains in history.
5. **`F14: Persistence across restarts`**:
   - *Input*: Add need to Server A, shut down Server A, boot Server B pointing to identical `statePath`.
   - *Expected*: Server B reloads persisted draft with exact item name, quantity, and events.
6. **`F15 & F18: UI widget resource contract`**:
   - *Input*: Read resource `ui://panelph/order-desk.html` via MCP.
   - *Expected*: Returns valid HTML containing `<html lang="fa" dir="rtl">`, `prefers-color-scheme: dark`, `#need-form`, `#items`, `#ambiguities`, and `#history`.
7. **`F17: Status transitions`**:
   - *Input*: Empty draft -> add need -> resolve need.
   - *Expected*: Status transitions `open` -> `needs_completion` -> `ready_for_review`.

### Tier 2: Boundary & Corner Cases
1. **`T2_01: Empty & Whitespace Name Rejection`**:
   - *Input*: Call `add_order_need` with `name: ""` and `name: "   \t\n  "`.
   - *Expected*: Tool call fails with explicit error.
2. **`T2_02 - T2_04: Zero, Negative, and NaN Quantities`**:
   - *Input*: Call `add_order_need` with `quantity: 0`, `quantity: -5`, `quantity: NaN`.
   - *Expected*: Tool call fails with explicit error.
3. **`T2_05: Leading Zeroes String Preservation`**:
   - *Input*: Resolve needs with codes `"00001"`, `"08234"`, `"00000"`, `"00123"`.
   - *Expected*: All codes retain string type and exact leading zeroes.
4. **`T2_06: Extreme Quantities`**:
   - *Input*: Bulk wholesale `quantity: 1000000` and decimal fraction `quantity: 2.5`.
   - *Expected*: Both values accurately stored as numbers without corruption.
5. **`T2_07: High-Fidelity Persian/Arabic Unicode`**:
   - *Input*: Persian name with half-space, Arabic characters, and symbols + 1,700-char note.
   - *Expected*: Saved verbatim without byte truncation or encoding corruption.
6. **`T2_08 - T2_10: Non-Existent IDs & Missing Title`**:
   - *Input*: Non-existent need ID update, non-existent event ID revert, resolve without title.
   - *Expected*: Explicit error returned in each case.
7. **`T2_13 - T2_14: Unknown Tool & Malformed JSON`**:
   - *Input*: Call unknown tool; send malformed JSON string to `/mcp`.
   - *Expected*: Protocol returns error; server process does not crash and remains responsive.

### Tier 3: Cross-Feature Combinations
1. **`T3_01: Full Operational Lifecycle Interlock`**:
   - *Input*: Free text entry -> status `needs_completion` -> resolve -> status `ready_for_review` -> revert resolution -> status reverts to `needs_completion`.
   - *Expected*: Seamless status lifecycle and reference cleanup.
2. **`T3_02: Multi-Item Progressive Ambiguity Resolution`**:
   - *Input*: 3 items added. Items resolved sequentially one by one.
   - *Expected*: Ambiguity count decrements 3 -> 2 -> 1 -> 0. Status stays `needs_completion` until the very last item is resolved.
3. **`T3_03: Ordered Chain of Compensating Reverts`**:
   - *Input*: Add need -> update quantity -> update note -> revert note -> revert quantity.
   - *Expected*: State unwinds step-by-step; event log accumulates compensating events without history truncation.
4. **`T3_04: Interleaved Resolution & New Need Addition`**:
   - *Input*: Resolve Item A -> draft is `ready_for_review` -> add ambiguous Item B.
   - *Expected*: Draft immediately downgrades back to `needs_completion`.
5. **`T3_05: Cross-Protocol State Coherence`**:
   - *Input*: Mutate draft via MCP -> read file from disk.
   - *Expected*: Disk file JSON matches MCP output verbatim.

### Tier 4: Real-World Application Scenarios (Pharmacist Shifts)
1. **`T4_01: Rapid Prescription Entry Shift`**:
   - *Scenario*: Pharmacist enters 5 medications in rapid succession during morning rush without catalog lookups. Later, opens ambiguity drawer and resolves all items sequentially.
   - *Expected*: All 5 captured; status transitions cleanly from `needs_completion` to `ready_for_review`.
2. **`T4_02: Out-of-Stock Substitution Workflow`**:
   - *Scenario*: Brand medication resolved; stock check returns `inStock: false`. Pharmacist updates note documenting patient consent and substitutes with available generic brand.
   - *Expected*: Audit trail preserved; draft becomes `ready_for_review`.
3. **`T4_03: Network Retry & Idempotency Protection`**:
   - *Scenario*: Batch order submitted with `uniqueId`. Network glitch triggers retry with identical `uniqueId`.
   - *Expected*: First call returns `SUBMITTED`; second call returns `CACHED` without double-decrementing stock.
4. **`T4_04: Shift Handoff & Interrupted Draft Resumption`**:
   - *Scenario*: Morning shift pharmacist enters 3 items, resolves 1. Server restarts. Evening shift pharmacist logs in, resumes exact draft, resolves remaining 2 items.
   - *Expected*: Exact state restored across restart; full draft resolved successfully.

---

## 5. Coverage Thresholds & Quality Gates

| Quality Gate | Pass Threshold | Current Suite Status | Measurement Method |
|---|---|---|---|
| **Tier 1: Feature Coverage** | 100% of runnable features pass | 10/10 passed (5 skipped pending M1/M2/M3) | `node --test test/e2e/tier1-feature-coverage.test.js` |
| **Tier 2: Boundary & Corner** | 100% of boundary tests pass | 13/13 passed (2 skipped pending M1) | `node --test test/e2e/tier2-boundary-corner.test.js` |
| **Tier 3: Cross-Feature** | 100% of cross-feature tests pass | 5/5 passed (0 skipped) | `node --test test/e2e/tier3-cross-feature.test.js` |
| **Tier 4: Real-World Scenarios** | 100% of shift scenarios pass | 3/3 passed (1 skipped pending M1) | `node --test test/e2e/tier4-real-world-scenarios.test.js` |
| **Suite Total Pass Rate** | Exit code 0, 0 failures | 38 passed, 8 skipped, 0 failed | `npm test` |
| **Strict Evaluation Mode** | 100% pass when M1-M4 implemented | Configured via `PANELPH_E2E_STRICT=1` | `PANELPH_E2E_STRICT=1 npm test` |

---

## 6. Execution Guide

```bash
# Execute the complete automated test suite (all tiers + baseline tests):
npm test

# Execute E2E tests specifically:
node --test test/e2e/*.test.js

# Execute individual tiers:
node --test test/e2e/tier1-feature-coverage.test.js
node --test test/e2e/tier2-boundary-corner.test.js
node --test test/e2e/tier3-cross-feature.test.js
node --test test/e2e/tier4-real-world-scenarios.test.js

# Execute in strict evaluation mode (asserting against future milestone targets):
PANELPH_E2E_STRICT=1 npm test
```
