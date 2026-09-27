# Assemble Tab Audit — 2026-07-19

Full-scale audit of Create > Assemble: functionality, layout, presentation, intuitiveness, component reuse, responsiveness. Five parallel investigations (8-dimension grading, two user-reported bug root-causes, full path trace, design-system compliance review). Tracker: `features/assemble-lab` recorded B,B,A+,A,B,A+,A,A+ — but the letter grades understate it; the deterministic evidence layer can't see the functional failures below.

**Verdict: the code is mechanically clean but architecturally fractured.** Assemble is the only Create tab with two data models — the real one (`assembleBuilderState.blueSteps/redSteps`) and a derived `sequenceState` mirror rebuilt by a one-way `$effect` bridge. Almost every functional defect traces to that seam. Fuse parity requires fixing the seam, not polishing around it.

---

## Critical — data loss / silent corruption

### C1. Every step-editor edit and sequence transform silently reverts (user-reported: delete beat)

The bridge (`assemble-tab-state.svelte.ts:135-190`) rebuilds `sequenceState.currentSequence` from builder arrays on every tick, and reads `sequenceState.currentSequence` itself (line 165) — so any write to the mirror re-triggers the rebuild that undoes it. Delete plays its animation optimistically (`sequence-step-operations.ts:254`) then gets reverted.

Already diagnosed twice by past sessions — `WorkspacePanel.svelte:166-173` (keyboard delete) and `clear-sequence-workflow.ts:74-82` both carry explanatory comments and correct detours to `builderState`. The fix was never propagated. Still broken on Assemble, confirmed unguarded (zero `activeTab === "assemble"` hits in either file):

- `StepEditorCoordinator.svelte` — delete (:337-359), turns (:212-281), rotation (:296-317), orientation (:319-335), duration (:386-400), path-shape (:402-414), beta-swap (:416-421), arrow adjustments (:423-449)
- `sequence-actions-orchestrator.ts:53-85` — mirror, swap colors, flip, invert, rotate, rewind, shift-start

Fix direction: `AssembleState` has no arbitrary-index mutator (only append/undo/truncate/reset). Either add `updateStepAt(index, patch)` + per-action routing, or make the bridge bidirectional (translate mirror writes back into builder steps). Bidirectional kills the whole bug class; per-site branches are the whack-a-mole that got us here.

### C2. Reload wipes all Assemble progress

`initializeAssembleTab()` (`assemble-tab-state.svelte.ts:213-228`) restores the persisted sequence — then the bridge fires, sees empty builder arrays (no reverse `StepData[]→BuilderStep[]` converter exists anywhere), and `setCurrentSequence(null)`s the restore on the next tick. Auto-save is live (500ms debounce), so the save/erase round-trip is real: progress persists, reload destroys it.

### C3. Rotation direction unreachable for the first motion (user-reported)

`rotationDirection`/`turnCount` are manual pre-set fields consumed by the NEXT destination click (`assemble-state.svelte.ts:96-98,160`). But both control surfaces gate on `phase === "building"` — desktop `BuilderTurnBar.svelte:45,125`, mobile `BuilderControls.svelte:311` — and "building" is only reachable AFTER the first motion committed. Every hand's first motion silently locks CW / 0 turns. During "placing" the bar shows only orientation pills, exactly what the user saw. No copy anywhere mentions rotation. Fix: render rotation/turns controls during "placing" too, both surfaces (the phase→controls logic is duplicated across the two files — consolidate while touching it).

### C4. Solo-prop save corrupts motion type

`BuilderControls.svelte:91-94` `deriveMotionType()` returns PRO for every non-static/non-dash shift, no HASH branch. Its "renderer will recalculate" comment is false — `step-deriver.ts:93` passes `motionType` through untouched. ANTI shifts and hash motions persist permanently as PRO. Fix: export `resolveMotionType` from `builder-step-converter.ts`, call with `builderState.gridMode`.

---

## Serious — functional

| # | Defect | Location |
|---|---|---|
| S1 | Numpad Enter bypasses `canFinishHand` — jump to terminal "complete" with 0/mismatched steps; `canUndo` false there, so only escape is full reset | `assemble-keyboard-dispatcher.ts:128-130`; mouse path correctly gated `BuilderControls.svelte:415,454` |
| S2 | `switchToHand` missing animating-phase guard (`handlePointClick`/`undoStep` have it) — mid-animation switch clobbered when `addMotion` resolves | `assemble-state.svelte.ts:384-400` vs 198, 229 |
| S3 | Beat cap silently swallows clicks for logged-in users (nudge modal guest-only; `checkBeatCap` still blocks) — reads as app unresponsive. Intentional per comment, still zero feedback | `AssembleToolPanel.svelte:39,48-60,148` |
| S4 | Solo-prop save failure invisible — `soloPropSaveError` set, never rendered; console.error only | `BuilderControls.svelte:59,110-141` |
| S5 | Tab-init `error`/`hasError` exposed, zero consumers — persistence-init failure fully silent | `assemble-tab-state.svelte.ts:224-239` |
| S6 | `word` hardcoded `""` on every sync; save panel survives via letter-join fallback, anything reading `sequence.word` directly sees blank | `assemble-tab-state.svelte.ts:180`; fallback `save-panel-state.svelte.ts:120-134` |

## Serious — design system / layout / responsive

