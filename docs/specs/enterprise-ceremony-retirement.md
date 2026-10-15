# Enterprise Ceremony Retirement

**Repository status (2026-10-14):** The interface/class/file counts below are April/May snapshots. Later history includes function owners such as `src/lib/features/create/generate/shared/services/turn-manager.ts` and `src/lib/features/create/shared/services/step-operations/turns-handler.ts`, alongside retained classes. This does not establish total completion or authorize a regenerated implementation audit.

Date: 2026-04-30
Status: historical May progress account; phases and remaining counts require individual reconciliation. See "Progress (2026-05-29)" at the end.
Scope: Codebase-wide removal of unnecessary 1:1 interface/implementation indirection AND conversion of stateless classes to plain function modules

## Problem

The codebase carries two layers of enterprise Java/C# ceremony adopted in 2024 that were already considered outdated in the TypeScript ecosystem by ~2018-2020.

### Layer 1: Interface Indirection

757 interface files in `contracts/` folders, 527 singleton getter files, and 799 `implements IFoo` declarations.

| Category                                                  | Count       | Action             |
| --------------------------------------------------------- | ----------- | ------------------ |
| Interfaces with exactly 1 implementation                  | 710 (93.8%) | Retire             |
| Interfaces with 0 explicit `implements`                   | 36 (4.8%)   | Audit individually |
| Interfaces with 2+ implementations (genuine polymorphism) | 11 (1.4%)   | Keep               |

The 710 single-implementation interfaces contribute:

- ~41,740 lines across 757 interface files
- ~5,900 lines across 527 getter files
- 124 `services/contracts/` + `services/implementations/` directory pairs
- 799 `implements IFoo` declarations in implementation classes

Only 42 `vi.mock` calls exist in the test suite, confirming that the interfaces are not being used for test double injection. TypeScript's structural typing and Vitest's module mocking make the interface-for-testability argument moot.

### Layer 2: Stateless Classes

328 exported classes have zero instance fields and zero constructor parameters. They use `this` only to call their own private methods, treating the class purely as a namespace. TypeScript's module system already provides namespacing. Each of these classes also has a singleton getter that lazy-initializes an instance that holds no state.

What a stateless class looks like today (3 files):

```typescript
// IBrowseSorter.ts (25 lines)
export interface IBrowseSorter {
  sortSequences(sequences: SequenceData[], method: BrowseSortMethod): SequenceData[];
}

// BrowseSorter.ts (558 lines)
export class BrowseSorter implements IBrowseSorter {
  sortSequences(sequences, method) {
    switch (method) {
      case 'alphabetical': return this.sortAlphabetically(sequences);
      ...
    }
  }
  private sortAlphabetically(sequences) { ... }
}

// getBrowseSorter.ts (10 lines)
let instance: IBrowseSorter | null = null;
export function getBrowseSorter(): IBrowseSorter {
  return instance ??= new BrowseSorter();
}
```

What it should be (1 file):

```typescript
// browse-sorter.ts
export function sortSequences(sequences, method) {
  switch (method) {
    case 'alphabetical': return sortAlphabetically(sequences);
    ...
  }
}

function sortAlphabetically(sequences) { ... }
```

No class, no getter, no instance, no `this`, no `private`. Private methods become unexported module-scoped functions. Public methods become named exports. The getter is eliminated entirely because there is nothing to initialize.

## Goals

1. Remove all 1:1 interface/implementation indirection where the interface provides no polymorphic value
2. Preserve the 11 genuinely polymorphic interfaces
3. Migrate co-exported types out of interface files before deletion
4. Flatten the `services/contracts/implementations/` directory structure
5. Convert 328 stateless classes to plain function modules
6. Eliminate getter boilerplate for stateless services
7. Remove all ceremonial `implements IFoo` declarations

## Non-Goals

- Rewriting service logic (this is purely structural)
- Eliminating all classes (stateful services with real instance state keep their classes and getters)
- Eliminating all interfaces (genuine polymorphism stays)
- Touching Svelte components (already on Svelte 5 runes, clean)

## The 11 Interfaces to Keep

These have genuine multiple implementations and should be preserved:

