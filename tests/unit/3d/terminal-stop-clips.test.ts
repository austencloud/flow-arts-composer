/**
 * The two terminal stop clips, played on the skeleton they ship with.
 *
 * These are the braking steps LocomotionAnimator hands a walk to on a stop.
 * The source is a clean Mixamo capture, so any fault found here was
 * introduced by `build-terminal-stops.py`. On 2026-09-24 the build keyed every
 * child bone against its parent's pose from the last source frame instead of
 * the frame being keyed. The legs came out dragged behind the pelvis, the
 * declared stance foot skated 20 cm, and the terminal foot flicked up 44 cm
 * behind the body on X-Bot in the walk lab. That reads as a trip, a held pose
 * and then a lunge. The build also left the capture's 10-13 degree braking
 * pelvis pitch on the Hips track, which the runtime drops, so the settled
 * legs swung back behind the body. The build now folds that pitch into the
 * pelvis's children.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AnimationMixer,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const DIR = path.resolve("static/animations/terminal-stops");

interface Sidecar {
  frameRate: number;
  frameCount: number;
  stepFrames: [number, number];
  terminalFoot: "left" | "right";
  leftFoot: number[];
  rightFoot: number[];
}

async function load(side: "left" | "right") {
  const bytes = new Uint8Array(
    fs.readFileSync(path.join(DIR, `walk-stop-${side}.glb`))
  );
  const gltf = await new Promise<{
    scene: Object3D;
    animations: AnimationClip[];
  }>((resolve, reject) =>
    new GLTFLoader().parse(bytes.buffer, "", resolve as never, reject)
  );
  const sidecar = JSON.parse(
    fs.readFileSync(path.join(DIR, `walk-stop-${side}.motion.json`), "utf8")
  ) as Sidecar;
  return { scene: gltf.scene, clip: gltf.animations[0]!, sidecar };
}

/**
 * World pelvis and toe positions for every authored frame, played the way
 * LocomotionAnimator plays it: `remapClipToSkeleton` drops every Hips
 * quaternion track, so the pelvis holds its rest orientation and only its
 * children carry rotation.
 */
function sampleFeet(scene: Object3D, clip: AnimationClip, sidecar: Sidecar) {
  const bone = (name: string) => {
    const found = scene.getObjectByName(`mixamorig${name}`);
    if (!found) throw new Error(`missing bone ${name}`);
    return found;
  };
  const bones = {
    hips: bone("Hips"),
    leftToe: bone("LeftToeBase"),
    rightToe: bone("RightToeBase"),
    leftAnkle: bone("LeftFoot"),
    rightAnkle: bone("RightFoot"),
  };
  const pelvisRest = bones.hips.quaternion.clone();
  const mixer = new AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const frames: Record<keyof typeof bones, Vector3>[] = [];
  for (let i = 0; i < sidecar.frameCount; i++) {
    // setTime at exactly the duration wraps a looping action to frame 0.
    mixer.setTime(Math.min(i / sidecar.frameRate, clip.duration - 1e-4));
    bones.hips.quaternion.copy(pelvisRest);
    scene.updateMatrixWorld(true);
    frames.push({
      hips: bones.hips.getWorldPosition(new Vector3()),
      leftToe: bones.leftToe.getWorldPosition(new Vector3()),
      rightToe: bones.rightToe.getWorldPosition(new Vector3()),
      leftAnkle: bones.leftAnkle.getWorldPosition(new Vector3()),
      rightAnkle: bones.rightAnkle.getWorldPosition(new Vector3()),
    });
  }
  return frames;
}

describe.each(["left", "right"] as const)("walk-stop-%s", (side) => {
  it("keeps a declared stance foot still on the floor", async () => {
    const { scene, clip, sidecar } = await load(side);
    const frames = sampleFeet(scene, clip, sidecar);

    for (const foot of ["left", "right"] as const) {
      const contact = foot === "left" ? sidecar.leftFoot : sidecar.rightFoot;
      const key = foot === "left" ? "leftToe" : "rightToe";
      let anchor: Vector3 | null = null;
      let worst = 0;
      for (let i = 0; i < frames.length; i++) {
        if (contact[i]! < 0.99) {
          anchor = null;
          continue;
        }
        const toe = frames[i]![key];
        anchor ??= toe;
        worst = Math.max(worst, Math.hypot(toe.x - anchor.x, toe.z - anchor.z));
      }
      // The source capture holds a planted toe to about a centimetre.
      expect(worst, `${foot} toe slip while declared planted`).toBeLessThan(
        0.03
      );
    }
  });

  it("declares contact only once the toe has come down", async () => {
    const { scene, clip, sidecar } = await load(side);
    const frames = sampleFeet(scene, clip, sidecar);
    // FootPlanter's Schmitt trigger: it pins the toe on the first frame at
    // 0.6 and holds that spot until contact drops below 0.35.
    const ENTER = 0.6;
    const EXIT = 0.35;

    for (const foot of ["left", "right"] as const) {
      const contact = foot === "left" ? sidecar.leftFoot : sidecar.rightFoot;
      const key = foot === "left" ? "leftToe" : "rightToe";
      let pinned: Vector3 | null = null;
      let worst = 0;
      for (let i = 0; i < frames.length; i++) {
        const toe = frames[i]![key];
        if (pinned ? contact[i]! <= EXIT : contact[i]! < ENTER) {
          pinned = null;
          continue;
        }
        pinned ??= toe;
        worst = Math.max(worst, Math.hypot(toe.x - pinned.x, toe.z - pinned.z));
      }
      // Ramping contact in ahead of touchdown pinned the terminal toe while it
      // was still 9 cm up and 21 cm short, and the plant had to let go and
      // slide it the rest of the way once the stop landed.
      expect(
        worst,
        `${foot} toe travel after the plant takes hold`
      ).toBeLessThan(0.04);
    }
  });

  it("lands the terminal foot ahead of the pelvis", async () => {
    const { scene, clip, sidecar } = await load(side);
    const frames = sampleFeet(scene, clip, sidecar);
    const first = frames[0]!;
    const landing = frames[sidecar.stepFrames[1]]!;
    const forward = new Vector3()
      .subVectors(frames.at(-1)!.hips, first.hips)
      .setY(0)
      .normalize();
    const ahead = (point: Vector3, of: Vector3) =>
      new Vector3().subVectors(point, of).setY(0).dot(forward);

    // Frame 0 is the preceding support landing: that foot starts under or in
    // front of the pelvis, never half a metre behind it.
    const support = side === "left" ? first.leftToe : first.rightToe;
    expect(ahead(support, first.hips)).toBeGreaterThan(0);
    const terminal = side === "left" ? landing.leftToe : landing.rightToe;
    expect(ahead(terminal, landing.hips)).toBeGreaterThan(0);
  });

  it("settles with the pelvis over its ankles", async () => {
    const { scene, clip, sidecar } = await load(side);
    const frames = sampleFeet(scene, clip, sidecar);
    const first = frames[0]!;
    const last = frames.at(-1)!;
    const forward = new Vector3()
      .subVectors(last.hips, first.hips)
      .setY(0)
      .normalize();
    const ankles = new Vector3()
      .addVectors(last.leftAnkle, last.rightAnkle)
      .multiplyScalar(0.5);
    // The capture stands with its ankles about 5 cm ahead of the pelvis. A
    // pelvis pitch left on the stripped Hips track swings both legs back
    // round the hip and leaves the ankles 10 cm behind it.
    const offset = new Vector3()
      .subVectors(ankles, last.hips)
      .setY(0)
      .dot(forward);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(0.15);
  });
});
