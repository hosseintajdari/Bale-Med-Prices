# Bale Med Prices

Private repository: `hosseintajdari/Bale-Med-Prices`

Consumer medicine price finder focused on patient-safe search, disambiguation,
and unit-price answers derived from Qanoon Pharma pricing logic with
TTAC-shaped medicine identity and enrichment behavior.

## Overview

This project aims to provide a clear patient-facing medicine lookup flow that:

- finds medicines from Persian and English patient input
- resolves ambiguous names through compact, bot-friendly selection steps
- keeps early selection price-safe and identity-first
- returns an explicit consumer unit price such as price per tablet
- leaves room for richer TTAC detail after final medicine resolution

Core product and rule references live in:

- `docs/PRD.md`
- `docs/pricing-rules.md`
- `docs/search-quality.md`
- `CONTEXT.md`

## Quick Start

```powershell
npm test
npm run dev:api
```

## Repository Layout

- `apps/api`: API, bot orchestration, and medicine-selection behavior
- `apps/web`: frontend shell
- `packages/domain`: shared pricing rules and domain types
- `docs`: product, pricing, and search references
- `local-inputs/`: private local source material ignored by Git

## Development Workflow

Use GitHub as the source of truth:

1. create a short-lived branch
2. keep changes scoped to one behavior or one reviewable slice
3. run `npm test`
4. push the branch and open a pull request
5. merge only after the branch is reviewed and CI is green

## Local Inputs

Large or private Qanoon Pharma reference files belong in `local-inputs/`.
That directory is intentionally ignored by Git. Keep source code, tests, and
shared documentation in tracked repository paths.

## MVP Scope

- search goods in Persian and English
- get a good by id
- return unit consumer price for a given date
- show the consumer-facing price clearly
- preserve linkable search state in the web UI
- keep the API simple enough for bot integrations

## Not In MVP

- insurance workflows
- internal profit analysis in patient-facing channels
- full inventory management
- full medicine detail sync from every external source
