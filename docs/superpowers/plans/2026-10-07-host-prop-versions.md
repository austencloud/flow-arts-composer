# Host Prop Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the deck releaser, tunnel creator, Arena and Guide codex from writing the account's prop version (`settings.propArtwork`).

**Architecture:** Each host either owns a local version (Arena, tunnel creator) or turns the choice off (deck releaser, Guide codex), following `docs/superpowers/specs/2026-10-07-host-prop-versions-design.md`. `PropSelectionSheet` gains the two seams the Arena and Guide need. The tunnel snapshot carries the creator's version so a saved tunnel reopens with it.

**Tech Stack:** SvelteKit, Svelte 5 runes, Vitest (jsdom logic suite and browser component suite), zod.

**Worktree:** `E:/worktrees/tka-platform/host-prop-versions`, branch `codex/host-prop-versions`. `node_modules` is a junction into `E:/tka-platform/node_modules`: never run `pnpm install` or `npm install` here, never delete `node_modules`.

**Commands (run from the worktree root):**
- Logic tests: `npx vitest run --config tests/config/vitest.config.ts <files>`
- Component tests: `pnpm exec vitest run --config tests/config/vitest.components.config.ts <name-filter>`
- `.svelte` type gate: `pnpm run check:fast` exits 1 on main with ~600 pre-existing errors. Only errors in files this branch touches count. Never run `svelte-check`.
- Commit with explicit pathspecs only: `git commit -m "..." -- <paths>`. No `git add -A`, `.` or `-u`. End messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Reference:** `versionAfterPick` and `normalizePropLook` live in `src/lib/shared/pictograph/prop/domain/prop-look.ts`; `withPickVersion` in `src/lib/shared/settings/domain/prop-version-rule.ts`. Composer's `selectProp` (`src/routes/(public)/composer/_components/ComposerExperience.svelte:149`) is the model for a local version. Existing V2 tile tests: `src/lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte.test.ts` (tile names look like `Select Triad V2 prop type`; families open with `Choose Triad style`).

---

### Task 1: PropSelectionSheet seams, deck releaser and Guide codex (no version choice)

**Files:**
- Modify: `src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte`
- Modify: `src/lib/features/choreo-card/components/deck-releaser/DeckPropSwitcher.svelte`
- Modify: `src/lib/features/choreo-card/components/deck-releaser/LoopBentoBoard.svelte` (BentoPropGrid near line 619)
- Modify: `src/routes/(public)/guide/level-1/_components/GuideCodexControls.svelte` (PropSelectionSheet near line 131)
- Modify: `src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte` (InlineAnimationPlayer near line 509)
- Test: `src/lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte.test.ts` (create)
- Test: `src/lib/features/choreo-card/components/deck-releaser/DeckPropSwitcher.svelte.test.ts` (extend)

- [ ] **Step 1: Sheet seams.** In `PropSelectionSheet.svelte`:
  - Widen `onSelect` to `(propType: PropType, look?: PropLook) => void` and make `handlePropSelect(propType: PropType, look?: PropLook)` call `look === undefined ? onSelect(propType) : onSelect(propType, look)`.
  - Add `showPropLook?: boolean` to the props (doc comment: "Turns the Version 1 / Version 2 choice off for a host whose render ignores it; see BentoPropGrid.") and pass `{showPropLook}` to `BentoPropGrid`. Undefined keeps BentoPropGrid's current default.
- [ ] **Step 2: Sheet test (write first, watch it fail).** Render `PropSelectionSheet` with `isOpen: true`, `selectedPropType: PropType.TRIAD`, `onSelect`, `propLook: "pictograph"`, `onPropLookChange`, and the settings store in a known state (read `getSettings().propArtwork` before and after). Open "Choose Triad style", click "Select Triad V2 prop type". Assert `onSelect` was last called with `(PropType.TRIAD, "model")`, `onPropLookChange` with `"model"`, and `getSettings().propArtwork` is unchanged. Second case: `showPropLook: false`; open the Triad family and assert the V2 tile is absent. If the sheet's drawer needs a viewport or responsive layout setup, copy what `BentoPropGrid.svelte.test.ts` does (`page.viewport(760, 800)`).
- [ ] **Step 3: Deck releaser.** On both `BentoPropGrid` mounts (DeckPropSwitcher and LoopBentoBoard) add `showPropLook={false}` and `propLook="pictograph"`, with one comment line on the first: deck cards print notation art (the locked render path draws only an explicit look), so the deck has no version to choose and the selected tile shows Version 1.
- [ ] **Step 4: Deck test.** Extend `DeckPropSwitcher.svelte.test.ts`: open the modal, open a family that has a V2 tile (Triad or Double Staff), assert the V2 tile is absent and no version chooser is shown.
- [ ] **Step 5: Guide codex.** In `GuideCodexControls.svelte` pass `showPropLook={false}` and `propLook="pictograph"` to `PropSelectionSheet` with a comment: codex cells draw notation, so the codex always shows Version 1. In `GuideCompanion.svelte` pass `propLook={isCodexMode ? DEFAULT_PROP_LOOK : undefined}` to the `InlineAnimationPlayer` (import `DEFAULT_PROP_LOOK` from `$lib/shared/pictograph/prop/domain/prop-look`) with a comment: in codex mode the animation matches the Version 1 cells beside it instead of the account's version.
- [ ] **Step 6: Run** the sheet and deck component tests, then `pnpm run check:fast` and confirm no errors in the touched files.
- [ ] **Step 7: Commit** the touched paths: `fix(props): deck releaser and Guide codex stop writing the account's prop version`.

