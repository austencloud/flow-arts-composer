# Cat Dog Audit: every surface honors the prop pair

Date: 2026-09-23
Status: approved (Austen, "all in, bud")
Follows: `2026-09-18-shape-engine-cat-dog-design.md` (Shape Engine, on main)

## Goal

Cat dog mode means the left hand draws the left prop and the right hand draws
the right prop. The Shape Engine honors that. This spec makes the rest of the
app honor it too: the settings store can no longer hold a contradictory pair,
the readers that trust a stale flag read the pair correctly, museum platforms
draw the sequence's props, and Tunnel gets per-hand props.

## The rule

A prop pair is `{ leftPropType, rightPropType, catDogMode }`.

1. Hands that differ mean cat dog is on.
2. Cat dog off means the right hand equals the left hand.
3. Equal hands with cat dog on is valid: the user turned cat dog on and has
   not picked a different hand yet. It is not normalized away.
4. The legacy `propType` field follows the left hand.

## Part 1: settings enforce the rule on write

New pure function in `src/lib/shared/settings/domain/prop-pair-rule.ts`:

```ts
normalizePropPatch(current: PropPairFields, patch: Partial<AppSettings>): Partial<AppSettings>
```

It returns the patch with the pair fields made consistent with the rule, given
the current stored values. Cases:

- Patch sets `catDogMode: false` (with or without hands): right becomes the
  resulting left; `propType` becomes the resulting left.
- Patch sets one hand, and the resulting hands differ: `catDogMode: true` is
  added.
- Patch sets both hands equal and says nothing about `catDogMode`: the flag is
  left alone (rule 3).
- Patch sets `propType` only (legacy writers): both hands follow it; the flag
  is left alone (rule 3).
- Patch touches none of the four fields: returned unchanged (same object).

Apply it at every write and load boundary in
`src/lib/shared/settings/state/settings-state.svelte.ts`:

- `updateSettings(newSettings)`: normalize the patch before the assignment loop.
- `updateSetting(key, value)`: when `key` is one of the four pair fields,
  route through the normalized patch so the companion fields are written and
  marked locally edited too.
- `loadSettingsFromStorage()` and `applyRemoteSettings()`: heal the loaded
  pair with `healPropPair(fields)` from the same module. Differing hands win
  over a stale flag (`catDogMode` becomes true, matching
  `captureActivePropConfig`), and `propType` follows the left hand. Nothing
  else about loading changes.

This fixes the Construct step editor's per-hand picker
(`StepEditorCoordinator.svelte` `handlePropSelect`, which writes one hand
without the flag) with no change to that file. The Shift+P and Alt+P
shortcuts write both hands equal; under rule 3 they are correct as is.

## Part 2: readers use the resolved pair

The existing helpers are the source of truth for reading:
`captureActivePropConfig(settings)` (infers cat dog from differing hands) and
`resolveViewingProps(settings, sequence, collectionProp)` (adds "as saved"
viewing mode), both in `src/lib/shared/foundation/services/`.

- **Sequence viewer image tab** (`src/lib/shared/sequence-viewer/components/SequenceViewer.svelte`,
  the `ChoreoCard` and `PropAwareThumbnail` props at ~338 and ~346): stop
  gating the right hand on the raw `catDogMode` and use
  `captureActivePropConfig(settings)`. This legacy viewer renders only in the
  Create drawer, where the animation tab, export preview, and real export all
  use the performer's own pair, so it does not follow "as saved" viewing mode
  (amended 2026-09-23 after review: it never sits under the orchestrator).
- **Export static preview** (`src/lib/shared/export-panel/components/single-media/StaticPreview.svelte` ~98-124):
  pass the same pair the real image export uses. Find the export path's prop
  source and share it, so preview and export cannot disagree. If the export
  uses `resolveViewingProps`, the preview does too.
- **Nav prop icon** (`src/lib/shared/navigation/components/buttons/SelectedPropPreview.svelte`):
  use `captureActivePropConfig(settings)` for left and right.

## Part 3: museum platforms draw the sequence's props

New helper `src/lib/features/museum/services/museum-prop-pair.ts`:

```ts
museumPropPair(sequence: SequenceData | null | undefined, settings: ActivePropSettings | null): ResolvedPropConfig
```

Returns `resolveRecordedPropConfig(sequence)` when the sequence recorded a
valid pair, else `captureActivePropConfig(settings ?? {})`. A half-valid
recording falls back as a whole, never mixed per hand.

- `src/lib/features/museum/scenes/procedural/components/PerformerPlatform.svelte:92-93`
  replaces the hardcoded staff with this helper.
- `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte:215-230`
  replaces its per-hand mix with the same helper (it keeps its try/catch
  around the settings service by passing `null` when settings are
  unavailable).

## Part 4: Tunnel supports per-hand props (per tunnel)

Tunnel already keeps its own pair per tunnel: the presentation state holds
`leftPropType`/`rightPropType`, saves them in the tunnel snapshot, and its
picker writes only animation-engine state
(`animationSettings.setCurrentPropType`), never global settings. That stays.
What changes:

- **State** (`src/lib/features/create/tunnel/state/tunnel-presentation-state.svelte.ts`):
  add `catDog` and `propHand` (`"left" | "right"`), `toggleCatDog()`,
  `selectPropHand(hand)`, and make `setPropType(prop)` address `propHand`
  when cat dog is on (both hands when off). Turning cat dog off folds the
  right hand to the left. Expose `addressedPropType` and a `handProps` object
  shaped as `HandPropToolbarProps`
  (`src/lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte`).
  New input `initialCatDogMode`; a new tunnel starts from the settings pair
  and flag.
- **Snapshot** (`src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts`):
  `props.catDogMode?: boolean`, optional in the type and the zod schema. On
  load, a missing flag is inferred as `leftPropType !== rightPropType`.
- **Picker** (`TunnelLayout.svelte` and `TunnelArtSettings` down to the
  `AnimationPanel` it hosts): pass `selectedPropType={addressedPropType}` and
  `handProps`, the same contract the Shape Engine Drill uses, so the Cat Dog
  chip and Left/Right segments appear.
- **Art view** (`TunnelLayout.svelte` ~342 and ~497): pass the real
  `leftPropType`/`rightPropType` to `TunnelArtView` instead of the left prop
  twice.

## Out of scope

- Store and showcase covers: a printed deck has one prop by design.
- Learn and guide pages: their hardcoded props are teaching illustrations.
- The Shape Engine: done in the prior spec.

## Testing

Unit (vitest, `tests/config/vitest.config.ts`):

- `normalizePropPatch`: every case above, plus "unrelated patch returns the
  same object".
- Settings state: `updateSettings({ rightPropType })` with differing hands
  stores `catDogMode: true`; `updateSetting("catDogMode", false)` folds the
  right hand; loading stored `{ staff, fan, catDogMode: false }` heals to
  `catDogMode: true`.
- `museumPropPair`: recorded pair wins, invalid recording falls back whole,
  null settings fall back to staff.
- Tunnel state: toggle, per-hand pick, fold on off, `handProps` shape, snapshot
  round trip with the flag, and an old snapshot without the flag inferring it.

Browser (task worktree dev server, staff/fan pair seeded in settings):

- Sequence viewer image tab draws staff on the left and fan on the right.
- Export panel static preview matches.
- Nav prop icon shows both props.
- A museum procedural platform draws the sequence's recorded pair.
- Tunnel: the picker shows the Cat Dog chip and segments, a per-hand pick
  changes only that hand in the art view, and the pair survives a reload of
  the saved tunnel.
- Construct: picking only the right prop in the step editor leaves settings
  with `catDogMode: true`.
