# Milestone 2 Review & Adversarial Assessment Report

**Reviewer**: `m2_reviewer_1` (teamwork_preview_reviewer)  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_reviewer_1_gen2`  
**Handoff Type**: Hard (Review Complete)  
**Recipient**: Orchestrator (`73e0f3ed-a319-4764-95ca-a26af0256c3d`), QA, and Next Milestone Workers  

---

## Review Summary

**Verdict**: **APPROVE**  
**Integrity Assessment**: **NO INTEGRITY VIOLATIONS DETECTED**. Zero hardcoded test outcomes, dummy implementations, facade bypasses, or fabricated outputs. The implementation is genuine, complete, and thoroughly tested.

---

## 1. Observation

1. **Test Suite Verification (`npm test`)**:
   - Command executed: `npm test` in `/home/admin/PanelPH`
   - Verbatim output summary:
     ```
     ℹ tests 113
     ℹ suites 0
     ℹ pass 113
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 0
     ℹ todo 0
     ℹ duration_ms 3654.922382
     ```
   - Exit code: `0`. Both previously skipped tests (`F9` and `F11`) now pass with zero skips:
     - `✔ F9: Operational REST API endpoints (/api/draft/*)`
     - `✔ F11: Order Batch Generation & Discrepancy Highlighting`

2. **Strict Mode Test Verification (`PANELPH_E2E_STRICT=1 npm test`)**:
   - Command executed: `PANELPH_E2E_STRICT=1 npm test` in `/home/admin/PanelPH`
   - Verbatim output summary:
     ```
     ℹ tests 113
     ℹ suites 0
     ℹ pass 113
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 0
     ℹ todo 0
     ℹ duration_ms 3507.679507
     ```
   - Exit code: `0`. No tests were skipped or bypassed in strict mode.

3. **REST Endpoints & HTTP Conformance in `src/server.js`**:
   - `GET /api/draft` (lines 599–607): Returns HTTP 200 with `{ draft }`.
   - `POST /api/draft/needs` (lines 609–642): Validates non-empty `name` and positive numeric `quantity`. Returns HTTP 201 with `{ draft, need }` and `Location: /api/draft/needs/:needId`.
   - `PATCH /api/draft/needs/:needId` (lines 644–680): Updates need properties (`name`, `quantity`, `unit`, `note`). Returns HTTP 200 with `{ draft }` or HTTP 404 if ID does not exist.
   - `POST /api/draft/needs/:needId/resolve` (lines 682–716): Requires `reference.title`. Strictly preserves string codes (`genericCode`, `brandCode`). Returns HTTP 200 with `{ draft }` or HTTP 404.
   - `POST /api/draft/revert` (lines 718–741): Requires `eventId`. Reverts via compensating event. Returns HTTP 200 with `{ draft }` or HTTP 404.
   - `GET /api/catalog/search` (lines 743–753): Reads `q` and `limit`. Returns HTTP 200 with `{ results }`.
   - `POST /api/stock/check` (lines 755–776): Dispatches to `adapter.checkStock`. Returns HTTP 200 with stock availability.
   - `POST /api/orders/export-batch` (lines 778–802): Dispatches to `runExportBatch`. Enforces 4-tier validation barrier. Returns HTTP 200 with `{ batch, discrepancies, uniqueId, status, pricingSummary }`.

4. **Universal CORS Preflight (`OPTIONS`) in `src/server.js:538-560`**:
   - For `/mcp`: Returns HTTP 204 with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS`, `Access-Control-Allow-Headers: content-type, mcp-session-id`, `Access-Control-Expose-Headers: Mcp-Session-Id`.
   - For `/api/*`: Returns HTTP 204 with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id`, `Access-Control-Expose-Headers: Location`.
   - All other routes: Returns HTTP 404.

5. **Stream Isolation in `src/server.js`**:
   - At lines 570–594, requests to `/mcp` are routed directly to `transport.handleRequest(request, response)` without prior body consumption.
   - At lines 613, 650, 688, 722, 759, 783, REST requests consume the stream via `readJsonBody(request)` with a 1MB size threshold and JSON schema validation.

6. **Catalog Resolver Invariants in `src/catalog-resolver.js`**:
   - `normalizeDigits` (lines 19–22): Character-by-character mapping of Persian (`۰-۹`) and Arabic (`٠-٩`) digits preserving leading zeroes.
   - `normalizeCodeString` (lines 55–59): Uses `String(code).trim()` and `normalizeDigits` without numeric coercion.
   - `normalizeText` (lines 32–50): Strips diacritics, normalizes Yeh/Keheh, and converts ZWNJ (`\u200c`) to space.
   - `scoreCandidate` (lines 245–339): 5-tier scoring hierarchy (Exact Code: 1.0; Exact Title/Alias: 0.97–0.99; Prefix: 0.90; Multi-token overlap with dosage/strength boosts: up to 0.95; Substring: 0.50–0.80).
   - `resolveItem` (lines 393–469): Detects runner-up ambiguity when margin < 0.15.

7. **MCP Tools Expansion**:
   - Discovery over `/mcp` returns 9 tools: `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`, `search_catalog`, `check_stock`, `export_order_batch`.
   - Cross-protocol execution verified: State mutations via MCP tools are instantly reflected in REST endpoints (`/api/draft`).

---

## 2. Logic Chain

1. **Contract Conformance Verification (Supported by Observations 1, 3, 4, 7)**:
   - `PROJECT.md:73-82` specifies exact REST route signatures, HTTP response status codes, and JSON response bodies.
   - Verification confirms that each endpoint returns the exact required status code (200, 201 with Location, 204 for OPTIONS, 400 for validation errors, 404 for missing resources).
   - In `Tier 1: Feature Coverage` and `server-rest.test.js`, all 18 REST test cases pass, confirming complete adherence to the contract.

2. **Stream Isolation & Transport Integrity (Supported by Observation 5)**:
   - Node.js readable streams can only be read once.
   - Because `/mcp` delegates directly to `@modelcontextprotocol/sdk` Streamable HTTP transport without consuming request body chunks first, and `/api/*` reads the body in isolated handlers via `readJsonBody`, there is zero risk of premature stream exhaustion between protocols.

3. **Leading Zero Preservation Verification (Supported by Observations 1, 6)**:
   - Codes like `"00001"`, `"08234"`, `"00025"`, `"00115"`, and `"00999"` must retain their 5-character string identity through text normalization, search, need resolution, and batch order generation.
   - Verifying `searchCatalog("00001")` and `searchCatalog("۰۰۰۰۱")` demonstrates strict string retention (`typeof item.genericCode === "string"`, `item.genericCode === "00001"`).

4. **Integrity & Authenticity Assessment (Supported by Observations 1, 2, 6, 7)**:
   - Source code grep reveals no test mock intercepts, hardcoded test strings, or dummy facade shortcuts.
   - Test count increased from 85 to 113, reflecting 28 genuine new unit and integration test assertions covering catalog resolution, CORS preflight, malformed JSON handling, and MCP tool invocations.

---

## 3. Findings

### [Minor] Finding 1: Query Parameter Number Coercion in `/api/catalog/search`
- **What**: In `src/server.js:746`, `limit` is parsed using `Number(url.searchParams.get("limit") ?? 20)`. If a non-numeric string is supplied (e.g. `?limit=invalid`), `Number()` returns `NaN`. `Math.max(1, Math.min(100, NaN))` evaluates to `NaN`, causing `results.slice(0, NaN)` to return an empty array `[]`.
- **Where**: `src/server.js:746`
- **Why**: Non-numeric query parameters should degrade gracefully to the default value (20) rather than returning 0 items.
- **Suggestion**: Use `const rawLimit = Number(url.searchParams.get("limit")); const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;`.

### [Minor] Finding 2: Unmatched Method Status Codes on API Routes
- **What**: When an unhandled HTTP method (such as `PUT` or `DELETE`) is requested against `/api/draft`, the server returns HTTP 404 instead of HTTP 405 Method Not Allowed.
- **Where**: `src/server.js:805`
- **Why**: While 404 is safe and does not cause data leakage or failures, HTTP 405 with an `Allow` header is more standard REST design.
- **Suggestion**: Return HTTP 405 when the URL path matches an existing resource but the HTTP method is unsupported.

---

## 4. Adversarial Challenges

**Overall Risk Assessment**: **LOW to MEDIUM**

### [Medium] Challenge 1: Partial Token Containment Collision on Short Alphanumeric Tokens
- **Assumption challenged**: In `scoreCandidate` (`src/catalog-resolver.js:300–304`), partial token matching (`for (const ct of candidateTokens) { if (ct.includes(qt) || qt.includes(ct)) matchedTokens += 0.5; }`) assumes that substring containment between query tokens and catalog tokens indicates semantic relevance.
- **Attack scenario**: Catalog items contain short tokens from strengths and dosages (such as `"1"`, `"g"` from `"1 g"` in `Out of Stock Item`, or `"10"`, `"5"` from `"10 mg / 5 ml"` in `Sample Vial`). If a user enters an unlisted query containing digits (e.g. `"XYZNONEXISTENTMEDICINE12345"`), `qt.includes("1")` evaluates to `true`. Because `queryTokens.length === 1`, `overlapRatio` is calculated as 0.5 / 1 = 0.5, giving a base score of 0.40 (+0.08 strength boost = 0.48). This promotes irrelevant items into candidates and causes `resolveItem` to report `confidence: "medium"` and `isAmbiguous: true` rather than `confidence: "none"`.
- **Blast radius**: A user entering an uncatalogued free-text item containing numbers or short letters may see unintended candidate suggestions instead of an empty candidate list.
- **Mitigation**: Require a minimum token length threshold (e.g. `Math.min(ct.length, qt.length) >= 3`) before evaluating partial token containment in `scoreCandidate`.

---

## 5. Verified Claims

- Claim: `npm test` runs with 113 passing tests and 0 skipped.  
  -> **VERIFIED** via `npm test` tool output (113 pass, 0 fail, 0 skipped, exit code 0).
- Claim: `PANELPH_E2E_STRICT=1 npm test` runs with 100% passing tests.  
  -> **VERIFIED** via `PANELPH_E2E_STRICT=1 npm test` tool output (113 pass, 0 fail, 0 skipped, exit code 0).
- Claim: Preflight `OPTIONS` returns 204 with CORS headers for `/api/*` and `/mcp`.  
  -> **VERIFIED** via direct HTTP request testing in Node and unit tests in `test/server-rest.test.js:40-47`.
- Claim: Codes with leading zeroes (`00001`, `08234`, `00025`, `00115`, `00999`) strictly preserve string identity.  
  -> **VERIFIED** via unit tests in `test/catalog-resolver.test.js:13-35` and standalone execution.
- Claim: Dual-protocol state consistency between MCP and REST.  
  -> **VERIFIED** via end-to-end script modifying draft via MCP `add_order_need` and inspecting `/api/draft`.
- Claim: Discrepancy barrier blocks unready drafts from batch order export.  
  -> **VERIFIED** via tests in `test/server-rest.test.js:238-258` and direct script execution.

---

## 6. Coverage Gaps & Unchallenged Areas

- **Full-Text Search Engine Scaling**: The catalog resolver currently operates against in-memory objects (`BUILTIN_REFERENCE_ITEMS` and mock fixtures), which is appropriate for development and offline testing. Scaling to production pharmacopeias (50,000+ TTAC medicines) will require external database indexing (e.g. SQLite FTS5 or Meilisearch). Risk Level: Low (M2 scope explicitly covers modular in-memory resolver with adapter injection).

---

## 7. Caveats

- **Persistent Mutex Locking (Milestone 3 Scope)**: The current Milestone 2 implementation protects the draft store in memory via `wrapWithMutex`. Full file-level atomic locking (`.tmp` write followed by atomic rename) across multiple separate processes is scheduled for Milestone 3 (`F13`, `F14`).

---

## 8. Conclusion

Milestone 2 (Operational Backend & MCP Tools) fulfills all functional, architectural, and interface requirements:
- The REST API provides full CRUD, ambiguity resolution, compensating reverts, stock queries, and batch export.
- Universal CORS preflight (`OPTIONS` -> 204) properly resolves earlier test skips for `F9` and `F11`.
- MCP tools are expanded to 9 operational tools with verified execution.
- Drug codes with leading zeros are strictly preserved as strings without numeric coercion.
- The test suite is 100% green (113/113 passing) in both normal and strict modes.
- Zero integrity violations were found.

**Verdict**: **APPROVE**

---

## 9. Verification Method

To independently reproduce this verification:

1. **Execute Test Suite**:
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   *Expected output*: `113 pass, 0 fail, 0 skipped`, exit code 0.

2. **Execute Strict Mode Test Suite**:
   ```bash
   cd /home/admin/PanelPH && PANELPH_E2E_STRICT=1 npm test
   ```
   *Expected output*: `113 pass, 0 fail, 0 skipped`, exit code 0.

3. **Verify String Code Retention**:
   ```bash
   node -e 'import("./src/catalog-resolver.js").then(m => {
     const res = m.searchCatalog("00001");
     if (typeof res[0].genericCode !== "string" || res[0].genericCode !== "00001") throw new Error("Coercion detected");
     console.log("Verified:", res[0].genericCode);
   })'
   ```

4. **Invalidation Conditions**:
   - If `npm test` reports skipped tests, `OPTIONS` preflight handler is missing or misconfigured.
   - If `res[0].genericCode` evaluates to numeric `1`, leading zero preservation is broken.
   - If empty or unresolved drafts can be exported via `POST /api/orders/export-batch` with `success: true`, discrepancy barrier logic is invalid.
