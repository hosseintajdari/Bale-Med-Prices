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

## Experience Principles

- Patient selection should prioritize simplicity for low health literacy
- Selection labels should be short, familiar, and non-technical whenever possible
- Selection buttons should prefer simple Persian wording for form, route, and patient-facing prompts, while preserving English medicine names when no reliable Persian label is available
- Pharmacy, regulatory, and manufacturer details should appear only when needed to distinguish otherwise similar choices
- Price should not steer early medicine selection unless otherwise similar choices need it as a final distinguishing clue

## Main User Story

As a patient, I want to search for a medicine in Persian or English and see its consumer price as a unit price so that I can understand the medicine cost quickly and confidently.

## MVP Features

- Search goods by Persian title, English title, generic code, barcode, or internal code
- Return medicine matches for patient-friendly lookup
- Show unit consumer price clearly
- Show the selected item source and warnings when confidence is limited
- Support web flow now and API shape suitable for messaging bots next
- Keep room for richer medicine details from `TTAC`
- Support both bot lookup start and bot selection continuation for multi-step button flows

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
- Selection-oriented medicine fields such as dosage form, route qualifier, strength label, patient form label, package description, and active status when available
- Pricing warnings
- Source hints
- Reference details placeholder for `TTAC` enrichment
- Optional post-resolution `TTAC` details such as package image, physical appearance image, ATC classification, ingredients, identifiers, and similar products
- First implementation of medicine selection may expose a placeholder contract for post-resolution `TTAC` details without fetching or scraping `TTAC` detail pages yet

## Source Strategy

- Internal pricing logic remains the richer price engine for consumer price output
- `TTAC` is the main reference for full medicine information for patients
- Rich `TTAC` detail-page information should enrich the resolved medicine result after selection, not crowd the initial selection menu
- `TTAC` detail-page fetching can be implemented separately from the first medicine-selection module, provided the response contract leaves room for it
- Initial `TTAC` media handling should keep source URLs and metadata rather than downloading or permanently storing images
- TTAC similar products should be shown only after a medicine is resolved and should not drive initial search ranking
- TTAC ATC classification and ingredient details should stay in post-resolution "more information" content, not the primary price answer
- TTAC identifiers such as IRC and GTIN should stay out of the primary price answer and appear in more-information content with simple patient-facing labels
- In messaging bots, TTAC media should initially be exposed as a "view medicine image" link or button rather than sending the image file directly
- `Payam Darousaz` is a secondary comparison and reference source
- The system should be able to surface one final consumer-facing answer even when sources differ internally

## Search Requirements

- Persian and English search must both work
- Alias-based lookup should be supported
- Patients should not need internal codes
- Search ranking should prefer the most likely consumer match
- If the patient query names a medicine but does not identify a clear consumption unit or dosage form, the response should first show a quick selection menu for the intended form or unit before showing a final price
- The dosage form or unit selection menu should include an "I do not know" path so patients who do not know the unit can continue without being blocked
- The default patient-facing label for the unknown-unit path should be "مطمئن نیستم"
- The first dosage form or unit selection menu should show at most five primary choices, always include the unknown-unit path, and use a "more" path when additional choices exist
- When more than five meaningful choices remain, the initial implementation should prefer a refine-search prompt over deep menu pagination
- If the patient chooses the unknown-unit path, the next selection step should use visible identity signals such as Persian or English name, dosage form, strength, and simple package description instead of using price as the primary chooser
- Initial selection options should generally hide price until the medicine identity is clear
- Initial selection options should not include rich `TTAC` detail such as images, ATC tree, ingredients, or similar products; those belong after the medicine result is resolved
- Similar products should not replace the selected medicine or steer the initial selection flow
- If the patient query includes a dosage form or unit, matching results for that dosage form or unit should rank higher
- If the patient query is ambiguous, ranking may use previous successful patient selections as a learned signal, while avoiding hard-coded assumptions such as always treating a medicine name as a tablet
- Ranking priority should be explicit patient wording first, then active result and clear medicine identity, then learned selection history, then completeness of dosage and package information
- Initial learning should use aggregate selection history only, not per-patient profiling or personal search memory
- A selection should contribute to learning only after it reaches a resolved medicine result and displays the final consumer unit price
- When a selection reaches the final consumer unit price, the selection session should close and aggregate selection history should update
- Initial implementation may use a lightweight local selection-history store suitable for development, as long as the ranking interface can later move to durable storage without changing patient-facing behavior
- If several dosage forms match the same medicine, selection options should make dosage form and unit prominent rather than guessing
- Dosage form matching should understand common Persian and English aliases, such as "قرص" and "tablet", while preserving source wording for display
- Route or site qualifiers should be modeled separately from dosage form, while patient-facing labels may combine them, such as showing "ophthalmic ointment" for ointment plus ophthalmic qualifier
- The first patient selection menu should show a combined patient form label when the qualifier changes patient understanding, while preserving separate dosage form and qualifier fields internally
- The first implementation may use current mock data, but should shape medicine records so real TTAC-derived selection fields can be connected later
- Active status should be optional in early data, but should improve ranking when available
- If the patient explicitly states a route or site qualifier without stating a dosage form, matching qualifiers should rank higher, but the system should still ask the patient to choose between multiple matching forms
- If the patient states a generic dosage form but route or site qualifiers differ across results, the selection menu should separate those patient form labels, such as ophthalmic drops, ear drops, and nasal drops
- If dosage form is clear but multiple strengths remain, the next selection step should ask for strength before brand or price
- Strength labels should be short and readable for patients, preferring familiar Persian wording when available while preserving source text when normalization is not confident
- If multiple brand or package choices remain after form and strength are clear, the selection should use the simplest distinguishing label first and avoid long manufacturer or regulatory names unless needed
- Search ranking should prefer active medicine results, then stronger text matches, then clear dosage form and package information
- Country of manufacture should be displayed when available, but should not drive initial search ranking by itself

## Pricing Requirements

- The default displayed price is unit price, not pack price
- If a medicine is sold as tablets, the answer should clearly represent the price of one tablet
- Final patient-facing unit price text should prefer Persian unit wording, such as "قیمت هر قرص", while preserving source labels when no reliable Persian unit is available
- A final patient-facing price should not be shown until the consumption unit is clear enough to name
- If quantity is provided, the system can also show the estimated total for that quantity
- Patient-facing channels should prioritize clarity over internal accounting details

## Channel Rollout

- Phase 1: web UI
- Phase 2: `Telegram` bot
- Phase 3: `Bale`
- Phase 4: `WhatsApp`
- All channels should reuse the same search and pricing core
- Messaging bots should represent ambiguous medicine results as button-friendly selection menus before returning a final unit price
- Medicine selection should produce a channel-neutral result such as resolved, needs form selection, needs strength selection, or needs identity selection; messaging channels should adapt that result into buttons
- Bot selection continuation should be supported by a small handler or endpoint, such as `/bot/select`, so button callbacks can advance the same selection session
- Multi-step bot selection should use short-lived selection sessions so button callbacks stay compact and channel-neutral state does not have to be encoded into every callback
- If a selection session expires, the bot should show a simple message asking the patient to send the medicine name again rather than silently ignoring the callback
- The default selection session lifetime should be 15 minutes and configurable

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
