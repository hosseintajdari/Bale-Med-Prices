# Qanoon Webservices Notes

Extracted from `مستندات.pdf`.

## Key Findings

- `Qanoon` documents a `REST API` style integration path
- data exchange is described as `JSON`
- the document mentions web use cases such as internet sales site or kiosk
- the document emphasizes repeated stock checks before finalizing sale
- it also emphasizes a stable `uniqueId` for retry-safe operations

## Why This Matters For This Project

- the safer long-term direction is API-oriented integration, not UI automation
- our own patient-facing API can stay clean and channel-friendly
- later bot channels can sit on top of our API while source-facing logic remains isolated

## Current Relevance

For the patient price finder, the most useful implication is architectural:

- prefer source adapters and contracts
- avoid brittle UI-coupled assumptions
- keep search and pricing core reusable for `Telegram`, `Bale`, and `WhatsApp`
