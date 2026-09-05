# Roadmap

## Scope

Patient-facing pharmacy services: **price**, **authenticity**, **drug info**, and **rare drug search**.

See [ADR-0002](adr/0002-parallel-delivery-ghaza-daru.md) and
[`agents/EMBEDNET-OS.md`](agents/EMBEDNET-OS.md) for the portfolio boundary and
temporary GitHub-first recovery rule.

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

## Outcome gates

### P0 — delivery foundation

- Module scaffold (`pricing`, `authenticity`, `drug-info`, `rare-drug`)
- Web PWA menu + price E2E
- Bale bot menu + price E2E

### P1 — source-backed expansion

- Authenticity + drug-info modules
- TTAC/Ghaza Daru web adapter
- Rare-drug module
- Integration tests across the four modules and web/Bale surfaces

### P2 — owner-reviewed release readiness

- UX polish + evaluator guide + rehearsal
- Consider Plus channels and a release only after owner review of the prior
  gates, source readiness, and channel-specific safety constraints.

## One next outcome

Produce a reviewable P0 delivery-foundation slice: the module layout, price
search flow, and clear boundary between source adapters and channel adapters.

## Retained actionable work

- Create `apps/api/src/modules/` layout.
- Add `adapters/ttac-web/` as a source adapter, preserving the channel-neutral
  core.
- Build the Bale channel adapter with the four-item menu.
- Keep `POST /verify/barcode` as a placeholder until source specifications are
  available; do not claim verification capability before then.
