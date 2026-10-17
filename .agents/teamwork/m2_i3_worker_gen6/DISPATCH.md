## 2026-10-14T14:12:59Z
You are the Milestone 2 Remediation Worker (`m2_i3_worker_gen6`).
Your assigned working directory is: `/home/admin/PanelPH/.agents/teamwork/m2_i3_worker_gen6`
The project root is: `/home/admin/PanelPH`
Authoritative user request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (You MUST read this before starting work).
Project scope & contracts: `/home/admin/PanelPH/PROJECT.md`
Challenger 1 findings: `/home/admin/PanelPH/.agents/teamwork/m2_i3_challenger_1/handoff.md`
Challenger 1 empirical test suite: `/tmp/m2_i3_challenger_1_suite.mjs`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Task:
Exclusively modify `src/catalog-resolver.js` to address the compact dosage and bare numeric strength matching vulnerability identified by Challenger 1:
1. In `src/catalog-resolver.js`, pure dosage queries (e.g. "500mg", "325mg", "120ml", "1000iu", "۵۰۰میلی‌گرم", "500 mg", "۵۰۰ میلی گرم") without any active ingredient name must NOT auto-resolve to specific medications (such as Amoxicillin or Acetaminophen) and must return 0 hits/score 0.
   - Define a compact dosage regex, e.g.:
     `const COMPACT_DOSAGE_REGEX = /^\d+(?:\.\d+)?(?:mg|ml|g|iu|mcg|گرم|میلی|لیتر|واحد)$/i;`
   - Use it in `scoreCandidate` lines 337-345 and in `searchCatalog` lines 470-477 to ensure that any query composed only of digits and dosage/unit tokens (spaced or compact) scores 0 / returns [].
   - In Tier 4 token overlap (line 369), mark compact dosage tokens as generic/non-substantive:
     `const isGeneric = GENERIC_MEASURE_OR_STOP_TOKENS.has(qt) || /^\d+$/.test(qt) || COMPACT_DOSAGE_REGEX.test(qt);`
2. In Tier 5 Substring Containment (`src/catalog-resolver.js:407-415`):
   - Disallow pure numeric queries from matching drug titles via substring:
     `!/^\d+$/.test(normQuery)` and `!COMPACT_DOSAGE_REGEX.test(normQuery)`
   - Pure numeric codes like "00001" or "08234" still resolve via Tier 1 code matching with score 1.0; only non-code bare numbers (like "500" or "325") are prevented from falsely substring-matching titles.
3. Run the following verification commands:
   - `node /tmp/m2_i3_challenger_1_suite.mjs` (must pass 11/11 checks with exit code 0)
   - `node /tmp/m2_i2_adversarial_suite.mjs` (must pass 28/28 checks with exit code 0)
   - `node /tmp/adversarial_challenger_2.mjs` (must pass 95/95 checks with exit code 0)
   - `npm test` (all 127 tests must pass with exit code 0, 0 skips, 0 fails)
   - `node --check src/catalog-resolver.js` (must exit 0)
4. Write your completion report to `/home/admin/PanelPH/.agents/teamwork/m2_i3_worker_gen6/handoff.md` with:
   - Observation: Verbatim outputs and exit codes of all verification commands.
   - Logic Chain: Explanation of changes made.
   - Caveats: Any limitations.
   - Conclusion: Status.
5. Send a message to your caller when done with a summary and path to your handoff.md.
