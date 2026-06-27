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

## Cursor Cloud specific instructions

- This is a zero-dependency Node.js + TypeScript monorepo (npm workspaces). It runs `.ts` directly via Node's `--experimental-strip-types`, so it requires Node 22+ (the VM has v22). There is nothing to compile; `npm run build` is an intentional no-op stub.
- There is no lint tooling configured (no ESLint/Prettier/tsc); the only verification step is `npm test` (see `package.json`).
- `npm run dev:api` starts the HTTP API on port 4000 and also serves the `apps/web` static frontend from the same server, so that one command runs the full product (open `http://localhost:4000`). Override the port with `PORT`.
- The server has no auto-reload/watch; restart `npm run dev:api` after editing API or web code to pick up changes.
- All data is in-memory mock data (`apps/api/src/data/mock-data.ts`); no database or external services are needed. Useful good ids include `g-1001` (Amoxicillin). Search supports Persian and English aliases.
