# Roadmap

## Scope

Patient-facing pharmacy services: **price**, **authenticity**, **drug info**, and **rare drug search**.

Deadline: **Ghaza Daru accreditation delivery — 5 Shahrivar 1405 (~2026-08-27)**.

See [DELIVERY-GHAZA-DARU.md](DELIVERY-GHAZA-DARU.md) and [ADR-0002](adr/0002-parallel-delivery-ghaza-daru.md).

## Product Direction

One channel-neutral API powers:

- Web PWA (mobile-first)
- Bale bot (this project token)
- Telegram + WhatsApp (Plus, after Must)

**Zero coupling with BaleMed** (`bale-med` repo).

## Source Responsibilities

- `Qanoon`: consumer unit price
- `TTAC`: medicine identity, drug info, rare drug, enrichment
- `Ghaza Daru` web: barcode authenticity (no API — adapter only)
- `Payam Darousaz`: secondary reference

## Build Order (delivery sprint)

### Sprint W1 — Jul 19–24

- Module scaffold (`pricing`, `authenticity`, `drug-info`, `rare-drug`)
- Web PWA menu + price E2E
- Bale bot menu + price E2E

### Sprint W2 — Jul 25–31

- Authenticity + drug-info modules
- TTAC/Ghaza Daru web adapter

### Sprint W3 — Aug 1–7

- Rare-drug module
- Integration tests (4 modules × web + Bale)

### Sprint W4 — Aug 8–15

- UX polish + evaluator guide + rehearsal

### Sprint W5 — Aug 16–27

- Plus channels + release tag + accreditation demo

## Immediate Next Engineering Tasks

- Create `apps/api/src/modules/` layout
- Add `adapters/ttac-web/` shared adapter
- Bale channel adapter with four-item menu
- Placeholder `POST /verify/barcode` until Ghaza Daru specs arrive
