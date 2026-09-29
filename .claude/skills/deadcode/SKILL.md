---
# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
description: Use when cleaning up unused code, after major refactors, or during codebase hygiene passes
argument-hint: "[scope | --list | --claims | --stats]"
---

# Dead Code Detection

## Run

```bash
npx -p @austencloud/code-quality ac-deadcode --auto-claim
```

This atomically finds and claims the next available scope. Parse `CLAIMED_SCOPE:` from output.

## Scope System

Scopes are feature-level directories under `src/lib/features` and `src/lib/shared`.

Each scope can only be claimed by one agent at a time. Claims expire after 2 hours.

## Workflow

1. **Parse CLAIMED_SCOPE** from auto-claim output
2. **Review each dead item** shown in the output
3. **For each item**, read the file and determine the action (see Decision Guide)
4. **Get user confirmation** before any deletion
5. **Mark items** as deleted, deferred, or false-positive
6. **Release scope** when done

## Decision Guide

### DELETE when:
- File has no imports anywhere in codebase
- Exports are not used by any other file
- File is not an entry point (route, hook, DI container)
- Not referenced in any config file

### DEFER when:
- User says "we started working on that"
- Part of an incomplete feature flagged for completion
- Has TODO comments indicating future use
- User wants to review the content first

### FALSE POSITIVE when:
- Dynamic imports (`await import(...)`)
- Entry points (routes, hooks, DI containers)
- Files referenced in configs (vite.config.ts, etc.)
- Test utilities only used by test files
- Type-only files used via `/// <reference types="..." />`

## Marking Decisions

```bash
# DELETE - remove the file
rm "src/lib/path/to/file.ts"

# FALSE POSITIVE - won't appear again
npx -p @austencloud/code-quality ac-deadcode --false-positive "src/lib/path/to/file.ts"

# DEFER - note it, move on. Will appear again on future scans.
```

## Completing a Scope

```bash
npx -p @austencloud/code-quality ac-deadcode --release <scope>
```

Report summary: how many reviewed, deleted, false positive, deferred.

## What NOT to Delete

Even if flagged as dead, never delete without checking:
- Files in DI container directories
- Files matching `*Container.ts`
- Files in `src/routes/` - SvelteKit routing
- Files with `// @ts-nocheck` at top
- Anything the user says "wait, we need that"

## Detection Limitations

The script uses import scanning which may miss:
1. **Dynamic imports** - `await import("./path")` not detected
2. **String-based references** - Configs that reference paths as strings
3. **CSS/SCSS imports** - Styles imported in non-standard ways
4. **Framework magic** - SvelteKit routes, +page/+layout files (pre-filtered)

Always manually verify before deleting files with confidence < 80%.

## Commands Reference

```bash
# Start working
npx -p @austencloud/code-quality ac-deadcode --auto-claim

# View status
npx -p @austencloud/code-quality ac-deadcode --list
npx -p @austencloud/code-quality ac-deadcode --claims
npx -p @austencloud/code-quality ac-deadcode --stats

# Manual operations
npx -p @austencloud/code-quality ac-deadcode --claim <scope>
npx -p @austencloud/code-quality ac-deadcode --release <scope>
npx -p @austencloud/code-quality ac-deadcode --false-positive <path>
npx -p @austencloud/code-quality ac-deadcode --clear-expired
```
