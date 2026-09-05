# Embednet OS coordination

## Purpose

Embednet OS in Notion is the portfolio and PKM map for direction, milestones,
and cross-project coordination. It is not a shared runtime or code dependency.

## Temporary recovery source of truth

Notion has not been reviewed recently. Until the owner refreshes it, precedence
is: explicit current owner instruction, then verified GitHub repository state
and Issues, then existing Notion content. This is a temporary recovery rule;
Notion remains the portfolio map after review.

This repository owns Bale-Med-Prices code, product rules, API contracts, and
operational documentation. GitHub Issues hold small actionable engineering work.

## Project boundary

Bale-Med-Prices provides consumer medicine price, identity, drug-information,
authenticity, and rare-drug capabilities. It has zero runtime coupling with
BaleMed: no shared code, tokens, webhooks, services, or deployment decisions.
Shared portfolio context belongs in Embednet OS or linked documentation.

## Sync rule

Update the repository first when a durable technical fact changes, then update
the linked Notion project page from the merged facts. Use P0/P1/P2 outcome gates
and one next outcome instead of calendar commitments. Retain historical dates
only when they identify evidence, not an active deadline.

## Notion-ready recovery update

- **Title:** Bale-Med-Prices — GitHub-first recovery status
- **Summary:** This repository remains a separate, channel-neutral medicine
  pricing and selection product. GitHub is temporarily authoritative for
  execution while the Notion project is reviewed.
- **Current gate:** P0 delivery foundation; preserve source boundaries and no
  runtime coupling with BaleMed.
