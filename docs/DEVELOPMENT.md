# Development Guide

GitHub repository: `hosseintajdari/Bale-Med-Prices`

Local folder convention: `BaleMedPrices`

## Commands

```powershell
npm test
npm run dev:api
```

## Architecture

- `packages/domain` owns pricing rules and domain types.
- `apps/api` owns HTTP endpoints, bot response contracts, and application services.
- `apps/web` owns the current web shell and static prototype.
- `docs` owns product decisions, roadmap, pricing rules, and ADRs.

## Agent/IDE Guidance

- Read `AGENTS.md` before changing code.
- Keep unrelated repositories, especially `Bale-Med`, out of scope.
- Do not commit `.codex/`, `.cursor/tmp/`, `local-inputs/`, or generated `output/`.
- Prefer GitHub branches for parallel work across Codex, Cursor, VS Code, or other agents.
- When multiple agents work on the same project, use separate branches or worktrees.

## Local Reference Inputs

`local-inputs/` can contain large or private Qanoon Pharma reference material.
It is intentionally ignored by Git. If a decision depends on local reference
material, summarize the decision in `docs/` instead of committing the source
material.