| Interface                      | Impl Count | Reason                                             |
| ------------------------------ | ---------- | -------------------------------------------------- |
| `ILOOPExecutor`                | 8          | Strategy pattern: halved, quartered, rewound, etc. |
| `ISubInterpreter`              | 10         | Voice command interpreters per domain              |
| `IDirectionCalculator`         | 5          | Different calculation strategies per prop type     |
| `ICodex`                       | 3          | Different codex implementations                    |
| `IAnimationPlaybackController` | 2          | Different playback strategies                      |
| `IAsciiRenderer`               | 2          | Different ASCII rendering backends                 |
| `IEndpointDetector`            | 2          | Video trail endpoint detection strategies          |
| `ITrailOverlayCanvas`          | 2          | Different canvas implementations                   |
| `IDirectRenderer`              | 2          | Different rendering backends                       |
| `IOrientationPropagator`       | 2          | Different propagation strategies                   |
| `ITransitionGraph`             | 2          | Different graph implementations                    |

Additionally, `IHapticFeedback` should be evaluated: it has Capacitor native, web Vibration API, and SSR no-op implementations. If those exist as separate classes, keep the interface.

## The 36 No-Implements Interfaces

These 36 interfaces have no class that declares `implements`. They fall into two categories:

1. **Type-only interfaces** used for data shapes (not service contracts). These should be moved to a `types.ts` file in their feature and the `I` prefix dropped.
2. **Dead interfaces** that nothing references. Delete outright.

Top by import count: `ISettingsState` (17 imports), `ISequenceAnimationOrchestrator` (15), `IPictographPreparer` (10), `IViewportManager` (8). These are likely type-only and need migration, not deletion.

## Co-Exported Types

~37% of interface files export additional types, interfaces, or enums beyond the main service contract. Example:

```typescript
// IConnectionManager.ts exports:
export interface IConnectionManager { ... }
export interface ConnectionInfo { ... }      // ← consumers import this
export interface MutualFollowInfo { ... }     // ← consumers import this
export type ConnectionStatus = ...;           // ← consumers import this
```

These types must be migrated to a `types.ts` file in the same feature directory before the interface file can be deleted. This is the main source of migration risk.

## Target Architecture

### Decision tree per service

```
Does the interface have 2+ implementations?
  YES → Keep interface, keep class, keep getter. Done.
  NO  ↓

Does the class have instance fields or constructor params?
  YES → Remove interface + `implements`. Keep class + getter (returns concrete type). Done.
  NO  ↓

Convert to plain function module:
  - Public methods → named exports
  - Private methods → unexported module-scoped functions
  - Delete interface, delete class, delete getter
  - Update all consumer imports
```

### Before (current) — stateful service

```
feature/
  services/
    contracts/
      IFooService.ts          ← 1:1 interface (delete)
    implementations/
      FooService.ts            ← implements IFooService (keep, remove implements)
  getFooService.ts             ← returns IFooService (keep, return FooService)
```

### After — stateful service

```
feature/
  services/
    FooService.ts              ← direct export, no implements
  getFooService.ts             ← returns FooService
```

### Before (current) — stateless service

```
feature/
  services/
    contracts/
      IBarService.ts           ← interface (delete)
    implementations/
      BarService.ts            ← stateless class (delete)
  getBarService.ts             ← getter for empty instance (delete)
```

### After — stateless service

```
feature/
  services/
    bar-service.ts             ← exported functions + module-scoped helpers
```

Consumer changes: `getBarService().doThing(x)` → `import { doThing } from './bar-service'; doThing(x)`

### Directory Structure

After retirement:

- `contracts/` directories with no remaining interfaces are deleted
- `implementations/` directories are renamed to just `services/` or their contents are moved up one level
- For features where `implementations/` has subdirectories (like `detection/`, `comparison/`), those subdirectories move up to `services/`

## Phases

### Phase 0: Automated Inventory (15 min)

Write a script that produces a JSON manifest of every interface, its implementation, its getter, whether it exports additional types, its consumer import count, and whether the implementation class is stateless. This manifest drives all subsequent phases.

Proposed deliverable: `scripts/ceremony-audit.json` (absent from the current tree).

### Phase 1: Zero-Consumer Pure Contracts (est. ~470 interfaces)

These interfaces have zero consumer imports outside their own contracts/implementations/getter triad. They are pure ceremony.

