---
status: active
value: 5
effort: L
remaining: "Verify Sequence Engine Unification — Design Spec against packages/tka-types/src/step.ts before resuming implementation. Prior recorded remainder: 'Phases 0-2 shipped via a different subtype architecture; Phase 3 (delete 5 app-side LOOP executors) still open — the bug that motivated the spec'"
depends_on: ""
plan_path: "docs/superpowers/plans/active/2026-04-20-sequence-engine-unification-plan.md"
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Sequence Engine Unification — Design Spec

**Queue evidence (2026-10-07):** Phases 0-2 landed through a different subtype architecture; Phase 3 LOOP executor consolidation remains open. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** Phases 0-2 shipped via a **different** subtype architecture; Phase 3 (delete 5 app-side LOOP executors) still open — the bug that motivated the spec
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-04-20
**Original status (historical):** Ready for implementation planning
**Author:** Austen + Claude (brainstorming session)

## Problem

Three parallel copies of LOOP execution logic have diverged in production:

1. **Engine** — `packages/sequence-engine/src/loop/execution/Strict*Executor.ts` (used by fresh LOOP generation via `SequenceBuilder`)
2. **App-side** — `src/lib/features/create/generate/circular/services/implementations/Strict*LOOPExecutor.ts` (used by spell/extend flow via `SequenceExtender`)
3. **MCP vendored** — copies in `mcp-server/`, `mcp-server-pkg/`, and `deployment/functions/broadcast/`

The drift between app-side and engine-side executors caused a user-visible bug: quartered MIRRORED LOOP generation silently produced halved output because the app-side path was updated while engine executors weren't. Five parallel copies of the same algorithm guarantee more drift bugs over time.

Simultaneously, two parallel sequence-step type systems exist — `StepData` (app, extends `PictographData`) and `SequenceStep` (engine, lean standalone) — describing the same concept with gratuitous differences. `MotionData` is defined twice. This split is a historical accident; neither type earned its independence.

## Goals

1. **One source of truth for LOOP execution.** Engine is canonical. All consumers import from engine. No vendoring, no reimplementations.
2. **One type describing a sequence step.** Unified `Step` type in `@tka/tka-types`. Reversals derived on demand, selection held in a separate UI store.
3. **Three publishable artifacts** forming the TKA reference implementation: `@tka/sequence-engine`, `@tka/domain`, `@tka/render-core`. Published Day 1 as 0.x.
4. **Terminology: Step, not Beat.** This spec's new types use Step. Codebase-wide audit/rename of `beat*` identifiers that describe sequence steps is a sibling spec.

## Non-Goals

- Codebase-wide `beat` → `step` identifier rename (sibling spec).
- Publishing the other library packages (`vtg-domain`, `caps-domain`, `9square-domain`, `spin-science-domain`, `render-composition`, `feedback-types`) — see *Publishing Strategy* below for the reasoning.
- Converting MCP servers from applications to libraries.

## Architecture

### Core Premise

One TKA sequence engine exists. Its types, algorithms, and rendering primitives are canonical. Three published packages form the reference implementation:

- `@tka/sequence-engine` — how sequences compose (LOOP algebra, constraints, orientation propagation)
- `@tka/domain` — what TKA is (glossary, letter types, positions, compounds, LOOPs, curriculum)
- `@tka/render-core` — how TKA looks (pictograph rendering calculations, arrow positioning, prop geometry)

All other consumers — the app, MCP servers, broadcast function — import from these. No vendoring, no duplication, no local reimplementations.

### Unified Type Layer

A single `Step` type and single `Motion` type live in `packages/tka-types`. Every consumer imports from there. `StepData` and `SequenceStep` are deleted. `MotionData` (both copies) is replaced by `Motion`.

```ts
// packages/tka-types/src/step.ts
export interface Step {
  readonly id: string;
  readonly letter: Letter | null;
  readonly startPosition: GridPosition | null;
  readonly endPosition: GridPosition | null;
  readonly motions: { readonly blue: Motion; readonly red: Motion };
  readonly gridMode?: GridMode;
  readonly stepNumber: number;        // >= 0, 0 = start position
  readonly duration: number;          // choreographic, in musical beats
  readonly variation?: number;
  readonly isBridge?: boolean;
  readonly isBlank?: boolean;
}
```

```ts
// packages/tka-types/src/motion.ts
export interface Motion {
  readonly motionType: MotionType;
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly rotationDirection: RotationDirection;
  readonly startOrientation: Orientation;
  readonly endOrientation: Orientation;
  readonly turns: number | "fl";
  readonly plane: Plane;                   // "wall" | "wheel" | "overhead"
  readonly color: PropColor;               // "blue" | "red"
  readonly prefloatMotionType?: MotionType;
  readonly prefloatRotationDirection?: RotationDirection;
}
```

**Type-surface decisions:**

