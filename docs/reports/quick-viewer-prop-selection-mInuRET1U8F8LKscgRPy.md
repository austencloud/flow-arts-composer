# Quick viewer closes on prop change — feedback `mInuRET1U8F8LKscgRPy`

**Status:** implementation and checks complete; no browser verification available
here (see Unresolved risks)
**Branch:** `claude/quick-viewer-prop-selection-8h33f2` (cloud namespace enforced;
the requested `codex/opus-quick-viewer` name is not pushable from this
environment)
**Session:** `session_01E4i3castChZAXpTK5JTj9x`
**Scope owned:** quick-viewer / prop-selection lifecycle and its focused tests.
Gallery carousel wrapping and the guest-save/auth audit belong to other agents;
nothing outside the files listed below was touched.

## Repro

Create → Construct → build a sequence → press Play (the workspace quick viewer
replaces the beat grid with the inline animation) → open the prop selection
panel (prop indicator button, or `P`) → pick a different prop. The quick viewer
closes and drops back to the beat grid.

## Root cause

The quick viewer is `panelState.workspacePlayback` — the inline
`WorkspacePlayback` surface that `CreationWorkspaceArea` crossfades in place of
the beat grid.

1. Picking a prop calls `updateSetting("leftPropType" / "rightPropType")`
   (`MainApplication.handleGlobalPropSelect`).
2. `createPropTypeSyncEffect`
   (`src/lib/features/create/shared/state/managers/prop-type-sync-manager.svelte.ts`)
   observes the settings change and calls
   `StepOperator.bulkUpdatePropType()` for blue and red.
3. `bulkUpdatePropType`
   (`src/lib/features/create/shared/services/step-operations/prop-type-handler.ts`)
   stamps the new `propType` onto every motion and writes the result back
   through `setStartPosition()` and `setCurrentSequence()`. Each write claims a
   fresh `currentSequenceRevision`
   (`src/lib/features/create/shared/state/core/sequence-core-state.svelte.ts`).
4. `CreationWorkspaceArea`'s effect calls
   `panelState.syncWorkspacePlaybackSource(activeTab, currentSequenceRevision)`.
   The revision no longer matches the one playback started from, so
   `stopWorkspacePlayback()` runs and the quick viewer closes.

The revision check exists to stop playback when the user _edits_ the sequence,
because playback holds a fixed snapshot. A prop swap is not that kind of change:
both surfaces inside the quick viewer resolve prop type from settings, not from
the snapshot — the animator through
`PropTypeManager.loadPropTextures` (reads `settings.leftPropType` /
`rightPropType` on the live `PlaybackSync.update` path) and the notation rail's
pictographs through `pictograph-preparer`, which overrides each motion's
`propType` from settings. So the snapshot the quick viewer is playing is
unchanged by a prop swap, and the new prop appears live either way.

## Fix

Let the prop-type sync report the revision delta it caused, and re-base the
running playback session onto it instead of stopping.

- `panel-coordination-state.svelte.ts`: the playback baseline revision moved out
  of the `workspacePlayback` object into a private variable exposed as
  `workspacePlaybackSourceRevision`. Keeping it out of that object matters:
  `CreationWorkspaceArea` keys the mounted player on the session object's
  identity, so replacing the object to change one number would remount the
  player and restart the sequence from beat 0. New
  `rebaseWorkspacePlayback(fromRevision, toRevision)` moves the baseline and
  does nothing else.
- `prop-type-sync-manager.svelte.ts`: reports `onPropTypeSequenceRewrite(from,
to)` only when a prop change actually rewrote the sequence. The revision is
  read under `untrack` so the effect keeps depending on settings alone.
- `create-module-effect-coordinator.ts`: wires that callback to
  `panelState.rebaseWorkspacePlayback`.

`rebaseWorkspacePlayback` forgives only the exact delta the caller observed — if
the live baseline is not `fromRevision`, it does nothing — so every intended
close survives: Escape, the Stop button, Clear, the expand-to-full-viewer
button, a creation-tab switch, any real sequence edit, `closeAllPanels()` when
another panel opens, and unmount.

## Changed files

- `src/lib/shared/create/state/panel-coordination-state.svelte.ts`
- `src/lib/features/create/shared/state/managers/prop-type-sync-manager.svelte.ts`
- `src/lib/features/create/shared/services/create-module-effect-coordinator.ts`
- `tests/unit/create/prop-swap-keeps-workspace-playback.test.ts` (new)
- `tests/unit/create/prop-swap-harness.svelte.ts` (new)
- `tests/unit/create/workspace-playback-panel-state.test.ts`
- `docs/reports/quick-viewer-prop-selection-mInuRET1U8F8LKscgRPy.md` (this file)

## Checks

All run in this container with `pnpm install --frozen-lockfile` and
`pnpm run build:packages` (the workspace `dist` output is required — without it
25 create test files and ~60 type errors are workspace-resolution noise, not
real failures).

| Check                                                                                                                                                 | Result                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/{workspace-playback-panel-state,prop-swap-keeps-workspace-playback}.test.ts` | pass — 14 tests                                                                                                                    |
| Same two files with `rebaseWorkspacePlayback` stubbed to a no-op                                                                                      | 2 failed / 3 passed — the new tests do fail without the fix                                                                        |
| `npx vitest run … tests/unit/create src/lib/features/create/shared/state src/lib/shared/create`                                                       | pass — 70 files, 421 tests                                                                                                         |
| `pnpm run check:fast`                                                                                                                                 | 582 errors / 44 warnings, **identical count on `main`** (`git switch --detach main`), none in the changed files or their consumers |
| `npx eslint` on the three changed source files                                                                                                        | clean (the three test files are covered by an eslint ignore pattern)                                                               |
| `npx prettier --check` on all changed files                                                                                                           | clean after `--write`                                                                                                              |

A full `npm run check` was not run: `check:fast` already covers the type
boundary these three files cross, and its error count is unchanged from `main`.

## Known limits

- No browser verification: this cloud container has no dev server, no
  `scripts/launch-chrome-debug.ps1` host, and no Chrome DevTools MCP. The local
  reviewer should confirm on `https://localhost:5173/create` that the quick
  viewer stays up and keeps playing across a prop change, and that the new prop
  appears in both the animation and the notation rail.
- `optionAudition` compares the same revision counter and will still be
  cancelled by a prop swap. It is a Construct hover-preview and is mutually
  exclusive with playback (`enterOptionAudition` returns early while playback
  runs), so it is out of this fix's scope — flagged rather than changed.

## Unresolved risks

- **The main one: no rendered evidence.** The reasoning that the new prop shows
  up live rests on reading `PropTypeManager.loadPropTextures` and
  `pictograph-preparer`, not on watching it. If the animation keeps the old prop
  after the swap, the close is fixed but the visual refresh is not, and the
  playback snapshot would need the new `propType` stamped into it as well.
- The re-base is keyed on the revision delta rather than on a typed "this change
  was cosmetic" signal. Any future writer that rewrites the sequence in the same
  tick as a prop swap would have its delta folded into the forgiven one. The
  conservative `fromRevision` guard limits this to that exact tick.
- `bulkUpdatePropType` runs once per hand, so a cat/dog pair change produces two
  revision bumps; both are inside the single reported delta and were exercised
  in the "leaves the same playback session running" test.
- The prop-type sync effect still tracks the sequence reads that
  `bulkUpdatePropType` performs, so it re-runs on every sequence edit as it did
  before. The new revision reads are wrapped in `untrack` so they add no
  dependency of their own.

## Status

Implementation and checks complete. Not merged, not deployed; branch left in
place for local review.