For each:

1. Remove `implements IFoo` from the implementation class
2. Update the getter to return the concrete class type instead of `IFoo`
3. Delete the `IFoo.ts` contract file
4. If the `contracts/` directory is now empty, delete it

This phase is fully automatable with a codemod script. No behavior changes, no consumer updates needed.

Risk: Near zero. The TypeScript compiler will catch any missed references.

### Phase 2: Type-Exporting Contracts (est. ~270 interfaces)

These interfaces export additional types that consumers depend on.

For each:

1. Create a `types.ts` file in the feature directory (or append to existing)
2. Move all non-service-contract exports to `types.ts`
3. Update all consumer imports to point to `types.ts`
4. Then perform the same steps as Phase 1 for the service contract itself

This phase requires import rewriting but no logic changes. A codemod can handle the mechanical work, with manual review for edge cases.

Risk: Low. Import errors are compile-time failures.

### Phase 3: The 36 No-Implements Interfaces

Audit each individually:

- If it's a type-only interface used as a data shape: move to `types.ts`, drop `I` prefix
- If it's dead (zero imports): delete
- If it's used structurally (TypeScript duck typing without `implements`): evaluate whether it serves as documentation or is pure ceremony

### Phase 4: Directory Flattening

After Phases 1-3:

1. Delete all empty `contracts/` directories
2. For `implementations/` directories that are the only child of `services/`:
   - If single file: move file up to `services/`, delete `implementations/`
   - If multiple files with no subdirs: move all up, delete `implementations/`
   - If has meaningful subdirectories (like `detection/`, `comparison/`): move subdirs up to `services/`
3. Update all imports affected by path changes

### Phase 5: Stateless Class Conversion (est. 328 classes)

This is the second layer of ceremony removal. For each class flagged as stateless in the Phase 0 manifest (zero instance fields, zero constructor parameters):

For each stateless class:

1. Create a new kebab-case module file (e.g., `BrowseSorter.ts` → `browse-sorter.ts`)
2. Convert public methods to named export functions, removing `this` references
3. Convert private methods to unexported module-scoped functions
4. Delete the class file
5. Delete the corresponding getter file (no instance to manage)
6. Update all consumer call sites:
   - `getBrowseSorter().sortSequences(seqs, method)` → `sortSequences(seqs, method)`
   - `import { getBrowseSorter } from '...'` → `import { sortSequences } from '../services/browse-sorter'`

Consumer call site updates are the main complexity in this phase. Each getter call must be traced to its consumers and rewritten. The mechanical pattern is consistent: `getXxx().methodName(args)` → `methodName(args)` with the import updated.

Subtleties to watch for:

- Consumers that store the getter result in a variable: `const sorter = getBrowseSorter(); sorter.sort(...); sorter.group(...);` — these need to be unwound into separate function calls
- Consumers that pass the service as an argument: `doSomething(getBrowseSorter())` — these need the receiving function's parameter type updated
- Svelte reactive state holding a service reference: `let sortService = $state<IBrowseSorter | null>(null)` — these need restructuring

Risk: Low-moderate. The TypeScript compiler catches all broken references. The main risk is overlooking a consumer pattern that doesn't fit the simple `getXxx().method()` shape.

### Phase 6: Getter Simplification for Stateful Classes

For the remaining ~200 stateful classes that keep their getters:

Before:

```typescript
import { browser } from "$app/environment";
import type { IBrowseFilter } from "./services/contracts/IBrowseFilter";
import { BrowseFilter } from "./services/implementations/BrowseFilter";

let instance: IBrowseFilter | null = null;

export function getBrowseFilter(): IBrowseFilter {
  if (!browser) throw new Error("getBrowseFilter() is browser-only");
  return (instance ??= new BrowseFilter());
}
```

After:

```typescript
import { browser } from "$app/environment";
import { BrowseFilter } from "./services/BrowseFilter";

let instance: BrowseFilter | null = null;

export function getBrowseFilter(): BrowseFilter {
  if (!browser) throw new Error("getBrowseFilter() is browser-only");
  return (instance ??= new BrowseFilter());
}
```

### Phase 7: Validation