### Task 2: Arena-only version

**Files:**
- Modify: `src/lib/features/arena/components/battle/ArenaPropDrawer.svelte`
- Modify: `src/lib/features/arena/components/battle/ArenaBattleView.svelte` (prop state lines 52-70, random re-picks near lines 98, 171, 186, panels near 225-249, drawer near 325)
- Modify: `src/lib/features/arena/components/battle/ArenaMatchupPanel.svelte`
- Test: `src/lib/features/arena/components/battle/ArenaPropDrawer.svelte.test.ts` (create)

- [ ] **Step 1: Drawer.** `ArenaPropDrawer` takes `propLook: PropLook` and `onPropLookChange: (look: PropLook) => void`, widens `onSelect` to `(propType, look?)`, and forwards `{propLook} {onPropLookChange}` to `PropSelectionSheet`. Fix its header comment: it changes neither the global prop nor the global version.
- [ ] **Step 2: Drawer test (first, watch it fail).** Render the drawer open with `selectedPropType: PropType.TRIAD`, `propLook: "pictograph"`, spies for `onSelect` and `onPropLookChange`. Click the Triad V2 tile. Assert `onSelect` got `(TRIAD, "model")`, `onPropLookChange` got `"model"`, and `getSettings().propArtwork` is unchanged.
- [ ] **Step 3: Battle view state.** Next to `matchupPropType` add `let matchupPropLook = $state<PropLook>(DEFAULT_PROP_LOOK);` and one setter used by every prop change:

```ts
  // A version belongs to the pick (versionAfterPick): a V2 tile sets Version 2,
  // and a different prop, including a random one, starts at Version 1.
  function setMatchupProp(prop: PropType, look?: PropLook): void {
    matchupPropLook = versionAfterPick(matchupPropType, matchupPropLook, prop, look);
    matchupPropType = prop;
  }
```

  `handlePropSelect(pt, look?)` sets `randomPropMode = false` and calls `setMatchupProp(pt, look)`. Every `matchupPropType = pickRandomPropType()` becomes `setMatchupProp(pickRandomPropType())`. The initial value stays `pickRandomPropType()` with `DEFAULT_PROP_LOOK`. Pass `propLook={matchupPropLook}` and `onPropLookChange={(look) => (matchupPropLook = look)}` to `ArenaPropDrawer`, and `propLook={matchupPropLook}` to both `ArenaMatchupPanel`s.
- [ ] **Step 4: Panel.** `ArenaMatchupPanel` takes `propLook?: PropLook` and passes `{propLook}` to `InlineAnimationPlayer`.
- [ ] **Step 5: Run** the drawer test and `pnpm run check:fast` (touched files only).
- [ ] **Step 6: Commit** the touched paths: `fix(arena): the Arena keeps its own prop version`.

### Task 3: Tunnel creator version, saved with the tunnel

**Files:**
- Modify: `src/lib/shared/sequence-viewer/tunnel/tunnel-snapshot.ts`
- Modify: `src/lib/features/create/tunnel/state/tunnel-presentation-state.svelte.ts`
- Modify: `src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte`
- Modify: `src/lib/features/create/tunnel/components/TunnelLayout.svelte` (`changeProp` near 271, settings panel near 305, `TunnelArtView` near 472)
- Modify: `src/lib/shared/sequence-viewer/components/ArtPane.svelte` (capture deps near 619)
- Modify: `src/lib/shared/sequence-viewer/tunnel/stage-tunnel-snapshot-for-viewer.ts`
- Modify: `src/lib/features/tunnel-collection/components/TunnelDetailPreview.svelte` (`TunnelArtView` near 78)
- Test: `src/lib/features/create/tunnel/state/tunnel-presentation-state.test.ts`, `src/lib/shared/sequence-viewer/tunnel/__tests__/tunnel-snapshot.test.ts`, `src/lib/shared/sequence-viewer/tunnel/__tests__/stage-tunnel-snapshot-for-viewer.test.ts`
- Test: `src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte.test.ts` (create only if the component renders in isolation with a stub controller in under ~40 lines of setup; otherwise cover the forwarding through the presentation-state tests and say so)

