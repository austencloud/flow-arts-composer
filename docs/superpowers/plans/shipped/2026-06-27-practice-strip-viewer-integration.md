# Practice Strip — Viewer Integration Implementation Plan (Practice Rehaul · Phase A.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When focused practice is active, replace the viewer's side-by-side notation preview with the read-ahead `BeatStrip` lane (reusing the viewer's existing animation canvas), with a user-adjustable canvas⇄lane split and read-ahead zoom, beat-pulse, and tap-a-cell-to-seek.

**Architecture:** Reuse `ViewerSplitPane`'s persistent left canvas. Add a localized `practiceActive` branch: its right pane renders a thin new `PracticeLanePane` (which builds cells + renders `BeatStrip`) instead of the `ChoreoCard` preview, and the grid columns are driven by `canvasFraction` from a `createPracticeViewPrefs()` store. The cockpit bar (already landed in the hosts) is untouched and stacks below as today. No second canvas/engine — playback state stays owned by the orchestrator.

**Tech Stack:** Svelte 5 (runes), SvelteKit. Reuses Phase A.1: `BeatStrip.svelte`, `buildNotationCells`, `createPracticeViewPrefs()`, `SegmentedControl`. Spec: `docs/superpowers/specs/2026-06-27-practice-strip-mode-design.md`.

**Key decision (refined from the seam exploration):** The spec floated a separate `PracticeStage` host-swap. The current code shows `ViewerSplitPane` owns the persistent canvas and the cockpit edits live in the HOSTS — so a host-swap would (a) re-init the canvas on every practice enter/exit (flicker) and (b) collide with the cockpit's host edits. Instead we branch *inside* `ViewerSplitPane`'s right pane: canvas is reused (no flicker), and there is **zero overlap** with the cockpit's host-level edits. `ViewerSplitPane` is not edited by the cockpit spec.

**⚠️ In-flux files:** `ViewerSplitPane.svelte`, `SequenceViewerDrawerHost.svelte`, `routes/sequence/[id]/+page.svelte`, `PracticeConfigPopover.svelte`, and `SequenceViewerOrchestrator.svelte` may be mid-edit by the cockpit-bar work. **Every task that touches them MUST start by re-reading the current file** and locating anchors by content, not the line numbers cited here (captured 2026-06-27). If an anchor is gone/changed, stop and report.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/lib/shared/sequence-viewer/components/PracticeLanePane.svelte` | Thin: build cells from the sequence + render `BeatStrip` with prefs-driven zoom + seek mapping | New |
| `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte` | When `practiceActive`: right pane → `PracticeLanePane`; grid columns from `canvasFraction`; thread the new props | Modify |
| `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` | Own a `createPracticeViewPrefs()` instance; expose it + `practiceViewPrefs` on the context; pass through hosts | Modify |
| `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte` | Pass `practiceActive` + `practiceViewPrefs` + seek into `ViewerSplitPane` | Modify |
| `src/routes/sequence/[id]/+page.svelte` | Same prop pass-through | Modify |
| `src/lib/shared/sequence-viewer/components/PracticeConfigPopover.svelte` | Add split-preset (`SegmentedControl`) + read-ahead-depth stepper rows wired to the prefs store | Modify |

No new state machine. No edits to `BeatStrip.svelte`, `PracticeBar.svelte`, or the cockpit host wiring.

---

## Task 1: `PracticeLanePane.svelte` — the read-ahead lane

**Files:**
- Create: `src/lib/shared/sequence-viewer/components/PracticeLanePane.svelte`

A thin presentational wrapper: builds `NotationCell[]` from the sequence and renders `BeatStrip` with prefs-driven `cellSize`, `beatPulse`, and a seek callback. Owns no playback. This keeps `ViewerSplitPane`'s edit to a single element.

- [ ] **Step 1: Write the component**

```svelte
<!--
  PracticeLanePane.svelte

  The read-ahead lane shown in place of the side-by-side preview during focused
  practice. Pure wrapper: derives cells from the sequence and renders the shared
  BeatStrip with prefs-driven zoom + beat-pulse + tap-to-seek. No playback ownership
  (the viewer orchestrator owns currentStep/bpm and the seek).
