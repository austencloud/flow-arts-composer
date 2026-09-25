/**
 * Hands clear the thighs
 *
 * The pack's arm rotations were authored on a slim body. Copied onto a rig
 * with wide hips they hang the hands inside the thighs: before the arm bake,
 * standing idle put X-Bot's thumb 5.6 cm into its thigh, Remy's fingers 4.9 cm
 * and ch34's hand 12.5 cm. The thumb is the usual culprit because it sits on
 * the inside of a relaxed hand, right against the leg.
 *
 * This reads the rendered skin rather than asking the bake what it did: every
 * hand and thigh vertex is skinned through the posed skeleton, and depth is
 * measured against the thigh's own surface along the direction the hand lies
 * in from the thigh's axis. It shares no geometry with the bake, so a bake that
 * fooled its own model would still fail here.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  Group,
  Vector3,
  type AnimationClip,
  type Bone,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { LocomotionAnimator } from "@austencloud/scene-3d";

import {
  avatar,
  avatarAssetsPresent,
  loadPackClips,
  loadRig,
} from "./locomotion-harness";

/** The rigs that went through their thighs, and three that never did. */
const RIGS = ["x-bot", "remy", "y-bot", "ch34", "ch01", "ch12", "ch44"];
/**
 * Skin-to-skin, a few millimetres of overlap is a relaxed hand resting on a
 * leg and reads as contact on screen. The failures this guards were 2 to 12
 * centimetres.
 */
const TOLERANCE = 0.004;
const FRAME_RATE = 30;

interface SkinSet {
  mesh: SkinnedMesh;
  vertices: number[];
}

function boneNamed(root: Object3D, suffix: string): Bone {
  let hit: Bone | null = null;
  root.traverse((node) => {
    if (!hit && (node as Bone).isBone && node.name.endsWith(suffix))
      hit = node as Bone;
  });
  if (!hit) throw new Error(`no bone ending ${suffix}`);
  return hit;
}

/** Vertices whose heaviest weight is on a bone the test accepts. */
function skinOn(root: Object3D, accept: (bone: Object3D) => boolean) {
  const sets: SkinSet[] = [];
  root.traverse((node) => {
    const mesh = node as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible) return;
    const index = mesh.geometry.getAttribute("skinIndex");
    const weight = mesh.geometry.getAttribute("skinWeight");
    const vertices: number[] = [];
    for (let i = 0; i < index.count; i++) {
      let best = -1;
      let heaviest = -1;
      for (let k = 0; k < 4; k++) {
        const w = weight.getComponent(i, k);
        if (w > heaviest) {
          heaviest = w;
          best = index.getComponent(i, k);
        }
      }
      const bone = mesh.skeleton.bones[best];
      if (bone && accept(bone)) vertices.push(i);
    }
    if (vertices.length) sets.push({ mesh, vertices });
  });
  return sets;
}

function skinned(sets: SkinSet[]): Vector3[] {
  const points: Vector3[] = [];
  for (const { mesh, vertices } of sets) {
    for (const i of vertices) {
      const v = new Vector3();
      mesh.getVertexPosition(i, v);
      points.push(v.applyMatrix4(mesh.matrixWorld));
    }
  }
  return points;
}

/** Deepest hand point inside the thigh, in metres; negative is a gap. */
function handDepth(hand: Vector3[], thigh: Vector3[], hip: Vector3, knee: Vector3) {
  const axis = knee.clone().sub(hip);
  const length = axis.length();
  axis.divideScalar(length);
  const place = (p: Vector3) => {
    const along = p.clone().sub(hip).dot(axis);
    const radial = p.clone().sub(hip).addScaledVector(axis, -along);
    return { along, radial, reach: radial.length() };
  };
  const surface = thigh.map(place);
  const cone = Math.cos((20 * Math.PI) / 180);
  let deepest = -Infinity;
  for (const p of hand) {
    const h = place(p);
    if (h.along <= 0 || h.along >= length || h.reach > 0.25) continue;
    const direction = h.radial.clone().normalize();
    let skin = 0;
    for (const s of surface) {
      if (Math.abs(s.along - h.along) > 0.03 || s.reach < 1e-4) continue;
      if (s.radial.dot(direction) / s.reach < cone) continue;
      skin = Math.max(skin, s.reach);
    }
    if (skin > 0) deepest = Math.max(deepest, skin - h.reach);
  }
  return deepest;
}

describe.skipIf(!avatarAssetsPresent())("hands clear the thighs", () => {
  let clips: Map<string, AnimationClip>;
  beforeAll(async () => {
    clips = await loadPackClips();
  }, 120_000);

  for (const id of RIGS) {
    it(`${id} keeps its hands out of its thighs standing and walking`, async () => {
      const rig = await loadRig(avatar(id));
      const travel = new Group();
      travel.add(rig.scene);
      const animator = new LocomotionAnimator();
      const seam = animator as unknown as {
        pendingClips: Map<string, AnimationClip>;
        clipsLoaded: boolean;
      };
      seam.pendingClips = new Map(clips);
      seam.clipsLoaded = true;
      animator.initialize(rig.scene);

      const sides = (["Left", "Right"] as const).map((side) => {
        const forearm = boneNamed(rig.scene, `${side}ForeArm`);
        const inHand = new Set<Object3D>();
        forearm.traverse((node) => inHand.add(node));
        const thigh = boneNamed(rig.scene, `${side}UpLeg`);
        return {
          side,
          hand: skinOn(rig.scene, (bone) => inHand.has(bone)),
          thigh: skinOn(rig.scene, (bone) => bone === thigh),
          hip: thigh,
          knee: boneNamed(rig.scene, `${side}Leg`),
        };
      });

      const worst = { standing: -Infinity, walking: -Infinity };
      const dt = 1 / FRAME_RATE;
      // Two seconds standing, then three walking at the Walk Lab's default
      // pace. The first half second of each is the blend settling.
      for (let frame = 0; frame < 5 * FRAME_RATE; frame++) {
        const t = frame * dt;
        const walking = t >= 2;
        animator.setLocomotion({
          isMoving: walking,
          speed: walking ? 1 : 0,
          moveDirection: { x: 0, z: 1 },
        });
        animator.update(dt);
        if (walking) travel.position.z += dt;
        travel.updateMatrixWorld(true);
        if ((t % 2) < 0.5 || frame % 2) continue;

        for (const side of sides) {
          const depth = handDepth(
            skinned(side.hand),
            skinned(side.thigh),
            side.hip.getWorldPosition(new Vector3()),
            side.knee.getWorldPosition(new Vector3())
          );
          const phase = walking ? "walking" : "standing";
          worst[phase] = Math.max(worst[phase], depth);
        }
      }
      animator.dispose();

      expect(worst.standing, `${id} standing, metres into the thigh`).toBeLessThan(TOLERANCE);
      expect(worst.walking, `${id} walking, metres into the thigh`).toBeLessThan(TOLERANCE);
    }, 120_000);
  }
});
