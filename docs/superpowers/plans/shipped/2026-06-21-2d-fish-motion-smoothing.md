# 2D Fish Motion Smoothing + Cursor Flee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop 2D ocean fish from spasming (snap bursts, twitch, vertical pops) by inserting a velocity-smoothing motion layer, and add a cursor-flee behavior mirroring the 3D fish.

**Architecture:** Keep the existing decision state machine. Behaviors write *target* speed/heading instead of mutating position/speed directly; a per-frame exponential integrator eases actual velocity toward targets. Replace per-frame `Math.random()` position jitter with smooth deterministic wander. Add a pure cursor-flee geometry function + handler, plumbed via a new optional `setPointer` on the background system/controller and a pointer listener in the tka hosts.

**Tech Stack:** TypeScript, `@austencloud/backgrounds` package (`E:\shared-packages\packages\backgrounds`, tsc-only build, pnpm workspace), Vitest (added in Task 1), Svelte 5 (tka hosts).

**Working directories:**
- Package: `E:\shared-packages\packages\backgrounds` (publish target)
- Consumer: `E:\tka-platform` (hosts + verification)

**Conventions found in codebase (follow them):**
- Pure-logic modules are plain functions, no `Service` suffix.
- Constants live in `src/backgrounds/ocean/domain/constants/fish-constants.ts`.
- `updateFish(fish, dimensions, frameMultiplier, animationTime)` is the per-frame entry (`FishAnimator.ts:102`); `deltaSeconds = 0.016 * frameMultiplier` today.
- Movement applied in `FishMovementController.ts` (`applyBehavior` switch at line 26).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/backgrounds/vitest.config.ts` | **new** — test runner config |
| `.../ocean/services/implementations/fish-motion/velocity-smoothing.ts` | **new** — pure exponential approach + heading ease |
| `.../fish-motion/lateral-wander.ts` | **new** — pure deterministic smooth wander |
| `.../fish-motion/cursor-flee.ts` | **new** — pure flee geometry (away + tangential + falloff) |
| `.../fish-motion/*.test.ts` | **new** — unit tests for the three pure modules |
| `.../ocean/domain/models/OceanModels.ts` | add `vx,vy,targetSpeed,fleeTimer,fleeIntensity` to `FishMarineLife` |
| `.../ocean/domain/constants/fish-constants.ts` | add `MOTION_SMOOTHING`, `LATERAL_WANDER`, `CURSOR_FLEE` |
| `.../services/implementations/FishFactory.ts` | init new fields at spawn |
| `.../services/implementations/FishMovementController.ts` | targets-not-snaps + integrator + wander + eased turn + dt-honest |
| `.../services/implementations/FishCursorAvoidance.ts` | **new** — applies cursor-flee.ts to fish + phased recovery |
| `.../services/contracts/IFishCursorAvoidance.ts` | **new** — contract |
| `.../services/implementations/FishAnimator.ts` | thread pointer; invoke cursor avoidance; honest dt |
| `.../services/OceanBackgroundOrchestrator.ts` | store pointer; `setPointer`; pass to `updateFish` |
| `.../core/contracts/IBackgroundSystem.ts` | optional `setPointer` |
| `.../core/contracts/IBackgroundController.ts` | `setPointer` |
| `.../core/services/BackgroundController.ts` | `setPointer` delegates to `systemA`/`systemB` |
| `tka: src/lib/features/background-builder/components/OceanLab.svelte` | lab pointer → setPointer (verify surface) |
| `tka: src/lib/shared/background/shared/components/BackgroundHost.svelte` | app-wide window pointer → controller.setPointer |

---

## Task 1: Add Vitest to the backgrounds package

**Files:**
- Create: `E:\shared-packages\packages\backgrounds\vitest.config.ts`
- Modify: `E:\shared-packages\packages\backgrounds\package.json`

- [ ] **Step 1: Add Vitest dev dependency**

Run (in `E:\shared-packages\packages\backgrounds`):
```bash
pnpm add -D vitest@^2
```

- [ ] **Step 2: Add the `test` script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Smoke test that the runner works**

Create `src/backgrounds/ocean/services/implementations/fish-motion/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("vitest", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```
Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/backgrounds/ocean/services/implementations/fish-motion/smoke.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(backgrounds): add vitest for fish-motion unit tests" -- package.json pnpm-lock.yaml vitest.config.ts
```

---

## Task 2: Velocity smoothing (pure)

**Files:**
- Create: `.../fish-motion/velocity-smoothing.ts`
- Test: `.../fish-motion/velocity-smoothing.test.ts`

- [ ] **Step 1: Write the failing test**

`velocity-smoothing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { approachExponential, easeHeading } from "./velocity-smoothing.js";

describe("approachExponential", () => {
  it("moves toward the target", () => {
    const next = approachExponential(0, 100, 10, 0.016);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it("never overshoots the target", () => {
    let v = 0;
    for (let i = 0; i < 1000; i++) v = approachExponential(v, 100, 10, 0.016);
    expect(v).toBeLessThanOrEqual(100);
    expect(v).toBeGreaterThan(99.9);
  });

  it("is frame-rate independent (two half-steps == one full step)", () => {
    const full = approachExponential(0, 100, 8, 0.032);
    const half1 = approachExponential(0, 100, 8, 0.016);
    const half2 = approachExponential(half1, 100, 8, 0.016);
    expect(Math.abs(full - half2)).toBeLessThan(1e-9);
  });

  it("returns target exactly when already there", () => {
    expect(approachExponential(50, 50, 10, 0.016)).toBe(50);
  });
});

describe("easeHeading", () => {
  it("eases a +1 -> -1 flip through 0, never instant", () => {
    const next = easeHeading(1, -1, 5, 0.016);
    expect(next).toBeLessThan(1);
    expect(next).toBeGreaterThan(-1);
  });
  it("converges to the target heading", () => {
    let h = 1;
    for (let i = 0; i < 1000; i++) h = easeHeading(h, -1, 5, 0.016);
    expect(h).toBeCloseTo(-1, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test velocity-smoothing`
Expected: FAIL — cannot find module `./velocity-smoothing.js`.

- [ ] **Step 3: Implement**

`velocity-smoothing.ts`:
```ts
/**
 * Frame-rate-independent exponential approach toward a target.
 * factor = 1 - e^(-rate*dt) so that two dt/2 steps equal one dt step exactly.
 * Higher `rate` = snappier; lower = smoother.
 */
