---
status: active
value: 4
effort: M
remaining: "Unimplemented. This live judgment loop consumes the real-flow perception core, whose synthetic validation tooling is complete but whose real-clip validation remains open. Start only after that prerequisite is validated, then require Austen's physical camera test for game-feel acceptance."
depends_on: "2026-07-03-fable-real-flow-notation-validation-design.md"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: blocked
---
# Fable Spec — Practice Judgment Loop (Learn-by-Doing)

**Date:** 2026-07-03 · **Autonomy: FULL AUTO to build the loop + calibration; CHECKPOINT on game-feel/tuning** (taste + requires Austen to physically test with a camera) · Index: `2026-07-03-fable-dispatch-index.md`

> The retention pillar — Austen's stated end-goal for practice. The primitives are shipped; the **feedback loop that makes it a game does not exist.** The mirror is a dumb overlay that judges nothing. This spec makes the do → get-told-if-right → improve loop exist.

## Problem

The viewer play-along loop is real, but it can't tell you if you're doing it right. Today: strip + tempo + metronome + a **passive** AR mirror you eyeball yourself against. Nothing correlates your motion to the target step. The `/train` module has a MediaPipe CV pipeline, but its per-step tracking is **stubbed and not wired to the viewer strip**.

## What's built (verified)

- **Rhythm strip:** `src/lib/shared/timeline/StepStrip.svelte` (focus-locked read-ahead carousel, virtualized, pure view) + `notation-cell.ts`; wired via `PracticeLanePane.svelte` + `ViewerSplitPane.svelte`.
- **Metronome:** `src/lib/shared/audio/metronome.ts` (Web Audio), one tick per beat off the playback beat-boundary, accented downbeat (`playback-controller.svelte.ts:78,340`), `pb-sound` toggle. Locks to visuals for free.
- **AR mirror (passive only):** `CameraPreview.svelte` (`src/lib/shared/train/components/`) behind the left canvas in `ViewerSplitPane.svelte:555-577` with `backgroundAlpha=0`; `pb-mirror` toggle; camera starts only on toggle (privacy). It is a **raw flipped feed** — `mirrored={true}` hardcoded, no opacity/blend, no alignment aids.
- **Cockpit:** `PracticeSetupBar` + `PracticeBar` + `PracticeCountInOverlay` (3-2-1) + `PracticeConfigPopover`, tempo ramp (Creep/Staircase/Custom).
- **Consolidation decision (authoritative):** `docs/superpowers/specs/2026-07-01-practice-consolidation-design.md` — **viewer is the single practice home; `/train` is a component reservoir that retires LAST (P5) — do NOT delete `features/train/**`.**
- **Train CV (stubbed):** quadrant hit/miss→combo→grade→IndexedDB works, but per-step tracking is stubbed — `beatResultsJson="[]"`, `lastPerformance` never set, `isQuadrantCorrect(tolerance)` + `StoredBeatResult` defined-but-never-called.

## The hard parts (why a stronger model helps)

Timing/sync is the **already-solved easy part** (tick off the beat boundary). The unbuilt parts are model-limited:

1. **CV judgment** — frame→step correlation, timing-tolerance windows, confidence gating, and handedness/prop-path classification (blue=left/red=right) from MediaPipe landmarks. This is consolidation-spec **P2, "the long road."**
2. **Camera calibration/alignment** — `project_practice_camera_overlay` names this as the real design challenge (NOT the camera): scale/offset so reference props overlay the user's *real* props at the correct distance, plus a mirror-direction toggle and a center guide. None built.
3. **Game-feel design** — DDR-style judgment that is **not a hollow, gameable metric** (scoring was deliberately cut in `2026-06-24-viewer-practice-restore-design` for exactly this reason). The feel is the design problem.

## Fable's task

1. **Consume the perception core** from the Real-Flow Notation spec (camera → track → derive TKA motion) and extend it from recorded video to **live-motion judgment against the target step**.
2. Wire real per-step results into the viewer timeline (populate `beatResultsJson`, `lastPerformance`; call the defined-but-unused `isQuadrantCorrect`/`StoredBeatResult` or their successors).
3. Build **mirror calibration UX**: direction toggle, scale/offset, center guide, opacity/blend.
4. Design the judgment surface + progress/history so it teaches without becoming gameable.

## Open decisions (left to Fable)

- What "correct" means per step (hand path? handedness? distance? timing window? which combination) and the tolerance model.
- The judgment/feedback UX that isn't a hollow metric — the explicit design constraint from the restore spec.
- `/train` reconciliation sequencing (retire LAST, P5) — do not delete `features/train`.

## Guardrails + definition of done

- **CHECKPOINT on game-feel:** the loop must be physically tested with a camera by Austen; "it feels right" is his call. Do not claim the loop works without a runtime demo / captured evidence (`verification-protocol`).
- Reuse existing primitives (`StepStrip`, `PracticeBar`, `CameraPreview`) — do not hand-roll parallel practice UI (`never-hand-roll`).
- Preserve the privacy guarantee (camera starts only on explicit toggle).
- MCP-ground TKA domain claims; commit own changes only.

## Dependencies

**Consumes the perception core built by the Real-Flow Notation spec — sequence after it.** Same reality→TKA engine; real-flow proves it on recorded video (bounded, has ground truth), practice extends it to live judgment. Shares the CV crown-jewel effort.