-->
<script lang="ts">
  import BeatStrip from "$lib/shared/timeline/BeatStrip.svelte";
  import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    sequence,
    currentStep,
    bpm,
    cellSize,
    bluePropType = null,
    redPropType = null,
    onSeek = null,
  }: {
    sequence: SequenceData | null | undefined;
    /** Float step from playback (integer step + fractional progress). */
    currentStep: number;
    bpm: number;
    cellSize: number;
    bluePropType?: PropType | null;
    redPropType?: PropType | null;
    /** Jump playback to a step (0 = start position, 1..N = beats). */
    onSeek?: ((stepNumber: number) => void) | null;
  } = $props();

  const cells = $derived(buildNotationCells(sequence));
</script>

<div class="practice-lane">
  <BeatStrip
    {cells}
    {currentStep}
    {bpm}
    {cellSize}
    {bluePropType}
    {redPropType}
    beatPulse={true}
    onCellClick={onSeek}
  />
</div>

<style>
  .practice-lane {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.25);
  }
</style>
```

- [ ] **Step 2: Type-check (filtered; ignore the ~55 pre-existing unrelated errors)**

Run: `npm run check:fast 2>&1 | tee /tmp/lane.log; grep -i "PracticeLanePane" /tmp/lane.log || echo "LANE CLEAN"`
Expected: `LANE CLEAN`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(practice): PracticeLanePane — read-ahead lane wrapping BeatStrip" -- src/lib/shared/sequence-viewer/components/PracticeLanePane.svelte
```

---

## Task 2: Orchestrator — own + expose the practice view-prefs

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte` (the `OrchestratorContext` provider; `practiceActive` already lives on it)

**RE-READ FIRST.** Locate the context object that exposes `practiceActive`, `bpmLocal`, `handleProgressBarSeek`, `currentStep`/`currentStepLocal` (the float), and `effectiveSequence`. Add the prefs store alongside.

- [ ] **Step 1: Import + instantiate the prefs store**

Add the import:
```ts
import { createPracticeViewPrefs } from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";
```
Instantiate once (near the other `create*` state in the orchestrator script):
```ts
const practiceViewPrefs = createPracticeViewPrefs();
```

- [ ] **Step 2: Expose it on the context object**

Add `practiceViewPrefs` to the context value the orchestrator provides (the same object that already carries `practiceActive`/`bpmLocal`). Add to its TS type:
```ts
practiceViewPrefs: import("$lib/shared/sequence-viewer/state/practice-view-prefs.svelte").PracticeViewPrefs;
```
and to the provided value: `practiceViewPrefs,`.

- [ ] **Step 3: Type-check**

Run: `npm run check:fast 2>&1 | tee /tmp/orch.log; grep -iE "SequenceViewerOrchestrator|practice-view-prefs" /tmp/orch.log || echo "ORCH CLEAN"`
Expected: `ORCH CLEAN`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(practice): expose practiceViewPrefs on the viewer context" -- src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
```

---

