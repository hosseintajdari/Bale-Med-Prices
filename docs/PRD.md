# PRD

## Product

Consumer medicine price finder.

## Problem

Patients need a fast way to find medicine consumer price without navigating the full pharmacy software.

The current price logic exists inside a larger internal system, while public medicine information is spread across sources such as `TTAC`, internal pricing data, and `Payam Darousaz`.

We need one focused product that can power a web UI first and then the same search and pricing logic inside `Telegram`, `Bale`, and later `WhatsApp`.

## Users

- Patient
- Patient companion
- Pharmacy support operator
- Bot user in `Telegram`, `Bale`, or `WhatsApp`

## Main User Story

As a patient, I want to search for a medicine in Persian or English and see its consumer price as a unit price so that I can understand the medicine cost quickly and confidently.

## MVP Features

- Search goods by Persian title, English title, generic code, barcode, or internal code
- Return medicine matches for patient-friendly lookup
- Show unit consumer price clearly
- Show the selected item source and warnings when confidence is limited
- Support web flow now and API shape suitable for messaging bots next
- Keep room for richer medicine details from `TTAC`

## Inputs

- Search query
- Good id
- Document date
- Quantity when user wants pack math, while base answer remains unit price
- Preferred language when needed
- Optional source preference in future

## Outputs

- Consumer unit price
- Optional pack-based total price
- Medicine title
- Search aliases in Persian and English when available
- Unit description, for example per tablet or per bottle
- Pricing warnings
- Source hints
- Reference details placeholder for `TTAC` enrichment

## Source Strategy

- `Qanoon` pricing logic remains the richer price engine for consumer price output
- `TTAC` is the main reference for full medicine information for patients
- `Payam Darousaz` is a secondary comparison and reference source
- The system should be able to surface one final consumer-facing answer even when sources differ internally

## Search Requirements

- Persian and English search must both work
- Alias-based lookup should be supported
- Patients should not need internal codes
- Search ranking should prefer the most likely consumer match

## Pricing Requirements

- The default displayed price is unit price, not pack price
- If a medicine is sold as tablets, the answer should clearly represent the price of one tablet
- If quantity is provided, the system can also show the estimated total for that quantity
- Patient-facing channels should prioritize clarity over internal accounting details

## Channel Rollout

- Phase 1: web UI
- Phase 2: `Telegram` bot
- Phase 3: `Bale`
- Phase 4: `WhatsApp`
- All channels should reuse the same search and pricing core

## Non-Goals For Now

- Full prescription handling
- Insurance claim workflows
- Internal stock and warehouse operations
- Full pharmacist dashboard
- Replacing `TTAC` as the canonical medicine-detail source

## Success Criteria

- Patient can find consumer price in one quick interaction
- Search works in both Persian and English
- The default answer clearly communicates unit price
- Shared API contracts are usable by web and bot channels
- Data dependencies and source responsibilities are explicit
