# God Component Decomposition (Ceremony Refactor v2.0)

**Repository status (2026-10-14):** The scores/line counts below are the dated May/June measurements, not current decomposition targets or a new census. The camera owner moved to `packages/camera-3d`; LOOP Labeler's old path is absent. The three bottom decisions remain unratified proposals.

Date: 2026-05-31
Status: Draft v2 — brainstormed 2026-06-02 against the live tree, reframed around
evidence. Pending final ratification of the three open decisions at the bottom.
Scope: Reduce the cognitive + agent-context cost of the codebase's most tangled
`.svelte` components by extracting logic into `*.svelte.ts` factories and plain
modules, and (secondarily) splitting markup-heavy layout shells, gated by a
ratcheting complexity rule. NOT a blanket "split every long file" mandate.

## The reframe (why v1 of this spec was wrong, in one paragraph)

v1 proposed gating on total line count (800 → 600 → 400). Measuring the 62
production `.svelte` files over 800 lines proved line count is the wrong metric.
It **over-flags**: 35 of the 62 (56%) are big because of `<style>`, not logic, and
splitting a cohesive presentational component to satisfy a line budget produces
prop-drilling and worse readability, not better. It **under-flags**: genuine logic
monsters hide under 800 total lines (`SequenceDrawerHost` 761, `AnimationSheetCoordinator`
716, `Drawer.svelte` 611) because their bulk is tangled script. The disease is
**script complexity**, not file size. This spec gates on that.

## Evidence (measured 2026-06-02)

Across the 62 production `.svelte` over 800 lines, classified by which block
dominates the file:

| Species                                 | Count | What's big                                             | Right treatment                                                                        |
| --------------------------------------- | ----- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Logic monster** (`<script>`-dominant) | 22    | reactive state + helpers + pipelines fused in one file | extract script → `*.svelte.ts` factory + plain modules. **PRIMARY.**                   |
| **Style monster** (`<style>`-dominant)  | 35    | cohesive CSS on a presentational component             | **mostly KEEP.** Svelte colocates CSS by design; a 700-line `<style>` is not a defect. |
| **Template monster** (markup-dominant)  | 5     | a layout shell wiring many children                    | break markup into sub-layout children. **SECONDARY.**                                  |

The worst logic monster, `ChoreoCard.svelte` (1,655 lines): the template is only
149 lines and fine. The disease is a **1,433-line `<script>`** holding 57 `$derived`,
9 `$effect`, and a single `renderAllCells()` function spanning **317 lines**
(630–947), fused with layout math, crossfade animation, context-menu handling, and
dimension tracking. The fix is not "split the component." It is "extract the
script." For the majority of real targets, this project is **God _Script_
Extraction**, not god _component_ splitting.

### The disease-score (the metric this spec gates on)

```
score = scriptLines + 4·($derived count) + 8·($effect count) + 3·(function count)
```

`$effect` is weighted highest: it is the hardest reactivity to reason about and the
riskiest to relocate (cleanup + ordering). The top targets by score:

| score | total | script | $derived | $effect | fn  | file                                                                                              |
| ----- | ----- | ------ | -------- | ------- | --- | ------------------------------------------------------------------------------------------------- |
| 1790  | 1655  | 1433   | 57       | 9       | 19  | `shared/sequence-viewer/components/ChoreoCard.svelte`                                             |
| 1016  | 978   | 856    | 76       | 6       | 16  | `packages/camera-3d/src/lib/components/UnifiedCameraController.svelte` (moved; scores historical) |
| 957   | 1112  | 755    | 13       | 6       | 34  | `features/choreo-card/components/deck-releaser/DeckReleaserTab.svelte`                            |
| 891   | 1194  | 678    | 18       | 6       | 31  | `features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte`                  |
| 871   | 761   | 708    | 6        | 8       | 25  | `features/create/shared/components/coordinators/SequenceDrawerHost.svelte`                        |
| 845   | 852   | 703    | 9        | 5       | 22  | `features/tika/TikaModule.svelte`                                                                 |
| 800   | 883   | 714    | 2        | 3       | 18  | `features/create/shared/components/CreateModule.svelte`                                           |
| 779   | 716   | 656    | 5        | 8       | 13  | `shared/coordinators/AnimationSheetCoordinator.svelte`                                            |
| 709   | 810   | 538    | 21       | 3       | 21  | Historical removed target: `features/loop-labeler/components/LOOPLabelerModule.svelte`            |
| 689   | 680   | 563    | 5        | 2       | 30  | `features/choreo-card/components/ChoreoCardTab.svelte`                                            |

(`Museum3DScene`, `RainbowScene`, `EffectOrchestrator3D` score high but are
declarative 3D scene graphs — candidate keepers, see classification.)

## The target pattern already exists

300 `*.svelte.ts` state-factory modules already exist (`state-management` skill:
factory + context). This is not new architecture. It is pushing the 22 logic
monsters onto the pattern the other ~300 components already follow. The primitive
library (`never-hand-roll`, chip consolidation) is the target for any template
extraction. No new patterns get invented.

## The split-must-earn-itself gate (the anti-cargo-cult guard)

This is the load-bearing rule. A split that scatters one cohesive flow across five
files, or introduces prop-drilling, is a **regression** even if it satisfies a line
budget. Mirroring `.claude/rules/never-hand-roll.md`'s justification gate: before extracting
anything, state ONE of:

1. **Cohesive responsibility** — this block is a self-contained job (a render
   pipeline, a parse step, a layout calculation) that can be named and lifted whole.
2. **Reused elsewhere** — another component already needs this; extraction dedups.
3. **Independently testable** — pulled into a pure module, it becomes unit-testable
   in a way it can't be while fused into a component.

