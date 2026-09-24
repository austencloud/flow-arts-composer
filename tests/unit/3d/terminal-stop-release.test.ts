/**
 * Letting go of a settled stop.
 *
 * A walk that has stopped is held in the terminal clip's last pose. Whatever
 * comes next, a turn or the next walk, begins by clearing the terminal plan.
 * On 2026-09-24 clearing it dropped the stop clip's weight from one to zero
 * in a single call while idle was still at zero, so three.js filled the
 * missing weight with the skeleton's bind pose for a frame. In the walk lab
 * shuttle that put both ankles 4 to 13 cm away from the settled stance on the
 * first frame of the about-face, a 2.5 to 7.7 m/s ankle spike on every rig,
 * before the turn clip had faded in at all.
 *
 * Played here on the animator alone, with the shipped rigs and clips, so the
 * test sees the pose the mixer writes before FootPlanter can soften it.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LocomotionAnimator } from "@austencloud/scene-3d";

import { createPatternTerminalStepPlan } from "$lib/shared/3d/locomotion/pattern-terminal-step-plan";
import { avatar, loadPackClips, loadRig } from "./locomotion-harness";

const STOP_DIR = path.resolve("static/animations/terminal-stops");
const RIGS = ["ch01", "ch12", "ch44", "remy", "x-bot"];
const DT = 1 / 60;

/** The fields `loadAnimations` fills over the network, and the actions. */
interface LoadSeam {
  pendingClips: Map<string, AnimationClip>;
  terminalMotions: Record<"stopLeft" | "stopRight", unknown>;
  clipsLoaded: boolean;
  mixer: { _actions: AnimationAction[] } | null;
}

/**
 * Everything the mixer is blending this frame. Below one, three makes up the
 * difference with the bind pose, which is the flash this suite exists for.
 */
function totalWeight(seam: LoadSeam): number {
  return (seam.mixer?._actions ?? []).reduce(
    (sum, action) => sum + action.getEffectiveWeight(),
    0
  );
}

let packClips: Map<string, AnimationClip>;
const stopClips = new Map<string, AnimationClip>();
const stopMotions = new Map<string, unknown>();

async function parseStop(side: "left" | "right"): Promise<AnimationClip> {
  const bytes = new Uint8Array(
    fs.readFileSync(path.join(STOP_DIR, `walk-stop-${side}.glb`))
  );
  const gltf = await new Promise<{ animations: AnimationClip[] }>(
    (resolve, reject) =>
      new GLTFLoader().parse(bytes.buffer, "", resolve as never, reject)
  );
  return gltf.animations[0]!;
}

beforeAll(async () => {
  packClips = await loadPackClips();
  for (const side of ["left", "right"] as const) {
    const key = side === "left" ? "stopLeft" : "stopRight";
    stopClips.set(key, await parseStop(side));
    stopMotions.set(
      key,
      JSON.parse(
        fs.readFileSync(
          path.join(STOP_DIR, `walk-stop-${side}.motion.json`),
          "utf8"
        )
      )
    );
  }
});

function ankles(scene: Object3D): [Vector3, Vector3] {
  const find = (suffix: string) => {
    let hit: Object3D | null = null;
    scene.traverse((node) => {
      if (!hit && node.name.endsWith(suffix)) hit = node;
    });
    if (!hit) throw new Error(`missing ${suffix}`);
    return hit as Object3D;
  };
  const left = find("LeftFoot");
  const right = find("RightFoot");
  scene.updateMatrixWorld(true);
  return [
    left.getWorldPosition(new Vector3()),
    right.getWorldPosition(new Vector3()),
  ];
}

/**
 * Walk, stop through the pattern planner, hold the settled pose, then clear
 * the plan and stand. Returns the ankle travel on the release frame and the
 * lowest total clip weight on any frame of the handover.
 */
async function releaseSettledStop(rig: string) {
  const { scene } = await loadRig(avatar(rig));
  const animator = new LocomotionAnimator();
  const seam = animator as unknown as LoadSeam;
  seam.pendingClips = new Map([...packClips, ...stopClips]);
  seam.terminalMotions.stopLeft = stopMotions.get("stopLeft")!;
  seam.terminalMotions.stopRight = stopMotions.get("stopRight")!;
  seam.clipsLoaded = true;
  animator.initialize(scene);

  const speed = 1;
  let remaining = 4;
  let plan: ReturnType<typeof createPatternTerminalStepPlan> = null;
  let settledFrames = 0;
  for (let frame = 0; frame < 60 * 12 && settledFrames < 30; frame++) {
    const clock = animator.getGaitClock();
    const status = clock.terminal?.status;
    if (!plan && frame > 60 && clock.cadence > 0) {
      plan = createPatternTerminalStepPlan({
        intent: { id: "stop", remainingDistance: remaining, targetFacing: 0 },
        gaitStep: clock.step,
        cadence: clock.cadence,
        speed,
      });
    }
    const moving = status !== "landed" && status !== "settled";
    animator.setTerminalStepPlan(plan);
    animator.setLocomotion({
      isMoving: moving,
      speed: moving ? speed : 0,
      moveDirection: { x: 0, z: 1 },
    });
    animator.update(DT);
    remaining = Math.max(0.05, remaining - speed * DT);
    if (animator.getGaitClock().terminal?.status === "settled") {
      settledFrames += 1;
    }
  }
  expect(settledFrames, `${rig} reached the settled stop`).toBe(30);

  const before = ankles(scene);
  let first = 0;
  let lowestWeight = Infinity;
  for (let frame = 0; frame < 45; frame++) {
    animator.setTerminalStepPlan(null);
    animator.setLocomotion({
      isMoving: false,
      speed: 0,
      moveDirection: { x: 0, z: 1 },
    });
    animator.update(DT);
    if (frame === 0) {
      const after = ankles(scene);
      first = Math.max(
        after[0].distanceTo(before[0]),
        after[1].distanceTo(before[1])
      );
    }
    lowestWeight = Math.min(lowestWeight, totalWeight(seam));
  }
  animator.dispose();
  return { first, lowestWeight };
}

describe("releasing a settled terminal stop", () => {
  it.each(RIGS)(
    "%s hands the held stance to idle without a jump",
    async (rig) => {
      const { first, lowestWeight } = await releaseSettledStop(rig);
      // A 1 cm step at 60 fps is 0.6 m/s, well under a walking swing foot.
      // The bind-pose flash moved an ankle 12 to 24 cm on this frame here.
      expect(first, `${rig} ankle travel on the release frame`).toBeLessThan(
        0.01
      );
      // After that the stop crossfades to idle over the usual blend time.
      // What must not happen is weight going missing on the way.
      expect(lowestWeight, `${rig} total clip weight`).toBeGreaterThan(0.999);
    }
  );
});
