# Fuse sequence composition — correctness audit and fixes

Opus cloud batch, 2026-09-12. Scope: `src/lib/features/fuse` plus narrowly
scoped Fuse tests. Excluded by assignment and respected here: shared
generation/LOOP transforms, the shared renderer, the playback carousel,
persistence, prop colors.

|           |                                                            |
| --------- | ---------------------------------------------------------- |
| Base SHA  | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`) |
| Branch    | `claude/fuse-sequence-composition-fix-smdu2c`              |
| Final SHA | `8b9daccaf3fbe21166bcc8f1b412c1097c2a49b6`                 |

## Owned files

| Path                                                                     | Change                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/lib/features/fuse/services/sequence-fuser.ts`                       | both fixes                                                                           |
| `src/lib/shared/foundation/services/step-deriver.ts`                     | `rehydrateMotion` made `export` (additive; no behaviour change for existing callers) |
| `src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts` | new regression test (defect 1)                                                       |
| `src/lib/features/fuse/services/__tests__/fused-grid-mode.test.ts`       | new regression test (defect 2)                                                       |

Nothing else was touched. `docs/reports/opus-batch-2026-09-12/fuse-correctness.md`
is this report.

## Contracts established for `fuseSequences`

Measured on the fixed build unless marked otherwise. "Measured" means an
assertion or a printed probe value from a run in this session; "inferred" means
read from code without a runtime observation.

| Contract                               | Status                                                                                                                                                                                    | Evidence            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Component step order                   | Holds. Sources are tiled cyclically in source order; a 2-step source against a 4-step source yields left `n,s,n,s` against right `n,e,s,w`.                                               | measured (probe)    |
| Hand assignment                        | Holds. Left source motions carry `hand: "left"`, right carry `hand: "right"`, including when the _same_ `SoloPropData` object is passed on both sides.                                    | measured (probe)    |
| Input immutability                     | Holds. Neither source's `steps` nor `handPath` is mutated. The result reuses the source `SoloPropStepData` objects by reference, which is safe because the interface is fully `readonly`. | measured (probe)    |
| Joins / seam                           | Holds when the LCM is reached. `isCircular` is measured with `isSeamlesslyLoopable`, not asserted.                                                                                        | measured (probe)    |
| One-step sources                       | Handled. A 1-step source tiles to the partner's length; 1×1 yields a 1-step fuse.                                                                                                         | measured (probe)    |
| Different-length sources               | Handled up to `maxSteps`; see limitation L1 for the truncation path.                                                                                                                      | measured (probe)    |
| Duration                               | **Does not hold** — see limitation L2.                                                                                                                                                    | measured (probe)    |
| Orientation                            | Carried through unchanged from each source step.                                                                                                                                          | measured            |
| Authored motion fields                 | Was broken; fixed — defect 1.                                                                                                                                                             | measured, red→green |
| Combined grid frame                    | Was order-dependent; fixed — defect 2.                                                                                                                                                    | measured, red→green |
| Solo-prop identity of the tiled result | **Does not hold** — see limitation L3.                                                                                                                                                    | measured (probe)    |
| Start position                         | Never populated — see limitation L4.                                                                                                                                                      | measured (probe)    |

## Defect 1 — authored motion fields dropped, producing a silently wrong word

### What was wrong

`fuseSequences` built its combined motions with a private
`buildMotionFromSoloPropStep` that carried only eight fields. Every sibling
builder in the codebase carries more:

- `step-deriver.rehydrateMotion` (the two-hand assembly path)
- `solo-prop-sequence-adapter.buildMotion` (the Fuse _source card_ path)
- `sequence-decomposer.motionToSoloPropStep` (the inverse direction)

all preserve `prefloatMotionType`, `handPath`, `skewSteps`, `skewDir` and
`plane`, and seed `arrowLocation` from `startLocation`. The fuser dropped all of
them.

`prefloatMotionType` is load-bearing. A float's `rotationDirection` is
`noRotation`, so the prefloat type is the only surviving record of the pro-vs-anti
motion the float collapsed from. With it absent,
`motion-query-handler.findLetterByMotionConfiguration` falls back to
"search as `pro`, ignore rotation, try both families" and returns the **first**
matching dataframe row — the exact "confident same-family WRONG letters" hazard
that handler's own comment documents.

That word is not cosmetic: `buildFusedSequence` joins the per-step letters into
`sequence.word`, and `fusedDisplayName(word)` becomes the saved sequence's name,
its export filename and its gallery word.

### Reachability

