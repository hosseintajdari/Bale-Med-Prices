# Contributing

This is a private project. Treat GitHub as the source of truth and keep local
IDE or agent work synchronized through branches and pull requests.

## Setup

```powershell
git clone https://github.com/hosseintajdari/Bale-Med-Prices.git
cd Bale-Med-Prices
npm test
```

## Development Rules

- Keep patient-facing behavior covered by tests.
- Run `npm test` before pushing.
- Keep private reference files in `local-inputs/`; never commit that folder.
- Do not commit secrets, `.env` files, generated output, or local Codex state.
- Put shared pricing rules in `packages/domain`.
- Put API orchestration and bot-facing behavior in `apps/api`.

## Branches

Use short descriptive branches:

```text
feature/telegram-selection
fix/patient-price-text
docs/pricing-rules
```

## Pull Requests

Each PR should include:

- what changed
- why it changed
- tests run
- any known limitations