- `letter: Letter | null` — enum, not string. Current engine's `string` typing discards safety.
- `startPosition`/`endPosition: GridPosition | null` — enum, not string.
- `motions: { blue, red }` — keyed record, not flat `blueMotion/redMotion`. Hand-iterating algorithms become one loop instead of duplicated blocks.
- `stepNumber: number` required (not optional). Every step has one.
- `startOrientation`/`endOrientation` required (not optional). Orientation algebra breaks without them.
- `color` required on `Motion`. Ambiguous-color Motions were a bug source.
- `readonly` everywhere. Immutability by contract; mutations go through builders.

**Removed fields (vs current `StepData`):**

- `blueReversal`, `redReversal` — derived via `deriveReversals(steps)` in shared domain logic. Stored values can drift from actual sequence content; derivation makes drift impossible.
- `isSelected` — moves to a `selectionStore` in the app UI layer, keyed by step id. Selection is view state, not sequence content. Enables the same sequence open in multiple panels with independent selection.
- `isStep` — type discriminator with no consumers; deleted.
- `id` — was on `PictographData` as optional; required on `Step`.

**Builder/factory helpers** live in `@tka/tka-types`:

- `createStartStep(pos: GridPosition): Step`
- `createStep(partial: Partial<Step> & { letter: Letter; stepNumber: number }): Step`
- `updateStep(step: Step, changes: Partial<Step>): Step`

### Consumer Topology

| Consumer | Path | Import strategy |
|---|---|---|
| App (`src/lib/**`) | Workspace | `file:../packages/*` — always on latest source |
| `mcp-server/` (local dev MCP) | Workspace | Already has `@tka/sequence-engine` as `file:` dep; delete vendored copy |
| `mcp-server-pkg/` (published `@austencloud/tka-domain-mcp`) | Build-time bundle | esbuild inlines `@tka/sequence-engine` into `dist/index.js`; single shipped artifact; no public engine package dep |
| `deployment/functions/broadcast/` | Workspace | Cloud Function's bundler inlines engine; delete vendored copy |
| Third-party consumers | Published npm | Install `@tka/sequence-engine` + `@tka/domain` + `@tka/render-core` from npm |

### Reversal Derivation

`deriveReversals(steps: Step[]): ReadonlyArray<{ blue: boolean; red: boolean }>` in `@tka/sequence-engine`. Pure function; returns an index-aligned array.

A reversal is: "this hand's rotation direction is opposite the previous step's same-hand rotation direction." Step 0 (start position) has no reversal. Blank steps break the chain — next step has no reversal (no prior direction to reverse against).

Renderers consume derived output for display. No storage, no sync logic.

### Selection Store

`selectionStore` in app UI layer (Svelte store). Keyed by step id. Scoped per sequence instance — if the same sequence is open in preview + timeline, each has its own selection.

API (draft, finalize in plan):
- `select(id: string, options?: { additive?: boolean })`
- `deselect(id: string)`
- `clear()`
- `isSelected(id: string): boolean`

No longer stored on steps, no longer serialized to Firestore.

## Publishing Strategy

**Day 1 publish (as `0.x`):**

1. `@tka/sequence-engine` — technical IP; the LOOP algebra, constraint system, orientation propagation. Estate artifact. Forces API hygiene.
2. `@tka/domain` — TKA knowledge in machine-readable form. Enables anyone to build TKA tooling. Biggest cultural deposit.
3. `@tka/render-core` — rendering calculations are foundational, not aesthetic. One correct way to render a TKA pictograph. Every consumer benefits from bug fixes.

**Keep internal:**

- `render-composition` — UI-opinionated, Svelte-coupled; app style, not engine.
- `feedback-types` — infra for your feedback system; no external consumer.

**Gated on upstream author endorsement:**

- `vtg-domain` (Ralf Heather), `caps-domain`, `9square-domain` (Charlie Cushing), `spin-science-domain` (Lorq Nichols), `flow-arts-core` (shared types).
- These are formalizations of other people's frameworks. Publishing without each author's explicit endorsement is politically risky.
- `flow-arts-core` is bundled into whichever framework package publishes.

**App consumes via workspace link** regardless of publish status. External consumers use npm. No need to simulate upgrade friction internally.

**Versioning:** 0.x during initial consumption validation. 1.0 only after API has stabilized with real third-party use (expect 1-2 years). 0.x allows breaking changes freely per semver.

## Rollout Phases

Each phase independently shippable, independently revertible, validated by the parity harness before merging.

### Phase 0 — Foundation Types

Create `@tka/tka-types/src/step.ts`, `motion.ts`, enum modules (`letter`, `grid`, `plane`, `orientation`, `motion-type`, `prop-color`, `rotation-direction`). Builders/factories. Unit tests for type shapes and builder semantics. No consumer changes.

### Phase 1 — Engine Migration

Replace `SequenceStep`/`MotionData` inside `packages/sequence-engine` with `Step`/`Motion` from `@tka/tka-types`. Mechanical swap; engine's public API now exports the unified types. Update engine tests. Parity harness: 200+ sequence corpus must produce identical output.

### Phase 2 — App Migration

Replace `StepData`/`MotionData` imports across `src/lib/**` with `Step`/`Motion`. Introduce `deriveReversals` in shared domain logic. Introduce `selectionStore` in app UI. Remove in-memory `blueReversal`/`redReversal`/`isSelected`/`isStep`. Renderer layers read derived reversals. Firestore writes stop emitting reversal fields.