## Task 3: `ViewerSplitPane` — render the lane when practicing

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte`

**RE-READ FIRST.** From the 2026-06-27 read: the 2D animation pane (`AnimatorCanvas`) is the persistent left pane (~lines 456-517); the right/preview pane (`ChoreoCard` + alternates) is ~lines 610-764; the grid `grid-template-columns` is set across media queries (~lines 790-1121); the seek callback is `onProgressBarSeek` (prop). `ViewerSplitPane` does NOT currently receive `practiceActive`.

- [ ] **Step 1: Add props for practice mode**

Add to `ViewerSplitPane`'s `$props()`:
```ts
practiceActive?: boolean;
practiceCellSize?: number;     // from prefs.cellSize
practiceCanvasFraction?: number; // from prefs.canvasFraction (0..1)
```
Default `practiceActive = false`, `practiceCellSize = 72`, `practiceCanvasFraction = 0.38`.

- [ ] **Step 2: Import the lane**

```ts
import PracticeLanePane from "./PracticeLanePane.svelte";
```

- [ ] **Step 3: Swap the right pane when practicing**

In the right/preview pane subtree, wrap the existing preview content so that when `practiceActive`, it renders the lane instead. Locate the preview pane container (the one that holds `ChoreoCard` with `highlightedStepIndex`) and branch at its top:
```svelte
{#if practiceActive}
  <PracticeLanePane
    sequence={playback.animationState.sequenceData}
    currentStep={playback.currentStep}
    {bpm}
    cellSize={practiceCellSize}
    bluePropType={propRendering.bluePropType}
    redPropType={propRendering.redPropType}
    onSeek={onProgressBarSeek ?? null}
  />
{:else}
  <!-- existing preview pane content (ChoreoCard / alternates) unchanged -->
{/if}
```
Keep the existing preview markup intact inside the `{:else}`.

- [ ] **Step 4: Drive the split from `practiceCanvasFraction`**

Add a practice-only grid override so the canvas/lane split follows the preset. After the existing grid rules, add a class + inline custom property. On the grid container, add `class:practice={practiceActive}` and `style="--canvas-frac: {practiceCanvasFraction};"`. Then in `<style>`:
```css
  /* Practice split: canvas vs read-ahead lane, driven by the preset. Desktop +
     mobile-landscape are columns; mobile-portrait stacks rows. */
  .split-grid.practice {
    grid-template-columns: calc(var(--canvas-frac) * 100%) 1fr;
  }
  @media (max-width: 767px) and (orientation: portrait) {
    .split-grid.practice {
      grid-template-columns: 1fr;
      grid-template-rows: calc(var(--canvas-frac) * 100%) 1fr;
    }
  }
```
(Use the actual grid container's class name found in the file in place of `.split-grid`.)

- [ ] **Step 5: Type-check + visual smoke (controller will do the full visual gate)**

Run: `npm run check:fast 2>&1 | tee /tmp/vsp.log; grep -i "ViewerSplitPane" /tmp/vsp.log || echo "VSP CLEAN"`
Expected: `VSP CLEAN`. Do NOT rely on the dev server (unrelated Vite overlay) — the coordinator runs the visual gate.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(practice): ViewerSplitPane renders the read-ahead lane when practicing" -- src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte
```

---

## Task 4: Hosts — pass practice props into `ViewerSplitPane`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte` (the `<ViewerSplitPane ... />` call, ~line 546)
- Modify: `src/routes/sequence/[id]/+page.svelte` (the `<ViewerSplitPane ... />` call, ~line 626)

**RE-READ FIRST. ⚠️ Cockpit seam:** these hosts also render `PracticeBar` + gate the rail on `ctx.practiceActive` (the cockpit edits). Touch ONLY the `<ViewerSplitPane>` prop list — do not alter the `PracticeBar` block, the rail gating, or the header.

- [ ] **Step 1: Add the three props to BOTH `<ViewerSplitPane>` calls**

```svelte
  practiceActive={ctx.practiceActive}
  practiceCellSize={ctx.practiceViewPrefs.cellSize}
  practiceCanvasFraction={ctx.practiceViewPrefs.canvasFraction}
```
(Leave the existing props, including `onProgressBarSeek`, as they are.)

- [ ] **Step 2: Type-check**

Run: `npm run check:fast 2>&1 | tee /tmp/hosts.log; grep -iE "SequenceViewerDrawerHost|sequence/\[id\]" /tmp/hosts.log || echo "HOSTS CLEAN"`
Expected: `HOSTS CLEAN`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(practice): hosts pass practice view-prefs into ViewerSplitPane" -- src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte src/routes/sequence/[id]/+page.svelte
```

---

## Task 5: `PracticeConfigPopover` — split + read-ahead controls

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/PracticeConfigPopover.svelte`

**RE-READ FIRST.** From the 2026-06-27 read: the config body (~lines 81-108) renders `{@render stepper(...)}` rows for ramp settings + a goal toggle. It receives the practice config + an update handler. It needs access to `practiceViewPrefs` (pass it in from the cockpit `PracticeBar`/host that mounts the popover — confirm the mount site; if the popover is mounted by `PracticeBar`, add a `viewPrefs` prop threaded from `ctx.practiceViewPrefs`).

- [ ] **Step 1: Accept the prefs store**

Add a prop:
```ts
viewPrefs: import("$lib/shared/sequence-viewer/state/practice-view-prefs.svelte").PracticeViewPrefs;
```
Import the presets + the `SegmentedControl`:
```ts
import { SPLIT_PRESETS } from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";
import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte";
```

- [ ] **Step 2: Add a "Stage" section to the config body**

After the ramp steppers (after the "BPM per speed-up" stepper, before the goal toggle), add:
```svelte
  <div class="config-row config-stage">
    <span class="config-label">Canvas / lane</span>
    <SegmentedControl
      options={SPLIT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
      value={viewPrefs.splitPreset}
      onchange={(v) => viewPrefs.setSplitPreset(v)}
      size="sm"
      color="accent"
    />
  </div>
  {@render stepper(
    "Read ahead",
    viewPrefs.readAheadDepth,
    (d) => viewPrefs.setReadAheadDepth(d),
    1,
    3,
  )}
```
(Match the existing `stepper` snippet's parameter signature — RE-READ it; the args above are `label, value, onChange, min, max`. Adjust to the actual snippet shape found in the file.)

- [ ] **Step 3: Thread `viewPrefs` from the mount site**

Wherever `<PracticeConfigPopover ... />` is rendered (likely inside `PracticeBar.svelte` — RE-READ to confirm; if so, `PracticeBar` already receives the context or props it needs), pass `viewPrefs={ctx.practiceViewPrefs}` (or thread a `viewPrefs` prop through `PracticeBar` from the host). **If this requires editing `PracticeBar.svelte` (a cockpit file), STOP and report the seam** — coordinate rather than edit it unilaterally; an alternative is mounting the popover's view-pref section from a small separate trigger you own.

- [ ] **Step 4: Type-check**

Run: `npm run check:fast 2>&1 | tee /tmp/pop.log; grep -iE "PracticeConfigPopover|PracticeBar" /tmp/pop.log || echo "POPOVER CLEAN"`
Expected: `POPOVER CLEAN`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(practice): split-preset + read-ahead controls in the practice config popover" -- src/lib/shared/sequence-viewer/components/PracticeConfigPopover.svelte
```
(Add `PracticeBar.svelte` to the pathspec ONLY if Step 3 required editing it AND the seam was cleared.)

---

## Final verification (controller-run visual gate)

- [ ] **Full type-check**: `npm run check > /tmp/a2.log 2>&1; grep -iE "PracticeLanePane|ViewerSplitPane|PracticeConfigPopover|practice-view-prefs|SequenceViewerOrchestrator|sequence/\[id\]" /tmp/a2.log || echo "A2 FILES CLEAN"`.
- [ ] **DevTools, iPhone SE + desktop**: open a sequence in the viewer, enter Practice. Confirm:
  - the side-by-side preview is replaced by the sliding read-ahead lane (gold focus frame center, neighbors flanking), the **animation canvas did NOT re-init/flicker** on enter (reused), and the cockpit bar is still docked below.
  - The config popover's "Canvas / lane" segmented control re-flows the split; "Read ahead" changes how many upcoming moves show; both **persist across reload** (`tka-practice-view` in localStorage).
  - The focus frame **beat-pulses** on each step at the set BPM; off under `prefers-reduced-motion`.
  - **Tapping a lane cell seeks** playback to that step.
  - Exit Practice → the side-by-side preview returns, canvas intact.
- Record screenshots + the localStorage check in the task notes.

---

## Self-Review (plan author)

- **Spec coverage:** strip replaces side-by-side ✓ (T3), reuse existing canvas ✓ (T3 branch, not host-swap), adjustable split ✓ (T3 grid var + T5 control), read-ahead zoom ✓ (cellSize via prefs, T2/T5), beat-pulse ✓ (T1 `beatPulse=true`), seek ✓ (T1/T3 `onSeek`), persistence ✓ (Phase A.1 store, T2), config controls ✓ (T5), cockpit untouched ✓ (T4/T5 seam guards), scoring/audio out ✓ (not present).
- **Type/name consistency:** `practiceViewPrefs` (orchestrator/context) → `ctx.practiceViewPrefs.cellSize`/`.canvasFraction`/`.splitPreset`/`.readAheadDepth`/`.setSplitPreset`/`.setReadAheadDepth` (Phase A.1 store API) → `practiceCellSize`/`practiceCanvasFraction` props (ViewerSplitPane) → `cellSize` prop (PracticeLanePane → BeatStrip). `onProgressBarSeek` (existing seek) → `onSeek` (PracticeLanePane) → `onCellClick` (BeatStrip). Consistent.
- **In-flux honesty:** every host/ViewerSplitPane/popover task opens with RE-READ + content-anchored edits + an explicit STOP-and-report if the cockpit seam (PracticeBar) would be touched. No brittle line-number edits.
- **Placeholder scan:** the only deferred specifics are the actual class name of ViewerSplitPane's grid container and the exact `stepper` snippet signature — both explicitly flagged as "use the real one found on RE-READ," which is correct for content-anchored edits against an in-flux file, not a hand-wave.

## Execution note

This plan edits four in-flux, cockpit-adjacent files. Prefer **subagent-driven execution** with a RE-READ at the top of every integration task, and a controller-run visual gate at the end (the dev server has an unrelated Vite overlay that must be dismissed to verify). If the cockpit-bar work is still mid-flight on the hosts, land Tasks 1-3 (lane + ViewerSplitPane + orchestrator — no host-content collision) first, then Tasks 4-5 once the hosts are quiescent.
