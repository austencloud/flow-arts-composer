import { describe, expect, it } from "vitest";
import { Bone, BoxGeometry, Group, Mesh, Object3D, Scene } from "three";

import { createBodyResponseProbe } from "#lib/shared/3d/diagnostics/body-response/body-response-probe.js";

function bone(name: string, parent: Object3D, x: number, y: number, z: number): Bone {
  const b = new Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

/**
 * A staff on the grid point `offset` from its anchor, its shaft along x,
 * 1.4 m tip to tip. As on the stage, a correction group between the grid
 * point and the model welds it to the hand; here it slides the staff 5 cm
 * along its own shaft, so the centre line stays put.
 */
function staff(anchor: Object3D, offset: [number, number, number]): void {
  const point = new Group();
  point.position.set(...offset);
  const correction = new Group();
  correction.position.set(0.05, 0, 0);
  point.add(correction);
  const model = new Object3D();
  model.name = "TKA_FireDoubleStaff";
  correction.add(model);
  const mesh = new Mesh(new BoxGeometry(1.4, 0.03, 0.03));
  mesh.name = "TKA_FireStaff_Tube_Mesh";
  model.add(mesh);
  const pivot = new Object3D();
  pivot.name = "TKA_Hand_Pivot";
  model.add(pivot);
  anchor.add(point);
}

/**
 * One performer facing +z (their left is +x), standing at the origin.
 * The left staff is held at (0.6, 1.4, 0.5), well clear of the body; the
 * right staff lies across the chest at (0, 1.35, 0).
 */
function stage(prefix = "mixamorig") {
  const scene = new Scene();
  const rig = new Group();
  scene.add(rig);
  const root = new Group();
  root.name = "PERFORMER_phrase-stage-solo";
  rig.add(root);

  const hips = bone(`${prefix}Hips`, root, 0, 1, 0);
  const spine = bone(`${prefix}Spine`, hips, 0, 0.1, 0);
  const spine1 = bone(`${prefix}Spine1`, spine, 0, 0.12, 0);
  const spine2 = bone(`${prefix}Spine2`, spine1, 0, 0.14, 0);
  const neck = bone(`${prefix}Neck`, spine2, 0, 0.14, 0);
  bone(`${prefix}Head`, neck, 0, 0.1, 0);
  bone(`${prefix}LeftShoulder`, spine2, 0.05, 0.1, 0);
  bone(`${prefix}RightShoulder`, spine2, -0.05, 0.1, 0);

  const legs = (side: "Left" | "Right", x: number) => {
    const up = bone(`${prefix}${side}UpLeg`, hips, x, -0.05, 0);
    const knee = bone(`${prefix}${side}Leg`, up, 0, -0.45, 0);
    const ankle = bone(`${prefix}${side}Foot`, knee, 0, -0.42, 0); // y 0.08
    bone(`${prefix}${side}ToeBase`, ankle, 0, -0.06, 0.12); // y 0.02
    return up;
  };
  const leftUp = legs("Left", 0.1);
  const rightUp = legs("Right", -0.1);

  // Hands hang off the root directly: only their world positions matter.
  // Left palm (midway to the middle knuckle) is on its shaft, the wrist 5 cm off.
  const leftHand = bone(`${prefix}LeftHand`, root, 0.6, 1.45, 0.5);
  bone(`${prefix}LeftHandMiddle1`, leftHand, 0, -0.1, 0);
  // Right palm at (0.2, 1.35, 0.06): 6 cm in front of its shaft.
  const rightHand = bone(`${prefix}RightHand`, root, 0.2, 1.35, 0.08);
  bone(`${prefix}RightHandMiddle1`, rightHand, 0, 0, -0.04);

  const propLeft = new Group();
  propLeft.name = "PERFORMER_PROP_LEFT";
  propLeft.position.set(0.6, 1.4, 0);
  staff(propLeft, [0, 0, 0.5]);
  const propRight = new Group();
  propRight.name = "PERFORMER_PROP_RIGHT";
  propRight.position.set(0, 1.35, -0.52);
  staff(propRight, [0, 0, 0.52]);
  rig.add(propLeft, propRight);

  scene.updateMatrixWorld(true);
  return { scene, leftUp, rightUp };
}

describe("body response probe", () => {
  it("measures grid reach, hand gap, body hits and feet over three frames", () => {
    const { scene, leftUp, rightUp } = stage();
    let clock = 0;
    const probe = createBodyResponseProbe(scene, {
      performerIds: ["solo"],
      now: () => (clock += 16),
    });
    const frames = [{ phraseIndex: 0, facingAngle: 0, phrase: { plane: "wheel", mode: "planted" } }];

    // Frame 0: both feet down.
    probe.sample(0, frames);
    // Frame 1: the left foot is 10 cm up; the right slides 1 cm.
    leftUp.position.y += 0.1;
    rightUp.position.x -= 0.01;
    scene.updateMatrixWorld(true);
    probe.sample(0.03, frames);
    // Frame 2: the left foot is back down; the right slides another 2 cm.
    leftUp.position.y -= 0.1;
    rightUp.position.x -= 0.02;
    scene.updateMatrixWorld(true);
    probe.sample(0.06, frames);

    const rows = probe.rows();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.handGapLeft).toBeCloseTo(0, 4);
    expect(rows[0]!.wristGapLeft).toBeCloseTo(0.05, 4);
    expect(rows[0]!.handGapRight).toBeCloseTo(0.06, 4);
    // A staff across the chest is inside the chest capsule and nothing else;
    // one half a metre in front of the body is inside nothing.
    expect(rows[0]!.hitsRight).toBe("chest");
    expect(rows[0]!.hitsLeft).toBe("");

    const summary = probe.summary();
    const solo = summary.performers.solo!.overall;
    expect(solo.frames).toBe(3);
    // On the wheel plane (normal = the performer's left-right axis) the
    // offsets along z are all in plane.
    expect(solo.gridRadius.maxM).toBeCloseTo(0.52, 4);
    expect(solo.weld.maxM).toBeCloseTo(0.05, 4);
    expect(solo.chestFlip.frames).toBe(0);
    expect(solo.handOff).toMatchObject({ left: 0, right: 3, anyFrames: 3, share: 1 });
    expect(solo.wristOff.left).toBe(3);
    // The right hand's 6 cm is its usual offset, so it never drifts.
    expect(solo.handDrift.right).toBe(0);
    expect(solo.body.byCapsule.chest).toBe(3);
    expect(solo.body.torsoFrames).toBe(3);
    expect(solo.body.headFrames).toBe(0);

    expect(solo.feet.right.slideSumM).toBeCloseTo(0.03, 4);
    expect(solo.feet.right.slideMaxPerFrameM).toBeCloseTo(0.02, 4);
    expect(solo.feet.right.steps).toBe(0);
    expect(solo.feet.left.steps).toBe(1);
    expect(solo.feet.left.liftMaxM).toBeCloseTo(0.1, 4);
    expect(solo.feet.left.slideSumM).toBe(0);
    expect(summary.meta.performers[0]!.footFloorAboveRootM).toBeCloseTo(0.02, 4);
    expect(summary.meta.performers[0]!.missing).toEqual([]);

    expect(solo.hipsOffsetM.y).toEqual([1, 1]);
    expect(solo.chestYawDeg).toEqual([0, 0]);
    expect(summary.fps.mean).toBeCloseTo(62.5, 1);
    expect(summary.performers.solo!.planes.wheel!.frames).toBe(3);
  });

  it("finds the bones of a numbered Mixamo export", () => {
    const { scene } = stage("mixamorig8");
    const probe = createBodyResponseProbe(scene, { performerIds: ["solo"] });
    probe.sample(0, [{ phrase: { plane: "wheel" } }]);
    expect(probe.summary().meta.performers[0]!.missing).toEqual([]);
    expect(probe.rows()[0]!.hitsRight).toBe("chest");
  });

  it("projects grid reach onto the phrase's plane", () => {
    const { scene } = stage();
    const probe = createBodyResponseProbe(scene, { performerIds: ["solo"] });
    // On the wall plane (normal = facing, +z) both staffs' offsets are along
    // the normal, so their in-plane reach is zero.
    probe.sample(0, [{ phrase: { plane: "wall" } }]);
    const row = probe.rows()[0]!;
    expect(row.gridRadiusLeft).toBeCloseTo(0, 4);
    expect(row.gridRadius3dLeft).toBeCloseTo(0.5, 4);
  });
});
