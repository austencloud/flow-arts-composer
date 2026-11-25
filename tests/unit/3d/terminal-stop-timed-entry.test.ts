/**
 * A stop that crosses in over a set time.
 *
 * Without `entrySeconds` a stop crosses in over its clip's opening travel. On
 * 2026-11-22 a run stop began 0.18 of the way into that travel, so the stop
 * clip took full weight on its first frame and the sprint lean straightened
 * in one 33 ms frame. A plan that gives `entrySeconds` must ramp the stop in
 * evenly over that time instead, whatever phase it starts at.
 *
 * Played on the animator alone with a shipped rig and the stop clips.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnimationClip } from "three";
import { LocomotionAnimator } from "@austencloud/scene-3d";

import { createPatternTerminalStepPlan } from "#lib/shared/3d/locomotion/pattern-terminal-step-plan.js";
import { avatar, avatarAssetsPresent, editedScene3d, loadPackClips, loadRig } from "./locomotion-harness";

const STOP_DIR = path.resolve("static/animations/terminal-stops");
const RIG = "x-bot";
const DT = 1 / 60;
const ENTRY = 0.5;

interface Seam {
  pendingClips: Map<string, AnimationClip>;
  terminalMotions: Record<"stopLeft" | "stopRight", unknown>;
  clipsLoaded: boolean;
  currentTerminalWeight: number;
}

let packClips: Map<string, AnimationClip>;
const stopClips = new Map<string, AnimationClip>();
const stopMotions = new Map<string, unknown>();

async function parseStop(side: "left" | "right"): Promise<AnimationClip> {
  const bytes = new Uint8Array(fs.readFileSync(path.join(STOP_DIR, `walk-stop-${side}.glb`)));
  const gltf = await new Promise<{ animations: AnimationClip[] }>((resolve, reject) =>
    new GLTFLoader().parse(bytes.buffer, "", resolve as never, reject)
  );
  return gltf.animations[0]!;
}

/** Walk, arm a timed stop, and return the stop's weight on each braking frame. */
async function timedStopWeights() {
  const { scene } = await loadRig(avatar(RIG));
  const animator = new LocomotionAnimator();
  const seam = animator as unknown as Seam;
  seam.pendingClips = new Map([...packClips, ...stopClips]);
  seam.terminalMotions.stopLeft = stopMotions.get("stopLeft")!;
  seam.terminalMotions.stopRight = stopMotions.get("stopRight")!;
  seam.clipsLoaded = true;
  animator.initialize(scene);

  const speed = 1;
  let plan: ReturnType<typeof createPatternTerminalStepPlan> = null;
  const weights: number[] = [];
  for (let frame = 0; frame < 60 * 6; frame++) {
    const clock = animator.getGaitClock();
    if (!plan && frame > 60 && clock.cadence > 0) {
      const base = createPatternTerminalStepPlan({
        intent: { id: "stop", remainingDistance: 1, targetFacing: 0 },
        gaitStep: clock.step,
        cadence: clock.cadence,
        speed,
      });
      plan = base && { ...base, entrySeconds: ENTRY };
    }
    const status = clock.terminal?.status;
    const moving = status !== "landed" && status !== "settled";
    animator.setTerminalStepPlan(plan);
    animator.setLocomotion({ isMoving: moving, speed: moving ? speed : 0, moveDirection: { x: 0, z: 1 } });
    animator.update(DT);
    const after = animator.getGaitClock().terminal?.status;
    if (after && after !== "armed") weights.push(seam.currentTerminalWeight);
    if (after === "settled") break;
  }
  animator.dispose();
  return weights;
}

// Needs the patched package; an install from before the patch has no timed entry.
describe.skipIf(!avatarAssetsPresent() || !editedScene3d || !fs.existsSync(avatar(RIG)))("a stop with a timed entry", () => {
  beforeAll(async () => {
    packClips = await loadPackClips();
    for (const side of ["left", "right"] as const) {
      const key = side === "left" ? "stopLeft" : "stopRight";
      stopClips.set(key, await parseStop(side));
      stopMotions.set(
        key,
        JSON.parse(fs.readFileSync(path.join(STOP_DIR, `walk-stop-${side}.motion.json`), "utf8"))
      );
    }
  });

  it("ramps the stop in over entrySeconds instead of taking it at once", async () => {
    const weights = await timedStopWeights();
    expect(weights.length).toBeGreaterThan(ENTRY / DT);
    // Nearly nothing on the first frame, even though the stop starts partway in.
    expect(weights[0]!).toBeLessThan(0.02);
    // Smoothstep over 0.5 s peaks at 1.5 / 0.5 per second, 0.05 a frame.
    let steepest = 0;
    for (let i = 1; i < weights.length; i++) steepest = Math.max(steepest, weights[i]! - weights[i - 1]!);
    expect(steepest).toBeLessThan(0.06);
    // Halfway through the entry, about half way in; whole by the end of it.
    const half = weights[Math.round(ENTRY / 2 / DT) - 1]!;
    expect(half).toBeGreaterThan(0.35);
    expect(half).toBeLessThan(0.65);
    expect(weights[Math.round(ENTRY / DT) + 1]!).toBeGreaterThan(0.99);
  });
});
