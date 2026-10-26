# Consumer Medicine Price Finder

This context defines the patient-facing medicine price lookup language used by the product. It keeps medicine, price, package, and source terms precise across web and bot channels.

## Language

**Consumer Unit Price**:
The patient-facing price for one clear consumption unit of a medicine, such as one tablet, one capsule, or one bottle. This is the primary price answer in the initial phase.
_Avoid_: Package price, pharmacy accounting price, internal sale price

**Consumption Unit**:
The unit a patient can understand when reading the price answer, such as tablet, capsule, bottle, or pack. The answer must name this unit whenever a price is shown.
_Avoid_: Internal unit, inventory unit

**TTAC**:
The patient-facing medicine information source used for search-oriented medicine details such as brands, package type, and public drug identity.
_Avoid_: Treating TTAC as the pharmacy pricing engine

**TTAC Detail Enrichment**:
Additional patient-facing medicine details from the TTAC detail page, such as package image, physical appearance image, ATC classification, ingredients, identifiers, and similar products. These details should enrich a resolved medicine result rather than drive the initial low-literacy selection menu.
_Avoid_: Mixing rich detail into the first selection menu, using TTAC detail as the primary price source

**TTAC Media Reference**:
A link and metadata reference to TTAC-hosted medicine media, such as package or physical appearance images. In the initial phase, the product should reference media rather than downloading or storing image files.
_Avoid_: Uncontrolled image copying, permanent media storage without a caching policy

**TTAC Similar Product Reference**:
A post-resolution reference to similar products listed by TTAC. Similar products may help a patient compare identities after a medicine is resolved, but they should not drive initial search ranking or replace the selected medicine.
_Avoid_: Steering the patient away from the selected medicine, using similar products as primary search results

**Internal Pricing Source**:
The pharmacy-oriented source for richer pricing and pharmacy software logic. It is useful for price calculation, but its model is not the patient-facing language by default.
_Avoid_: Patient medicine catalog, TTAC replacement

**Price Difference Warning**:
A patient-facing caution shown when the displayed consumer unit price differs from a supporting source by more than 10,000 rial per consumption unit. It should explain uncertainty simply without exposing raw internal source disagreement.
_Avoid_: Raw source conflict, accounting discrepancy

**Medicine Selection Option**:
A patient-facing choice shown when search has several possible medicine matches. It should identify the medicine by name, strength, dosage form, package description, and brand or license holder before using price as supporting context.
_Avoid_: Cheapest option, raw TTAC row, internal good row

**Medicine Selection Result**:
A channel-neutral result from the medicine selection module. It may be resolved, need form selection, need strength selection, or need identity-first selection; channel adapters should render it into buttons or UI without owning selection logic.
_Avoid_: Telegram-only selection logic, channel-specific ranking rules

**Selection Session**:
A short-lived state record for a multi-step medicine selection flow. It lets channel callbacks stay compact while preserving the original query, filters, and remaining choices across selection steps.
_Avoid_: Encoding full selection state in button callbacks, long callback payloads

**Expired Selection Message**:
A simple patient-facing message shown when a short-lived selection session is no longer available. It should tell the patient the search is old and ask them to send the medicine name again.
_Avoid_: Silent callback failure, technical session errors

**Dosage Form Selection Gate**:
A patient-facing selection step shown when the query names a medicine but does not identify a clear consumption unit or dosage form. It should quickly ask the patient to choose the intended form or unit, such as tablet, capsule, drop, syrup, injection, bottle, or pack, before showing a final price.
_Avoid_: Guessing the form, showing a final price before the unit is clear

**Compact Selection Menu**:
A short patient-facing choice list intended for messaging buttons. For dosage form or consumption unit selection, it should show up to five primary choices, always include an unknown-unit path, and use a "more" path when additional choices exist.
_Avoid_: Long button lists, forcing all source rows into one menu

**Refine Search Prompt**:
A patient-facing prompt used when too many choices remain. It asks the patient to send a more specific medicine name, dosage form, or strength instead of paging through long menus.
_Avoid_: Deep pagination for ambiguous patient searches, overwhelming button lists

**Unknown Unit Choice**:
A patient-facing option inside the dosage form or consumption unit selection step for patients who do not know the intended form or unit. Choosing it means the system should not force a unit guess; it should continue with safer medicine selection using other clear identity signals.
_Avoid_: Blocking the patient, treating missing unit knowledge as an error

