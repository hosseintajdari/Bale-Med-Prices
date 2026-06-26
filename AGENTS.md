# Agent Notes

Project name in GitHub: `hosseintajdari/Bale-Med-Prices`

Local folder name may be `BaleMedPrices`.

## Rules

- Do not touch unrelated local projects, especially `Bale-Med`.
- Keep `local-inputs/` out of Git; it can contain large, private, or binary
  reference material.
- Run `npm test` after code changes.
- Keep patient-facing price text clear and concise.
- Keep pricing rules in `packages/domain` and API orchestration in `apps/api`.
- Prefer small, focused commits with tests.
- Do not commit generated output, local reference inputs, secrets, or editor temp files.

## Repository Layout

- `apps/api/`: HTTP API, bot-facing controllers, services, and mock repositories.
- `apps/web/`: frontend shell and static prototype.
- `packages/domain/`: shared pricing rules and domain types.
- `docs/`: product, data, pricing, roadmap, and ADR documents.
- `local-inputs/`: private local reference material; ignored by Git.

## Useful Commands

```powershell
npm test
npm run dev:api
```
