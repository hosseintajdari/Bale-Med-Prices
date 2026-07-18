# Ghaza Daru delivery plan — Bale-Med-Prices

**Deadline:** 5 Shahrivar 1405 (~2026-08-27)  
**Notion:** [Goal](https://app.notion.com/p/3a1f6d55a673812b9137cdde5233795a) | [Weekly schedule](https://app.notion.com/p/3a1f6d55a673812f8736e4071a1dfcc7)

## Deliverables (this repo)

| Module | Patient-facing | Source |
| --- | --- | --- |
| pricing | Consumer unit price | Qanoon + TTAC |
| authenticity | Barcode verify | Ghaza Daru web |
| drug-info | Medicine details | TTAC web |
| rare-drug | Rare medicine search | TTAC web |

## Unified menu (Bale + Web)

1. Authenticity — barcode
2. Price lookup
3. Drug information
4. Rare drug search

## Week 1 (Jul 19–24) — Must

- [ ] `modules/` + `adapters/ttac-web/` + `channels/bale/` scaffold
- [ ] Web PWA four-item menu + price flow polished
- [ ] Bale bot token + inline keyboard + price end-to-end
- [ ] Authenticity module placeholder (until Ghaza Daru specs)
- [ ] Smoke test web + Bale (Friday)

## Week 2 (Jul 25–31)

- Authenticity + drug-info modules
- Ghaza Daru / TTAC web adapter (real specs)

## Week 3 (Aug 1–7)

- Rare-drug module
- 4×2 test matrix (modules × web+Bale)

## Week 4 (Aug 8–15)

- Persian UX polish
- Evaluator one-page guide (A4)
- 15-minute rehearsal

## Week 5 (Aug 16–27)

- Plus: Telegram / WhatsApp adapters if time
- Tag release + handoff to accreditation session

## Acceptance (evaluators)

Evaluators test bots/web themselves. If they get answers, that is enough.

## Architecture rule

**No code coupling with BaleMed.** Two bots, two repos, two services.