**Uncertain Choice Label**:
The patient-facing label for an unknown or uncertain selection path. The default label should be simple and low-stress, such as "مطمئن نیستم".
_Avoid_: Technical uncertainty wording, blame-oriented wording

**Identity-First Selection**:
A patient-facing selection path that identifies a medicine using visible identity signals such as Persian or English name, dosage form, strength, and patient package description before asking the patient to rely on price or internal codes.
_Avoid_: Price-first selection, internal-code selection

**Price-Late Selection**:
A patient-facing selection rule where price is withheld from early medicine selection unless otherwise similar choices need price as a final distinguishing clue. The goal is to choose the correct medicine before comparing prices.
_Avoid_: Cheapest-first selection, early price anchoring

**Low-Literacy Selection**:
A patient-facing selection style that prioritizes short, familiar, non-technical labels and avoids exposing pharmacy or regulatory details unless they are needed to distinguish choices. It assumes many patients have limited health literacy.
_Avoid_: Expert-first labels, long regulatory names, source-row dumps

**Strength Selection Step**:
A patient-facing selection step used when dosage form is clear but multiple strengths remain, such as tablet 325 mg versus tablet 500 mg. Strength should be resolved before brand and price when it changes medicine identity.
_Avoid_: Brand-first selection when strength differs, price-first selection

**Patient Strength Label**:
A short patient-facing strength label, preferably in familiar Persian wording such as "۵۰۰ میلی‌گرم" when available, while preserving source strength text when normalization is not confident.
_Avoid_: Long technical strength strings, hiding strength when it distinguishes choices

**Learned Selection Signal**:
A search ranking signal based on previous successful patient selections for ambiguous medicine queries. It can promote commonly selected dosage forms, units, or medicine identities for similar queries, but it must not override explicit patient wording, active result status, or clear medicine identity.
_Avoid_: Hard-coded popularity guesses, popularity as the only ranking rule

**Aggregate Selection History**:
Non-personal selection history collected across successful patient searches. It records which options were chosen for ambiguous queries so ranking can improve without building a per-patient profile.
_Avoid_: Patient profiling, personal search memory

**Successful Selection**:
A patient selection that reaches a resolved medicine result and displays a final Consumer Unit Price. Only successful selections should contribute to Aggregate Selection History.
_Avoid_: Counting abandoned clicks, counting unfinished menu navigation

**Dosage Form Match**:
A search ranking signal where a dosage form stated by the patient, such as tablet or syrup, ranks matching medicine results ahead of other forms for the same medicine.
_Avoid_: Treating dosage form as optional display-only text

**Dosage Form Alias**:
A patient-entered synonym or spelling variant that maps to a canonical dosage form or consumption unit, such as "قرص" and "tablet" for tablet, or "شربت" and "syrup" for syrup. Aliases improve ranking and menu grouping while preserving source text for display.
_Avoid_: Replacing raw source wording, free-text-only matching

**Dosage Route Qualifier**:
A modifier that clarifies route, site, or use context for a dosage form, such as ophthalmic in "ophthalmic ointment" or sublingual in "sublingual tablet". It should be modeled separately from dosage form, while patient-facing labels can combine both.
_Avoid_: Treating every combined phrase as an unrelated dosage form

**Patient Form Label**:
A patient-facing label that combines dosage form and important route or site qualifiers when they change patient understanding, such as "ophthalmic ointment" or "sublingual tablet". Internally, the dosage form and qualifier remain separate.
_Avoid_: Showing only the generic form when the qualifier is decisive for selection

**Active Medicine Result**:
A medicine search result whose source status says it is currently active. Active results should rank ahead of inactive or unclear results in patient-facing search.
_Avoid_: Available stock, pharmacy inventory status

**Patient Package Description**:
A patient-facing explanation of a medicine package derived from source packaging text. It should preserve the raw source package text separately while displaying a readable structure such as "100 tablets, in 10 blister packs, inside 1 box".
_Avoid_: Raw package string only, warehouse package unit

**Derived TTAC Unit Price**:
A supporting unit price calculated from TTAC package price only when the consumption unit count can be confidently extracted from the package description. It is not the primary displayed price in the initial phase.
_Avoid_: Primary consumer unit price, guessed unit price
