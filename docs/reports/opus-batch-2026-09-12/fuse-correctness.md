# Fuse sequence composition — correctness audit and fixes

Opus cloud batch, 2026-09-12. Scope: `src/lib/features/fuse` plus narrowly
scoped Fuse tests. Excluded by assignment and respected here: shared
generation/LOOP transforms, the shared renderer, the playback carousel,
persistence, prop colors.

|                   |                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Base SHA          | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`)                                                               |
| Branch            | `claude/fuse-sequence-composition-fix-smdu2c`                                                                            |
| Final runtime SHA | `8b9daccaf3fbe21166bcc8f1b412c1097c2a49b6` — the last commit touching runtime code; every commit after it is this report |

## Owned files

| Path                                                                     | Change                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/lib/features/fuse/services/sequence-fuser.ts`                       | both fixes                                                                           |
| `src/lib/shared/foundation/services/step-deriver.ts`                     | `rehydrateMotion` made `export` (additive; no behaviour change for existing callers) |
| `src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts` | new regression test (defect 1)                                                       |
| `src/lib/features/fuse/services/__tests__/fused-grid-mode.test.ts`       | new regression test (defect 2)                                                       |

Nothing else was touched. `docs/reports/opus-batch-2026-09-12/fuse-correctness.md`
is this report.

## Corrections after independent review

An independent review of `7c9a6fee` approved both runtime fixes and flagged four
overstatements in this report plus two gaps in the fidelity test. All six are
corrected above; no runtime file changed in that round, so the approved
`sequence-fuser.ts` and `step-deriver.ts` are byte-identical to what was
reviewed.

