---
name: code-style
description: Use when writing or editing TypeScript/Svelte code in this project. Covers project-specific architectural decisions — module-level singleton getters, pure-function modules vs stateful services, no barrel exports, and the conversational commenting style.
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# TKA Code Style

Project-specific architectural decisions. Standard engineering wisdom (single responsibility, descriptive names, strict types) is assumed.

## Services: Module-Level Singleton Getters

Services are module-level singletons accessed via colocated getter functions. No DI containers, no `iti` package.

```typescript
// src/lib/shared/<domain>/getYourService.ts
import { YourService } from './services/implementations/YourService';

let instance: YourService | null = null;
export function getYourService(): YourService {
  if (!instance) instance = new YourService();
  return instance;
}

// consumer
import { getYourService } from '$lib/shared/<domain>/getYourService';
const myService = getYourService();
```

Every service: interface in `services/contracts/IName.ts`, implementation in `services/implementations/Name.ts`, getter in a colocated `get*.ts` file.

## Pure Functions vs Services

A stateless pure function belongs in a plain module named for what it holds —
`seeded-rng.ts`, `canonical-json.ts`, `relative-time.ts`. Ship it as a
tree-shakeable named export, colocated with the domain that owns it. Do **not**
wrap a pure function in a singleton class: a function with no state, lifecycle,
or dependencies gains nothing from `getThingService().doThing()` and loses
tree-shaking. That ceremony is a Java-ism, not 2026 TS.

A `utils/` folder is fine when its name is honest — pure, stateless helpers
grouped by a real theme, each filename saying what's inside. Two things are
banned, and they are what "no utils dump" actually means:

1. **Junk-drawer naming.** A generic `utils.ts` / `helpers.ts` where unrelated
   functions accumulate. Split by theme; name each file for its contents.
2. **Stateful logic disguised as a utility.** Anything that holds a cache, owns
   a lifecycle, carries dependencies, or coordinates other services is a
   service, not a util — give it a verb-named class and a singleton getter (see
   above). A "workflow", "manager", "loader", or "cache" living as loose
   functions in `utils/` is the smell.

Rule of thumb: stateless transform → plain function module; stateful concern →
service.

## No Barrel Exports

Never create `index.ts` files in `src/` that re-export other modules. Vite's bundle bloats dramatically — importing one item from a barrel loads and evaluates the entire barrel, tree-shaking fails, dev-mode network requests skyrocket. Always import directly from source files using relative paths.

## Commenting Style

Write comments as if explaining to someone who uses the app but doesn't write code. Say what the user would observe, not what the code does internally. Explain *why* — what problem does this solve, what would go wrong without it.

Keep a comment only when it adds information the surrounding code cannot make
clear within a few seconds. Do not add JSDoc that restates a signature, prose
that narrates the next statement, decorative section dividers, or historical
phase ledgers whose decisions are already reflected in the code. Preserve and
tighten comments that carry rationale, warnings, external contracts,
compatibility constraints, units, security boundaries, tool directives, or
non-obvious algorithm details. A cleanup is successful when the remaining
comments are more trustworthy, not when it reaches a deletion target.

For repository-wide review criteria and the token-aware audit tool, see
`docs/archive/swarm-2026-10-14/specs/comment-noise-retirement.md` and
`scripts/strip-noise-comments.mjs`.

**Good:**
```ts
// We normally find a sequence by its word (e.g. "ABBD"). But if the user
// edited and re-saved it with a different word (e.g. "ABBDJ"), our lookup
// table still has the old word and won't find the new one. In that case,
// we fall back to locating it by its unique ID instead.
```

**Bad:**
```ts
// Look up sourceRef from cache. If word changed, fall back to ownerId + id.
```

## Svelte 5

Use runes (`$state`, `$derived`, `$effect`) not legacy reactive syntax. Prefer `$derived` over `$effect` when computing values. Use `$props()` with TypeScript interfaces.

## State Management

Use context + runes for shared state, not stores. See the `state-management` skill for the factory+context pattern.
