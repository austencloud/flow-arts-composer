import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GripType } from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sampleStaffIsolation } from "$lib/shared/3d/performers/staff-isolation";
import {
  allowedTipOffset,
  authoredBodyPose,
  defaultTeachingKeys,
  isolationPalmRoll,
  sampleTeachingPose,
  TEACHING_ANCHOR_OFFSET,
  upsertTeachingKey,
} from "../../../src/routes/test/grip-lab/isolation-teaching";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const STAFF_RADIUS_M = 0.0102125;
describe.runIf(avatarAssetsPresent())("relaxed strict-contact grip", () => {
  it("keeps ch07's North hold as a seek-independent thumb-index pinch", async () => {
    const { scene } = await loadRig(avatar("ch07"));
    const services = createAvatarServices({
      enableLocomotion: false,
      enableRootMotion: false,
      enableFootPlanting: false,
    });
    (
      services.skeleton as unknown as {
        processGLTF(
          root: import("three").Object3D,
          bounds: null,
          label: string
        ): void;
      }
    ).processGLTF(scene, null, "ch07");
    services.skeleton.setHeight(1.905);
    const root = new Group();
    root.add(scene);
    root.position.y = -services.skeleton.getFeetOffset();
    root.updateWorldMatrix(true, true);
    const state = services.skeleton.getState();
    services.fingers.initialize(state.fingerChains!, state.meshes);
    services.fingers.setCylinderContactStrict(true);
    services.animator.setContactMode("prop-authoritative");

    let keys = defaultTeachingKeys();
    const sample = (
      phase: number,
      relaxation: number,
      rollOverride?: number
    ) => {
      const teaching = sampleTeachingPose(phase, keys);
      const tip = allowedTipOffset(teaching, 0.13);
      const authored = sampleStaffIsolation(phase, [
        tip[0] + TEACHING_ANCHOR_OFFSET[0],
        tip[1] + TEACHING_ANCHOR_OFFSET[1],
        tip[2] + TEACHING_ANCHOR_OFFSET[2],
      ]);
      const center = authored.worldPosition.clone().add(ORIGIN);
      const orientation = authored.worldRotation
        .clone()
        .multiply(
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
        );
      const axis = new Vector3(0, -1, 0)
        .applyQuaternion(orientation)
        .normalize();
      const a = center.clone().addScaledVector(axis, -0.45);
      const b = center.clone().addScaledVector(axis, 0.45);
      const pose = authoredBodyPose(teaching, phase);
      pose.gripRelaxation = relaxation;
      pose.gripTiltRad = 1.0472;
      if (rollOverride !== undefined) pose.gripPalmRollRad = rollOverride;
      services.animator.setAuthoredContactPose(pose);
      services.animator.setPropsAndBlend(
        null,
        { ...authored, worldPosition: center },
        undefined,
        { blue: null, red: orientation }
      );
      services.fingers.setGrips(GripType.IDLE, GripType.SQUARE);
      services.fingers.setContactRelaxation("right", relaxation, 1.0472);
      services.fingers.update(1 / 120);
      services.animator.update(1 / 120);
      const palm = services.animator.getPalmWorldPoint?.(
        "right",
        new Vector3()
      );
      services.fingers.setCylinderContact("right", {
        a,
        b,
        radiusM: STAFF_RADIUS_M,
        lengthM: 0.9,
      });
      services.fingers.solveCylinderContacts();
      root.updateWorldMatrix(true, true);
      const indexDirection = state
        .fingerChains!.right.get("Index3")!
        .getWorldPosition(new Vector3())
        .sub(
          state
            .fingerChains!.right.get("Index1")!
            .getWorldPosition(new Vector3())
        )
        .normalize();
      const fingers = state.fingerChains!.right;
      const wristPoint = state.rightArmChain!.effector.getWorldPosition(
        new Vector3()
      );
      const middlePoint = fingers
        .get("Middle1")!
        .getWorldPosition(new Vector3());
      const palmNormal = fingers
        .get("Pinky1")!
        .getWorldPosition(new Vector3())
        .sub(fingers.get("Index1")!.getWorldPosition(new Vector3()))
        .cross(middlePoint.clone().sub(wristPoint))
        .normalize();
      if (
        palmNormal.dot(
          fingers
            .get("Thumb1")!
            .getWorldPosition(new Vector3())
            .sub(middlePoint)
        ) < 0
      )
        palmNormal.negate();
      return {
        phase,
        palmNormal,
        wrist: state.rightArmChain!.effector.getWorldPosition(new Vector3()),
        fingers: services.fingers
          .getCylinderContactReport("right")
          .map((finger) => ({ ...finger })),
        rotations: [...state.fingerChains!.right.values()].map((bone) =>
          bone.quaternion.clone()
        ),
        worldPoints: [...state.fingerChains!.right.values()].map((bone) =>
          bone.getWorldPosition(new Vector3())
        ),
        palmResidualM: palm?.distanceTo(center) ?? Infinity,
        shaftIndexAngleRad: Math.min(
          indexDirection.angleTo(axis),
          Math.PI - indexDirection.angleTo(axis)
        ),
      };
    };

    const closed = sample(2, 0, 0);
    const first = sample(2, 1);
    const closedAgain = sample(2, 0, 0);
    const second = sample(2, 1);
    expect(first.palmNormal.x).toBeGreaterThan(0.9);
    expect(first.palmNormal.z).toBeGreaterThan(0);
    expect(closed.palmNormal.x).toBeLessThan(-0.9);
    expect(isolationPalmRoll(1)).toBeCloseTo((Math.PI - 0.18) / 2);
    expect(isolationPalmRoll(2)).toBeCloseTo(Math.PI - 0.18);
    expect(isolationPalmRoll(2.5)).toBeCloseTo(Math.PI - 0.18);
    expect(isolationPalmRoll(3)).toBe(0);
    second.rotations.forEach((rotation, index) =>
      expect(
        rotation
          .clone()
          .normalize()
          .angleTo(first.rotations[index]!.clone().normalize()),
        String(index)
      ).toBeLessThan(1e-4)
    );
    closedAgain.worldPoints.forEach((point, index) =>
      expect(point.distanceTo(closed.worldPoints[index]!)).toBeLessThan(1e-7)
    );
    expect(closedAgain.palmResidualM).toBeCloseTo(closed.palmResidualM, 7);

    const required = first.fingers.filter(
      (finger) => finger.required !== false
    );
    expect(required.map((finger) => finger.finger)).toEqual(["thumb", "index"]);
    expect(
      required.every((finger) => finger.supported === true),
      JSON.stringify({ required, palmResidualM: first.palmResidualM })
    ).toBe(true);
    expect(
      first.fingers.filter((finger) => finger.required === false)
    ).toHaveLength(3);
    expect(closed.fingers.every((finger) => finger.required === true)).toBe(
      true
    );
    expect(first.shaftIndexAngleRad).toBeLessThan(
      closed.shaftIndexAngleRad - 0.2
    );
    const travel = Array.from({ length: 9 }, (_, i) => {
      const phase = 1 + i / 4;
      return sample(phase, sampleTeachingPose(phase, keys).gripRelaxation);
    });
    for (const frame of travel) {
      expect(Number.isFinite(frame.palmResidualM)).toBe(true);
      expect(frame.fingers.every((finger) => finger.available)).toBe(true);
      expect(
        frame.fingers
          .filter((finger) => finger.required !== false)
          .every((finger) => finger.supported === true),
        JSON.stringify(frame.fingers)
      ).toBe(true);
      expect(
        Math.min(
          ...frame.fingers.map((finger) => finger.signedClearanceM ?? -Infinity)
        ),
        `phase ${frame.phase}`
      ).toBeGreaterThanOrEqual(-0.001);
    }
    const transition = Array.from({ length: 204 }, (_, i) => {
      const phase = 0.99 + i / 100;
      return sample(phase, sampleTeachingPose(phase, keys).gripRelaxation);
    });
    const maxStep = Math.max(
      ...transition
        .slice(1)
        .flatMap((frame, i) =>
          frame.worldPoints.map((point, joint) =>
            point.distanceTo(transition[i]!.worldPoints[joint]!)
          )
        )
    );
    const maxFingerStep = Math.max(
      ...transition
        .slice(1)
        .flatMap((frame, i) =>
          frame.worldPoints.map((point, joint) =>
            point
              .clone()
              .sub(frame.wrist)
              .distanceTo(
                transition[i]!.worldPoints[joint]!.clone().sub(
                  transition[i]!.wrist
                )
              )
          )
        )
    );
    const maxJointAngle = Math.max(
      ...transition
        .slice(1)
        .flatMap((frame, i) =>
          frame.rotations.map((rotation, joint) =>
            rotation
              .clone()
              .normalize()
              .angleTo(transition[i]!.rotations[joint]!.clone().normalize())
          )
        )
    );
    const worstClearance = Math.min(
      ...transition.flatMap((frame) =>
        frame.fingers.map((finger) => finger.signedClearanceM ?? -Infinity)
      )
    );
    const unsupported = transition.flatMap((frame) =>
      frame.fingers
        .filter((finger) => finger.required !== false && !finger.supported)
        .map((finger) => ({
          phase: frame.phase,
          finger: finger.finger,
          clearance: finger.signedClearanceM,
        }))
    );
    expect(maxStep).toBeLessThan(0.018);
    expect(maxFingerStep).toBeLessThan(0.012);
    expect(maxJointAngle).toBeLessThan(0.22);
    expect(worstClearance).toBeGreaterThanOrEqual(-0.001);
    expect(unsupported).toEqual([]);

    keys = upsertTeachingKey(keys, 1.529, {
      elbowX: -0.6944,
      elbowY: -0.2812,
      elbowZ: -0.4096,
      tipY: 0.0205,
      gripRelaxation: 0.5435,
    });
    keys = upsertTeachingKey(keys, 1.966, {
      elbowX: -1.5,
      elbowY: -1.5,
      elbowZ: 0.3387,
      tipY: 0.0003,
      gripRelaxation: 0.9966,
    });
    const authoredNearNorth = sample(1.966, 0.9966);
    expect(
      authoredNearNorth.fingers
        .filter((finger) => finger.required !== false)
        .every((finger) => finger.supported)
    ).toBe(true);
    expect(
      Math.min(
        ...authoredNearNorth.fingers.map(
          (finger) => finger.signedClearanceM ?? -Infinity
        )
      )
    ).toBeGreaterThanOrEqual(-0.001);
  }, 30_000);
});