| Raised                                                                                                                                         | Where it is now                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readonly` does not prove runtime output isolation; `tile` aliases the source objects, and only "no mutation during the call" was demonstrated | contracts table row 1, and new limitation L7                                                                                                                    |
| No runtime deep clone was requested or added                                                                                                   | stated in L7                                                                                                                                                    |
| `solo-prop-sequence-adapter` does not copy `plane`, so the "every sibling preserves it" claim is wrong                                         | defect 1 "What was wrong" now carries a per-field table naming the omission                                                                                     |
| The fidelity test named `plane` but neither supplied nor asserted it, and never asserted `arrowLocation`                                       | both now supplied with non-default values and asserted, plus a canonical field-for-field parity test; defect 1 "Proof" lists the measured pre-fix value of each |
| `grid-mode-deriver` has no CENTRIC handling, unlike the other two classifiers                                                                  | defect 2 "Fix" now separates the skewed equivalence (all three) from the centric one (two of three), and the test header says the same                          |
| No browser proof has run — keep that explicit                                                                                                  | "Not verified" now states it absolutely rather than as a soft caveat                                                                                            |

One follow-up is deliberately **not** done, because this round was scoped to the
report and tests: the doc comment above `resolveFusedGridMode` in
`sequence-fuser.ts` still reads "the classification follows the canonical
derivers (grid-mode-deriver for motions, hand-path-factory for paths)", which
carries the same imprecision about `CENTRIC` that this report just corrected.
Editing it would mean touching an approved runtime file for a comment, so it is
recorded here instead and should be tightened the next time that file is opened.

## Contracts established for `fuseSequences`

Measured on the fixed build unless marked otherwise. "Measured" means an
assertion or a printed probe value from a run in this session; "inferred" means
read from code without a runtime observation.

| Contract                                  | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Component step order                      | Holds. Sources are tiled cyclically in source order; a 2-step source against a 4-step source yields left `n,s,n,s` against right `n,e,s,w`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | measured (probe)    |
| Hand assignment                           | Holds. Left source motions carry `hand: "left"`, right carry `hand: "right"`, including when the _same_ `SoloPropData` object is passed on both sides.                                                                                                                                                                                                                                                                                                                                                                                                                                          | measured (probe)    |
| No mutation of the inputs during the call | Holds, and that is the exact extent of the claim. Neither source's `steps` nor `handPath` differed before and after a `fuseSequences` call. The result is **not** isolated from its inputs: `tile` aliases the source `SoloPropStepData` objects into the returned solo props, measured as `mixed.leftSoloProp.steps[0] === two.steps[0]`. `readonly` on the interface is a compile-time annotation and proves nothing about runtime output isolation — a caller reaching the aliased objects through a cast or plain JS could mutate shared state. No deep clone was added; see limitation L7. | measured (probe)    |
| Joins / seam                              | Holds when the LCM is reached. `isCircular` is measured with `isSeamlesslyLoopable`, not asserted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | measured (probe)    |
| One-step sources                          | Handled. A 1-step source tiles to the partner's length; 1×1 yields a 1-step fuse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | measured (probe)    |
| Different-length sources                  | Handled up to `maxSteps`; see limitation L1 for the truncation path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | measured (probe)    |
| Duration                                  | **Does not hold** — see limitation L2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | measured (probe)    |
| Orientation                               | Carried through unchanged from each source step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | measured            |
| Authored motion fields                    | Was broken; fixed — defect 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | measured, red→green |
| Combined grid frame                       | Was order-dependent; fixed — defect 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | measured, red→green |
| Solo-prop identity of the tiled result    | **Does not hold** — see limitation L3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | measured (probe)    |
| Start position                            | Never populated — see limitation L4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | measured (probe)    |

## Defect 1 — authored motion fields dropped, producing a silently wrong word

### What was wrong

`fuseSequences` built its combined motions with a private
`buildMotionFromSoloPropStep` that carried only eight fields. The sibling
builders carry more, though not all of them carry the same set:

| Field                                       | `step-deriver.rehydrateMotion` | `solo-prop-sequence-adapter.buildMotion` | `sequence-decomposer.motionToSoloPropStep` | old fuser                                                  |
| ------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `prefloatMotionType`                        | yes                            | yes                                      | yes                                        | **dropped**                                                |
| `handPath`                                  | yes                            | yes                                      | yes                                        | **dropped**                                                |
| `skewSteps` / `skewDir`                     | yes                            | yes                                      | yes                                        | **dropped**                                                |
| `plane`                                     | yes                            | **no**                                   | yes                                        | **dropped**                                                |
| `arrowLocation` seeded from `startLocation` | yes                            | yes                                      | n/a (inverse direction)                    | **dropped** — left at `createMotionData`'s `NORTH` default |

So `plane` is not a field every sibling preserves: `solo-prop-sequence-adapter`
omits it, which an earlier draft of this report got wrong. The fuser now routes
through `rehydrateMotion`, which does carry it.

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

Every authored field the fixtures supply is now both **supplied and asserted**,
including `plane` (`wheel` on the left hand, `floor` on the right — non-default
values, so a dropped field is distinguishable from a carried one) and
`arrowLocation`. An earlier draft named `plane` in its header comment without
supplying or asserting it, and never asserted `arrowLocation` at all; both gaps
are closed.

The three tests are:

1. `keeps every supplied authored field on both fused hands` — per-field
   assertions on both hands, including the derived
   `prefloatRotationDirection` (the value the CSV lookup actually matches on)
   and `arrowLocation`.
2. `produces the same authored fields as the canonical two-hand assembly` —
   compares all fourteen carried fields, on both hands, on every step, against
   `step-deriver.deriveSteps` output for the same pair. `gridMode` is
   deliberately excluded and the exclusion is stated in the test.
3. `derives the same word as the canonical two-hand assembly`.

Before the fix, all three fail. Each assertion was also confirmed individually
red by printing the pre-fix motion values (the suite stops at the first failing
assertion, so the printed probe is what establishes the rest):

| Field                | pre-fix value         | supplied / expected              |
| -------------------- | --------------------- | -------------------------------- |
| `prefloatMotionType` | `undefined`           | `anti`                           |
| `handPath`           | `null`                | `cw`                             |
| `skewSteps`          | `null`                | `0`                              |
| `skewDir`            | `null`                | `+`                              |
| `plane`              | `undefined`           | `wheel` (left) / `floor` (right) |
| `arrowLocation`      | `n` on **both** hands | `w` (left) / `e` (right)         |
| derived word         | `AAAA`                | `CCCC`                           |

The reference value `CCCC` is not hand-written: the test assembles the identical
solo pair through the canonical `step-deriver.deriveSteps` owner and derives its
word the same way, so the assertion is Fuse-vs-canonical, not Fuse-vs-opinion.

After the fix all three pass.

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

A symmetric table: equal frames pass through, a center-touching frame wins, any
other disagreement is skewed. The pre-existing diamond+box → skewed result is
unchanged, so this completes the table rather than reinterpreting it.

The equivalence with the canonical classifiers is **partial**, and the earlier
phrasing ("matching the three canonical classifiers") overstated it:

- **Skewed** matches all three. `grid-mode-deriver.deriveGridMode`,
  `step-deriver.deriveStepGridMode` and `hand-path-factory.deriveGridMode` all
  call a mixed or cardinal↔intercardinal pairing skewed. The last assertion in
  the grid-mode test pins this against `deriveGridMode` directly.
- **Centric** matches only two. `hand-path-factory` and `step-deriver` return
  `CENTRIC` for a `CENTER`-touching path, but `grid-mode-deriver` has **no
  `CENTER` branch at all** — verified by grep, it contains no reference to
  `CENTER` or `CENTRIC` — and falls through to its `console.warn` +
  `DIAMOND` default. Fuse follows the two classifiers that model `CENTER`,
  which is a deliberate choice, not a derived equivalence. The centric case in
  the test is therefore asserted against Fuse's own contract and explicitly not
  against `deriveGridMode`.

## Commands and results

All run in this cloud checkout. `pnpm install --frozen-lockfile` and
`npm run build:packages` were required first — the container had no
`node_modules` and `@tka/tka-types` must be built before Vitest can resolve it.

| Command                                                                                                                                                                                                                                                                                                                                                                                         | Result                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --config tests/config/vitest.config.ts src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts` (pre-fix)                                                                                                                                                                                                                                                        | 3 failed — `undefined` vs `'anti'`; `step 1 left prefloatMotionType` in the canonical-parity test; `'AAAA'` vs `'CCCC'`                                                                                                 |
| pre-fix probe printing the fused motion values directly (scratch test, not committed)                                                                                                                                                                                                                                                                                                           | `arrowLocation: n` on both hands; `plane: undefined`; `skewSteps`, `skewDir`, `handPath` all `null` — confirms each new assertion is individually red, not masked by the first failure                                  |
| same, post-fix                                                                                                                                                                                                                                                                                                                                                                                  | 3 passed                                                                                                                                                                                                                |
| `…/fused-grid-mode.test.ts` (grid resolver reverted to its pre-fix form)                                                                                                                                                                                                                                                                                                                        | 3 failed, 2 passed                                                                                                                                                                                                      |
| same, post-fix                                                                                                                                                                                                                                                                                                                                                                                  | 5 passed                                                                                                                                                                                                                |
| `npx vitest run … src/lib/features/fuse/services/__tests__/`                                                                                                                                                                                                                                                                                                                                    | 4 files, 17 tests passed                                                                                                                                                                                                |
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