- [ ] **Step 1: Snapshot field.** In `TunnelSnapshot.props` add `propLook?: PropLook` with the comment "The creator's prop version. Missing (tunnels saved before versions) means Version 1." Add `propLook: z.enum(PROP_LOOKS).optional()` to the props schema. In `SnapshotDeps.settings` add `propLook?: PropLook` and allow `propLook?: PropLook` in the `updateSettings` patch type. `captureTunnelSnapshot` writes `propLook: normalizePropLook(settings.propLook)`. `applyTunnelSnapshot` includes `propLook: normalizePropLook(snap.props.propLook)` in its `settings.updateSettings` call. Keep `SNAPSHOT_VERSION` at 3: the field is optional.
- [ ] **Step 2: Snapshot tests (first).** Capture round-trips `"model"`; capture with no `propLook` writes `"pictograph"`; parsing a snapshot without the field succeeds and apply passes `propLook: "pictograph"`.
- [ ] **Step 3: Presentation state.** Add `let propLook = $state<PropLook>(normalizePropLook(initialSnapshot?.props.propLook));`. `propSettings` gets a `propLook` getter, and its `updateSettings` sets `propLook = patch.propLook` when defined (a snapshot restore is direct, no pick rule). The fallback `capture()` writes `propLook` in `props`. Expose `get propLook()` and `setPropLook(look: PropLook)`. `setPropType(propType: string, look?: PropLook)` settles the version with the same rule the account uses for a pair, so a prop already in either hand, a size twin, or a prop with no Version 2 keeps it:

```ts
    setPropType(propType: string, look?: PropLook) {
      const before = {
        leftPropType: leftPropType as PropType,
        rightPropType: rightPropType as PropType,
        catDogMode: catDog,
        propArtwork: propLook,
      };
      // existing hand assignment, unchanged
      const settled = withPickVersion(before, {
        leftPropType: leftPropType as PropType,
        rightPropType: rightPropType as PropType,
        ...(look === undefined ? {} : { propArtwork: look }),
      });
      if (settled.propArtwork !== undefined) propLook = settled.propArtwork;
      inputs.animationSettings.setCurrentPropType(leftPropType);
    },
```

- [ ] **Step 4: Presentation tests (first).** A new state at Version 1: `setPropType("triad", "model")` gives `"model"`; then `setPropType("club")` gives `"pictograph"`; `setPropType("triad", "model")` then `setPropType("bigtriad")` keeps `"model"`; then `setPropType("fan")` keeps `"model"` (Fan has no Version 2). A saved snapshot with `propLook: "model"` opens at `"model"` and `capture()` writes it back; a snapshot without it opens at `"pictograph"`.
- [ ] **Step 5: Settings panel.** `TunnelArtSettings` widens `onPropChange` to `(propType: PropType, look?: PropLook) => void`, adds optional `propLook?: PropLook` and `onPropLookChange?: (look: PropLook) => void`, and passes both to `BentoPropGrid` (undefined keeps the global writer, which the viewer's Art pane relies on). Update the comment above the grid: the creator owns its version, the viewer's Art pane edits the account's.
- [ ] **Step 6: Creator wiring.** In `TunnelLayout.svelte`: `changeProp(prop, look?)` calls `creator.presentation.setPropType(prop, look)`; the settings panel passes `propLook={creator.presentation.propLook}` and `onPropLookChange={creator.presentation.setPropLook}`; the stage `TunnelArtView` gets `propLook={creator.presentation.propLook}`.
- [ ] **Step 7: Other snapshot readers.** `ArtPane.svelte` capture deps add `propLook: settingsService.settings.propArtwork` (the viewer saves the version it draws). `stageTunnelSnapshotForViewer` adds `propArtwork: normalizePropLook(snapshot.props.propLook)` to its `settings.updateSettings` call, as an applied preset restores its version, and its test asserts it for a saved V2 and an old snapshot. `TunnelDetailPreview.svelte` passes `propLook={normalizePropLook(snap.props.propLook)}` to `TunnelArtView` so the collection preview shows the saved version, not the account's.
- [ ] **Step 8: Run** the three logic test files (and the component test if created), then `pnpm run check:fast` (touched files only).
- [ ] **Step 9: Commit** the touched paths: `fix(tunnel): the Tunnel creator keeps its own prop version and saves it with the tunnel`.

### Task 4: Integration (coordinator)

- [ ] Review both task branches' diffs, run all new and touched tests together.
- [ ] Preview from this worktree on a free non-5173 port; on desktop and phone width, with the main prop at Version 1: pick a V2 tile in the Arena and in the tunnel creator and confirm each surface draws V2 while the main Props picker still shows Version 1; confirm the deck releaser and Guide codex pickers show no V2 tiles.
- [ ] Merge local `main` in, rerun invalidated checks, stop the preview, then from `E:/tka-platform`: `npm run wt:finish -- codex/host-prop-versions --route /<verified route>`.