1. Full TypeScript compilation (`tsc --noEmit`)
2. Full test suite run
3. Verify no runtime regressions in dev
4. Grep for orphaned `contracts/` or `implementations/` directories
5. Grep for remaining `implements I` declarations (should only be the 11 genuine ones)
6. Verify no `IFoo` imports remain except for the 11 kept interfaces
7. Verify no getter files remain for stateless-converted services
8. Verify no `getXxx()` call sites remain for converted services

## Execution Strategy for Claude Code

This is ideal for parallel agentic execution. The work is mechanical, repetitive, and has clear success criteria (TypeScript compiles, tests pass).

**Recommended approach:**

- Phase 0: Single agent, produces the manifest
- Phase 1: 4-5 parallel agents, each taking a slice of the ~470 zero-consumer interfaces. Each agent processes ~100 interfaces, runs `tsc --noEmit` after each batch of 20.
- Phase 2: 3-4 parallel agents, each taking a slice of the ~270 type-exporting interfaces. Slightly more care needed for import rewriting.
- Phases 3-4: Single agent, smaller scope, needs judgment calls.
- Phase 5: 3-4 parallel agents, each taking a slice of the 328 stateless classes. Each agent converts a class, deletes the getter, updates consumers, runs `tsc --noEmit`. The consumer call-site rewriting is the bottleneck, but each service is independent.
- Phase 6: Single agent, mechanical getter updates for remaining stateful classes.
- Phase 7: Single agent, validation sweep.

**Estimated token budget:** Phases 1-2 (interface removal) are the bulk. Phase 5 (stateless class conversion) is moderate but involves more consumer-site rewriting. Total is achievable in a focused evening session at 10% of weekly budget.

**Safety net:** Every phase ends with `tsc --noEmit` and `vitest run`. If compilation fails, the agent fixes the import before moving on.

## Expected Outcomes

| Metric                                  | Before                       | After                               |
| --------------------------------------- | ---------------------------- | ----------------------------------- |
| Interface files                         | 757                          | ~11                                 |
| Getter files                            | 527                          | ~200 (stateful only)                |
| Stateless class files                   | 328                          | 0 (converted to function modules)   |
| `implements IFoo` declarations          | 799                          | ~25                                 |
| Lines of pure ceremony                  | ~55,000                      | ~0                                  |
| `contracts/` directories                | 124                          | ~5                                  |
| `implementations/` directories          | 127                          | 0 (flattened)                       |
| Total TypeScript files                  | 3,435                        | ~2,450 (est. ~985 files eliminated) |
| Avg files an AI agent reads per service | 3 (contract + impl + getter) | 1                                   |
| Avg hops to understand a service        | 3                            | 1                                   |

## Risks

1. **Co-exported types missed by codemod.** Mitigated by TypeScript compiler catching broken imports immediately.
2. **Structural typing consumers.** Some code may depend on the interface shape without importing it explicitly. TypeScript's structural typing means this still works after deletion, but worth verifying.
3. **External consumers of the MCP server.** The Flow Arts Knowledge MCP server may reference interface types. Verify MCP server compiles after changes.
4. **Capacitor/Tauri builds.** Run platform builds after completion to verify no path issues.
5. **Getter call-site patterns.** Some consumers may store getter results in variables, pass services as arguments, or hold them in Svelte reactive state. These patterns need manual attention during Phase 5. The Phase 0 manifest should flag consumers that use non-trivial getter patterns.
6. **Services mistakenly classified as stateless.** The audit checks for constructor params and instance field declarations, but a class could acquire state through closure or external mutation. Manual review of the Phase 0 manifest before executing Phase 5 is prudent.

## Progress (2026-05-29)

Executed across multiple parallel sessions (the wave/cluster batches). What's landed vs the plan, measured against the live tree:

### Done

