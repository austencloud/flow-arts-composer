---
# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
description: Use when TypeScript errors need analysis and fixing, or after large refactors
---

# TypeScript Check

## Run

```bash
npx tsc --noEmit
```

## Strategy

| Errors | Approach |
|--------|----------|
| <10 simple | Fix directly |
| 10-30 independent | 2-4 parallel subagents |
| 30-50 moderate | 4-8 parallel subagents |
| >50 or complex | Multiple sessions |

## Workflow

1. Run tsc, analyze error count and types
2. Check for cascading errors (one root cause = many errors)
3. Present summary and recommended strategy
4. Get confirmation before fixing
5. Execute fixes (directly or via subagents)
