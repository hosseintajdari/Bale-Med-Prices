## 2026-10-14T15:09:44Z
From: 7625a001-7a29-4bf5-9e8c-d5feff17e404
Priority: MESSAGE_PRIORITY_HIGH

You are M4 Spec Miner 1 (Gen 7) for the PanelPH project.
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m4_spec_miner_1_gen7
The project root is: /home/admin/PanelPH
The authoritative user request is at: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope is at: /home/admin/PanelPH/PROJECT.md

Your mission is authoritative specification mining for Milestone 4 (Pharmacist Frontend & Apps SDK):
1. Deeply inspect the core UI specifications in `docs/UI-DESIGN.md`, `docs/adr/ADR-001-private-chatgpt-mcp-workspace.md`, and `ORIGINAL_REQUEST.md § R3`.
2. Extract exact technical and visual requirements for:
   - F15: Free-text need entry form (fields: item name/rawText, quantity, unit, note; keyboard shortcuts; validation; RTL layout).
   - F16: Ambiguity resolution drawer / modal (sliding drawer or modal triggered by "Resolve" button on `needs_completion` items, displays live catalog search candidates from `/api/catalog/search`, allows selecting brand/generic codes, IRC/TTAC references, and submitting resolution via `/api/draft/needs/:id/resolve`).
   - F17: Live draft overview & status indicators (`open`, `needs_completion`, `ready_for_review`), summary counts (`itemCount`, `ambiguityCount`), and discrepancy indicators.
   - F18: Host context & theme synchronization (support automatic dark/light theme matching host via CSS variables, media query `prefers-color-scheme`, and ChatGPT Apps SDK postMessage / context events).
   - F19: Event history timeline & compensating revert buttons (visual reverse-chronological event log with action badges and instant revert button invoking `/api/draft/revert`).
3. Write a comprehensive, structured handoff report in `/home/admin/PanelPH/.agents/teamwork/m4_spec_miner_1_gen7/handoff.md` detailing all specifications, DOM IDs/classes, CSS theme tokens, and interaction flows.
4. Send a completion message to your parent orchestrator.