- **Phases 1–2 (interface retirement), bulk.** The ~470 zero-consumer + ~270 type-exporting interfaces were retired across the wave/cluster batches. Residual interface files: **20** `I*.ts` (down from 757).
- **Phase 4 (directory flattening), complete.** `contracts/` directories: **0 remain** (all collapsed; the last 5 single-interface dirs were hoisted 2026-05-29 — `ILOOPExecutor`, `IAsciiRenderer`, `IEndpointDetector`, `IInputProvider`, `ISubInterpreter` moved up out of `contracts/`). `implementations/` directories: **2 remain, deliberately** (see Deferred).
- **Kebab-rename + resolution-based import rewrite**, complete for the flattened modules. Two Windows-specific hazards were found and now have guard scripts: `scripts/import-case-scan.cjs` (case-only renames that pass on Windows but break Cloudflare's case-sensitive Linux) and `scripts/worker-url-scan.cjs` (`new URL("…worker.ts", import.meta.url)` paths broken by depth changes during flatten).

### Residual interface inventory (20 `I*.ts`)

| Class                                                                                                       | Count                                                                                                                                                                                                                                            | Disposition                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Genuine 2+ implementations                                                                                  | 8 — `ILOOPExecutor`, `ISubInterpreter`, `ILOOPDetector`, `IAsciiRenderer`, `IDirectRenderer`, `IEndpointDetector`, `IInputProvider`, `ITrailOverlayCanvas`                                                                                       | **Keep** (real polymorphism)                                                                 |
| Dependency-inversion boundary (1 impl, but interface lets a lower layer call a higher one via register/get) | 1 — `IFeedbackTesterWorkflow`                                                                                                                                                                                                                    | **Keep** — retiring it = layering violation (`shared/` would import `features/`)             |
| Type-only `I*` (impls=0; data-shape interfaces, not service contracts)                                      | 10 — `IAnimationRenderer` (19 importers), `IAnimationRenderLoop`, `IAnimationPrecomputer`, `IAnimatorLoader`, `IAnimatorCanvasInitializer`, `IGlyphTextureLoader`, `IPropTextureLoader`, `ISVGGenerator`, `ITrailCapturer`, `IPublicIndexSyncer` | **Phase 3 pending** — migrate to `types.ts`, drop `I` prefix                                 |
| Retired 2026-05-29                                                                                          | `ICSVPictographParser`                                                                                                                                                                                                                           | Done — `CSVRow` moved to `csv-pictograph-parser.ts`, consumers retyped to the concrete class |

**Lesson:** the residual interfaces are the _hard tail_, not leftover ceremony. The easy 1:1 contracts were already retired by the waves. What remains is genuine polymorphism, inversion boundaries, and type-only shapes — each needs individual judgment, not a codemod.

### Recorded as not started in the May snapshot

- **Phase 5 (stateless class → function modules).** Scope per the 2026-05-28 manifest is **51 pure stateless + 52 stateless-deps ≈ 103 classes** (~80 KB source, ~675 methods) — far below the spec's original 328 estimate; the waves converted the rest and a tighter audit reclassified. **Bundle benefit is negligible, despite the tree-shaking argument.** All stateless source is ~50 KB of a 17 MB client bundle (~0.3%); per-function DCE recovers only the unused-method slice of that — low single-digit KB gzipped, not perceptible. So Phase 5 is the _same kind of win as Phases 1–4: source-org + code deletion_ (~51 class files + ~51 getters removed, 1 import instead of 3, no lazy-init getter), not a runtime/bundle improvement. Do it for the cleanup, not the bytes. Biggest individual targets: `LOOPDetector` (19 methods), `BrowseSectionManager` (16), `BrowseFilter` (21).
- **Phase 6 (getter return-type simplification for ~200 stateful classes).**
- **Phase 7 (validation sweep).**

Current metrics vs targets: `implements I` **55** (target ~25 — the surplus is mostly stateless classes still implementing retired-elsewhere shapes, cleared in Phase 5); singleton getter files **289** (target ~200 stateful; ~89 stateless getters die in Phase 5); exported classes **656**.

### Deferred (deliberate keeps, not flatten targets)

- `foundation/services/implementations/data/` — `CsvParser` + `EnumMapper`. These are genuine dedup candidates (class API vs the canonical standalone-function modules `csv-parser.ts`/`enum-mapper.ts`), needing behavior analysis, not a mechanical move.
- `animation-engine/services/implementations/` — structural subdirs (`canvas2d/`, `fire/`, `led/`, `managers/`), not a flat hoist.

### Sequencing note

Phase 3 (the 10 type-only migrations) and Phase 5 touch consumers broadly in the **render / animation / trail / export** subtrees — run them on a clean tree, since that's where in-flight feature work concentrates and rename/migration churn collides.
