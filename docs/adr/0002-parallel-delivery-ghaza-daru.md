# Parallel delivery for Ghaza Daru accreditation

**Status:** Accepted  
**Date:** 2026-07-19  
**Deadline:** 5 Shahrivar 1405 (~2026-08-27)

## Context

Three deliverables for pharmacy accreditation:

1. Drug authenticity via barcode
2. Medicine price bot (+ drug info + rare drug search)
3. BaleMed patient intake bot

Items 1 and 2 expand **this repo** (`Bale-Med-Prices`). Item 3 stays in `bale-med`.

## Decision

1. Expand `Bale-Med-Prices` with four modules under one channel-neutral API:
   - `pricing` (existing)
   - `authenticity` (`POST /verify/barcode`)
   - `drug-info` (`GET /drug/info`)
   - `rare-drug` (`GET /drug/rare-search`)
2. Shared adapter: `adapters/ttac-web/` for Ghaza Daru + TTAC web pages (no official API).
3. **Zero coupling with BaleMed** — separate Bale bot token, no shared webhook, no proxy.
4. Reject separate hub repo (`GhazaDaruHub`).

## Channels

| Channel | Priority |
| --- | --- |
| Bale + Web PWA | Must deliver by deadline |
| Telegram + WhatsApp | Plus after Must |

## Consequences

- Monorepo layout: `apps/api/src/modules/` + `channels/bale/`
- Web PWA menu: authenticity, price, drug info, rare drug
- BaleMed demo = existing VPS bot; evaluators test it directly

## Related

- [DELIVERY-GHAZA-DARU.md](../DELIVERY-GHAZA-DARU.md)
- BaleMed boundary ADR: `bale-med/docs/adr/0005-ghaza-daru-delivery-boundary.md`
