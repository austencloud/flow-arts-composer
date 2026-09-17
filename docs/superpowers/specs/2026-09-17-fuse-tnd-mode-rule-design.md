# Fuse Linked rule: timing and direction as the primary selector

Date: 2026-09-17
Surface: `/create/fuse`, Pairing = Linked, Rule panel
Status: approved design, awaiting implementation plan

## Why

In Linked mode the Right path is one fixed transform of the Left path on every
beat. Timing and direction (TnD) are derived purely from each hand's
start-to-end arc (`src/lib/shared/pictograph/shared/domain/utils/tnd-deriver.ts`),
so a fixed pointwise transform pins TnD for the whole sequence. Rotation shifts
the follower's phase by a constant, mirror and flip reverse its arc sense,
invert touches nothing the deriver reads. The Generate tab already ships this
as the Hand Relationship constraint (`src/lib/shared/create/domain/hand-relationship.ts`,
`HAND_RELATIONSHIP_TND`), proven against the dataframes by
`hand-relationship-tnd.test.ts`. Fuse still asks for the transform and leaves
the user to discover the TnD it produces.

This design turns that around. The user picks the TnD mode. The app resolves
the rule.

## Scope

In:
- A six-mode TnD picker replaces the rotation dial and reflect toggles in the
  Linked Rule panel.
- A clockwise / counterclockwise offset choice for the two quarter modes.
- Invert stays as a free toggle.
- Rewind stays as a verified toggle with a per-beat TnD check.
- Persisted rules restore into the new model; odd rotations are coerced.
- Mode labels come from the shape-matrix tables, not a new Fuse copy.

Out:
- Separate mode. Its manual adjust controls (`adjustSource`) are unchanged.
- The transform pipeline (`applyDriverRule`, `motion-transforms.ts`,
  `sequence-transforms.ts`). No changes.
- The generator. No rejection sampling, no TnD-aware generation.
- Generate's Hand Relationship panel. It keeps its four-name scheme. A
  follow-up should migrate its labels to the same six-mode source.
- 45-degree rotations in Linked. They become unreachable from the panel.

## Domain model

New file `src/lib/features/fuse/domain/fuse-tnd-rule.ts`.

```ts
export type FuseTnDMode = VtgMode; // "SS" | "TS" | "QS" | "SO" | "TO" | "QO"
export type FuseQuarterOffset = "cw" | "ccw";

export interface FuseTnDSelection {
  mode: FuseTnDMode;
  /** Only meaningful for QS and QO. Which way round the circle the follower
   *  sits from the driver: a quarter clockwise or a quarter counterclockwise. */
  quarterOffset: FuseQuarterOffset;
  invert: boolean;
  rewind: boolean;
}
```

Why an offset and not a lead hand: which hand reaches the downbeat first
depends on the driver's arc sense on that beat. A follower a quarter
clockwise of a clockwise-moving driver leads; the same follower of a
counterclockwise-moving driver lags. Generated paths reverse arc sense
(hand-path mode "mixed"), so "Left leads" would be true on some beats and
false on others. The offset is the thing the rule actually fixes.

`FuseTnDMode` is a type alias of the existing `VtgMode` from
`src/lib/shared/shape-matrix/services/shape-matrix-realizations.ts`. Labels,
short words (Tog, Opp) and family ids come from `MODE_LABEL`,
`MODE_SHORT_WORDS` and `MODE_FAMILY_ID` in that file.

### resolveFuseRule(selection): FuseRule

Pure. Maps a selection to the existing `FuseRule` shape. The result feeds
`applyDriverRule` unchanged.

| Mode | rotationSteps | reflect |
|---|---|---|
| TS (Together, Same) | 0 | none |
| SS (Split, Same) | 4 | none |
| QS (Quarter, Same) | 2 for cw, 6 for ccw | none |
| TO (Together, Opp) | 0 | mirror |
| SO (Split, Opp) | 0 | flip |
| QO (Quarter, Opp) | 2 for cw, 6 for ccw | mirror |

`invert` and `rewind` pass through.

SO uses flip rather than rotate 180 plus mirror because they are the same
map (flip equals rotate 180 composed with mirror) and flip is the existing
single-op label. QO uses rotation plus mirror because there is no single op
for it.

### classifyFuseRule(rule): FuseTnDSelection | null

Pure. The inverse. Returns null when `rotationSteps` is odd. For even steps:

- steps 0, reflect none: TS
- steps 4, reflect none: SS
- steps 2 or 6, reflect none: QS, offset cw for 2 and ccw for 6
- steps 0, reflect mirror: TO
- steps 0, reflect flip: SO
- steps 4, reflect mirror: SO (rotate 180 then mirror equals flip)
- steps 4, reflect flip: TO (rotate 180 then flip equals mirror)
- steps 2 or 6, reflect mirror or flip: QO, offset cw for 2 and ccw for 6

Note on composites: on the eight grid points, rotate 180 then mirror (E to W)
is the same map as flip (N to S). Rotate 180 then flip is the same as mirror.
So steps 4 with flip classifies as TO, and steps 4 with mirror as SO. The
resolver never emits those composites, but persisted and legacy rules can
carry them and the classifier must read them correctly. A unit test pins each
composite against `deriveTnD` on a fixed pair of arcs so the table cannot
drift.

Every `LEGACY_RULES` id restores this way: `rotate90` to QS,
`rotate-mirror` to QO, `mirror-invert` to TO with invert, `rotate-invert` to
QS with invert, `rewind` to TS with rewind.

### coerceToTnDRule(rule): { selection, adjusted: boolean }

