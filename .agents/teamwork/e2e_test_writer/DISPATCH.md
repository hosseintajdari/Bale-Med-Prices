# Task Dispatch: E2E Test Suite Design (Dual Track)

## Objective
Design and implement the complete opaque-box E2E test suite for PanelPH derived strictly from user requirements and public interfaces, without dependencies on internal module implementation details.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Architecture & Feature Inventory: `/home/admin/PanelPH/PROJECT.md`
- Reference Data: `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- UI Design: `/home/admin/PanelPH/docs/UI-DESIGN.md`

## Requirements
1. Follow the 4-tier test case design methodology:
   - Tier 1: Feature Coverage (happy-path tests verifying each feature in isolation)
   - Tier 2: Boundary & Corner Cases (empty inputs, invalid formats, leading zeros preservation, out-of-stock items, price divergence thresholds, extreme quantities)
   - Tier 3: Cross-Feature Combinations (free text entry -> resolution -> stock check -> price calculation -> batch export -> event revert)
   - Tier 4: Real-World Application Scenarios (realistic pharmacist shifts: rapid prescription entry, out-of-stock substitution, network retry with same uniqueId, draft resumption)
2. Use Node.js native test runner (`node --test`). Place all tests in `test/e2e/`.
3. Create `TEST_INFRA.md` at project root using the standard template documenting philosophy, feature checklist, test architecture, and runner commands.
4. When the test harness and test cases are ready, create `TEST_READY.md` at project root summarizing coverage counts and command to run the suite.
5. Do NOT modify implementation code (`src/` or `public/`).

## Deliverables
- `TEST_INFRA.md` at `/home/admin/PanelPH/TEST_INFRA.md`
- E2E tests in `/home/admin/PanelPH/test/e2e/*.test.js`
- `TEST_READY.md` at `/home/admin/PanelPH/TEST_READY.md`
- Handoff report in `/home/admin/PanelPH/.agents/teamwork/e2e_test_writer/handoff.md`

## 2026-10-14T09:34:36Z
You are e2e_test_writer, an E2E Test Suite Designer.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/e2e_test_writer
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/e2e_test_writer/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Design and implement the opaque-box automated E2E test suite covering Tiers 1-4 for all features in PROJECT.md.
Create /home/admin/PanelPH/TEST_INFRA.md and test cases in /home/admin/PanelPH/test/e2e/.
When complete, create /home/admin/PanelPH/TEST_READY.md and write your handoff to /home/admin/PanelPH/.agents/teamwork/e2e_test_writer/handoff.md.
Send a message back to the orchestrator when finished.
