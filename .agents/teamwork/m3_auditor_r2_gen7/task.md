# M3 Forensic Auditor Replacement 2 (Gen 7) Task
Scope: Forensic integrity audit of Milestone 3 changes in `src/draft-store.js`, `src/server.js`, and test files.
Verify:
- Genuine logic implementation without hardcoded test inputs/expected outputs.
- No facade or dummy implementations.
- No test-suite bypasses, no skipped assertions.
- Safe secret handling (zero hardcoded credentials or leaks).
- Integrity checks matched to project type (Event Sourcing & Concurrency).
Output: `handoff.md` with explicit binary verdict (CLEAN or INTEGRITY VIOLATION).
