# Task Assignment: Milestone 2 Iteration 3 Explorer 2

## Working Directory
`/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_2`

## Authoritative User Request
`/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`

## Scope Document
`/home/admin/PanelPH/PROJECT.md`

## Prior Gate Feedback
Read the Gate 2 Iteration 2 reports:
- `/home/admin/PanelPH/.agents/teamwork/m2_i2_challenger_1/handoff.md`
- `/home/admin/PanelPH/.agents/teamwork/m2_i2_challenger_2/handoff.md`
- `/home/admin/PanelPH/.agents/teamwork/m2_i2_reviewer_2/handoff.md`

## Task Description
Analyze and blueprint exact, robust remediations for:
1. `src/catalog-resolver.js`:
   - Punctuation / empty query handling: If `normQuery.length === 0`, return 0 score and empty search hits (prevent `","` from matching everything with score 0.90 via `startsWith("")`).
   - Generic token query rejection: If all tokens of `normQuery` belong to `GENERIC_MEASURE_OR_STOP_TOKENS` or match `/^\d+$/`, immediately return 0 score in `scoreCandidate` (reject isolated units `"mg"`, `"ml"`, `"واحد"`, isolated dosages `"۵۰۰ میلی گرم"`, standalone dosage forms `"کرم"`, `"ویال"`, `"شربت"`, and statuses `"ناموجود"`).
   - In Tier 3 prefix match, check that `normQuery.length >= 3` and `!GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery)`.
   - In Tier 5 substring match, check that `normQuery.length >= 3` and that query contains at least one substantive token.
2. Formulate a patch blueprint and verify against test cases.
3. Write your report in `/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_2/handoff.md`.


## 2026-10-14T13:36:37Z
You are Milestone 2 Iteration 3 Explorer 2 for PanelPH.
Working directory: /home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_2
Authoritative user request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /home/admin/PanelPH/PROJECT.md
Read DISPATCH.md at /home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_2/DISPATCH.md.

Analyze `src/catalog-resolver.js` edge cases: punctuation collapse to score 0.90, generic isolated units/dosages/statuses matching prefix/substring.
Blueprint exact token filters, query length guards, and tests in `test/catalog-resolver.test.js`.
Deliver your report to `/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_2/handoff.md` and message the orchestrator when done.
