# BRIEFING — 2026-10-14T10:08:45Z

## Mission
Explore design and implementation for src/catalog-resolver.js to support progressive medicine catalog search and resolution while strictly preserving leading zeroes.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: /home/admin/PanelPH/.agents/teamwork/m2_explorer_2
- Original parent: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Milestone: Milestone 2 — Catalog Resolver & Search

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in src/ or test/ directly
- Confine exploration reports to /home/admin/PanelPH/.agents/teamwork/m2_explorer_2
- Strictly preserve leading zeroes for genericCode and brandCode
- Support English and Persian drug search
- Support progressive resolution without blocking free-text need capture

## Current Parent
- Conversation ID: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`, `docs/REFERENCE-DATA.md`, `docs/qanoon-api-spec.md`, `docs/UI-DESIGN.md`
  - `fixtures/catalog.sample.json`, `fixtures/qanoon-mock-data.json`
  - `src/adapters/qanoon-adapter.js`, `src/server.js`, `src/draft-store.js`
  - `test/e2e/test-helper.js`, `test/e2e/tier1-feature-coverage.test.js`, `test/e2e/tier2-boundary-corner.test.js`, `test/server.test.js`, `test/draft-store.test.js`
- **Key findings**:
  1. `src/catalog-resolver.js` does not exist yet; must be implemented in M2.
  2. Return schema must include `genericCode`, `brandCode`, `title`, `persianTitle`, `dosageForm`, `strength`, `sellPrice`, `tempPrice`, `score`, and `goodId`.
  3. Persian/Arabic text search requires character normalization (ی/ي, ک/ك, آ/ا, ة/ه), digit mapping (۰-۹ to 0-9), ZWNJ normalization, and token-based multi-field matching.
  4. Leading zero preservation strictly requires string primitive types, raw string comparison, and avoiding all `Number()`, `parseInt()`, or `+` conversions.
  5. Decoupling contract: `addNeed()` never triggers catalog lookup; resolution is strictly user-confirmed and reversible.
- **Unexplored areas**: None for M2 scope; ready for synthesis and reporting.

## Key Decisions Made
- Design `CatalogResolver` as both a configurable factory `createCatalogResolver(options)` and top-level helper `searchCatalog(query)`.
- Use `fixtures/qanoon-mock-data.json` as primary default dataset, with optional adapter injection.
- Implement token-based relevance scoring with exact code matches scoring 1.0, exact titles 0.95, and multi-token matches 0.85.

## Artifact Index
- `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/DISPATCH.md` — Dispatch instructions
- `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/BRIEFING.md` — Persistent working memory
- `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/progress.md` — Liveness heartbeat
- `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md` — Detailed analysis report
- `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/handoff.md` — 5-component handoff report
