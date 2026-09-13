# App-side LOOP generation vs canonical sequence-engine transforms — parity audit

**Type:** read-only audit. No production code was modified.
**Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main` at session start)
**Branch:** `claude/sequence-engine-parity-audit-wxc07g`
**Code/test SHA:** `fce8d96c` — the last commit that adds executable evidence.
This report is committed on top of it and adds documentation only.
**Owned paths:** `tests/unit/opus-sequence-parity/**`, this report.

Driving question: Phase 3 of
`docs/superpowers/specs/active/2026-04-20-sequence-engine-unification-design.md`
wants the app-side LOOP executors deleted and `SequenceExtender` rewired to the
engine. Is that swap behaviour-preserving, and where is it not?

---

## 1. Summary

| | |
| --- | --- |
| LOOP types measured | 16 (every type the app's `LOOPExecutorSelector` supports) |
| Periods | halved (2) and quartered (4) |
| Seeds per (type, period) | 288 — 2 grid modes × 3 seed lengths × 4 turn profiles × 3 start-orientation profiles × 4 canonical chains |
| Total executor invocations | ≈ 39,000 across the committed suites (17.9k in the parity matrix, 21.6k in the pipeline-configuration sweep) |
| Equal on the compared projection at period 2 | **14 of 16 types** |
| Equal on the compared projection at period 4 | **1 of 15 types** (pure `rotated`; quartered rewound has no valid seed) |

"Equal on the compared projection" is not "byte-identical objects": the
comparison is a named field projection, defined in §3, that deliberately omits
`id`, the pre-derivation `letter` and the reversal flags, and does not look at
the remaining `Step`/`Motion` fields at all. Read every equality claim below
with that scope.

Four findings, in descending order of how much they should change the plan:

- **D1 (app defect).** `mirrored_swapped_inverted` and
  `mirrored_rotated_inverted_swapped` produce steps whose stored `endPosition`
  contradicts their own hands' end locations, so the LOOP never returns to its
  start position. This is wrong under *any* LOOP algebra — it is not a
  disagreement with the engine. The engine gets these right.
- **D2 (engine defect, legacy conversion only).** At period 4,
  `loopSpecFromLegacy` absorbs `ROTATED` into the fused stage for
  `rotated_inverted` and `rotated_swapped`; `FusedExecutor.createCopiedStep`
  then reuses the seed's end locations and the rotation orbit stalls. The
  result is an open (non-closing) LOOP on **every** seed measured.
- **D3 (algebra, not a bug on either side).** The app's quarter guard
  (`buildStrictQuarters`) and the engine's post-execution
  `closeOrientationCycle` + `reduceToMinimalLoop` are two different mechanisms
  for the same product rule ("don't emit a literal repeat"). Parity at period 4
  is therefore a property of the whole *pipeline*, never of the executor alone.
- **D4 (guard divergence).** The app refuses a quartered `rewound` request; the
  engine's `RewoundExecutor` ignores its period argument and silently returns
  the halved result.

Everything below is measured unless explicitly marked *inferred* or *not
verified*.

---

## 2. Current architecture (measured, and where it has drifted from the spec)

The spec and its plan are 2026-04-20 documents with an 2026-08-02 drift banner.
Several of their load-bearing statements no longer describe the tree.

| Spec/plan statement | Current reality |
| --- | --- |
| "app-side `…/circular/services/implementations/Strict*LOOPExecutor.ts`" | Files live one directory up, kebab-cased: `src/lib/features/create/generate/circular/services/*-loop-executor.ts` |
| "5 app-side LOOP executors" (Phase 3 heading) | **19** executor files; 16 are wired through `loop-executor-selector.ts` |
| "`MotionData` is defined twice", "two parallel sequence-step type systems" | Already unified. `StepData extends Step` from `@tka/tka-types`, with a compile-time `Assert` proving it (`src/lib/shared/foundation/domain/models/step-data.ts`). Engine `SequenceStep`/`MotionData` are deprecated aliases for `Step`/`Motion`. |
| "app-side `Strict*` executors are a straight copy of the engine's" | No longer true. The engine replaced per-type executor classes with a compositional `LOOPSpec` + `FusedExecutor` pipeline (`loop-spec.ts`, `spec-executor.ts`). The two sides now use *different algorithms*, not drifted copies. |
| "MCP vendored copies in `mcp-server/`, `mcp-server-pkg/`, `deployment/functions/broadcast/`" | No vendored `loop-executor` remains anywhere, and `deployment/` no longer exists in the tree, so Phases 4 and 5 are effectively done **for LOOP execution**. But `mcp-server-pkg/vendor/sequence-engine/` is still tracked (6 files) and still imported — `OrientationPropagator`, `TransitionGraph`, `SequenceEngineTypes`, `ISequenceDataProvider`. Phase 4.B's "delete the entire vendor dir" is therefore not done. |
| position maps duplicated app-side | Already collapsed: `src/lib/features/create/generate/circular/domain/constants/strict-loop-position-maps.ts` is a 28-line pure re-export of the engine's. |

What is *not* unified, and is the real Phase 3 surface:

```
APP path      SequenceExtender.generateExtensionSteps
              → loopExecutorSelector.getExecutor(appLoopType)        (16 bespoke classes)
              → executor.executeLOOP(steps, period)
              → per-executor _validateSequence gate + buildStrictQuarters guard
              → (letters re-derived by SequenceExtender afterwards)

ENGINE path   loopExecutorSelector.getExecutor(engineLoopType)       (deprecated shim)
              → loopSpecFromLegacy(type, period)   ← uniform period for every component
              → executeLOOPSpec → StrictRotatedExecutor / FusedExecutor / RewoundExecutor
              → no seed validation, no quarter guard
```

The orientation algebra is still triplicated:

- `src/lib/shared/render/core/calculations/orientation.ts` (app)
- `packages/sequence-engine/src/core/orientation/OrientationCalculator.ts` (engine)
- `packages/render-core/src/calculations/orientation.ts` — reached by
  `mcp-server-pkg` through the still-live
  `vendor/sequence-engine/services/implementations/OrientationPropagator.ts`

`orientation-calculator-parity.test.ts` runs all three over 17,280 input
combinations plus every grid-location pair at the boundary turn counts and finds
**zero** disagreement, so this duplication is currently inert. That result also
matters methodologically: it means every LOOP difference reported below is
attributable to executor logic, not to orientation drift.

That is a statement about *output over sampled inputs*, and only that. It does
not mean the three files are interchangeable or that collapsing them is free:
the app's copy exports three functions the other two do not, the engine
deliberately inlined its copy to *drop* a dependency on `@tka/render-core`, and
`mcp-server-pkg`'s vendor directory has three further live imports beyond the
orientation path. §6 step 2 works through what a collapse would actually
involve.

Git history is uninformative here: every executor file on both sides last
changed in the same squashed merge (`a12df677`), so per-file drift cannot be
dated from the repository.

---

## 3. Method

- **Fixtures.** Seeds are real rows from `static/data/pictographs/{Diamond,Box}PictographDataframe.csv`
  — the same canonical dataframes the engine's own integration tests and the
  app's variation provider read. Nothing is synthesised. Chains are formed only
  where one row's `endPosition` equals the next row's `startPosition`.
  `blue → left`, `red → right`, matching `@tka/tka-types`' `HandSide` contract
  and `packages/sequence-engine/tests/integration/loop-grid-mode-start.test.ts`.
- **Determinism.** Chain enumeration is CSV-ordered and breadth-first across
  root rows with a fixed per-cell budget. No RNG, no clock, no set-iteration
  dependence.
- **Identical inputs.** Both paths receive deep clones of the same `StepData[]`
  (both mutate their input in place via `shift`/`push`/`unshift`).
- **Seed admission.** Only seeds the app executor accepts are counted. The app
  validates its start/end position pair; the engine's fused path validates
  nothing. Comparing on seeds the app rejects would measure the absence of a
  gate, not a transform difference — that is reported separately (§5.5).
- **Non-circular expectations.** Divergences are never scored by "the engine is
  right". Each side is independently checked against
  `checkStepCoherence` (a step's `endPosition` must equal the grid position of
  its own two hands' end locations; positions and hand locations must chain)
  and `positionCloses`. Those are implementation-independent, so they identify
  *which* side is wrong.

**Exact comparison scope.** Every "equal" / "diverges" verdict in this report is
computed over this projection and nothing else
(`tests/unit/opus-sequence-parity/harness/parity-diff.ts`):

- **Compared, and a difference counts as divergence:** output length, and per
  step `startPosition`, `endPosition`, `stepNumber`, plus for each of
  `motions.left` and `motions.right` — `motionType`, `startLocation`,
  `endLocation`, `rotationDirection`, `turns`, `startOrientation`,
  `endOrientation`, `prefloatMotionType`, `prefloatRotationDirection`.
  (`undefined` and `null` are normalised to one absence.)
- **Compared, but reported separately and never counted as divergence:** `id`,
  the pre-derivation `letter`, `leftReversal`, `rightReversal`. Both production
  pipelines overwrite or re-derive these immediately after execution
  (`SequenceBuilder.applyLoop` re-derives letters from motions;
  `SequenceExtender.extendSequence` does the same; reversals are derived on read
  by `deriveReversals`). Concretely: the app executors renumber `id` to
  `step-N` and the engine's do not.
- **Not compared at all:** every other field on `Step`/`StepData` (`duration`,
  `gridMode`, `isBlank`, `variation`, `isBridge`, `betaSwapped`, `category`) and
  every app view field on `MotionData` (`isVisible`, `propType`,
  `arrowLocation`, `hand`, placement data, `handPath`, `skewSteps`, `skewDir`,
  `pathShape`, `segment`, `plane`). Both sides spread `...sourceStep` /
  `...sourceMotion`, so these are expected to carry through unchanged — but this
  audit did **not** assert that, so an equality claim here says nothing about
  them.

So "14 of 16 types agree" means: over the corpus, on the first bullet's fields,
zero differences. It does not mean the two outputs are interchangeable objects.

**What this method cannot establish.** Everything here is *semantic equality of
function output over a sampled input space*. That is a different thing from
"safe to swap", and nothing in this report should be read as the latter. In
particular this audit says nothing about:

- **Module-boundary and packaging effects** — import graphs, export surfaces,
  `package.json` `exports` conditions, tree-shaking, bundle size, SSR/browser
  condition resolution, or whether a workspace package still builds under its
  own `tsconfig` after a change.
- **Dependency direction** — which package ends up depending on which, and
  whether that reintroduces a dependency someone deliberately removed.
- **Type-level compatibility** — the two sides are structurally assignable
  today (`StepData extends Step`), but narrower app unions (e.g. `MotionType`
  without `"shift"`) and required app view fields are not exercised by a
  runtime differential.
- **Runtime and lifecycle** — module singleton construction order, the
  `browser`-only guards in `get-loop-executors.ts`, or anything that only
  appears once a real surface mounts.
- **Unsampled inputs** — see the coverage bounds in §4.1.

A "the outputs match" result is therefore a *necessary* condition for a safe
migration, never a sufficient one.

---

## 4. Results

### 4.1 Period 2 (halved)

Equal on the compared projection (§3) on every one of 288 seeds, for 14 of 16
types:

`rotated`, `mirrored`, `flipped`, `swapped`, `inverted`, `swapped_inverted`,
`rotated_inverted`, `mirrored_swapped`, `mirrored_inverted`, `rotated_swapped`,
`mirrored_rotated`, `mirrored_inverted_rotated`, `rotated_swapped_inverted`,
`strict_rewound`.

Coverage bound for that claim: diamond and box grids; seed lengths 1–3; per-hand
turns 0/0, 1/1, 0/1 and 0.5/0.5; start orientations in/in, out/in and
clock/counter. Not covered: float (`"fl"`) turns, centric/interradial start
orientations, seeds longer than 3 steps, skewed/trigrid dataframes,
asymmetric (per-prop) `LOOPSpec`s — the engine throws
`"Asymmetric LOOPSpec execution not yet implemented"` for those and the app has
no equivalent concept at all.

The two exceptions are D1 (§5.1).

### 4.2 Period 4 (quartered)

Only pure `rotated` is equal on the compared projection. The rest split into:

- **Length-only divergence** (engine returns exactly twice the app's length on
  the seeds whose turn total already closes orientation): `mirrored`,
  `flipped`, `swapped`, `inverted`, `swapped_inverted`, `mirrored_swapped`,
  `mirrored_inverted`, `mirrored_rotated`, `mirrored_inverted_rotated`,
  `mirrored_swapped_inverted`, `rotated_swapped_inverted`. This is D3.
- **Semantic divergence**: `rotated_inverted`, `rotated_swapped` (D2) plus
  `mirrored_swapped_inverted` and `mirrored_rotated_inverted_swapped` carrying
  D1 forward.
- **No valid seed**: `strict_rewound` (D4).

---

## 5. The divergences

### 5.1 D1 — app mirror+swap composites relabel a position the hands never reached

**Smallest repro** (`minimal-divergence-repros.test.ts`), a two-entry seed:

```
seed   [0] -   alpha3→alpha3  L:w→w  R:e→e     (start position)
       [1] α   alpha3→alpha3  L:w→w  R:e→e     (canonical α, static, 0 turns)

LOOP   mirrored_swapped_inverted, halved

APP    [2] α   alpha3→alpha7  L:w→w  R:e→e     ← hands never moved
ENGINE [2] α   alpha3→alpha3  L:w→w  R:e→e
```

Both hands are static with zero turns, so the derived pass cannot move
anything; the app nonetheless labels the result `alpha7`. Hands at `w`/`e`
**are** `alpha3` — `getGridPositionFromLocations("w","e") === "alpha3"` — so the
app's step contradicts itself, and the LOOP never returns home.

**Root cause.** `mirrored-swapped-inverted-loop-executor.ts:245`
(`_getMirroredPosition`) applies only `VERTICAL_MIRROR_POSITION_MAP` to the end
position, while `_createMirroredSwappedInvertedMotion` does swap the hands. The
composite the motions perform is `swap ∘ mirror`; the stored position is one
transform short. It is invisible exactly where the two agree
(`swap(mirror(alpha1)) === mirror(alpha1)`), which is why alpha1/alpha5 and
beta1/beta5 seeds look fine and alpha3/alpha7, beta3/beta7 and **every** gamma
position do not.

`mirrored_rotated_inverted_swapped` shows the same defect class with the error
in the other direction (stored `alpha3` where the hands read `alpha7`).

**Blast radius.** App-side only. Reachable from
`SequenceExtender.generateExtensionSteps` → `ExtensionFlowCoordinator`
(`SequenceActionsPanel.svelte`, `CreateModule.svelte`) and from
`WordSequenceGenerator.extendSequence` (spell flow). The Generate tab does not
reach it — see §5.3. **Not verified:** whether any stored Firestore sequence
already carries these steps; that needs a production query, which this
read-only cloud session did not perform.

**Migration consequence.** Deleting these two executors in favour of the engine
is a *bug fix*, not a regression — but it changes output for existing users and
would need the same treatment as
`scripts/migrations/repair-jyc3ji-rotated-loop.ts` if bad data is already
stored.

### 5.2 D2 — engine quartered rotation composites stall their orbit

**Smallest repro**, a two-entry seed from the canonical row
`A,alpha3,alpha5,…,pro,cw,w,n,pro,cw,e,s`:

```
LOOP   rotated_inverted, quartered

APP    A alpha3→alpha5  L:w→n R:e→s
       B alpha5→alpha7  L:n→e R:s→w
       A alpha7→alpha1  L:e→s R:w→n
       B alpha1→alpha3  L:s→w R:n→e     ← closes at alpha3

ENGINE A alpha3→alpha5  L:w→n R:e→s
       B alpha5→alpha7  L:n→e R:s→w
       A alpha7→alpha5  L:e→n R:w→s     ← copy pass; e→n is not a cw quarter
       B alpha5→alpha7  L:n→e R:s→w     ← ends at alpha7, never closes
```

**Root cause.** `loopSpecFromLegacy(type, 4)` gives every component period 4.
`spec-executor.ts` then sees a fuseable component (`INVERTED`) at the same
period as `ROTATED` with no mirror/flip, so it **skips the separate
`StrictRotatedExecutor` stage** and lets `FusedExecutor` rotate implicitly.
`FusedExecutor.execute` alternates transform and copy passes, and
`createCopiedStep` takes its start locations from the previous step but reuses
the **source** step's `endLocation` and `endPosition`. That is sound only when
the preceding pass returned to the seed's start position — true for
mirror/flip/swap/invert, false once rotation is absorbed into the same group.

**Blast radius — measured, and narrower than it first looks.**

| Entry point | Conversion used | Outcome for quartered `rotated_inverted` |
| --- | --- | --- |
| App Generate (`generation-orchestrator` → `SequenceBuilder`) | always supplies a `loopSpecWire` from `resolveLoopConfig`, which keeps non-rotation components at period 2 | **not affected** |
| `mcp-server/` (local dev MCP) via engine `executeLOOP` | `loopSpecFromLegacy` | fails loudly: `success:false`, `"Cannot close orientation on an open position pattern (alpha3 -> alpha7)"` |
| `mcp-server-pkg/` source (packaged as `@austencloud/tka-domain-mcp`) via `loop-adapter.executeLOOP` → `loopExecutorSelector.getExecutor()` | `loopSpecFromLegacy` | **source inference, not executed:** the adapter has no `closeOrientationCycle` stage and sets `isCircular: true` unconditionally, so on this source it would return the open sequence without an error |
| App extend flow | app executors | **not affected** (app is correct here) |

`downstream-reach.test.ts` locks the first two rows and the fourth.

**The `mcp-server-pkg` row is source inference only.** It comes from reading
`mcp-server-pkg/src/core/loop/loop-adapter.ts` at this SHA (lines 102–155: the
same `getExecutor` call, no closure stage, `isCircular: true` returned
unconditionally). This session did **not** execute that package, did not build
it, and did not check any published npm version. So the honest statement is:
*if* a deployed build corresponds to this source and *if* a caller requests
quartered `rotated_inverted`, the source has no stage that would catch the open
LOOP. Whether any published version matches this source, and whether any real
caller makes that request, is **unverified**. Confirming it needs either a
build-and-invoke of `mcp-server-pkg` or a check of the published artifact —
neither of which was in scope for a read-only audit.

### 5.3 D3 — two mechanisms for "don't emit a literal repeat"

`buildStrictQuarters` (app) appends the period-2 pass and extends to period 4
*only when orientation has not yet closed* — the YΦΔ×4 guard. The engine has no
such check in any executor; its equivalent is the pair
`closeOrientationCycle` (re-expands when orientation has not closed) +
`reduceToMinimalLoop` (folds a literal repeat back down), both of which run in
`SequenceBuilder.applyLoop` and in neither `SequenceExtender` nor
`mcp-server-pkg`'s adapter.

`engine-pipeline-configuration.test.ts` measures all four combinations at
period 4:

| Configuration | Reproduces the app exactly for |
| --- | --- |
| `legacy-raw` (what `getExecutor()` does today) | `rotated` |
| `rhythm-raw` (`loopSpecFromLegacyRhythm`, what `mcp-server` uses) | `rotated`, `swapped_inverted`, `mirrored_swapped`, `mirrored_inverted`, `mirrored_rotated`, `mirrored_inverted_rotated` |
| `legacy-full` (+ `closeOrientationCycle` + `reduceToMinimalLoop`) | `mirrored`, `flipped`, `swapped`, `mirrored_rotated`, `mirrored_inverted_rotated` |
| `rhythm-full` | a partial overlap of the two above |

No single configuration reproduces the app across all types, and two types —
`rotated_inverted` and `mirrored_rotated_inverted_swapped` — are reproduced by
**none** of the four on any seed.

One more unreconciled case worth naming: `rotated_swapped_inverted` at period 4.
The rhythm conversion gives `ROTATED` its own period-4 stage, so
`StrictRotatedExecutor` validates the seed's position pair — and this LOOP
type's app executor requires a `start === end` seed, which no quartered
rotation pair can satisfy. The engine therefore throws
`"Invalid position pair for quartered LOOP"` on 288/288 seeds the app accepts.

### 5.4 D4 — quartered rewound

App: `RewoundLOOPExecutor` throws `LoopViabilityError("Quartered rewound is not
a valid LOOP…")`. Engine: `RewoundExecutor.executeLOOP(sequence, _period)`
ignores the period entirely and returns the two-pass result. A naive rewire
turns a clear error into a silently different-length sequence. Locked in
`loop-executor-parity.test.ts`.

### 5.5 Seed-admission divergence (no defect, but a migration hazard)

The app executors each gate on their start/end position pair before running.
The engine's behaviour depends on which stage plan the spec produces: the fused
path performs **no** seed validation, while a separate `StrictRotatedExecutor`
stage does validate. So the two gates are **not** ordered — neither is uniformly
wider. Measured over all 650 canonical diamond one-step seeds, per LOOP type,
counting only seeds the app **rejected** and then asking what the engine does
with them:

| LOOP type / period | app rejected | engine accepted | of those, open (non-closing) |
| --- | --- | --- | --- |
| `inverted` halved | 560 | 560 | 512 |
| `mirrored` halved | 560 | 560 | 0 |
| `swapped` halved | 536 | 536 | 416 |
| `rotated` halved | 560 | **0** (engine rejected all 560) | — |
| `mirrored_rotated` halved | 572 | 12 (engine rejected 560) | 0 |
| `mirrored_rotated_inverted_swapped` halved | 560 | **0** (engine rejected all 560) | — |
| `strict_rewound` quartered | 576 | 576 | 0 (returns the halved 2-pass result — D4) |

**Counterexample, engine wider.** Canonical one-step seed `A` `alpha3→alpha5`
with `inverted`, halved. App: `"Invalid position pair for inverted LOOP:
alpha3 → alpha5…"`. Engine: accepts, returns 3 entries, ends at `alpha7` — an
open LOOP, no error.

**Counterexample, engine narrower.** The same seed with `rotated`, halved: the
app rejects it *and* so does the engine, because that spec gives `ROTATED` its
own `StrictRotatedExecutor` stage, which validates the pair. Same for
`mirrored_rotated_inverted_swapped` halved, where the engine rejected all 560
app-rejected seeds.

These numbers come from an ad-hoc probe at this SHA over
`buildChains("diamond", 1)`; they are **not** locked by a committed test (see
§9). The committed matrix separately shows 0 engine refusals among
*app-accepted* seeds — which is observed inclusion in one direction only, and
was previously over-read here as a strict ordering.

**Migration hazard.** Those per-executor gates are today the only place where an
invalid extend request is refused with a domain message
(`"For a mirrored LOOP from alpha3, the sequence must end at alpha7"`). After
the executors are deleted, `LOOPValidator` still gates the UI, but for the
LOOP types whose spec takes the fused path, `generateExtensionSteps` would have
no second line of defence — an invalid seed reaching it would yield an open
LOOP instead of an error.

### 5.6 Selector coverage gap

`LOOPType.MIRRORED_ROTATED_SWAPPED` exists in the app enum, is offered by
`loop-type-utils.IMPLEMENTED_COMBOS`, and resolves to a valid `LOOPSpecWire` —
but `loop-executor-selector.ts` has no `case` for it and throws
`"LOOP type … is not yet implemented"`. So the Generate tab can produce it
(engine spec path) while the extend flow cannot. The engine handles it. This is
one of the few places where migration *adds* capability.

### 5.7 Dead app-side executors

Three executor files under `src/lib/features/create/generate/circular/services/`
have **zero importers** anywhere in the repository (verified by grep on both the
file path and every exported identifier):

- `swapped-complementary-loop-executor.ts` (327 lines)
- `mirrored-rotated-complementary-loop-executor.ts` (72 lines)
- `mirrored-rotated-complementary-swapped-loop-executor.ts` (73 lines)

472 lines deletable at zero behavioural risk, independent of everything else in
this report. (The plan's Phase 3 deletion list names two of them as if they were
live.)

---

## 6. Suggested migration sequence

Ordered so that each step is independently revertible and none of them bundles
a bug fix with a refactor.

1. **Delete the three dead executors (§5.7).** No behaviour change; shrinks the
   Phase 3 surface by ~470 lines before any risky work starts.
2. **Consider collapsing the three orientation copies — separately, and not as
   a "free" change.** The three agree on every sampled input (§2), so the
   *behavioural* risk of collapsing them is low. That is the only thing this
   audit establishes, and it is not the whole risk:
   - **Dependency direction.** The engine's copy carries the comment *"Inlined
     from @tka/render-core to remove that dependency."* Pointing it back at
     `@tka/render-core` reverses a decision someone made on purpose; pointing
     `render-core` at the engine creates the opposite edge. Either way the
     package graph changes and that needs its own review.
   - **The app copy is not a subset.** `src/lib/shared/render/core/calculations/orientation.ts`
     additionally exports `deriveMotionType` (used by
     `navigation/services/sequence-encoder.ts`,
     `navigation/services/legacy-sequence-codec.ts`,
     `combination/services/variant-generator.ts`),
     `deriveHandOrbitalDirection` (`pictograph/shared/domain/utils/tnd-deriver.ts`)
     and `canonicalOrientation` (`pictograph/prop/services/prop-rot-angle-manager.ts`).
     Those need a home before the file can go.
   - **It does not empty the vendor directory.** Only
     `OrientationPropagator` reaches the orientation math.
     `mcp-server-pkg/vendor/sequence-engine/` also still supplies
     `TransitionGraph` (`src/core/letter-transition-graph.ts`),
     `SequenceEngineTypes` (three importers) and `ISequenceDataProvider`
     (`src/adapters/NodeDataProvider.ts`), and `mcp-server-pkg/tsconfig.json`
     lists `vendor/sequence-engine/**/*.ts` in `include`. Phase 4.B's "delete
     the vendor dir" needs all four addressed, plus a packaging check — none of
     which this audit covers.
3. **Fix D1 in place, app-side, before migrating anything.** Compose
   `SWAPPED_POSITION_MAP` after `VERTICAL_MIRROR_POSITION_MAP` in
   `mirrored-swapped-inverted-loop-executor.ts` and the matching path in
   `mirrored-rotated-inverted-swapped-loop-executor.ts`, or derive the end
   position from the transformed hand locations the way `FusedExecutor` does.
   Doing this first means the later executor swap is a pure refactor whose
   parity can be asserted at 16/16 rather than 14/16. Enable the quarantined
   suite to confirm: `LOOP_PARITY_QUARANTINE=1`.
4. **Fix D2 in the engine.** `FusedExecutor.createCopiedStep` must not be used
   when `ROTATED` is absorbed into the fused group — either give `ROTATED` its
   own stage whenever it is present at the group's period, or make the copy
   pass advance positions the way the transform pass does. It would also close
   the gap described in §5.2 for `mcp-server-pkg`'s adapter — but note that gap
   is a source inference: no deployed version was checked, and no user-visible
   consequence was observed by this audit.
5. **Decide the period-4 product rule (D3) explicitly.** "Quartered mirrored of
   a zero-turn seed" is 2 passes under the app's guard and 4 under a uniform
   period-4 expansion. Pick one, write it down, and make both paths implement
   it. Until that decision exists, *any* Phase 3 rewire silently changes
   quartered extend output.
6. **Only then rewire `SequenceExtender.generateExtensionSteps`** — and rewire
   it to the **whole pipeline**, not to `getExecutor()`:
   `executeSpec(loopSpecFromWire(resolveLoopConfig(...).loopSpecWire))` →
   `closeOrientationCycle` → `reduceToMinimalLoop` → existing letter
   re-derivation. `getExecutor()` is marked `@deprecated` in the engine and
   carries D2; do not build the migration on it.
7. **Keep a seed gate (§5.5).** Either port each executor's `_validateSequence`
   into a shared `validateSeedForSpec(spec, seed)` in the engine, or assert
   `positionCloses` on the result and surface the existing
   `LoopViabilityError`. Do not let the gate disappear with the executors.
8. **Add the quartered-rewound refusal to the engine (D4)** or keep it in the
   extend flow's caller. `validateLOOPSpec` already has a `rewound_exclusivity`
   rule; a `rewound_period` rule belongs beside it.
9. **Delete the app executors last**, with `loop-executor-parity.test.ts`
   converted from a divergence lock into an equality assertion in the same
   commit.

Steps 1, 3 and 4 are each shippable on their own. Step 2 is a separate piece of
work with its own packaging review, not a warm-up. Step 5 is the only one that
needs Austen.

None of these steps is authorised by this audit; it is read-only and produced no
runtime change. Each one needs its own verification beyond output equality — see
"What this method cannot establish" in §3.

---

## 7. Deliverables and how to run them

```bash
# the audit suite (runs in the default unit run; ~28 s)
npx vitest run --config tests/config/vitest.config.ts tests/unit/opus-sequence-parity

