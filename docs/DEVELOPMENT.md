# Development Guide

GitHub repository: `hosseintajdari/Bale-Med-Prices`

Local folder convention: `BaleMedPrices`

## Commands

```bash
# Run all 111 unit & integration tests
npm test

# Run API & web server
npm run dev:api

# Run Bale price bot (polling mode)
npm run dev:bale-bot

# Run Telegram price bot (polling mode)
npm run dev:telegram-bot
```

## Architecture

- `packages/domain` owns pricing calculation rules, domain types, and canonical doctor-grade price formatting (`formatPriceFa`, `formatPriceBlock`, Persian digit conversion).
- `apps/api` owns HTTP endpoints, catalog search with live web aggregator fallback, price caching, and bot webhooks (`/telegram/webhook`, `/bale/webhook`).
- `apps/bale-bot` owns Bale bot update processing, doctor-grade pricing display, and one-tap copy callbacks.
- `apps/telegram-bot` owns Telegram twin bot implementation with identical formatting and callback handling.
- `apps/web` owns the web shell and static prototype assets.
- `docs` owns product specifications, roadmap, ADRs, and architectural decisions.

## Test Suite

The test suite runs with Node's native test runner (`node --experimental-strip-types --test`) and covers 111 tests across:
- `packages/domain`: pricing calculations, taxes, format-price rules, doctor-grade representations
- `apps/api`: HTTP endpoints, health probe, webhooks, rate-limiting, LRU price caching, catalog normalization, live aggregator
- `apps/bale-bot` & `apps/telegram-bot`: bot configuration, command extraction, copy callbacks, message presentation

## Bot Configuration

Both bots support polling and webhook modes:
- Copy `.env.bale.example` to `.env.bale` for Bale bot settings (`BALE_BOT_TOKEN`, `API_BASE_URL`, optional `BALE_WEBHOOK_URL`).
- Copy `.env.telegram.example` to `.env.telegram` for Telegram bot settings (`TELEGRAM_BOT_TOKEN`, `API_BASE_URL`, optional `TELEGRAM_WEBHOOK_URL`).

## Agent/IDE Guidance

- Read `AGENTS.md` before changing code.
- Keep unrelated repositories, especially `Bale-Med`, out of scope.
- Do not commit `.codex/`, `.cursor/tmp/`, `local-inputs/`, or generated `output/`.
- Prefer GitHub branches for parallel work across Codex, Cursor, VS Code, or other agents.
- When multiple agents work on the same project, use separate branches or worktrees.

## Local Reference Inputs

`local-inputs/` can contain large or private internal reference material.
It is intentionally ignored by Git. If a decision depends on local reference
material, summarize the decision in `docs/` instead of committing the source
material.