If the only reason is "the file is long," **do not split.** Long-but-cohesive beats
short-but-scattered.

## Goals

1. No production `.svelte` above a target **disease-score** (final number in the
   open decisions; the lint gate ratchets down from a baseline that captures the 22).
2. Logic monsters: reactive state in `*.svelte.ts` factories, pure helpers in plain
   modules, leaving a thin component (script proportional to its actual UI).
3. Template monsters: markup split into focused sub-layout children reusing primitives.
4. Style monsters: KEPT unless they also carry a logic problem.
5. A ratcheting complexity-lint gate with an enumerated keeper allowlist (the
   `import-case-scan.cjs` / `worker-url-scan.cjs` lock-in model).
6. Zero behavior or visual change. Pure structural extraction.

## Non-Goals

- Splitting cohesive components to hit a line number (explicitly forbidden by the
  earn-itself gate).
- Touching the 35 style-dominant components solely for their size.
- Force-decomposing declarative 3D scene graphs / shader hosts.
- Decomposing `routes/test/*` scratch harnesses (exempt).
- Comment-noise retirement or naming work (separate specs).

## Phases

### Phase 0: Disease-score inventory + species classification (script)

`scripts/component-inventory.mjs` computes, per `.svelte`: total / script / template
/ style line splits, `$state`/`$derived`/`$effect`/function counts, the disease-score,
and a proposed species (logic / style / template) + classification
(extract / split / keeper-with-reason). Output: `scripts/component-manifest.json`

- a human-readable dry-run, and the **keeper allowlist seed** (3D scenes, shader
  hosts, cohesive style-dominant components — each with a one-line reason). Drives
  every later phase, exactly as `ceremony-manifest.json` drove v1.

### Phase 1: Pure-helper extraction (lowest risk, do first)

For each logic monster, lift functions with **no reactivity** (`renderAllCells`,
formatters, layout math, parsers) into plain colocated modules. No `$state`/`$effect`
moves. Immediate script shrink, near-zero risk, builds the pattern. Smallest-score
monster first.

### Phase 2: Reactive-state extraction → `*.svelte.ts` factories

Move `$state`/`$derived`/`$effect` and their helpers into a colocated factory per the
`state-management` skill (the 300 existing factories are the reference). Highest care
on `$effect` (cleanup + ordering). Per-component visual spot-check: must render
identically. Revert any extraction that changes output; reclassify and note it.

### Phase 3: Template decomposition (the 5 template monsters + over-big templates)

Break layout-shell markup into focused children, reusing existing primitives
(`primitive-discovery` first — grep before creating). Apply the earn-itself gate per
child.

### Phase 4: Ratcheting complexity-lint gate

Custom lint check failing CI when a production `.svelte` exceeds the current
disease-score ceiling, minus the enumerated keeper allowlist. Land at a baseline that
captures the 22, ratchet down as phases complete, never regress.

### Phase 5: Validation

Per-batch: `npm run check` error count == baseline, scoped tests green, visual
spot-check. Final: full check + suite + gate passing at target.

## Execution strategy

Isolated clone + rebase-often + smallest-first + explicit-pathspec commits, identical
to the v1 ceremony model. Each component is independent. The logic monsters cluster
in `sequence-viewer`, `create`, and `choreo-card` — the same hottest, most actively
developed subtrees v1's progress note flagged for collision. Sequence accordingly.

## Expected outcomes

| Metric                                               | Before                       | After (target)                    |
| ---------------------------------------------------- | ---------------------------- | --------------------------------- |
| Logic monsters (script-dominant, high disease-score) | 22                           | 0 outside keeper allowlist        |
| Largest single function in a component               | 317 lines (`renderAllCells`) | bounded; pure modules unit-tested |
| Reactive state living inline in 1k-line scripts      | widespread                   | extracted to `*.svelte.ts`        |
| Agent context cost to edit a logic monster           | whole 1,400+ line file       | one focused module                |
| Style-dominant components churned for size           | (v1 would have forced 35)    | 0 (correctly left alone)          |
| Complexity-lint gate                                 | none                         | ratcheting, with keeper allowlist |

## Risks

1. **Cargo-cult splitting** producing prop-drilling / scattered flows. Mitigated by
   the earn-itself gate. This is the primary risk and the reason the gate exists.
2. **Behavior/visual drift** during extraction. Mitigated by zero-logic-change
   discipline + per-component visual spot-check + revert-on-test-flip.
3. **`$effect` relocation subtleties** (cleanup, ordering, run timing). Highest-care
   item; the 300 existing factories are the reference; Phase 1 (no-reactivity
   helpers) deliberately precedes Phase 2 to de-risk.
4. **Misclassifying a declarative scene graph as a logic monster.** Mitigated by the
   keeper allowlist with stated reasons in Phase 0.

## Open decisions (ratify when back at a computer)

1. **The ceiling number.** Recommendation: gate on **disease-score, not total
   lines**, at a baseline that flags exactly the current 22 (so day-one CI is green
   on the allowlist), then ratchet. Open: the exact ratchet stops.
2. **Routes coverage.** Recommendation: `lib/` components first; `routes/` pages
   judged by the same disease-score (`routes/sequence/[id]` scores 611 and is a real
   target); `routes/test/*` exempt. Open: whether `routes/` is in-scope for v2.0 or a
   follow-up.
3. **Keeper criteria breadth.** Recommendation: keep = style-dominant + lean script,
   OR declarative 3D scene graph / shader host. Open: whether large pure-config
   components (data tables, `tab-definitions`-style) also get a blanket exemption.
