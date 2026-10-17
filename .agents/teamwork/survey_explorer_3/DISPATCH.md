# Task Dispatch: Frontend & UI Spec Survey

## Objective
Survey the pharmacist frontend specifications, existing UI files, Apps SDK widget requirements, interaction flows, theme requirements, and status indicators.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- UI design: `/home/admin/PanelPH/docs/UI-DESIGN.md`
- Frontend code/assets: `/home/admin/PanelPH/public/order-desk.html` and any existing static assets or templates
- ADRs: `/home/admin/PanelPH/docs/adr/`

## Key Questions to Answer
1. What frontend files currently exist in `/home/admin/PanelPH/public` or elsewhere?
2. What are the UI requirements in `docs/UI-DESIGN.md` (layout, component tree, interaction patterns)?
3. How should rapid free-text item capture be designed and work?
4. How should the ambiguity resolution drawer/modal operate?
5. What are the live draft status indicators (`open`, `needs_completion`, `ready_for_review`, etc.) and transitions?
6. How does dark/light theme integration work with host design principles (e.g. ChatGPT Apps SDK / ChatGPT desktop/web theme sync)?
7. What API/MCP endpoints does the UI interact with?

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3/frontend_survey_report.md` and complete `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3/handoff.md`.
Send a completion message back to the orchestrator when finished.


## 2026-10-14T09:22:26Z
[Message] timestamp=2026-10-14T09:22:26Z sender=ba9cb93f-aa16-41f9-a7c1-f88d790936d4 priority=MESSAGE_PRIORITY_HIGH
Content:
You are survey_explorer_3, a Frontend & UI Spec Explorer.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/survey_explorer_3
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/survey_explorer_3/DISPATCH.md and /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md first.
Survey docs/UI-DESIGN.md, public/order-desk.html, existing UI assets, Apps SDK widget requirements, theme handling, ambiguity drawer/modal, and live draft status indicators.
Write your detailed report to /home/admin/PanelPH/.agents/teamwork/survey_explorer_3/frontend_survey_report.md and your handoff to /home/admin/PanelPH/.agents/teamwork/survey_explorer_3/handoff.md.
Send a message back to the orchestrator when finished.
