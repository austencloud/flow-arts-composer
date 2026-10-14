# Practice Setup → Bottom Bar — Implementation Plan

> Executes `docs/superpowers/specs/2026-06-29-practice-setup-bottom-bar-design.md`.
> Single-session, interdependent edits (props flow host→bar), so implemented inline
> (not subagent fan-out). Verify with `npm run check` + DevTools geometry sampling.

**Goal:** Move practice tempo config from the right-column card to the bottom bar;
lane fills the right column in both phases; canvas fixed 50% (no jar at Start).

---

### Task 1: Add bindable `open` to `PracticeConfigPopover`

**File:** `src/lib/shared/sequence-viewer/components/PracticeConfigPopover.svelte`

- Change `let open = $state(false)` → bindable prop: add `open = $bindable(false)`
  to Props (type `open?: boolean`) and the destructure. Keep the gear trigger.
- Lets `PracticeSetupBar` open it when Custom is selected.

### Task 2: Create `PracticeSetupBar.svelte`

**File (create):** `src/lib/shared/sequence-viewer/components/PracticeSetupBar.svelte`

- Props: `config: Partial<TempoPracticeConfig>`, `onSetConfig`, `onStart`.
- Move the preset logic verbatim from `PracticeSetupPane`: `PresetId`, `PRESETS`,
  `matchPreset`, `selected` state, `pick`, `presetHint`.
- Layout (horizontal, `height: 100%`, vertically centered, ~128px host):
  `[ SegmentedControl size="sm" options=PRESETS ]  <span hint>  [ PracticeConfigPopover ]  [ Start button ]`
- Custom: `let cfgOpen = $state(false)`; in `pick`, when `p === "custom"` set
  `cfgOpen = true`; render `<PracticeConfigPopover {config} onUpdate={onSetConfig} bind:open={cfgOpen} />`.
- Start button: reuse `.setup-start` visual (play icon + "Start practice"),
  `onclick={onStart}`. Keep the reduced-motion guard for the breathing glow.
- No "Practice / Pick how the tempo climbs" title.

### Task 3: `ViewerSplitPane` — right column = lane always

**File:** `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte`

- In the preview column, replace the `practice-deck` conveyor (both `deck-pane`s)
  with a single lane container shown when `practiceActive`, keeping the
  `in/out:slideInRight` reveal:
  ```svelte
  {#if practiceActive}
    <div class="practice-deck" in:slideInRight={{ duration: DECK_MS }} out:slideInRight={{ duration: DECK_MS }}>
      <PracticeLanePane sequence={...} currentStep={...} {bpm} cellSize={practiceCellSize} bluePropType={...} redPropType={...} onSeek={...} />
    </div>
  {/if}
  ```
- Remove `import PracticeSetupPane`. Remove the `.deck-pane`/`.deck-pane.setup/.lane`
  conveyor CSS (the deck is now a single pane; keep `.practice-deck` absolute+inset).
- Remove now-unused props: `practiceConfig`, `onPracticeSetConfig`, `onPracticeStart`
  (type + destructure + defaults). `practiceRunning` is still used elsewhere (keep).

### Task 4: Bottom-bar conveyor — `SequenceViewerDrawerHost`

**File:** `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte`

- The `.practice-bar-rise`: reserved (height) when `practiceActive` (unchanged);
  but it now slides to `translateX(0)` when `practiceActive` (was `practiceRunning`)
  so the config shows in setup. Replace `class:up={ctx.practiceRunning}` →
  `class:up={ctx.practiceActive}`.
- Inside, two conveyor panes (mirror the deck), each absolute inset:0:
  ```svelte
  <div class="bar-pane config" class:active={!ctx.practiceRunning} inert={ctx.practiceRunning}>
    <PracticeSetupBar config={ctx.practiceState.userConfig}
      onSetConfig={ctx.handlePracticeSetConfig} onStart={ctx.handlePracticeStart} />
  </div>
  <div class="bar-pane cockpit" class:active={ctx.practiceRunning} inert={!ctx.practiceRunning}>
    <PracticeBar ... (existing props) />
  </div>
  ```
- CSS: `.bar-pane{position:absolute;inset:0;transition:transform var(--ws-dur) var(--ws-ease);will-change:transform}`
  `.bar-pane.config{transform:translateX(-100%)} .bar-pane.config.active{transform:translateX(0)}`
  `.bar-pane.cockpit{transform:translateX(100%)} .bar-pane.cockpit.active{transform:translateX(0)}`
  reduced-motion → `transition:none`.
- Import `PracticeSetupBar`. The `.practice-bar-rise` must be `position:relative`
  (it already is `overflow:hidden`; add `position:relative` so panes anchor).
- `inert` on the outer `.practice-bar-rise` was `!practiceRunning` — change to
  `!practiceActive` (the whole bar is interactive in both phases; per-pane inert
  handles which side).

### Task 5: Bottom-bar conveyor — route `+page.svelte`

**File:** `src/routes/sequence/[id]/+page.svelte`

- Same structure as Task 4 against this file's `.practice-bar-rise` (line ~727):
  `up` on `practiceActive`, two `.bar-pane`s (config = `PracticeSetupBar`, cockpit =
  `PracticeBar`), per-pane `inert`, the conveyor CSS, `position:relative` on
  `.practice-bar-rise`, import `PracticeSetupBar`. Config props already available
  via `ctx` (it passes them to ViewerSplitPane today; repoint to the bar).
- Remove the now-unused `practiceConfig`/`onPracticeSetConfig`/`onPracticeStart`
  passed to `<ViewerSplitPane>` (lines ~664-666).

### Task 6: Delete `PracticeSetupPane.svelte`

**File (delete):** `src/lib/shared/sequence-viewer/components/PracticeSetupPane.svelte`
- Confirm zero remaining imports (grep) after Tasks 3–5.

### Task 7: Verify

- `npm run check` → 0 errors in touched files (ignore unrelated concurrent churn).
- DevTools: enter practice → bottom bar shows config (segmented + Start), right
  column shows lane, canvas at 50%. Sample canvas box; click Start; re-sample —
  canvas box unchanged (no jar). Cockpit present after Start. Reduced-motion snaps.