For odd `rotationSteps`, round down to the nearest even step (1 to 0, 3 to 2,
5 to 4, 7 to 6), keep reflect, invert, rewind, then classify. `adjusted` is
true when a change was made. Used only on restore.

## Panel

`FuseRelationshipComposer.svelte` step 2 changes. Step 1 (path you will edit)
is unchanged. Step 3 (result strip) changes its wording.

Step 2 layout, top to bottom:

1. A 3x2 grid of mode chips. Rows are timing (Tog, Split, Quarter), columns
   are direction (Same, Opp). Chips render with `RelationshipChoiceChip`
   from shape-matrix so the picker matches the shape-matrix TnD chips. Short
   words on the chip, full words in the accessible name.
2. An offset segmented pair, "Quarter clockwise" and "Quarter
   counterclockwise", visible only when the selected mode is QS or QO.
   Defaults to clockwise.
3. Invert toggle. Same control as today.
4. Rewind toggle. Same control as today, plus the verification note below.

The ROTATE dial and the Mirror and Flip toggles are removed from the Linked
panel.

The result strip reads mode first, then the operation chain from
`fuseRuleLabel`: "Together, opposite · Mirror + Invert". The header Rule chip
in `FuseRecipeRail` shows the mode label, "Together, opposite".

The follower card's note ("Rebuilt from Left") keeps `fuseRuleLabel` so the
operation chain stays visible somewhere.

## Rewind verification

Rewind is not a pointwise transform. `rewindSingleHand` pairs follower beat i
with driver beat n-1-i. TnD only stays constant under Rewind when the driver
path has the internal symmetry the generator builds in. A hand-edited path can
break it.

After `deriveFollower` produces `previewSequence`, the state computes:

```ts
interface FuseTnDCheck {
  expected: FuseTnDMode;
  /** First beat (1-based) whose derived mode differs, or null when all match. */
  firstMismatchBeat: number | null;
  /** Beats where the deriver returned null (dash, static). Not mismatches. */
  undefinedBeats: number[];
}
```

using `deriveTnDFromPictograph` over each beat and mapping `TnDMode` to
`VtgMode`. Null beats are skipped.

With Rewind off this check always passes; the dataframe test below is the
proof, since every non-rewind rule is pointwise.

With Rewind on and a mismatch, the Rewind toggle stays on. Under it a one-line
note reads "Rewind breaks Together, opposite at beat 5." The result strip
prefixes the mode with "About". Nothing is changed automatically.

The check is a pure function, `checkFuseTnD(sequence, expected)`, in the
domain layer. `fuseState` exposes it as a derived value over
`previewSequence` and the classified rule, in Linked mode only, so the panel
and the result strip read one source.

## Persistence

`PersistedFuseState.rule` stays a `FuseRule`. Nothing new is stored. On
restore in Linked mode, `coerceToTnDRule` runs. When `adjusted` is true the
result strip shows a one-line note, "Rule adjusted to the nearest timing",
until the user changes the rule. The coerced rule is written back so the note
does not reappear on the next load.

`DEFAULT_RULE` (mirror) classifies to TO, so the default experience is
unchanged.

## Data flow

```
picker / offset / invert / rewind
  -> FuseTnDSelection (panel draft state)
  -> resolveFuseRule(selection)
  -> fuseState.setRule(FuseRule)        (existing)
  -> applyDriverRule, deriveFollower    (existing)
  -> previewSequence                    (existing)
  -> FuseTnDCheck (new derived)
  -> panel note and result strip
```

The panel's draft state holds a `FuseTnDSelection`, initialised by
classifying the current rule. `chooseRule` resolves and commits as today.

## Error handling

- Classifier null on a live rule (should not happen after coercion): fall back
  to TO and log a warning. Do not throw.
- Deriver returns null for every beat: `firstMismatchBeat` is null,
  `undefinedBeats` lists every beat, no note shown. A sequence with no shift
  beats has no TnD and the panel does not claim one.
- Offset on a non-quarter mode is stored but ignored. Switching to a
  quarter mode reuses it.

## Testing

Unit, `tests/unit/fuse/fuse-tnd-rule.test.ts`:
- `resolveFuseRule` for all six modes and both offsets; invert and rewind
  pass through.
- `classifyFuseRule` round-trips every resolved rule and every `LEGACY_RULES`
  id to the expected mode; returns null on odd steps; reads the two
  rotate-180 composites correctly.
- `coerceToTnDRule` rounds each odd step down, preserves the other axes, sets
  `adjusted`.

Dataframe, `src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts`, in
the style of `hand-relationship-tnd.test.ts`: for each mode and offset with
rewind off, apply the resolved rule's location map to the left hand of every
shift row in the Diamond and Box CSVs, run `deriveTnD`, assert the mode. This
is the proof that every non-rewind rule pins its mode on every beat.

Check, `tests/unit/fuse/fuse-tnd-check.test.ts`, on hand-built sequences:
- Every beat matches: `firstMismatchBeat` is null.
- Dash and static beats are listed in `undefinedBeats`, not counted as
  mismatches.
- One beat off: reports that beat, 1-based.

Component, `FuseRelationshipComposer.svelte.test.ts` additions:
- Six chips render with short words and full accessible names.
- Offset pair appears only for QS and QO.
- Rotation dial and reflect toggles are gone.
- Result strip leads with the mode label.

## Follow-ups (not this work)

- Migrate Generate's Hand Relationship labels to the shared six-mode source and
  add the quarter modes there.
- Decide whether Separate mode's adjust controls should surface a live TnD
  readout of the current pair.