export function approachExponential(
  current: number,
  target: number,
  rate: number,
  dt: number
): number {
  if (current === target) return target;
  const factor = 1 - Math.exp(-rate * dt);
  return current + (target - current) * factor;
}

/**
 * Eases a continuous heading scalar (e.g. -1..1 direction factor) toward a
 * target. Uses the same exponential approach so direction flips ramp smoothly
 * through zero instead of snapping.
 */
export function easeHeading(
  current: number,
  target: number,
  rate: number,
  dt: number
): number {
  return approachExponential(current, target, rate, dt);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test velocity-smoothing`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backgrounds/ocean/services/implementations/fish-motion/velocity-smoothing.ts src/backgrounds/ocean/services/implementations/fish-motion/velocity-smoothing.test.ts
git commit -m "feat(backgrounds): frame-rate-independent velocity smoothing helpers" -- src/backgrounds/ocean/services/implementations/fish-motion/velocity-smoothing.ts src/backgrounds/ocean/services/implementations/fish-motion/velocity-smoothing.test.ts
```

---

## Task 3: Lateral wander (pure) — replaces RNG jitter

**Files:**
- Create: `.../fish-motion/lateral-wander.ts`
- Test: `.../fish-motion/lateral-wander.test.ts`

- [ ] **Step 1: Write the failing test**

`lateral-wander.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { wanderOffset } from "./lateral-wander.js";

describe("wanderOffset", () => {
  it("stays within the amplitude bound", () => {
    for (let t = 0; t < 50; t += 0.1) {
      const v = wanderOffset(3.2, t, 1.5, 4);
      expect(Math.abs(v)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it("is continuous (no per-frame teleport)", () => {
    let prev = wanderOffset(1.0, 0, 1.5, 4);
    for (let t = 0.016; t < 5; t += 0.016) {
      const cur = wanderOffset(1.0, t, 1.5, 4);
      // smooth signal: adjacent-frame change is small relative to amplitude
      expect(Math.abs(cur - prev)).toBeLessThan(0.6);
      prev = cur;
    }
  });

  it("is deterministic for a given seed+time", () => {
    expect(wanderOffset(7, 2.5, 1.5, 4)).toBe(wanderOffset(7, 2.5, 1.5, 4));
  });

  it("differs between seeds", () => {
    expect(wanderOffset(1, 2.5, 1.5, 4)).not.toBe(wanderOffset(9, 2.5, 1.5, 4));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lateral-wander`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lateral-wander.ts`:
```ts
/**
 * Smooth, deterministic lateral wander offset.
 * Sum of two incommensurate sines so the signal is continuous and bounded by
 * `amp` (weights sum to 1). Replaces uncorrelated per-frame Math.random()
 * jitter, which caused visible twitching.
 *
 * @param seed     per-fish constant (phase offset) so fish don't sync
 * @param t        animation time in seconds
 * @param freq     base frequency (Hz-ish)
 * @param amp      max absolute offset in pixels
 */
export function wanderOffset(
  seed: number,
  t: number,
  freq: number,
  amp: number
): number {
  const a = Math.sin(t * freq + seed);
  const b = Math.sin(t * freq * 2.137 + seed * 1.7);
  return amp * (0.6 * a + 0.4 * b);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lateral-wander`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backgrounds/ocean/services/implementations/fish-motion/lateral-wander.ts src/backgrounds/ocean/services/implementations/fish-motion/lateral-wander.test.ts
git commit -m "feat(backgrounds): smooth deterministic lateral wander" -- src/backgrounds/ocean/services/implementations/fish-motion/lateral-wander.ts src/backgrounds/ocean/services/implementations/fish-motion/lateral-wander.test.ts
```

---

## Task 4: Cursor-flee geometry (pure)

**Files:**
- Create: `.../fish-motion/cursor-flee.ts`
- Test: `.../fish-motion/cursor-flee.test.ts`

Mirrors the 3D `boid-velocity.glsl` scatter: boldness-scaled radius, proximity² falloff, away + tangential blend.

- [ ] **Step 1: Write the failing test**

`cursor-flee.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeFlee } from "./cursor-flee.js";

const base = { radius: 200, boldness: 0.5, direction: 1 as 1 | -1 };

describe("computeFlee", () => {
  it("returns zero intensity outside the (boldness-scaled) radius", () => {
    const r = computeFlee({ fishX: 0, fishY: 0, cursorX: 1000, cursorY: 0, ...base });
    expect(r.intensity).toBe(0);
  });

  it("flees away from the cursor (sign of direction is correct)", () => {
    // cursor to the LEFT of fish -> fish should be pushed RIGHT (+x)
    const r = computeFlee({ fishX: 100, fishY: 0, cursorX: 50, cursorY: 0, ...base });
    expect(r.intensity).toBeGreaterThan(0);
    expect(r.dirX).toBeGreaterThan(0);
  });

  it("intensity increases as the cursor gets closer", () => {
    const far = computeFlee({ fishX: 0, fishY: 0, cursorX: 150, cursorY: 0, ...base });
    const near = computeFlee({ fishX: 0, fishY: 0, cursorX: 30, cursorY: 0, ...base });
    expect(near.intensity).toBeGreaterThan(far.intensity);
  });

  it("returns a unit-length flee direction", () => {
    const r = computeFlee({ fishX: 0, fishY: 0, cursorX: 40, cursorY: 40, ...base });
    expect(Math.hypot(r.dirX, r.dirY)).toBeCloseTo(1, 5);
  });

  it("bolder fish have a smaller effective radius", () => {
    const timid = computeFlee({ fishX: 0, fishY: 0, cursorX: 250, cursorY: 0, radius: 200, boldness: 0.0, direction: 1 });
    const bold = computeFlee({ fishX: 0, fishY: 0, cursorX: 250, cursorY: 0, radius: 200, boldness: 1.0, direction: 1 });
    expect(timid.intensity).toBeGreaterThan(0);
    expect(bold.intensity).toBe(0);
  });

  it("degenerate zero-distance flees upward without NaN", () => {
    const r = computeFlee({ fishX: 0, fishY: 0, cursorX: 0, cursorY: 0, ...base });
    expect(Number.isNaN(r.dirX)).toBe(false);
    expect(Number.isNaN(r.dirY)).toBe(false);
    expect(r.intensity).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test cursor-flee`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`cursor-flee.ts`:
```ts
export interface FleeInput {
  fishX: number;
  fishY: number;
  cursorX: number;
  cursorY: number;
  /** base scatter radius in px */
  radius: number;
  /** 0..1 personality boldness; bolder = smaller effective radius */
  boldness: number;
  /** current horizontal heading */
  direction: 1 | -1;
}

export interface FleeResult {
  /** 0..1 strength (proximity^2) */
  intensity: number;
  /** unit flee direction */
  dirX: number;
  dirY: number;
}

const ZERO: FleeResult = { intensity: 0, dirX: 0, dirY: 0 };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Screen-space cursor flee, mirroring the 3D boid scatter shader:
 * boldness-scaled radius, proximity^2 falloff, away+tangential blend so fish
 * escape sideways when the cursor is dead ahead instead of only backing up.
 */
export function computeFlee(input: FleeInput): FleeResult {
  const { fishX, fishY, cursorX, cursorY, radius, boldness, direction } = input;
  const effRadius = radius * (1.3 - boldness * 0.6);
  let dx = fishX - cursorX;
  let dy = fishY - cursorY;
  const dist = Math.hypot(dx, dy);

  if (dist >= effRadius) return ZERO;

  // Degenerate: cursor exactly on the fish -> flee straight up.
  if (dist < 1e-4) return { intensity: 1, dirX: 0, dirY: -1 };

  const awayX = dx / dist;
  const awayY = dy / dist;
  const proximity = 1 - dist / effRadius;

  // Tangential escape: stronger when the fish heads toward the cursor.
  const headingDot = Math.abs(direction * awayX); // heading is (direction, 0)
  const tangentWeight = smoothstep(0.3, 0.8, headingDot) * 0.6;
  // tangent perpendicular to away; sign chosen by current heading.
  const sign = direction >= 0 ? 1 : -1;
  const tanX = -awayY * sign;
  const tanY = awayX * sign;

  let fx = awayX * (1 - tangentWeight) + tanX * tangentWeight;
  let fy = awayY * (1 - tangentWeight) + tanY * tangentWeight;
  const len = Math.hypot(fx, fy) || 1;
  fx /= len;
  fy /= len;

  return { intensity: proximity * proximity, dirX: fx, dirY: fy };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test cursor-flee`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backgrounds/ocean/services/implementations/fish-motion/cursor-flee.ts src/backgrounds/ocean/services/implementations/fish-motion/cursor-flee.test.ts
git commit -m "feat(backgrounds): pure screen-space cursor-flee geometry" -- src/backgrounds/ocean/services/implementations/fish-motion/cursor-flee.ts src/backgrounds/ocean/services/implementations/fish-motion/cursor-flee.test.ts
```

---

## Task 5: Add model fields

**Files:**
- Modify: `.../ocean/domain/models/OceanModels.ts` (FishMarineLife, after `dartSpeed?` at ~line 237)
- Modify: `.../services/implementations/FishFactory.ts` (createFish init)

- [ ] **Step 1: Add fields to `FishMarineLife`**

In `OceanModels.ts`, inside `interface FishMarineLife`, after the `dartSpeed?: number;` line:
```ts
  // Velocity smoothing (motion layer)
  /** Smoothed actual horizontal speed target (px/s). Behaviors set this; the
   *  controller eases `speed` toward it each frame. */
  targetSpeed: number;
  /** Continuous heading factor (-1..1), eased on turns instead of flipping. */
  headingFactor: number;

  // Cursor flee
  /** Remaining flee panic time (s); >0 means actively fleeing the cursor. */
  fleeTimer: number;
  /** Current flee intensity 0..1 for visual + speed scaling. */
  fleeIntensity: number;
```

> Note: `vx/vy` already exist on other interfaces but NOT on `FishMarineLife`; horizontal motion here stays 1D (`speed` + `direction`/`headingFactor`), vertical via `baseY`/wander. We do not add `vx/vy` to fish — `targetSpeed` + `headingFactor` cover the smoothing need. (Spec mentioned `vx/vy`; this is the concrete, minimal realization.)

- [ ] **Step 2: Initialize in `FishFactory.createFish`**

In `FishFactory.ts`, find the object literal returned by `createFish` (the one setting `behaviorTimer:` at ~line 399). Add to it:
```ts
      targetSpeed: 0, // set on first behavior application; seeded below
      headingFactor: 0,
      fleeTimer: 0,
      fleeIntensity: 0,
```
Then immediately after the fish object is created (before return), seed the smoothing fields from the spawned values:
```ts
    fish.targetSpeed = fish.baseSpeed;
    fish.headingFactor = fish.direction;
```
(If `createFish` returns the literal directly, refactor to `const fish = { ... }; fish.targetSpeed = fish.baseSpeed; fish.headingFactor = fish.direction; return fish;`.)

- [ ] **Step 3: Build to verify types**

Run (in package): `pnpm build`
Expected: tsc exits 0 (no missing-field errors on FishMarineLife construction sites; if other construction sites exist, add the four fields there too — grep `behavior: "cruising"` / object literals typed as FishMarineLife).

- [ ] **Step 4: Commit**

```bash
git add src/backgrounds/ocean/domain/models/OceanModels.ts src/backgrounds/ocean/services/implementations/FishFactory.ts
git commit -m "feat(backgrounds): add smoothing + flee fields to FishMarineLife" -- src/backgrounds/ocean/domain/models/OceanModels.ts src/backgrounds/ocean/services/implementations/FishFactory.ts
```

---

## Task 6: Constants

**Files:**
- Modify: `.../ocean/domain/constants/fish-constants.ts` (append new exports at end)

- [ ] **Step 1: Append constants**

At the end of `fish-constants.ts`:
```ts
// =============================================================================
// MOTION SMOOTHING (velocity integration)
// =============================================================================

/**
 * Exponential-approach rates (1/s) for easing `speed` toward `targetSpeed`.
 * Higher = snappier ramp. Darting is high so the C-start still bursts, but over
 * ~120ms not one frame. Tunable live in OceanLab.
 */
export const MOTION_SMOOTHING = {
  /** default speed ease rate for cruise/pass/ascend/descend/etc. */
  speedRate: 6,
  /** faster ease during darting burst so it still reads as explosive */
  dartSpeedRate: 18,
  /** heading ease rate for turns (direction flip ramps through 0) */
  headingRate: 5,
};

// =============================================================================
// LATERAL WANDER (replaces RNG dart jitter)
// =============================================================================

export const LATERAL_WANDER = {
  /** base frequency for the smooth wander signal */
  frequency: 1.5,
  /** amplitude (px) of the dart-phase lateral wander */
  dartAmplitude: 4,
  /** amplitude (px) of the recovery-phase residual wander */
  recoveryAmplitude: 0.6,
};

// =============================================================================
// CURSOR FLEE (screen-space, mirrors 3D scatter)
// =============================================================================

export const CURSOR_FLEE = {
  /** base scatter radius (px), scaled by boldness in computeFlee */
  radius: 180,
  /** peak horizontal speed multiplier at full flee intensity */
  speedMultiplier: 4.0,
  /** vertical flee velocity scale (px/s) at full intensity */
  verticalForce: 120,
  /** panic duration (s) seeded on trigger; recovery eases over this window */
  panicDuration: 2.5,
  /** master on/off; flee is active wherever the ocean background renders */
  enabled: true,
};
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: tsc exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/backgrounds/ocean/domain/constants/fish-constants.ts
git commit -m "feat(backgrounds): motion smoothing, wander, cursor-flee constants" -- src/backgrounds/ocean/domain/constants/fish-constants.ts
```

---

## Task 7: Integrate smoothing into FishMovementController

**Files:**
- Modify: `.../services/implementations/FishMovementController.ts`

This is the core change. Behaviors set `targetSpeed`; `applyBehavior` integrates `speed` toward it; remove RNG jitter (use wander); ease turning; track vertical so dart-exit doesn't pop. `applyBehavior` and the private appliers need `deltaSeconds` (already passed) — no new signature except adding `animationTime` where wander needs it.

- [ ] **Step 1: Import helpers + constants**

At top of `FishMovementController.ts`, extend the constants import and add the new modules:
```ts
import {
  BEHAVIOR_CONFIG,
  EDGE_AWARENESS,
  SPAWN_CONFIG,
  DEPTH_TRANSITION,
  MOTION_SMOOTHING,
  LATERAL_WANDER,
} from "../../domain/constants/fish-constants.js";
import { approachExponential, easeHeading } from "./fish-motion/velocity-smoothing.js";
import { wanderOffset } from "./fish-motion/lateral-wander.js";
```

- [ ] **Step 2: Change `applyBehavior` signature to receive `animationTime`**

Replace the `applyBehavior(...)` signature (line 26) and add the speed integrator + heading ease at the top of the body:
```ts
  applyBehavior(
    fish: FishMarineLife,
    deltaSeconds: number,
    frameMultiplier: number,
    dimensions: Dimensions,
    animationTime: number
  ): void {
    // Ease actual speed toward the behavior's target speed (no more snaps).
    const rate =
      fish.behavior === "darting"
        ? MOTION_SMOOTHING.dartSpeedRate
        : MOTION_SMOOTHING.speedRate;
    fish.speed = approachExponential(fish.speed, fish.targetSpeed, rate, deltaSeconds);

    // Ease heading factor toward the current direction (turns ramp through 0).
    fish.headingFactor = easeHeading(
      fish.headingFactor,
      fish.direction,
      MOTION_SMOOTHING.headingRate,
      deltaSeconds
    );

    // Always update depth (z-axis lerping)
    this.updateDepth(fish, frameMultiplier);

    switch (fish.behavior) {
      // ... unchanged cases, but pass animationTime to applyDarting ...
```
Update the `darting` case to `this.applyDarting(fish, deltaSeconds, animationTime);`.

- [ ] **Step 3: Make every behavior set `targetSpeed` instead of `fish.speed`**

In `transitionBehavior` (the decision-applying switch starting ~line 159), replace each `fish.speed = ...` assignment with `fish.targetSpeed = ...`. Specifically:
- `turning`: add `fish.targetSpeed = fish.baseSpeed * BEHAVIOR_CONFIG.turning.speedMultiplier;`
- `passing`: `fish.targetSpeed = fish.baseSpeed * (decision.speedMultiplier ?? this.randomInRange(BEHAVIOR_CONFIG.passing.speedMultiplier));` (was `fish.speed`)
- `ascending`/`descending`: `fish.targetSpeed = fish.baseSpeed * BEHAVIOR_CONFIG.<x>.speedMultiplier;`
- `approaching`/`receding`: `fish.targetSpeed = fish.baseSpeed * BEHAVIOR_CONFIG.<x>.speedMultiplier;`
- `cruising`/`schooling`: `fish.targetSpeed = decision.speedMultiplier ? fish.baseSpeed * decision.speedMultiplier : fish.baseSpeed;`
- `darting`: keep `fish.dartSpeed` as-is, but also set `fish.targetSpeed = fish.dartSpeed;`

And in the early-return completion blocks (lines 96-146) that set `fish.speed = fish.baseSpeed`, change each to `fish.targetSpeed = fish.baseSpeed;` (leave `fish.speed` to ease down).

- [ ] **Step 4: Replace `applyDarting` jitter with smooth wander + baseY tracking**

Replace the body of `applyDarting` (lines 275-329). New signature + body:
```ts
  private applyDarting(
    fish: FishMarineLife,
    deltaSeconds: number,
    animationTime: number
  ): void {
    const config = BEHAVIOR_CONFIG.darting;
    const elapsed = config.duration - fish.behaviorTimer;

    // Body flex cue per phase (speed itself is eased in applyBehavior).
    let amp = LATERAL_WANDER.recoveryAmplitude;
    if (elapsed < config.coilDuration) {
      fish.bodyFlexAmount = 1.3;
    } else if (elapsed < config.coilDuration + config.burstDuration) {
      const burstProgress =
        (elapsed - config.coilDuration) / config.burstDuration;
      fish.bodyFlexAmount = 1.0;
      amp = LATERAL_WANDER.dartAmplitude * (1 - burstProgress);
    }

    // Horizontal advance uses the eased speed.
    fish.x += fish.headingFactor * fish.speed * deltaSeconds;

    // Smooth, deterministic lateral wander INTO baseY (not raw fish.y), so the
    // return to cruising doesn't pop. Velocity form (derivative) * dt keeps it
    // frame-rate independent and continuous.
    const seed = fish.bodyFlexPhase; // per-fish constant phase
    const w0 = wanderOffset(seed, animationTime, LATERAL_WANDER.frequency, amp);
    const w1 = wanderOffset(seed, animationTime + deltaSeconds, LATERAL_WANDER.frequency, amp);
    fish.baseY += (w1 - w0);
  }
```
(Use `fish.headingFactor` instead of `fish.direction` so a dart during a turn still curves smoothly.)

- [ ] **Step 5: Ease turning + use headingFactor for horizontal movement in other appliers**

In `applyCruising`, `applyPassing`, `applyAscending`, `applyDescending`, replace `fish.direction * fish.speed` with `fish.headingFactor * fish.speed`. In `applyTurning`, remove the hard `fish.speed = ...` line (target already set) and keep the rotation cue; horizontal advance becomes `fish.x += fish.headingFactor * fish.speed * deltaSeconds;`.

- [ ] **Step 6: Update the interface + caller**

In `services/contracts/IFishMovementController.ts`, add `animationTime: number` to the `applyBehavior` signature. In `FishAnimator.ts:194`, update the call to `this.movementController.applyBehavior(f, deltaSeconds, frameMultiplier, dimensions, animationTime);`.

- [ ] **Step 7: Build + run all motion tests**

Run: `pnpm build && pnpm test`
Expected: tsc 0; all fish-motion tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/backgrounds/ocean/services/implementations/FishMovementController.ts src/backgrounds/ocean/services/contracts/IFishMovementController.ts src/backgrounds/ocean/services/implementations/FishAnimator.ts
git commit -m "feat(backgrounds): eased velocity + smooth wander in fish movement (no snap/twitch)" -- src/backgrounds/ocean/services/implementations/FishMovementController.ts src/backgrounds/ocean/services/contracts/IFishMovementController.ts src/backgrounds/ocean/services/implementations/FishAnimator.ts
```

---

## Task 8: Cursor-avoidance handler

**Files:**
- Create: `.../services/contracts/IFishCursorAvoidance.ts`
- Create: `.../services/implementations/FishCursorAvoidance.ts`
- Test: `.../services/implementations/FishCursorAvoidance.test.ts`

- [ ] **Step 1: Write the contract**

`IFishCursorAvoidance.ts`:
```ts
import type { FishMarineLife } from "../../domain/models/OceanModels.js";

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface IFishCursorAvoidance {
  /** Apply cursor flee to all fish for this frame. Mutates fish in place. */
  apply(
    fish: FishMarineLife[],
    pointer: PointerState | null,
    deltaSeconds: number,
    animationTime: number
  ): void;
}
```

- [ ] **Step 2: Write the failing test**

`FishCursorAvoidance.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FishCursorAvoidance } from "./FishCursorAvoidance.js";
import type { FishMarineLife } from "../../domain/models/OceanModels.js";

function makeFish(x: number, y: number): FishMarineLife {
  return {
    x, baseY: y, y, direction: 1, speed: 40, baseSpeed: 40, targetSpeed: 40,
    headingFactor: 1, behavior: "cruising", behaviorTimer: 5,
    fleeTimer: 0, fleeIntensity: 0,
    personality: { boldness: 0.5, curiosity: 0.5, sociability: 0.5, activity: 0.5 },
  } as unknown as FishMarineLife;
}

describe("FishCursorAvoidance", () => {
  const av = new FishCursorAvoidance();

  it("does nothing when pointer is inactive", () => {
    const f = makeFish(100, 100);
    av.apply([f], { x: 100, y: 100, active: false }, 0.016, 0);
    expect(f.fleeTimer).toBe(0);
    expect(f.behavior).toBe("cruising");
  });

  it("triggers flee when cursor is near and pushes fish away", () => {
    const f = makeFish(100, 100);
    av.apply([f], { x: 110, y: 100, active: true }, 0.016, 0); // cursor just right of fish
    expect(f.fleeTimer).toBeGreaterThan(0);
    expect(f.behavior).toBe("darting");
    expect(f.targetSpeed).toBeGreaterThan(f.baseSpeed); // sped up
    expect(f.direction).toBe(-1); // cursor on the right -> flee left
  });

  it("does not trigger when cursor is far", () => {
    const f = makeFish(0, 0);
    av.apply([f], { x: 5000, y: 5000, active: true }, 0.016, 0);
    expect(f.fleeTimer).toBe(0);
  });

  it("decays fleeTimer over time", () => {
    const f = makeFish(100, 100);
    av.apply([f], { x: 110, y: 100, active: true }, 0.016, 0);
    const t0 = f.fleeTimer;
    av.apply([f], { x: 5000, y: 5000, active: true }, 0.5, 0); // cursor gone
    expect(f.fleeTimer).toBeLessThan(t0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test FishCursorAvoidance`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`FishCursorAvoidance.ts`:
```ts
import type { FishMarineLife } from "../../domain/models/OceanModels.js";
import type {
  IFishCursorAvoidance,
  PointerState,
} from "../contracts/IFishCursorAvoidance.js";
import { CURSOR_FLEE } from "../../domain/constants/fish-constants.js";
import { computeFlee } from "./fish-motion/cursor-flee.js";

/**
 * Applies screen-space cursor flee to fish, mirroring the 3D scatter:
 * proximity-falloff trigger, away+tangential push, boldness-scaled radius,
 * and a panic timer that decays so the fish eases back to normal behavior
 * (no instant snap out of flee).
 */
export class FishCursorAvoidance implements IFishCursorAvoidance {
  apply(
    fish: FishMarineLife[],
    pointer: PointerState | null,
    deltaSeconds: number,
    _animationTime: number
  ): void {
    if (!CURSOR_FLEE.enabled) return;

    for (const f of fish) {
      // Decay any existing panic.
      if (f.fleeTimer > 0) {
        f.fleeTimer = Math.max(0, f.fleeTimer - deltaSeconds);
        f.fleeIntensity = f.fleeTimer / CURSOR_FLEE.panicDuration;
      }

      if (!pointer || !pointer.active) continue;

      const boldness = f.personality?.boldness ?? 0.5;
      const flee = computeFlee({
        fishX: f.x,
        fishY: f.baseY,
        cursorX: pointer.x,
        cursorY: pointer.y,
        radius: CURSOR_FLEE.radius,
        boldness,
        direction: f.direction,
      });

      if (flee.intensity <= 0) continue;

      // Enter / refresh flee: dart away from the cursor.
      f.behavior = "darting";
      f.behaviorTimer = Math.max(f.behaviorTimer, 0.6);
      f.fleeTimer = CURSOR_FLEE.panicDuration;
      f.fleeIntensity = Math.max(f.fleeIntensity, flee.intensity);

      // Horizontal: face away, boost target speed by intensity.
      f.direction = flee.dirX >= 0 ? 1 : -1;
      f.targetSpeed =
        f.baseSpeed * (1 + (CURSOR_FLEE.speedMultiplier - 1) * flee.intensity);

      // Vertical: push baseY along the flee vector (smoothed by integration
      // since we move baseY by a velocity*dt amount, not a teleport).
      f.baseY += flee.dirY * CURSOR_FLEE.verticalForce * flee.intensity * deltaSeconds;
    }
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test FishCursorAvoidance`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/backgrounds/ocean/services/contracts/IFishCursorAvoidance.ts src/backgrounds/ocean/services/implementations/FishCursorAvoidance.ts src/backgrounds/ocean/services/implementations/FishCursorAvoidance.test.ts
git commit -m "feat(backgrounds): cursor-flee handler with phased panic decay" -- src/backgrounds/ocean/services/contracts/IFishCursorAvoidance.ts src/backgrounds/ocean/services/implementations/FishCursorAvoidance.ts src/backgrounds/ocean/services/implementations/FishCursorAvoidance.test.ts
```

---

## Task 9: Thread pointer through animator + orchestrator + system contract

**Files:**
- Modify: `.../services/implementations/FishAnimator.ts`
- Modify: `.../services/contracts/IFishAnimator.ts`
- Modify: `.../services/OceanBackgroundOrchestrator.ts`
- Modify: `.../core/contracts/IBackgroundSystem.ts`

- [ ] **Step 1: Add optional `setPointer` to the system contract**

In `IBackgroundSystem.ts`, after `handleResize?`:
```ts
  /**
   * Set the current pointer position (canvas-logical px) for interactive
   * backgrounds (e.g. fish cursor flee). active=false when pointer left.
   */
  setPointer?(x: number, y: number, active: boolean): void;
```

- [ ] **Step 2: Give `FishAnimator` a cursor-avoidance handler + pointer param**

In `FishAnimator.ts`: import + construct the handler (mirror the existing optional-DI constructor pattern):
```ts
import { FishCursorAvoidance } from "./FishCursorAvoidance.js";
import type { IFishCursorAvoidance, PointerState } from "../contracts/IFishCursorAvoidance.js";
```
Add a private field `private cursorAvoidance: IFishCursorAvoidance;`, a constructor param `cursorAvoidance?: IFishCursorAvoidance,` and `this.cursorAvoidance = cursorAvoidance ?? new FishCursorAvoidance();`.

Change `updateFish` signature to accept pointer:
```ts
  updateFish(
    fish: FishMarineLife[],
    dimensions: Dimensions,
    frameMultiplier: number,
    animationTime: number,
    pointer: PointerState | null = null
  ): FishMarineLife[] {
```
Inside the per-fish loop, AFTER the behavior timer / mood / propulsion block and BEFORE `applyBehavior` is fine, but apply cursor avoidance once per frame for the whole array right before the loop that calls `applyBehavior`. Simplest: call it just before the `for (const f of fish)` movement loop:
```ts
    const deltaSeconds = 0.016 * frameMultiplier;
    this.cursorAvoidance.apply(fish, pointer, deltaSeconds, animationTime);
```
Update `IFishAnimator.updateFish` in the contract with the new optional `pointer` param.

- [ ] **Step 3: Orchestrator stores pointer + forwards it + implements setPointer**

In `OceanBackgroundOrchestrator.ts`: add a private field near the other state:
```ts
  private pointer: { x: number; y: number; active: boolean } | null = null;
```
Add the method (near `setQuality`):
```ts
  setPointer(x: number, y: number, active: boolean): void {
    this.pointer = { x, y, active };
  }
```
In `update()`, change the `updateFish` call (line 250) to pass the pointer:
```ts
    this.state.fish = this.fishAnimator.updateFish(
      this.state.fish,
      dimensions,
      effectiveMultiplier,
      this.animationTime,
      this.pointer
    );
```

- [ ] **Step 4: Build + test**

Run: `pnpm build && pnpm test`
Expected: tsc 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/backgrounds/ocean/services/implementations/FishAnimator.ts src/backgrounds/ocean/services/contracts/IFishAnimator.ts src/backgrounds/ocean/services/OceanBackgroundOrchestrator.ts src/core/contracts/IBackgroundSystem.ts
git commit -m "feat(backgrounds): plumb pointer into fish update for cursor flee" -- src/backgrounds/ocean/services/implementations/FishAnimator.ts src/backgrounds/ocean/services/contracts/IFishAnimator.ts src/backgrounds/ocean/services/OceanBackgroundOrchestrator.ts src/core/contracts/IBackgroundSystem.ts
```

---

## Task 10: Controller `setPointer` delegation

**Files:**
- Modify: `.../core/contracts/IBackgroundController.ts`
- Modify: `.../core/services/BackgroundController.ts`

- [ ] **Step 1: Add to the controller contract**

In `IBackgroundController.ts`, add:
```ts
  /** Forward pointer (canvas-logical px) to the active background system. */
  setPointer(x: number, y: number, active: boolean): void;
```

- [ ] **Step 2: Implement on `BackgroundController`**

In `BackgroundController.ts`, add a method near `setQuality` (which already delegates to `systemA`/`systemB`):
```ts
  setPointer(x: number, y: number, active: boolean): void {
    this.systemA?.setPointer?.(x, y, active);
    this.systemB?.setPointer?.(x, y, active);
  }
```

- [ ] **Step 3: Build + export check**

Run: `pnpm build`
Expected: tsc 0. Confirm `BackgroundController` / `IBackgroundController` are exported from `src/index.ts` (they are used by tka). If `setPointer` needs to be on the exported type, it now is via the contract.

- [ ] **Step 4: Commit**

```bash
git add src/core/contracts/IBackgroundController.ts src/core/services/BackgroundController.ts
git commit -m "feat(backgrounds): BackgroundController.setPointer delegates to active systems" -- src/core/contracts/IBackgroundController.ts src/core/services/BackgroundController.ts
```

---

## Task 11: Publish the package + bump tka dependency

**Files:**
- Modify: `E:\shared-packages\packages\backgrounds\package.json` (version, via tooling)
- Modify: `E:\tka-platform\package.json` (dep bump)

- [ ] **Step 1: Full check in the package**

Run (in `E:\shared-packages`): `pnpm -C packages/backgrounds build && pnpm -C packages/backgrounds test`
Expected: build 0, all tests pass.

- [ ] **Step 2: Version bump + publish**

Run (in `E:\shared-packages\packages\backgrounds`):
```bash
npm version patch
npm publish --access public
```
(Automation token is configured — no OTP. See memory `feedback_npm_automation_token`.)
Record the new version (e.g. `0.6.3`).

- [ ] **Step 3: Bump the dependency in tka-platform**

In `E:\tka-platform`, run:
```bash
pnpm add @austencloud/backgrounds@latest
```
Verify `package.json` shows the new version.

- [ ] **Step 4: Commit the tka dep bump**

```bash
cd /e/tka-platform
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @austencloud/backgrounds for fish motion smoothing" -- package.json pnpm-lock.yaml
```

---

## Task 12: Wire pointer in the tka OceanLab (verification surface)

**Files:**
- Modify: `E:\tka-platform\src\lib\features\background-builder\components\OceanLab.svelte`

`LabPreviewCanvas` already exposes `onMouseMove` / `onMouseLeave`. OceanLab owns the ocean system instance.

- [ ] **Step 1: Find how OceanLab holds the system**

Read `OceanLab.svelte`; locate the `IBackgroundSystem` / ocean system variable passed to `LabPreviewCanvas` as `system`. Call it `system` below.

- [ ] **Step 2: Add pointer handlers**

Add to OceanLab's script:
```ts
  function handleOceanPointerMove(e: { offsetX: number; offsetY: number }) {
    system?.setPointer?.(e.offsetX, e.offsetY, true);
  }
  function handleOceanPointerLeave() {
    system?.setPointer?.(0, 0, false);
  }
```
Pass to `<LabPreviewCanvas onMouseMove={handleOceanPointerMove} onMouseLeave={handleOceanPointerLeave} ... />`. (Match the exact callback payload shape `LabPreviewCanvas` emits — read its `onMouseMove` prop type; if it emits a raw `MouseEvent`, use `e.offsetX/e.offsetY`.)

- [ ] **Step 3: Verify in the lab (runtime, real component)**

Run: `npm run check:watch` (background) and use the existing dev server.
Open: [http://localhost:5173 → Background Builder → Ocean Lab](http://localhost:5173)
Move the cursor over the fish. **Manual confirm with Austen** (per browser-verification rule, ask before screenshotting): fish dart away from the cursor and ease back smoothly; no twitch/spasm during normal swimming.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/background-builder/components/OceanLab.svelte
git commit -m "feat(ocean-lab): forward pointer to ocean system for fish flee" -- src/lib/features/background-builder/components/OceanLab.svelte
```

---

## Task 13: Wire app-wide pointer in BackgroundHost

**Files:**
- Modify: `E:\tka-platform\src\lib\shared\background\shared\components\BackgroundHost.svelte`

Container is `pointer-events: none`, so use a window-level listener and map client coords to canvas-logical px (canvas == container size after the resolution patch).

- [ ] **Step 1: Add a window pointer listener**

In `BackgroundHost.svelte` `<script>`, add inside `onMount` (guarded by `browser`):
```ts
    const onPointerMove = (e: PointerEvent) => {
      if (!controller || !containerRef) return;
      const rect = containerRef.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      controller.setPointer(x, y, inside);
    };
    const onPointerLeaveWin = () => controller?.setPointer(0, 0, false);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeaveWin);
```
Return a cleanup from `onMount` (or use `onDestroy`) removing both listeners:
```ts
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeaveWin);
    };
```

> Note: `controller.setPointer` is a no-op for non-ocean backgrounds (their systems lack `setPointer`), so this is safe app-wide. The container CSS px == canvas logical px because `patchCanvasResolution` sets `canvas.width = floor(rect.width)`.

- [ ] **Step 2: Type-check**

Run (tka): `npm run check > /tmp/check.log 2>&1; grep -niE "BackgroundHost|setPointer|error TS" /tmp/check.log | head`
Expected: no errors referencing BackgroundHost / setPointer.

- [ ] **Step 3: Verify app-wide (runtime)**

With the dev server, navigate to a route showing the ocean background app-wide (not the lab). Move the cursor; **manual confirm with Austen**: fish flee the cursor.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/background/shared/components/BackgroundHost.svelte
git commit -m "feat(background): forward window pointer to background controller (fish flee)" -- src/lib/shared/background/shared/components/BackgroundHost.svelte
```

---

## Task 14: No-spasm instrumentation proof

**Files:**
- Temporary instrumentation in `OceanLab.svelte` (or a throwaway `src/routes/test/` page) — removed after capture.

Objective evidence that the per-frame discontinuity is gone (spec verification requirement).

- [ ] **Step 1: Add a temporary per-frame max-delta logger**

In OceanLab (or a `src/routes/test/fish-smoothness/+page.svelte` harness that mounts the ocean system), after each `system.update(...)`, read `system.getFish?.()` (the orchestrator exposes `getFish()`), and track per-fish `|y - prevY|` and `|speed - prevSpeed|`, logging the rolling max every ~60 frames:
```ts
  let prev = new Map<unknown, { y: number; s: number }>();
  let maxDy = 0, maxDs = 0, frames = 0;
  function sampleSmoothness(fish: Array<{ y: number; speed: number }>) {
    for (const f of fish) {
      const p = prev.get(f);
      if (p) { maxDy = Math.max(maxDy, Math.abs(f.y - p.y)); maxDs = Math.max(maxDs, Math.abs(f.speed - p.s)); }
      prev.set(f, { y: f.y, s: f.speed });
    }
    if (++frames % 60 === 0) { console.log(`maxDy=${maxDy.toFixed(2)}px maxDs=${maxDs.toFixed(2)}`); maxDy = 0; maxDs = 0; }
  }
```

- [ ] **Step 2: Capture before/after numbers**

With cursor idle (no flee), observe `maxDy`. Pre-fix code produced ±2px/frame teleports (random jitter) and large `maxDs` spikes on behavior change. Post-fix expectation: `maxDy` per frame is small and smooth (no ±2px random spikes), `maxDs` bounded by the eased ramp (no instant 4–6× jumps). Record the console output as the proof artifact.

- [ ] **Step 3: Remove the instrumentation**

Delete the temporary logger / test page.

- [ ] **Step 4: Commit cleanup (if a test page was created)**

```bash
git add -- src/routes/test/fish-smoothness  # only if created; otherwise skip
git commit -m "chore: remove fish smoothness instrumentation" -- src/routes/test/fish-smoothness
```

---

## Self-Review notes (resolved)

- **Spec coverage:** velocity integration → Tasks 2,7; smooth wander → Tasks 3,7; dart-exit pop → Task 7 step 4 (baseY tracking); honest dt → Task 7/9 (dt applied to all writes; `0.016*frameMultiplier` retained as the dt source but every write now multiplies by it); cursor flee → Tasks 4,8,9,10,12,13; constants → Task 6; verification → Tasks 12,13,14. All covered.
- **Type consistency:** `setPointer(x,y,active)` identical across `IBackgroundSystem`, orchestrator, `IBackgroundController`, controller, tka hosts. `PointerState` defined once (Task 8) and reused. `computeFlee`/`FleeResult`, `approachExponential`, `wanderOffset` signatures match call sites. `targetSpeed`/`headingFactor`/`fleeTimer`/`fleeIntensity` defined in Task 5, used in 7/8.
- **Scope:** single subsystem (ocean fish motion), one plan.
- **Note on dt:** the spec called for `vx/vy`; the concrete realization keeps horizontal motion 1D (`speed`+`headingFactor`) and verticals via `baseY`+wander/flee — fewer fields, same smoothness goal. Documented in Task 5 step 1.