**Transition-window behavior (Phases 2–6):** stored reversal fields on existing Firestore docs are ignored on read; derivation is the sole source of truth from Phase 2 onward. No drift possible because reads never touch stored values. Phase 6 removes the now-unused fields from storage.

### Phase 3 — LOOP Executor Consolidation

Delete app-side `src/lib/features/create/generate/circular/services/implementations/Strict*LOOPExecutor.ts`. Rewire `SequenceExtender.extendSequence` to call engine's `executeLOOP` directly. Extension flow and fresh-generation flow share one execution path.

### Phase 4 — MCP Consolidation

- `mcp-server/` (local): delete vendored `loop-executor.js`; imports from `@tka/sequence-engine/loop` (workspace dep exists).
- `mcp-server-pkg/` (published): add esbuild build step; `@tka/sequence-engine` becomes a build-time dependency; `dist/index.js` ships inlined; no vendor dir in git.

### Phase 5 — Broadcast Consolidation

Delete `deployment/functions/broadcast/loop-executor.ts`. Function imports from engine via workspace link; existing Cloud Function bundler inlines.

### Phase 6 — DB Backfill

Firestore migration removes stored `blueReversal`/`redReversal` fields from all sequence docs. Gated by 30 days of zero derivation mismatches (see *Testing Strategy*). Backup before migration; reversible.

### Phase 7 — Publish

`@tka/sequence-engine` + `@tka/domain` + `@tka/render-core` published to npm as `0.1.0`. CHANGELOG.md scaffolds. READMEs with installation + one example each. App continues consuming via workspace link.

## Testing Strategy

### Parity Harness (cross-phase safety net)

Before Phase 1: capture a corpus of 200+ sequences — decks, recent Firestore writes, manually-authored edge cases including period-2 and period-4 LOOPs across all types, REWOUND sequences, high-turn sequences, bridge-inserted sequences. Serialize engine output for each (steps array → canonical JSON).

After every phase: re-run corpus, diff outputs bit-for-bit. Any diff fails the phase. Diff tool surfaces which sequence + which step diverged for fast triage.

### Reversal Derivation Proof (Phase 2 gate)

Before Phase 6 (field removal): query all production sequence docs, compute `deriveReversals(steps)` for each, compare to stored `blueReversal`/`redReversal`. Zero mismatches required before field-drop migration runs.

Any mismatch = either derivation logic bug OR stored data was wrong all along. Both cases investigated before proceeding. Logged for 30 days of continuous monitoring.

### Engine Unit Tests

All existing `packages/sequence-engine/tests/**` pass post-migration. Type changes are mechanical; behavior is not.

### LOOP Executor Correctness Tests

Period-2 and period-4 round-trip tests for MIRRORED/FLIPPED/SWAPPED/INVERTED/ROTATED/REWOUND. During Phases 1–3 transition window: both the consolidated engine path AND the app-side path (before deletion) run against same inputs; outputs must match.

### MCP Integration Test

After Phase 4: round-trip the full `generate_sequence` MCP tool with known-good inputs (covering all LOOP types, both slice sizes, multiple levels). Output identical to pre-migration baseline.

### Broadcast Integration Test

After Phase 5: broadcast Cloud Function produces identical output for a known-good trigger payload.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Parity harness false-negative (bug exists, corpus doesn't catch) | Corpus includes all deck sequences + all sequences written to prod in the last 30 days; edge cases manually authored from known-buggy regions (high turns, quartered non-rotated, float motion types) |
| Reversal derivation disagrees with stored values due to legacy data | Investigate per-sequence; fix derivation or backfill correct stored values before Phase 6; do NOT just trust derivation silently |
| MCP bundled size bloat after esbuild | Measure baseline; if bundle > 2x pre-bundling dist, consider tree-shaking audit or excluding test utilities from engine exports |
| Breaking change ripples through 820+ files (terminology audit scope) | This spec doesn't touch those files; the sibling rename spec can proceed independently and in parallel |
| Published package API churn frustrates early adopters | 0.x versioning signals instability; README explicitly states "API not stable until 1.0"; CHANGELOG tracks every breaking change |

## Success Criteria

- Zero LOOP executor code duplicated across the codebase. One engine implementation; everyone imports it.
- One `Step` type and one `Motion` type across the codebase. `StepData`, `SequenceStep`, both `MotionData` copies deleted.
- Parity harness shows bit-identical engine output pre/post all phases on 200+ sequence corpus.
- Reversal derivation matches stored data with zero mismatches across production before field drop.
- `@tka/sequence-engine` + `@tka/domain` + `@tka/render-core` installable from npm as `0.1.0`.
- Fresh-generation and extend flows both produce correct quartered mirrored LOOPs (original bug fixed, verified end-to-end).

## Open Items for the Implementation Plan

- Exact esbuild config for `mcp-server-pkg` bundling.
- Exact Firestore migration script structure (dry-run flag, progress logging, rollback procedure).
- Exact sequence corpus selection methodology (deterministic IDs logged in plan).
- README+CHANGELOG scaffolding for the three published packages — content, examples, installation instructions.
