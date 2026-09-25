/**
 * Where a stopped walk leaves the feet.
 *
 * Two faults showed in the walk lab shuttle on 2026-09-24, and both come from
 * the stop clips being taken as they arrive from the source instead of being
 * measured on the rig that plays them, the way the walks are.
 *
 * Height: the stop clips keep the "bob" pelvis track, which holds the pelvis
 * at rest height, and borrowed the forward walk's dip to bring it down. Since
 * the contact bake carries the walk's dip inside the walk clip, that borrowed
 * dip is close to zero, so every rig settled with both soles 4 to 5 cm above
 * the floor: the capture's standing-idle knees (about 150 degrees) hung under
 * a pelvis held at rest height.
 *
 * Placement: the stop scaled its braking stride against the capture's travel
 * in source metres. Remy's legs are about twice that length, so every step it
 * took was read as far too short, the stride scale sat on its 1.75 clamp, and
 * FootPlanter's stride warp planted both feet well ahead of the root. The
 * about-face that pivots about the root then had to tear the pinned foot
 * half a metre back to the turn clip. Measuring the stop on the rig fixed the
 * scale, and exposed the second half: the warp scales a foot's offset from the
 * pelvis, and a stop's last feet settle ahead of the pelvis, so even a correct
 * scale of 1.27 on ch01 still planted them 7 cm ahead of the settled pose.
 *
 * The shuttle is reproduced here with the shipped rigs and clips, the root
 * following the stop's distance curve exactly as WalkDriver does.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Group,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ContactCurveCache,
  FootPlanter,
  HingeConstrainedLegIKSolver,
  LocomotionAnimator,
  LocomotionState,
  type TerminalStepPlan,
} from "@austencloud/scene-3d";

import {
  createPatternTerminalStepPlan,
  samplePatternTerminalTravel,
} from "$lib/shared/3d/locomotion/pattern-terminal-step-plan";
import {
  avatar,
  avatarAssetsPresent,
  loadPackClips,
  loadRig,
} from "./locomotion-harness";

const STOP_DIR = path.resolve("static/animations/terminal-stops");
const RIGS = ["ch01", "ch12", "ch44", "remy", "x-bot"];
const DT = 1 / 60;
const SPEED = 1;
const MARK = 4;

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

function bone(scene: Object3D, suffix: string): Object3D {
  let hit: Object3D | null = null;
  scene.traverse((node) => {
    if (!hit && node.name.endsWith(suffix)) hit = node;
  });
  if (!hit) throw new Error(`missing ${suffix}`);
  return hit;
}

const world = (node: Object3D) => node.getWorldPosition(new Vector3());

interface SettledStance {
  rootZ: number;
  /** Height of each sole over the floor, ankle or ball, whichever is lower. */
  soles: [number, number];
  /** Where each ankle ended along the walk, in world metres. */
  ankleZ: [number, number];
  /** The rig's pelvis height at bind, which every tolerance scales with. */
  size: number;
}

/**
 * Walk to the mark, stop through the pattern planner, and hold the settled
 * pose for half a second.
 */
