# Bale Med Prices

Private repository: `hosseintajdari/Bale-Med-Prices`

Consumer medicine price finder extracted from the observed pricing logic in Qanoon Pharma, integrated with live public medicine pricing sources and twin bots for Bale and Telegram.

## Quick Start

```bash
# Run full test suite (111 unit & integration tests)
npm test

# Run API & web server (default port: 4000)
npm run dev:api

# Run Bale price bot (polling mode)
npm run dev:bale-bot

# Run Telegram price bot (polling mode)
npm run dev:telegram-bot
```

GitHub CI runs `npm test` on a standard hosted Ubuntu runner for pushes to
`main`, pull requests, and manual dispatch.

## Goals

- Find consumer price quickly for patients
- Support Persian and English search for medicine names
- Return unit price clearly in doctor-grade format: `ریال (تومان)` + منبع + سن قیمت
- Support one-tap copy button for medical staff and patients
- Combine internal pricing logic (Qanoon) with rich public medicine aggregator fallback
- Provide a single shared pricing and search core for Web, `Bale`, `Telegram`, and `WhatsApp`

## Workspace Layout

- `apps/api`: HTTP API, pricing engine, catalog search, live aggregator service, and webhooks (`/telegram/webhook`, `/bale/webhook`)
- `apps/web`: frontend shell and static assets
- `apps/bale-bot`: Bale price bot (polling / webhook) with doctor-grade price cards and one-tap copy button
- `apps/telegram-bot`: Telegram price bot twin with identical formatting and callback handling
- `packages/domain`: pricing rules, domain types, and canonical doctor-grade Persian price formatters (`formatPriceFa`, `formatPriceBlock`)
- `docs`: product specifications, ADRs, aggregator architecture, and developer guides
- `local-inputs/qanoon`: local source materials from Qanoon Pharma, ignored by Git

## Local Inputs

Large or private Qanoon Pharma reference files belong in `local-inputs/`.
That directory is intentionally ignored by Git. Keep source code, tests, and
project docs in the tracked workspace folders above.

## Core Capabilities (MVP)

- Search goods in Persian and English (tolerant of spelling variations, digits, suffixes)
- Local catalog search with automatic live web aggregator fallback (`torob`, `delgarm`) when local results are empty
- Return consumer unit price formatted according to medical standard (ADR-0006)
- Interactive bots for Bale and Telegram with inline button callbacks and one-tap copy
- HTTP endpoints:
  - `GET /goods/search?q=...` (supports `format=telegram` or structured JSON)
  - `GET /goods/:id` (sanitized patient-safe details)
  - `POST /pricing/calculate` (full tax, toll, technical fee, and profit breakdown)
  - `POST /telegram/webhook` & `POST /bale/webhook` (bot webhook endpoints)
  - `GET /health` (liveness probe)

## Not In MVP

- Insurance workflows
- Internal profit analysis in patient-facing channels
- Full inventory management
- Full medicine detail sync from every external source
