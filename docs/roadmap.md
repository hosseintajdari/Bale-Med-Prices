# Roadmap

## Scope

Patient-facing pharmacy services: **price**, **authenticity**, **drug info**, and **rare drug search**.

See [ADR-0002](adr/0002-parallel-delivery-ghaza-daru.md) and
[`agents/EMBEDNET-OS.md`](agents/EMBEDNET-OS.md) for the portfolio boundary and
temporary GitHub-first recovery rule.

## Product Direction

One channel-neutral API powers:

- Web PWA (mobile-first)
- Bale bot (this project token) — twin of Telegram bot
- Telegram bot (polling / webhook)
- WhatsApp (scheduled for future phase)

**Zero coupling with BaleMed** (`bale-med` repo).

## Source Responsibilities

- `Qanoon`: consumer unit price
- `TTAC`: medicine identity, drug info, rare drug, enrichment
- `Ghaza Daru` web: barcode authenticity (no API — adapter only)
- `Payam Darousaz`: secondary reference
- `Torob` & `Delgarm`: live public price aggregator fallback

## Outcome gates

### P0 — delivery foundation (Delivered ✓)

- Module scaffold (`pricing`, `catalog search`, `aggregator fallback`)
- Web API core endpoints (`/goods/search`, `/goods/:id`, `/pricing/calculate`, `/health`)
- Bale bot with doctor-grade price cards and one-tap copy button (`npm run dev:bale-bot`)
- Telegram bot twin with full parity (`npm run dev:telegram-bot`)
- Webhook controllers for both Bale and Telegram (`/bale/webhook`, `/telegram/webhook`)
- 111 passing tests across domain rules, API, aggregator, and bots

### P1 — source-backed expansion (In Progress)

- Payam Darousaz & Darukade official adapters (ADR-0005 trusted sources)
- Authenticity + drug-info modules
- TTAC/Ghaza Daru web adapter
- Rare-drug module
- Integration tests across the four modules and web/Bale surfaces

### P2 — owner-reviewed release readiness

- UX polish + evaluator guide + rehearsal
- Consider WhatsApp channel and public deployment after owner review of source readiness and safety constraints.
