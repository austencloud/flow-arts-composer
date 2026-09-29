---
# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
description: Use when preparing release notes or reviewing what changed since last version
---

# Changelog Generation

## Run

```bash
git tag -l "v*" --sort=-version:refname | head -1
git log $(git tag -l "v*" --sort=-version:refname | head -1)..HEAD --oneline --no-merges
```

## Categorize

**Include:** feat, fix, perf, UI changes
**Exclude:** refactor, chore, test, docs, ci, build

## Rewrite for Users

Transform technical messages to plain language:

- Before: `fix(shop): filter not persisting selection`
- After: `Fixed filters not saving when switching categories`

## Output Format

```
### Bug Fixes
- [plain language]

### New Features
- [plain language]

### Improvements
- [plain language]
```
