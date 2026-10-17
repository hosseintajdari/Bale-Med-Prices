# M3 Challenger 1 (Gen 7) Task
Scope: Empirical adversarial stress-testing of Milestone 3 event sourcing, revert chains, and draft projection logic.
Examine: `src/draft-store.js` and write an independent adversarial test script (in `/tmp/` or temporary file) stress testing:
- Deep recursive revert-of-reverts (un-reverting multi-level reverts)
- Out-of-order partial field updates and revert interleaving
- High-frequency mixed additions, edits, resolutions, and reverts
- Boundary conditions (empty strings, zero quantities, unicode names)
Output: `handoff.md` with explicit verdict (APPROVE or REQUEST_CHANGES) and test run results.
