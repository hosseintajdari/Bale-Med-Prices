## 2026-10-14T10:36:50Z

You are an Explorer agent for Milestone 2 Iteration 2 of the PanelPH project.
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2

Read the following authoritative documents first:
1. /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/admin/PanelPH/PROJECT.md
3. Previous Challenger 2 failure report at: /home/admin/PanelPH/.agents/teamwork/m2_challenger_2/handoff.md

Your task:
Investigate alias scoring and false-positive candidate ranking in `src/catalog-resolver.js`.
Challenger 2 discovered that generic single-word dosage forms (like "ویال", "شربت", "کرم") and status placeholders ("ناموجود") exist in `BUILTIN_REFERENCE_ITEMS` aliases and in `scoreCandidate`, the unconditional check `normQuery.includes(alias)` assigns a 0.65 score. As a result, specific clinical queries like "ویال سفتریاکسون ۱ گرم" match "Educational Sample Vial" as the top suggested reference and trigger spurious ambiguity warnings.
Analyze:
1. Which generic terms in `BUILTIN_REFERENCE_ITEMS` should be cleaned or refined.
2. How `scoreCandidate` should evaluate aliases (e.g. requiring exact match or token/word boundary matching rather than substring containment, or penalizing short generic aliases).
3. Specify exact proposed code modifications and regression test cases for `test/catalog-resolver.test.js`.

Write your structured findings and recommendations to `/home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2/handoff.md`.
When done, send a message back with your conclusion.