# the quarantined contract — FAILS TODAY, ON PURPOSE
LOOP_PARITY_QUARANTINE=1 npx vitest run \
  --config tests/config/vitest.config.ts \
  tests/unit/opus-sequence-parity/quarantine
```

| File | Purpose |
| --- | --- |
| `tests/unit/opus-sequence-parity/harness/canonical-fixtures.ts` | CSV loading, deterministic chain enumeration, seed materialisation |
| `…/harness/corpus.ts` | the coverage grid (grid mode × length × turns × orientations) |
| `…/harness/run-both-paths.ts` | both execution entry points + the app→engine LOOPType translation |
| `…/harness/parity-diff.ts` | semantic vs representation classification |
| `…/harness/invariants.ts` | implementation-independent coherence and closure checks |
| `…/orientation-calculator-parity.test.ts` | all three copies of the orientation algebra agree (17,280+ cases each) |
| `…/loop-executor-parity.test.ts` | the parity matrix lock (15 assertions) |
| `…/engine-pipeline-configuration.test.ts` | which engine configuration reproduces the app (7 assertions) |
| `…/minimal-divergence-repros.test.ts` | D1 and D2 with both sides' exact traces (6 assertions) |
| `…/downstream-reach.test.ts` | blast-radius bounds (5 assertions) |
| `…/quarantine/loop-closure-contract.quarantine.test.ts` | the plain contract; env-gated, fails today |

The passing suites **lock current behaviour including its defects** so the
default run stays green and any change is visible. Sets named `*_DIVERGENT`,
`*_INCOHERENT` and `*_OPEN` are defect inventories that should shrink; when
they do, those tests fail and name what changed. That is the intended signal.

---

## 8. Commands run and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | ok (26 s) |
| `pnpm run build:packages` | ok — required before any app test can resolve `@tka/tka-types` |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/loop/` | 7 files, 28 tests passed (pre-existing suite, unchanged) |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/opus-sequence-parity` | **5 files, 35 passed, 3 skipped** (the skipped 3 are the quarantine) |
| `LOOP_PARITY_QUARANTINE=1 … tests/unit/opus-sequence-parity/quarantine` | **3 failed, as designed** — see §9 |
| `pnpm run check:tsc` | 0 errors in the new files; 1 pre-existing failure unrelated to this branch (see §9) |

---

## 9. Limitations and unresolved items

- **`pnpm run check:tsc` fails on `main` in this container**, before any of my
  changes: `src/lib/features/community/get-geocoding-service.ts(4,10): error
  TS2305: Module '"$env/static/public"' has no exported member
  'PUBLIC_GOOGLE_MAPS_API_KEY'`. There is no `.env` in the cloud checkout and
  `.env.example` declares the key, so this is environment configuration, not a
  code defect. The file is untouched by this branch. It is the only error the
  gate reports under `src/` or `tests/`.
- **No browser, no emulators, no production data, no deployed artifacts.** Every
  claim here is from unit-level execution of the two code paths. Specifically
  **not verified**: whether any stored Firestore sequence already carries a
  D1-shaped step; what any published or deployed
  `@austencloud/tka-domain-mcp` build does (§5.2 is source inference, and no
  npm version was inspected); any visual or runtime behaviour of the Generate or
  extend surfaces.
- **Output equality is not migration safety.** §3's "What this method cannot
  establish" lists what a differential over function output leaves untested —
  module boundaries, packaging and `exports` resolution, bundle/tree-shaking
  effects, dependency direction, type-level narrowing, and singleton/lifecycle
  behaviour. Every migration step in §6 needs verification of those in its own
  right; none of them is de-risked by this report alone.
- **The §5.5 seed-gate table is from an ad-hoc probe, not a committed test.**
  It is reproducible at this SHA (all 650 canonical diamond one-step seeds via
  `buildChains("diamond", 1)`, each run through both paths), but no assertion
  guards it, so it can silently go stale. Folding it into the committed suite
  is deliberately deferred until the independent full-suite review lands.
- **Coverage bounds** are stated in §4.1 and apply to every "parity holds"
  claim: float (`"fl"`) turns, centric/interradial start orientations, seeds
  longer than three steps, skewed/trigrid dataframes and asymmetric per-prop
  `LOOPSpec`s are outside the corpus. A parity claim for those classes is
  **unestablished**, not established.
- **`mirrored_rotated` and `mirrored_inverted_rotated` have no box-grid seeds.**
  Their composite position requirement admits only diamond pairs, so their
  parity result rests on diamond coverage alone.
- **I did not attempt to decide which side is canonical for D3.** The app's
  answer is shorter and closes; the engine's is twice as long and also closes.
  That is a product decision about what "quartered" means for an order-2
  transform, and it is step 5 of §6 for a reason.
- **Scope discipline.** Another agent owns the Generate inverted-controls fix.
  This branch touches no runtime file; the only overlap is that §5.6 and §5.7
  describe app Generate files, as findings, not edits.