Float steps reach Fuse through both source paths that exist today, and both
correctly emit `prefloatMotionType` onto their `SoloPropStepData`:

- `fuse-built-path.toSoloStep` — the in-Fuse "build a path" dialog, whose turn
  picker offers `"fl"` (`fuseBuilderTurnCounts`).
- `solo-loop-generator.toSoloStep` — the generated solo LOOP, via
  `allocateSoloTurns` which can allocate `"fl"`.

`skewSteps`/`skewDir` likewise arrive from the built-path source
(`stepToMotion`), and the fuser already had deliberate handling for skewed
pairings, so it was dropping data it knew about.

### Proof

`src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts` builds
an anti-derived float LOOP on the left (`w→n→e→s→w`, all `float`,
`prefloatMotionType: anti`) against a `pro`/`cw` ring on the right, and derives
letters against the **real** `DiamondPictographDataframe.csv` — no stubs. The
pair is deliberately chosen from two real rows that differ only by the left
motion's family:

```
blue anti ccw w→n + red pro cw e→s  →  C
blue pro  cw  w→n + red pro cw e→s  →  A
```

Before the fix:

```
× keeps the authored float/skew/handPath fields on both fused hands
  AssertionError: expected undefined to be 'anti'
× derives the same word as the canonical two-hand assembly
  AssertionError: expected 'AAAA' to be 'CCCC'
```

The reference value `CCCC` is not hand-written: the test assembles the identical
solo pair through the canonical `step-deriver.deriveSteps` owner and derives its
word the same way, so the assertion is Fuse-vs-canonical, not Fuse-vs-opinion.

After the fix both pass.

### Fix

Reuse the canonical owner. `step-deriver.rehydrateMotion` is now exported and
the fuser calls it per hand. Fuse cannot call `deriveSteps` wholesale because it
deliberately gives each hand its _own_ native grid frame (a 45° adjustment can
leave one source on Box while its partner stays on Diamond), whereas
`deriveSteps` resolves a single frame per step; `rehydrateMotion` takes the grid
mode as a parameter, so the per-hand frame is preserved while every other field
now matches the two-hand path exactly.

Two deliberate consequences of routing through the canonical builder:

- `arrowLocation` now seeds from `startLocation` instead of defaulting to
  `NORTH`. This makes the fused preview consistent with the Fuse _source cards_,
  which already reach the renderer through `soloPropToSequence` → the same seed.
- `propType` is passed explicitly as `PropType.STAFF`, which is what
  `createMotionData` defaulted to before and what `deriveSteps` defaults to.
  Prop type is a viewer preference overridden at render time.

## Defect 2 — the fused grid frame depended on argument order

### What was wrong

```ts
// before
const mixesDiamondAndBox =
  (left === DIAMOND && right === BOX) || (left === BOX && right === DIAMOND);
return mixesDiamondAndBox ? SKEWED : leftGridMode;
```

The table knew exactly one mixed pair and otherwise fell through to the **left**
source's frame. So:

| left frame | right frame | resolved    | canonical |
| ---------- | ----------- | ----------- | --------- |
| skewed     | diamond     | skewed      | skewed    |
| diamond    | skewed      | **diamond** | skewed    |
| box        | skewed      | **box**     | skewed    |
| diamond    | centric     | **diamond** | centric   |

The combined sequence's frame cannot depend on which source the caller labels
"left" — that is a hand assignment, not a frame. `SoloPropData.impliedGridMode`
really can be `SKEWED` or `CENTRIC`: `hand-path-factory.deriveGridMode` returns
`CENTRIC` for any path touching `CENTER` and `SKEWED` for any path mixing
cardinals with intercardinals.

`sequence.gridMode` is the value `FuseAnimationPreview` feeds the renderer
(`sequenceData?.gridMode ?? sequence.gridMode`) and the value persisted on a
saved fuse, so a skewed pairing was being drawn and stored on a diamond grid
whenever the skewed source happened to land on the right.

Letter derivation is _not_ affected: `letter-deriver.deriveLetterForBeat` calls
`grid-mode-deriver.deriveGridMode` on the beat's two motions and ignores
`sequence.gridMode`. (inferred from code, not separately measured)

### Proof

`src/lib/features/fuse/services/__tests__/fused-grid-mode.test.ts` builds four
8-step rings whose `impliedGridMode` the test first pins against the canonical
path factory (diamond / box / skewed / centric), then asserts that fusing any
pair gives the same answer in both argument orders.

Before the fix, with the rest of the branch in place:

```
✓ reads the sources as the frames the canonical path factory assigns
× does not depend on which source is passed as the left hand
    expected 'diamond' to be 'skewed'
× calls a skewed source's pairing skewed from either side
    expected 'diamond' to be 'skewed'
× keeps matching frames and a center-touching frame intact
    expected 'diamond' to be 'centric'
✓ agrees with the canonical motion deriver on a diamond/box pairing
```

After the fix all five pass.

### Fix

A symmetric table matching the three canonical classifiers
(`grid-mode-deriver.deriveGridMode`, `step-deriver.deriveStepGridMode`,
`hand-path-factory.deriveGridMode`): equal frames pass through, a
center-touching frame wins, any other disagreement is skewed. The pre-existing
diamond+box → skewed result is unchanged, so this completes the table rather
than reinterpreting it.

## Commands and results

All run in this cloud checkout. `pnpm install --frozen-lockfile` and
`npm run build:packages` were required first — the container had no
`node_modules` and `@tka/tka-types` must be built before Vitest can resolve it.

| Command                                                                                                                                                                                                                                                                                                                                                                                         | Result                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts` (pre-fix)                                                                                                                                                                                                                                                        | 2 failed — `undefined` vs `'anti'`; `'AAAA'` vs `'CCCC'`                                                                                                                                                                |
| same, post-fix                                                                                                                                                                                                                                                                                                                                                                                  | 2 passed                                                                                                                                                                                                                |
| `…/fused-grid-mode.test.ts` (grid resolver reverted to its pre-fix form)                                                                                                                                                                                                                                                                                                                        | 3 failed, 2 passed                                                                                                                                                                                                      |
| same, post-fix                                                                                                                                                                                                                                                                                                                                                                                  | 5 passed                                                                                                                                                                                                                |
| `npx vitest run … src/lib/features/fuse/services/__tests__/`                                                                                                                                                                                                                                                                                                                                    | 4 files, 16 tests passed                                                                                                                                                                                                |
| `npx vitest run …` over `tests/unit/SequenceFuser.test.ts`, `tests/unit/StepDeriver.test.ts`, `tests/unit/fuse/`, `tests/unit/SequenceDecomposer.test.ts`, `tests/unit/reversal-derivation-parity.test.ts`, `tests/unit/hand-arc-reversal-impact.test.ts`, `tests/unit/content-hash-v2-fork-proof.test.ts`, `src/lib/shared/library/services/__tests__/sequence-persistence-normalizer.test.ts` | 17 files, 188 tests passed                                                                                                                                                                                              |
| `npm run test:ci` (whole default Vitest project)                                                                                                                                                                                                                                                                                                                                                | 1974 files passed, 5 skipped; 15982 tests passed, 106 skipped, 1 todo, **0 failed**; exit 0; 724 s                                                                                                                      |
| `npm run check:fast` on the branch                                                                                                                                                                                                                                                                                                                                                              | 582 errors, 44 warnings                                                                                                                                                                                                 |
| `npm run check:fast` on the stashed (unchanged) tree                                                                                                                                                                                                                                                                                                                                            | 582 errors, 44 warnings — identical baseline                                                                                                                                                                            |
| `npm run check:fast` filtered to the changed files                                                                                                                                                                                                                                                                                                                                              | no errors in `sequence-fuser.ts`, `step-deriver.ts`, or either new test                                                                                                                                                 |
| `npx eslint` on the four changed source files                                                                                                                                                                                                                                                                                                                                                   | clean                                                                                                                                                                                                                   |
| `npx prettier --check` on the changed files                                                                                                                                                                                                                                                                                                                                                     | the two new tests and `step-deriver.ts` pass; `sequence-fuser.ts` fails, but it fails identically on the unmodified tree (it is a tab-indented file), so it was left alone rather than reformatted as unrelated cleanup |

The 582 errors are pre-existing repository-wide noise, unchanged by this branch.

## Regressions

None observed. The whole default Vitest project — 15982 tests across 1974 files —
passes on the branch with zero failures. The pre-existing `fused-word-derivation.test.ts` still derives
`IIECCKIIECCK` from the production 12-step input, which confirms that routing
non-float, non-skewed fuses through `rehydrateMotion` changes nothing for them.
The reversal-derivation parity diagnostic over the 568-sequence public corpus
reports the same 24 divergences it reported before the change.

## Limitations and observations (found, deliberately not fixed)

Reported rather than fixed to stay inside the "up to two defects" scope and to
avoid touching behaviour I cannot verify in a browser from this container.

**L1 — `maxSteps` truncation can produce a non-closing composite.** When
`lcm(leftLen, rightLen) > maxSteps`, `fuseSequences` falls back to
`min(leftLen, rightLen)`. Measured: a 3-step ring against a 4-step ring at
`maxSteps: 8` yields 3 steps in which the left hand closes and the right hand
does not, and `isCircular` comes back `false`. In practice `createPreview`
throws on the resulting step count before a user sees it, so this is latent.

**L2 — the right hand's `duration` is discarded.** `duration: leftStep.duration
?? 1` ignores `rightStep.duration`. Measured: fusing a duration-1 source with a
duration-2 source yields every step at duration 1. Latent today because every
Fuse source path emits `duration: 1` (`solo-loop-generator.toSoloStep`,
`fuse-built-path.toSoloStep`, `buildMinimalSteps`), but a library solo decomposed
by `extractSoloProp` carries whatever its `StepData` had. Deciding what a
mismatched pair _should_ do is a product question, not a bug fix.

**L3 — the tiled `SoloPropData` keeps the source's identity and path.** For
`SoloPropData` inputs the fuser spreads the source and overrides only `steps`
and `length`, so `handPath`, `contentHash`, `bigrams` and `impliedGridMode` still
describe the untiled source. Measured on a 2-step source tiled to 4:
`handPath.locations.length` 3 against `steps.length` 4, `bigrams.length` 2
against 4, and both `contentHash` and `handPath.contentHash` equal to the
source's. The canonical `solo-prop-factory.createSoloProp` derives all four from
the steps, so this is a hand-rolled construction that violates the invariant the
factory guarantees. Two consequences follow but neither is reachable from
today's UI, which is why this was not the second fix:

- `soloPropToSequence` stamps `leftPathHash`/`leftSoloHash` from those stale
  hashes, and `lengthMatchedInjectedSide` persists them, so a tiled solo and its
  shorter source hash identically.
- `fuseSequences` derives `leftLength` from `handPath.locations.length - 1`, so
  a re-fuse of a previously fused solo sizes itself from the stale path. The
  comment at `fuse-state.svelte.ts:771-776` promises the opposite ("re-derives
  from the full-length path, not the shorter source").

Both are unreachable today because every source path is length-matched:
`FuseSoloLoopPicker` filters `solo.length === length`, `buildFusePathSource`
rejects anything but `expectedLength`, `generateSource` generates at `length`,
and VTG sources go through `fitSoloPathToLoop(solo, length)`. So the LCM tiling
branch is, in practice, dead: `lcm(length, length) === length`. A future source
that is not length-matched would immediately expose this.

**L4 — the fused sequence has no `startPosition`.** Measured: both
`startPosition` and `startingPosition` are absent, and `StepData.gridMode` is
absent on every fused step, where `deriveSteps`/`deriveStartPosition` populate
both. Every consumer checked has a fallback — `FuseLivePathGrid` synthesizes one
from `steps[0]`, `resolveFusePictographMotionFrame` falls back to the last step,
`isSeamlesslyLoopable` falls back to per-hand motion locations — and for a
circular fuse the fallback is equivalent, so no visible defect was demonstrated.
`FuseAnimationPreview` does return `null` for `stepData` while
`animCurrentStep < 1`; I could not observe what that renders from this container
(see below).

**L5 — `FuseOptions.alignmentOffset` is a no-op.** Measured: the offset is
applied only to `rightHandPath.locations`, which are used solely by
`buildMinimalSteps` for bare `HandPathData` inputs. For `SoloPropData` inputs —
which is every real caller — the right steps are tiled from index 0 and the
option changes nothing. No caller passes it today.

**L6 — repeated source, one id.** Fusing the same `SoloPropData` object into both
hands produces correct per-hand motions but two solo props sharing one `id`
(measured). `soloPropToSequence` uses `soloProp.id` as the sequence id, so this
is an identity smell rather than a demonstrated failure.

## Not verified

- **No browser verification.** This is a cloud container with no dev server and
  no Chrome DevTools MCP. Defect 2 changes a value the renderer consumes
  (`sequence.gridMode` on skewed and centric pairings) and defect 1 changes
  `arrowLocation` seeding on fused motions. Both changes move Fuse _toward_ what
  the canonical path already produces for the source cards, but neither has been
  observed rendered. A skewed/centric fuse and a float fuse should be looked at
  on a real surface before this is considered visually confirmed.
- **Firebase-emulator suites** (`test:rules`, `test:e2e`) and the component
  browser project were not run; nothing in the diff touches rules, auth, or a
  Svelte component.
- **No user or device gate is claimed complete.**