async function settleStop(
  rig: string,
  planting: boolean
): Promise<SettledStance> {
  const loaded = await loadRig(avatar(rig));
  const scene = loaded.scene;
  const travel = new Group();
  travel.add(scene);
  travel.updateMatrixWorld(true);

  // The floor the rig is authored standing on: the lower of its two ankles,
  // and of its two balls of the foot, before anything plays.
  const bindAnkle = Math.min(
    world(bone(scene, "LeftFoot")).y,
    world(bone(scene, "RightFoot")).y
  );
  const bindToe = Math.min(
    world(bone(scene, "LeftToeBase")).y,
    world(bone(scene, "RightToeBase")).y
  );
  const size = world(bone(scene, "Hips")).y;

  const animator = new LocomotionAnimator();
  const seam = animator as unknown as {
    pendingClips: Map<string, AnimationClip>;
    terminalMotions: Record<"stopLeft" | "stopRight", unknown>;
    clipsLoaded: boolean;
  };
  seam.pendingClips = new Map([...packClips, ...stopClips]);
  seam.terminalMotions.stopLeft = stopMotions.get("stopLeft")!;
  seam.terminalMotions.stopRight = stopMotions.get("stopRight")!;
  seam.clipsLoaded = true;
  animator.initialize(scene);

  let planter: FootPlanter | null = null;
  if (planting) {
    planter = new FootPlanter();
    planter.initialize(
      loaded.skeleton,
      new HingeConstrainedLegIKSolver(),
      new ContactCurveCache()
    );
    const sole = animator.getSoleOffset();
    if (sole > 0) planter.configure({ footHeightOffset: sole });
    const toe = animator.getToeOffset();
    if (toe >= 0) planter.configure({ toeHeightOffset: toe });
  }

  let z = 0;
  let plan: TerminalStepPlan | null = null;
  let braking: { distance: number; from: number } | null = null;
  let settledFrames = 0;
  for (let frame = 0; frame < 60 * 12 && settledFrames < 30; frame++) {
    const clock = animator.getGaitClock();
    const status = clock.terminal?.status;
    if (!plan && frame > 30 && clock.cadence > 0) {
      plan = createPatternTerminalStepPlan({
        intent: { id: "stop", remainingDistance: MARK - z, targetFacing: 0 },
        gaitStep: clock.step,
        cadence: clock.cadence,
        speed: SPEED,
      });
    }

    // WalkDriver's handover: once the stop brakes, the root follows the
    // stop's distance curve from wherever this frame's walking left it.
    const ownsRoot =
      !!plan &&
      clock.distanceStep !== undefined &&
      (status === "braking" || status === "landed" || status === "settled");
    let moving = true;
    if (ownsRoot && !braking) {
      z += SPEED * DT;
      braking = {
        distance: MARK - z,
        from: samplePatternTerminalTravel(plan!, clock.distanceStep!),
      };
    } else if (ownsRoot) {
      const covered = samplePatternTerminalTravel(plan!, clock.distanceStep!);
      z =
        MARK -
        (braking!.from >= 1
          ? 0
          : braking!.distance *
            Math.max(0, (1 - covered) / (1 - braking!.from)));
      moving = status === "braking";
    } else {
      z += SPEED * DT;
    }

    animator.setTerminalStepPlan(plan);
    animator.setLocomotion({
      isMoving: moving,
      speed: moving ? SPEED : 0,
      moveDirection: { x: 0, z: 1 },
    });
    animator.update(DT);
    travel.position.z = z;
    travel.updateMatrixWorld(true);

    const after = animator.getGaitClock().terminal?.status;
    if (planter) {
      // Avatar3D keeps the planter in its walking mode, with the slower
      // terminal lock blend, for as long as the stop owns contact.
      const ownsContact =
        after === "braking" || after === "landed" || after === "settled";
      planter.configure({ lockBlendInTime: ownsContact ? 0.3 : 0.08 });
      const contact = animator.getFootContact();
      planter.update(DT, {
        groundY: 0,
        locomotionState: LocomotionState.WALKING,
        isMoving: moving || ownsContact,
        contactLeft: contact.left,
        contactRight: contact.right,
        lockConfidence: animator.getFootPlantConfidence(),
        strideScale: animator.getStrideScale(),
        travelDirection: { x: 0, z: 1 },
        settlingPlants: animator.getSettlingPlants() ?? undefined,
      });
    }
    if (after === "settled") settledFrames += 1;
  }
  expect(settledFrames, `${rig} reached the settled stop`).toBe(30);

  scene.updateMatrixWorld(true);
  const sole = (side: "Left" | "Right") =>
    Math.min(
      world(bone(scene, `${side}Foot`)).y - bindAnkle,
      world(bone(scene, `${side}ToeBase`)).y - bindToe
    );
  const stance: SettledStance = {
    rootZ: z,
    soles: [sole("Left"), sole("Right")],
    ankleZ: [
      world(bone(scene, "LeftFoot")).z,
      world(bone(scene, "RightFoot")).z,
    ],
    size,
  };
  animator.dispose();
  return stance;
}

describe.skipIf(
  !avatarAssetsPresent() ||
    !fs.existsSync(avatar("remy")) ||
    !fs.existsSync(avatar("x-bot"))
)("the settled terminal stop", () => {
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

  it.each(RIGS)("%s stands both soles on the floor", async (rig) => {
    for (const planting of [false, true]) {
      const { soles, size } = await settleStop(rig, planting);
      const label = `${rig} ${planting ? "planted" : "animator only"}`;
      // A centimetre and a half on a one-metre pelvis. Before the stop was
      // measured on the rig, both soles held 3.8 to 5.3 cm up here.
      for (const [index, height] of soles.entries()) {
        const side = index === 0 ? "left" : "right";
        expect(height, `${label} ${side} sole over the floor`).toBeLessThan(
          0.015 * size
        );
        expect(height, `${label} ${side} sole into the floor`).toBeGreaterThan(
          -0.01 * size
        );
      }
    }
  });

  it.each(RIGS)(
    "%s plants its feet where the stop puts them",
    async (rig) => {
      const free = await settleStop(rig, false);
      const planted = await settleStop(rig, true);
      // The planter holds contacts; it must not move the stance. Remy's
      // planted ankles ended 0.34 and 0.79 m ahead of the clip's here, on a
      // 2.09 m pelvis, from a braking stride scaled against source metres;
      // ch01 and ch12 ended 7 cm ahead once the scale was right. Every rig
      // now lands within about a centimetre.
      for (const index of [0, 1]) {
        const side = index === 0 ? "left" : "right";
        expect(
          Math.abs(planted.ankleZ[index]! - free.ankleZ[index]!),
          `${rig} ${side} planted ankle against the clip's`
        ).toBeLessThan(0.025 * planted.size);
      }
    }
  );
});
