# Task Dispatch: Milestone 2 (Iteration 2) — Alef Normalization & Alias Sanitization Explorer

## Objective
Analyze and formulate exact fix recommendations for the catalog resolution defects identified by Challenger 2 in `src/catalog-resolver.js`.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Challenger 2 Findings: `/home/admin/PanelPH/.agents/teamwork/m2_challenger_2/challenge_report.md`
- Catalog resolver code: `/home/admin/PanelPH/src/catalog-resolver.js`

## Findings to Remediate
1. Alef normalization defect: `normalizeText` currently does not map Alef variants (`[آأإٱ]` -> `ا` and `[يى]` -> `ی`). As a result, searching for bare Alef `"اموکسی"` fails to match `"آموکسی سیلین"`, and `"آستامینوفن"` fails to match `"استامینوفن"`.
2. Spurious generic alias matching: `scoreCandidate` executes unconditional substring checks `normQuery.includes(alias)` against generic single-word dosage forms (`"ویال"`, `"شربت"`). Queries like `"ویال سفتریاکسون ۱ گرم"` incorrectly match `"Educational Sample Vial"` with score 0.65.
3. Formulate exact regex and scoring adjustments to ensure robust bilingual normalization and eliminate false positive alias boosts.

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2/analysis.md` and handoff to `/home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2/handoff.md`.
Send a completion message to the orchestrator.

## 2026-10-14T10:37:05Z
You are m2_explorer_r2_2, an Explorer for Milestone 2 (Iteration 2) of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Analyze the Alef variant normalization defect ([آأإٱ] -> ا and [يى] -> ی) and spurious generic alias matching in src/catalog-resolver.js and formulate exact regex and scoring fix recommendations.
Write your analysis to /home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2/analysis.md and handoff to /home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_2/handoff.md.
Send a message back to the orchestrator when finished.
