# Generate saved setups: detach on edit

Date: 2026-09-11
Status: approved, awaiting plan
Supersedes: the "Snapshot equality and modified state" section of
`shipped/2026-07-30-generate-saved-setups-favorites-design.md`

## Problem

Applying a saved setup (for example "V2G", a level 1 setup) and then changing
any control keeps the setup attached. The Setups card still shows "V2G" with a
"Modified" badge, and the drawer row still highlights it. On short phone
viewports the card hides its badge entirely, so the card reads "V2G" as if
nothing changed.

Austen's rule: once a control differs from the setup, the panel is no longer
showing that setup, and nothing should say it is.

## Decision

A setup is active only while the live panel snapshot exactly equals the
snapshot captured when it was applied. Any divergence detaches it. The
"Modified" state goes away.

Re-attachment: if the user edits the controls back so the live snapshot again
equals the applied baseline, the setup shows as active again. Active means
"the current settings are this setup," and that is true in that moment.

## Behavior

### `favoriteState` (`state/favorite-state.svelte.ts`)

- Internal fields `appliedSource` and `appliedBaseline` replace `activeSource`
  and `activeBaseline` as the raw stored provenance. `setActiveSource`,
  `saveCurrentSetup`, `updateSetupFromCurrent`, `deleteSetup`, and
  `loadPersonal` keep writing them exactly as they write the current fields.
- Public `activeSource` becomes a `$derived`: returns `appliedSource` when
  `appliedBaseline` is non-null and `setupSnapshotsEqual(appliedBaseline,
  deps.getLiveSnapshot())`, otherwise `null`.
- Public `activeStatus` becomes `"active" | null`: `"active"` when
  `activeSource` is non-null, else `null`. The `"modified"` value is removed.
- `updateSetupFromCurrent` still resets `appliedBaseline` to the live snapshot
  when the updated setup is the applied one, so the row lights up as active
  after an update.

### Setups card (`CardBasedSettingsContainer.svelte`, `PresetCard.svelte`, `card-configurator.ts`)

- Card value logic is unchanged; it already reads `favoriteState.activeSource`,
  so a detached setup falls through to `"N saved"` or `"Browse"`.
- `setupsCardStatus` type narrows to `"active" | null` in
  `generator-contract-types.ts`, `card-configurator.ts`, and `PresetCard.svelte`.
- The hidden sizer span in `PresetCard.svelte` that reserves width for the
  word "Modified" changes to "Active". The status slot stays so the card does
  not resize between active and detached.

### Drawer (`PresetDrawer.svelte`, `SavedSetupRow.svelte`)

- `SavedSetupRow` loses the `isModified` prop and the `modified` class. The
  status label is `"Active"` or empty.
- "Update with current settings" is enabled on any row where mutations are
  allowed and the row is not busy and not the exact active match. Overwriting
  a setup that already equals the live settings is a no-op, so that row keeps
  it disabled.
- Community rows drop the `modified` class and the "Modified" status text.
- `summarize()` is unchanged.

### Apply and save flows

Unchanged. `handleApplySource` in `GeneratePanel.svelte` still writes the
config and start/end options, then calls `setActiveSource` with the live
snapshot. `saveCurrentSetup` still makes the new setup active.

## Out of scope

- Confirm dialog on "Update with current settings". Today there is none; this
  change widens which rows offer it but does not add a confirm.
- The card's short-viewport rule that hides the status slot. With only one
  status value it no longer misleads: the name only appears while the setup is
  exactly active.
- Matching the live snapshot against every saved setup (approach C in the
  brainstorm). Rejected because two setups can share a config and community
  favorites would collide with personal ones.

## Tests

- `tests/unit/create/favorite-state.test.ts`
  - Applying a setup then changing `config.level` in the live snapshot makes
    `activeSource` null and `activeStatus` null.
  - Changing it back restores `activeSource` and `activeStatus === "active"`.
  - Existing sign-out and stale-read cases keep asserting `activeSource` is
    null.
- `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`
  - "enables Update only when the applied setup is modified" is replaced by:
    Update is disabled on the active row and enabled on a non-active row.
  - The `activeStatus` mock type drops `"modified"`.
- `src/lib/features/create/generate/domain/__tests__/setup-snapshot.test.ts`
  is unchanged; the comparator is not touched.

## Verification

- `pnpm vitest run tests/unit/create/favorite-state.test.ts src/lib/features/create/generate` passes.
- `pnpm check` (svelte-check) reports no new errors in the touched files. If
  the machine is under memory pressure, run it in the cloud session instead.
- Browser: apply a level 1 setup, pick level 2, confirm the Setups card shows
  "N saved" and the drawer row has no highlight. Pick level 1 again, confirm
  the card shows the setup name with "Active".

## Files

- `src/lib/features/create/generate/state/favorite-state.svelte.ts`
- `src/lib/features/create/generate/components/cards/PresetCard.svelte`
- `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`
- `src/lib/features/create/generate/components/presets/SavedSetupRow.svelte`
- `src/lib/features/create/generate/shared/services/card-configurator.ts`
- `src/lib/shared/create/domain/generator-contract-types.ts`
- `tests/unit/create/favorite-state.test.ts`
- `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`
- `docs/superpowers/specs/shipped/2026-07-30-generate-saved-setups-favorites-design.md`
  (add a superseded note pointing here)
