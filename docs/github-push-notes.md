# GitHub Push Notes

## Current local status

Local branch: `main`

Local commits prepared after the last known pushed commit:

- `35c15a1 Improve patient medicine search tolerance`
- `64a00c8 Normalize patient-entered strength units`

The next commit after this note should include the search quality suite expansion.

## Verification

Run from `C:\Users\hosse\Documents\قیمت\BaleMedPrices`:

```powershell
npm test
```

Latest local result:

- 30 tests passed
- 0 tests failed

## Why GitHub push is pending

`git push origin main` currently reaches Git credential handling and then hangs or fails because no GitHub credential is available to the terminal session.

The GitHub MCP connector also became unavailable with a transport error while trying to publish through the API.

## Manual push commands

If Git reports dubious ownership first:

```powershell
git config --global --add safe.directory "C:/Users/hosse/Documents/قیمت/BaleMedPrices"
```

Then:

```powershell
cd "C:\Users\hosse\Documents\قیمت\BaleMedPrices"
git status
git log --oneline -5
git push origin main
```

If authentication is needed:

```powershell
gh auth login
git push origin main
```
