# Pricing App

Consumer medicine price finder extracted from the observed pricing logic in Qanoon Pharma.

## Goals

- Find consumer price quickly for patients
- Support Persian and English search for medicine names
- Return unit price clearly, for example price per tablet
- Combine internal pricing logic with richer public medicine information
- Prepare one shared pricing and search core for web, `Telegram`, `Bale`, and `WhatsApp`

## Workspace Layout

- `apps/api`: HTTP API and pricing service
- `apps/web`: frontend shell
- `packages/domain`: pricing rules and domain types
- `docs`: product and rule documents

## MVP Scope

- Search goods in Persian and English
- Get a good by id
- Return unit consumer price for a given date
- Show the consumer-facing price clearly
- Preserve linkable search state in the web UI
- Keep the API simple enough for bot integrations

## Not In MVP

- Insurance workflows
- Internal profit analysis in patient-facing channels
- Full inventory management
- Full medicine detail sync from every external source
