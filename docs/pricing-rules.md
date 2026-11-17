# Pricing Rules

## Rule Flow

1. Find the best medicine match from Persian, English, and alias search inputs
2. If the medicine name is clear but the consumption unit or dosage form is not clear, ask the patient to choose the intended unit or dosage form before returning a final price
3. If the patient does not know the intended unit or dosage form, continue with safer medicine selection using visible identity signals such as name, dosage form, strength, and package description instead of blocking or guessing the unit
4. Return medicine selection as a channel-neutral result; bot-specific buttons should be derived from that result
5. Read unit consumer price from `sellPrice` or `tempPrice`
6. Resolve applicable tax row by good and date when tax is part of the price logic
7. Split total tax from total toll using `taxMultiplier`
8. Add technical fee if that rule belongs to the final consumer price
9. Return a clear unit price answer for patients
10. If quantity is provided, multiply from unit price to show optional total price
11. Attach source hints and warnings when pricing confidence is limited
12. When a derived `TTAC` unit price is available, show a patient-facing warning if it differs from the primary internal consumer unit price by more than 10,000 rial per consumption unit
13. Do not automatically replace the primary internal unit price with a higher `TTAC`-derived unit price

## Notes

- Search must work in both Persian and English
- Patient-facing output should default to unit price
- Unit meaning should be explicit, for example tablet, capsule, bottle, or pack
- Final unit price wording should prefer Persian patient-facing unit labels, such as "قیمت هر قرص"
- Selection wording should prioritize simplicity for patients with low health literacy
- Selection buttons should prefer Persian labels for form and route while preserving source medicine names when needed
- When the unit or dosage form is ambiguous, selection should happen before final price display
- The initial unit or dosage form menu should stay compact: up to five primary choices, plus unknown-unit, plus more when needed
- If too many meaningful choices remain, ask for a more specific search instead of paging through long menus in the initial implementation
- Multi-step selection callbacks should reference a short-lived selection session rather than encoding the full query and filters in the callback payload
- Bot lookup should start a selection session when needed, and bot selection continuation should advance that session from button callbacks
- Expired selection sessions should return a simple patient-facing retry message, not a technical error or silent failure
- Selection sessions should default to a 15-minute lifetime and remain configurable
- Unknown unit should be a valid patient path, not a validation failure
- Unknown-unit selection should use medicine identity first; price should remain supporting context until the medicine is selected
- Price should be hidden from early selection unless otherwise similar choices require it as a final distinguishing clue
- Learned selection history can help order ambiguous choices, but explicit patient wording and active medicine identity should rank above learned popularity
- Ranking should never let learned popularity override an explicit dosage form or unit stated by the patient
- Dosage route or site qualifiers should refine selection labels and ranking without replacing the underlying dosage form
- Patient-facing selection labels may combine dosage form and qualifier, but learned ranking should retain the separate form and qualifier values
- Initial implementation can use mock data while preserving explicit selection fields for future TTAC-derived data
- Active status should improve ranking when available, but missing active status should not block selection
- An explicit route or site qualifier should not force a dosage form guess when multiple matching forms remain
- When a generic dosage form has multiple route or site qualifiers, the selection menu should distinguish those qualifiers before final price display
- When dosage form is clear but multiple strengths remain, strength should be selected before brand or price
- Strength should be displayed as a short patient-readable label, with source text preserved when normalization is uncertain
- Brand, package, manufacturer, or license-holder details should be used only as much as needed to distinguish remaining choices
- Learned selection history should be aggregate and non-personal in the initial phase
- Only successful selections that reach a resolved final consumer unit price should update learned selection history
- A selection session should close when it reaches the final consumer unit price
- Initial learned selection storage can be lightweight, provided the selection ranking interface does not expose the storage choice
- `TTAC` is the main medicine information reference for patients
- Rich `TTAC` detail, including package images and physical appearance images, should be shown after final medicine resolution rather than inside early selection menus
- The first medicine-selection implementation may leave `TTAC` detail enrichment as a post-resolution placeholder rather than fetching it immediately
- TTAC media should be referenced by URL and metadata in the initial phase; image download or caching needs a separate policy
- TTAC similar products are post-resolution references and should not alter initial ranking or replace the selected medicine
- TTAC ATC and ingredient details should remain in post-resolution more-information content, not the primary unit price answer
- TTAC identifiers such as IRC and GTIN should be shown only in more-information content with simple labels, not in the primary price answer
- Messaging bots should initially link to TTAC media rather than sending downloaded image files
- `TTAC` package price can support unit-price comparison only when the package unit count can be confidently extracted
- A higher `TTAC`-derived unit price is a warning signal, not the selected patient price by itself
- Internal richer price logic can still come from the internal source
- `Payam Darousaz` can be used as a comparison source in later phases
- Internal cost and profit are not first-class outputs for patient channels