**L7 — the returned solo props alias the source step objects.** `tile` copies
references, not values, so `fused.leftSoloProp.steps[i]` is the very same object
as the source's step (measured: `=== two.steps[0]`). What was demonstrated is
only that `fuseSequences` does not mutate its inputs during the call; the output
is not isolated from them afterwards. `readonly` on `SoloPropStepData` is erased
at runtime and does not prevent a caller from mutating a shared step through a
cast or from plain JavaScript. **No runtime deep clone was added and none was
requested** — this is recorded so the isolation claim is not read as stronger
than the evidence. A deep clone would be a separate, measurable change with its
own allocation cost, and should be decided on its own merits.

## Not verified

- **No browser verification has run at all.** Not partially, not
  indirectly — zero rendered frames were observed for this branch. This is a
  cloud container with no dev server and no Chrome DevTools MCP, and port 5173
  is Austen's and must not be started here. Defect 2 changes a value the
  renderer consumes (`sequence.gridMode` on skewed and centric pairings) and
  defect 1 changes `arrowLocation` seeding on fused motions. Both changes move
  Fuse _toward_ what the canonical path already produces for the source cards,
  but that is an argument, not an observation. A skewed fuse, a centric fuse and
  a float fuse must each be looked at on a real surface before any part of this
  is described as visually confirmed.
- **Firebase-emulator suites** (`test:rules`, `test:e2e`) and the component
  browser project were not run; nothing in the diff touches rules, auth, or a
  Svelte component.
- **No user or device gate is claimed complete.**
