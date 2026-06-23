# Roadmap

## Scope

The scope of this project is finding consumer medicine price for end users, starting with patients.

The product should:

- help patients find medicine price quickly
- support Persian and English search
- return unit price clearly
- prepare one shared backend for web and messaging bots

## Product Direction

The web app is the first delivery surface, but it is not the final destination.
The same search and pricing core should later power:

- `Telegram`
- `Bale`
- `WhatsApp`

## Source Responsibilities

- `Qanoon`: richer pricing logic and practical output for consumer price
- `TTAC`: main reference for complete medicine information for patients
- `Payam Darousaz`: secondary pricing or reference input with its own logic

## Build Order

### Phase 1

- stabilize patient-facing search
- make Persian and English lookup reliable
- make unit price output explicit
- reduce internal-only fields in the patient UI

### Phase 2

- add medicine alias model
- define source-priority rules
- add `TTAC` enrichment placeholders in the API contract
- support quantity-to-total conversion while keeping unit price primary

### Phase 3

- design bot-friendly API responses
- add compact response formats for `Telegram`
- keep the same core for `Bale`
- document `WhatsApp` constraints for later rollout

## Immediate Next Engineering Tasks

- reshape API responses around patient-facing fields
- expand search data model for Persian and English aliases
- separate internal pricing fields from consumer-facing fields
- add source metadata to search and pricing results
- define bot response contracts before channel integrations begin
