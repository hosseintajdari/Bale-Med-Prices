# GitHub Push Notes

## Environment & Remote Status

- Remote Repository: `https://github.com/hosseintajdari/Bale-Med-Prices.git`
- Active Branch: `main`
- Host: Linux Remote with authenticated `gh` CLI

## Verification & Test Results

Run all tests from repository root:

```bash
npm test
```

Verification status:
- Total tests: 111
- Passing: 111
- Failing: 0
- Test suites covered: domain pricing rules, catalog search normalization, HTTP server & health, bot lookup & selection, price caching, live web aggregator, Telegram bot, Bale bot
- GitHub Actions CI: Green (Runs on push to `main` and all pull requests)

## Git Workflow Guidelines

1. Work in feature branches: `git checkout -b <branch-name>`
2. Test thoroughly: `npm test`
3. Commit with conventional commit messages: `git commit -m "feat/fix(...): ..."`
4. Push and open PR: `git push -u origin <branch-name> && gh pr create`
5. Verify CI checks: `gh pr checks <PR_NUM>`
6. Merge PR cleanly: `gh pr merge <PR_NUM> --merge --delete-branch`
