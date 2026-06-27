# Search Quality

This note documents the current patient-facing medicine search strategy.

## Goals

- tolerate common Persian and English patient input noise
- keep ranking deterministic and explainable
- prefer clear medicine identity over internal fields
- leave room for richer alias and learning signals later

## Matching Order

Search quality currently follows four layers:

1. deterministic normalization
2. source-aware searchable fields and aliases
3. constrained fuzzy token matching
4. deterministic ranking

## Deterministic Normalization

Normalization runs before matching and ranking. It currently handles:

- Persian and Arabic digit conversion
- Persian and Arabic Yeh and Kaf normalization
- diacritics and kashida removal
- half-space normalization
- separator cleanup for slash, dash, dot, parentheses, and similar punctuation
- letter-digit boundary splitting such as `acetaminophen500`
- strength-unit normalization such as `میلی گرم`, `مگ`, and `mg`

The goal is to turn messy patient input into a comparable token stream before any fuzzy behavior starts.

## Searchable Fields

The search index is still lightweight and in-memory, but it already checks patient-relevant fields first:

- Persian and English titles
- dosage form
- route qualifier
- strength label
- patient form label
- package description
- explicit aliases

Internal identifiers remain searchable for development and support use, but patient-facing ranking should not depend on them.

## Fuzzy Matching

Fuzzy matching is intentionally constrained:

- token-level matching is used, not broad full-text guessing
- very short tokens are only fuzzied safely, mainly for dosage-form typos
- longer tokens allow small edit distance tolerance

This keeps common misspellings like `استامنوفن` or dosage-form typos like `قرث` recoverable without turning unrelated medicines into false positives.

## Ranking Rules

Ranking is deterministic and currently prefers:

- exact or prefix title and alias matches
- explicit query matches for dosage form and route qualifier
- explicit strength alignment
- active medicines
- learned selection history keyed by normalized query text
- records with clearer patient-facing medicine detail

This means a query such as `استامینوفن شیاف` should rank the suppository result above tablet results, even when all are technically matched.
It also means a successful patient selection from `اِستـامینوفن` can inform the later plain query `استامینوفن`, because both normalize to the same canonical search text before history is recorded.
When several `drop` results share the same broad dosage form but differ by route qualifier, the first selection menu should keep those qualifiers visible as separate patient labels such as `قطره چشمی`, `قطره گوشی`, and `قطره بینی`.

## Next Steps

- move form and qualifier alias dictionaries into a shared domain-level search module
- add richer medicine aliases from TTAC-shaped reference data
- add source-priority and confidence metadata to ranked results
- add an LLM fallback only for ambiguous or no-result cases, never as the first-pass matcher
