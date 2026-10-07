---
status: active
value: 2
effort: S
remaining: Recheck the six deferred effects items against current source; distinguish the fixed, deleted, and three still-open cases.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Effects Unification: Deferred Items Backlog

> **DRIFT WARNING — 2026-08-02.** Of 6 items: 1 fixed, **2 moot** (referenced code deleted), 3 genuinely open
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


Living doc. Items surfaced during Phase 1a review that were correctly deferred (not blocking). Each should be addressed before Phase 3 (retiring the legacy `EffectsSettingsPanel`), but order is flexible.

Last updated: 2026-04-15.

---

## 1. Crackle mode 3D parity

**Problem.** In Zap crackle mode, the 2D renderer draws bolts radiating from all 4 tip endpoints (blue positive, blue negative, red positive, red negative). The 3D path only crackles from `start` — `ElectricityArc.svelte` is wired one-way, so only 2 endpoints radiate in 3D vs 4 in 2D.

**Options.**
- **A.** Mount 4 `ElectricityArc` instances in crackle mode (one rooted at each tip), not 2. Requires `EffectsLayer.svelte` mode-aware mounting.
- **B.** Teach `ElectricityArc.svelte` to radiate from both endpoints internally when in crackle mode. Single component, fewer scene-graph nodes, but the component grows more complex.

**Recommendation.** Option A. Scene-graph additions are cheap; component complexity is costlier. The mounting logic is already conditional on mode — extending it is mechanical.

**Where.** `src/lib/shared/3d/effects/EffectsLayer.svelte`.

**Phase 1b note (2026-04-17).** With the per-hand `leftColor`/`rightColor` split, the 3D path now uses a per-pair color split: positive-pair takes `leftColor`, negative-pair takes `rightColor`. This is a documented compromise — it surfaces per-hand color in 3D arc mode without a custom shader, but in crackle mode the per-pair split is not the same as per-origin coloring. Option A's four-instance refactor would also restore true per-origin (and therefore per-hand) coloring in 3D crackle mode.

---

## 2. FireTipTracker output-array aliasing

**Problem.** `FireTipTracker.update()` returns a tip-position array that is reused across frames (perf optimization). When fire errors and `reset()` fires mid-frame, the shared array is zeroed — but zap consumed the same reference in the same frame tick and renders with zeroed positions for one frame (visible as a single-frame flash at origin).

**Options.**
- **A.** Defer the `reset()` to end-of-frame.
- **B.** Return a shallow-copied array from `update()`, accepting the allocation cost (once per frame is negligible).

**Recommendation.** Option B. The allocation cost is trivial (a single `[...arr]`); the correctness win is absolute. Aliasing bugs across effect systems will multiply as Phase 1b/1c/1d land.

**Where.** `src/lib/shared/animation-engine/services/implementations/FireTipTracker.ts`.

---

## 3. `isAnyDarkModeEffectActive()` should include zap

**Open question for Austen.** The utility `isAnyDarkModeEffectActive()` returns true for effects that look best against a dark background. It currently lists fire / charcoal / led / trails but omits zap.

**Ask Austen:** Should enabling zap auto-trigger dark mode (as fire does)? Visually, lightning is dramatically more legible against dark, so the answer is probably yes — but it's a product call.

**Where.** Wherever `isAnyDarkModeEffectActive` lives. Grep for the function name.

---

## 4. Sequence viewer doesn't call `setEffectsConfigState()` on its engine

**Problem.** Effects Lab was wired in Phase 1a (`EffectsLabPlaybackHost.svelte` creates an `EffectsConfigState` and passes it to `AnimatorCanvas`). The sequence viewer's playback path was not. Result: when a user views a sequence with Zap enabled, the renderer receives default Zap params regardless of what the user picked in Customize.

**Fix.** 3 lines in `ViewerSplitPane.svelte` (or wherever the viewer mounts its `AnimatorCanvas`):

```ts
import { createEffectsConfigState, setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";

const effectsConfigState = createEffectsConfigState();
setEffectsConfigContext(effectsConfigState);
```

Then pass `effectsConfigState` as a prop to `AnimatorCanvas`. Same three-line pattern as `EffectsLabPlaybackHost.svelte`.

**Caveat.** The in-flight sequence viewer redesign (paused at Phase 2 Task 11) may move where `AnimatorCanvas` mounts. Resolve *after* that redesign lands, or coordinate with it.

---

## 5. `Math.log2(segments)` truncates on non-power-of-two counts

**Problem.** In `Zap2DRenderer.generatePath()`, the midpoint-displacement recursion depth is computed as `Math.log2(segments)`. If segments = 10, this gives 3.32 which truncates to 3 — producing 8 segments visually instead of 10.

**Options.**
- **A.** Document the field as power-of-two-preferred and coerce input in the translator (`segments = 1 << Math.round(Math.log2(segments))`).
- **B.** Rename the field to `recursionDepth` and change the translator to output the log directly.
- **C.** Switch the renderer to loop-based subdivision instead of power-of-two recursion.

**Recommendation.** Option B. The translator already computes `segments` from intent intensity; changing what it emits is one line. Naming matches semantics.

**Where.** `src/lib/shared/effects/translators/canvas2d-translator.ts` (resolver), `src/lib/shared/effects/translators/canvas2d-types.ts` (param type), `src/lib/shared/animation-engine/renderers/Zap2DRenderer.ts` (consumer).

---

## When to address these

Before Phase 3 (retiring `EffectsSettingsPanel`) so parity with the legacy system is real. Items 1, 2, 4 are user-visible; items 3, 5 are correctness/clarity.

Items can be rolled into Phase 1b/1c/1d polish passes if they're in the way, or tackled as a dedicated cleanup pass between Phase 1d and Phase 2.

---

## 6. Motion (Phase 1d) deferred items

Surfaced 2026-04-17 during Phase 1d Group B implementation.

**6a. Velocity-color mode in 3D.** `Motion3DParams.colorMode === "velocity"` falls back to `motion3D.color` in 3D. Per-frame velocity hue requires per-emitter derived state (one `$derived.by` per Motion mount, reading `effectState.getVelocity` each frame) and adds noise without much visual payoff in 3D where the tip already moves through space. 2D path supports velocity hue as designed.

**6b. Per-tip independent threshold.** Spec uses one global threshold for all four tips (blueA/B, redA/B). Per-tip threshold would let users gate left vs right hand independently. Probably not worth the UI complexity until a user asks.

**6c. Doppler chromatic aberration.** Spec listed it as a future polish — split RGB channels offset along velocity vector for a hyperspeed look. Defer until someone wants it.

**6d. Legacy `PropMotionEffects` mount in `EffectsLayer.svelte`.** Phase 1d adds the unified-state mount alongside the legacy one (driven by `configState.motion.*`). Phase 3 retires the legacy path along with `EffectsSettingsPanel`.

**6e. 3D MotionBlur/SpeedLines per-tip previousPosition.** The 3D mounts pass center-prop `previousPosition` for both ends of a staff (no per-tip-end history). The components' threshold gating is based on velocity magnitude and the approximation reads correctly at speed. A faithful per-end previous position would require extending `effectState` to track end positions, not just centers. Defer.
