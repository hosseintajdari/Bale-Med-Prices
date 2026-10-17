# Task Dispatch: Milestone 1 — Pricing & Stock Rules Exploration (Explorer 2)

## Objective
Explore the implementation requirements for Milestone 1: Stock checks, deterministic pricing calculation, and code string preservation.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Architecture: `/home/admin/PanelPH/PROJECT.md`
- Survey Reports: `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md`
- Pricing Rules: `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.ts`, `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-tax.ts`

## Focus
1. Define the exact deterministic calculation logic for `calculatePrice`:
   - `basePrice = round(unitBasePrice * quantity)`
   - `totalTax = round(quantity * averageTax)`
   - `taxAmount = round(totalTax * 0.75)` (VAT)
   - `tollAmount = totalTax - taxAmount` (municipal toll)
   - `technicalFee = round(appliedRule.amount * quantity)`
   - `finalPrice = basePrice + taxAmount + tollAmount + technicalFee`
   - Price divergence warning if `|TTAC_price - Qanoon_price| > 10,000` Rials.
2. Define the exact stock check logic (`checkStock`) for advisory preliminary check and pre-batch check.
3. String preservation for generic and brand codes (ensure no accidental coercion to number that strips leading zeroes).
4. Recommend concrete unit tests for `test/qanoon-adapter.test.js`.

## Deliverables
- Report at `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md`
- Handoff at `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2/handoff.md`


## 2026-10-14T09:34:36Z
[Message] timestamp=2026-10-14T09:34:36Z sender=ba9cb93f-aa16-41f9-a7c1-f88d790936d4 priority=MESSAGE_PRIORITY_HIGH content=You are m1_explorer_2, a Pricing and Stock Rules Explorer.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m1_explorer_2
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m1_explorer_2/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Explore stock check rules, 7-step deterministic pricing calculation, tax/toll 75/25 split, TTAC divergence warnings, and leading-zero string preservation.
Write your analysis to /home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m1_explorer_2/handoff.md.
Send a message back to the orchestrator when finished.