| # | Defect | Location |
|---|---|---|
| D1 | Orientation pills + turn pills = exactly-one-active groups hand-rolled as raw `role="radio"` buttons, independently duplicated in **3 files**, instead of `SegmentedControl` (chip-primitives.md names this exact case) | `BuilderTurnBar.svelte:98-163`, `BuilderControls.svelte:282-373`, `OrientationExplainer.svelte:207-220` |
| D2 | `65vh` grid width + non-shrinking flex siblings overflows portrait desktop-width viewports (810×1080 needs ~1054px, gets ~810px), clipped silently by `overflow:hidden` | `AssembleToolPanel.svelte:184-206`; magic number duplicated `InteractiveGrid.svelte:708` |
| D3 | Zero container queries in the whole tree — parent `CreationToolPanelSlot.svelte:212-227` exposes `container-name: tool-panel` specifically for this; Fuse queries its own container in every component | entire `assemble-lab` |
| D4 | Idle→building transition is an abrupt reflow; the `view-transition-name: assemble-grid` CSS meant to smooth it is dead — `startViewTransition()` never wraps this state change | `AssembleToolPanel.svelte:79-89,205,239-249` |
| D5 | Touch-target floor violations: mobile "?" help 36×36 (`BuilderControls.svelte:650-666`), keyboard toggle 36×36 (`BuilderInstructionHeader.svelte:300-316`) | as cited |
| D6 | Hand-rolled popover (manual rect/backdrop/dismiss) vs bits-ui `Popover` (Fuse BPM + 3 other Create sites); hand-rolled `.action-btn` vs `PanelButton`/`ActionButton`; zero `--settings-*` spacing/radius tokens (Fuse uses throughout) | `BuilderControls.svelte:158-165,273-374,401-475` |
| D7 | Toggle chips hand-rolled 3× with inconsistent ARIA (`role="switch"` vs `aria-pressed`) instead of `FilterChipBase` | `AssembleIdlePanel.svelte:64-86`, `GridModePicker.svelte:41-96` |

## Moderate / intuitiveness

- **No visible sequence history in the live tab** — `StepStrip.svelte` (thumbnail strip of built steps) sits one file away, wired only into the dead lab module. Users see step-count badges, never what they built. Big approachability gap; also the strip's local converter copy is stale/buggy (missing HASH + FLOAT cases) if revived — use `builder-step-converter.ts`.
- Mobile: no persistent rotation-direction indicator; keyboard-mode toggle unreachable mid-build; keyboard-mode chip offered on touch devices that have no numpad.
- Icon-only buttons rely solely on `aria-label` (no tooltip primitive project-wide — not Assemble-specific).
- Arc/orientation math duplicated between `assemble-state.svelte.ts:449-495` and `svg-prop-animator.ts:22-70` ("mirror" comment) — desync risk between animation and recorded state.
- Dead code: `hand-path-motion-calculator.ts:156,174-175` (`% 4` breaks SKEWED mode; zero callers), `isBlueComplete` (zero consumers, misleading name), phase-copy switch duplicated in 2 files, mobile header CSS positioning an always-empty container.
- Confirmed dead for live tab: `AssembleLabModule.svelte`, `ReplayTransport`, `TimingControlsPanel`, `timing-state`, `timing-interpreter`, `StepStrip` — only importer is `routes/test/numpad-lab`.

## What's genuinely good (preserve)

- 100% Svelte 5 runes, zero legacy patterns. Token-clean colors (no hex, no theme-var shadowing). `{@html}` sites documented + verified safe. 64px grid hit targets with keyboard parity. `GridModePicker` correctly uses `SegmentedControl`. Reserved-space discipline in spots (`mode-desc` min-height + tabular-nums, opacity-not-display hand switcher, `lastActiveContent` swap guard). Idle-panel copy clear. `OrientationExplainer` reuses real `PictographContainer`. Undo + keyboard-delete + clear correctly detour the bridge (the pattern the rest never got).

## Remediation shape (suggested order)

1. **Seam fix** — bidirectional bridge or builder-side mutators + routing (kills C1; unlocks step editor entirely). Decide architecture first; this is the Fuse-rework-scale piece.
2. **Reload persistence** — reverse hydrator or restore gate (C2).
3. **Rotation in placing phase** (C3) + numpad finish gate (S1) + solo-prop motion type (C4). Small, independent.
4. **Design-system sweep** — SegmentedControl/FilterChipBase/bits-ui Popover/PanelButton/settings tokens/44px targets (D1, D5-D7).
5. **Layout** — container queries + kill 65vh; wire or remove view transition (D2-D4).
6. **Approachability** — step history strip in live tab, rotation indicator on mobile, cap feedback (S3), error surfacing (S4-S5).
7. **Dead-code purge** — orphaned lab components + latent-bug helpers.

---

## Status — 2026-09-27 release pass

Hands-on check on the live tab at 375×667, 390×844, 810×1080, 960×412, 1440×900 and 3840×2160 before releasing Assemble to accounts:

- Fixed and verified at runtime: C1 (step-editor turns edit persists and cascades), C2 (reload restores both hands), C3 (orientation and turns are offered while placing), the step history (the Create workspace shows each step as a pictograph), D2 (no clipping at 810×1080), D4 (the grid holds its position from idle to building; the dead view-transition CSS is gone). Delete, undo and Complete behave as in Construct.
- Fixed in this pass: the removal undo label counted from zero ("Remove step 0 and 1 subsequent steps"); touch-only screens showed an empty "Input" heading where the numpad controls hide.
- Still open: on short phones (667px tall) the workspace gives the step history about 48px thumbnails, because the shared workspace button rows take most of its 30% share. More height would squeeze the grid into the hand picker, so it needs a layout decision rather than a ratio change.
- Release: Assemble is open to every signed-in account; guests see it on the front door with a Free account label.
