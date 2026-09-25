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
import { sculptFingers } from "../../../src/routes/test/grip-lab/hand-sculpt";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const STAFF_RADIUS_M = 0.0102125;
describe.runIf(avatarAssetsPresent())("relaxed strict-contact grip", () => {
  for (const scenario of ["saved transition", "baseline loop"] as const) {
    it(
      scenario,
      async () => {
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
          rollOverride?: number,
          sculptForContact = false
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
              new Quaternion().setFromAxisAngle(
                new Vector3(0, 0, 1),
                Math.PI / 2
              )
            );
          const axis = new Vector3(0, -1, 0)
            .applyQuaternion(orientation)
            .normalize();
          const a = center.clone().addScaledVector(axis, -0.45);
          const b = center.clone().addScaledVector(axis, 0.45);
          const pose = authoredBodyPose(teaching, phase);
          pose.gripRelaxation = relaxation;
          pose.gripTiltRad = teaching.gripTilt;
          pose.wristBendRad = teaching.wristBend;
          pose.wristTwistRad = teaching.wristTwist;
          if (sculptForContact) {
            pose.sculptFingers = (rig, side) => {
              if (side === "right") sculptFingers(rig, side, teaching);
            };
          }
          if (rollOverride !== undefined) pose.gripPalmRollRad = rollOverride;
          services.animator.setAuthoredContactPose(pose);
          services.animator.setPropsAndBlend(
            null,
            { ...authored, worldPosition: center },
            undefined,
            { blue: null, red: orientation }
          );
          services.fingers.setGrips(GripType.IDLE, GripType.SQUARE);
          services.fingers.setContactRelaxation(
            "right",
            relaxation,
            teaching.gripTilt
          );
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
          services.fingers.solveCylinderContacts(
            pose.sculptFingers
              ? (side) => pose.sculptFingers!(root, side)
              : undefined
          );
          const contactReport = services.fingers
            .getCylinderContactReport("right")
            .map((finger) => ({ ...finger }));
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
          const elbowPoint = state.rightArmChain!.middle.getWorldPosition(
            new Vector3()
          );
          const middlePoint = fingers
            .get("Middle1")!
            .getWorldPosition(new Vector3());
          const palmBase = fingers
            .get("Index1")!
            .getWorldPosition(new Vector3())
            .add(fingers.get("Pinky1")!.getWorldPosition(new Vector3()))
            .multiplyScalar(0.5);
          const wristAngleRad = wristPoint
            .clone()
            .sub(elbowPoint)
            .angleTo(palmBase.sub(wristPoint));
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
            wristAngleRad,
            center,
            axis,
            palmNormal,
            wrist: state.rightArmChain!.effector.getWorldPosition(
              new Vector3()
            ),
            fingers: contactReport,
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

        if (scenario === "baseline loop") {
          const closed = sample(2, 0, 0);
          const solved = sample(2, 1);
          const first = sample(2, 1, undefined, true);
          const closedAgain = sample(2, 0, 0);
          const second = sample(2, 1, undefined, true);
          const radial = (point: Vector3) => {
            const fromStaff = point.clone().sub(first.center);
            return fromStaff
              .addScaledVector(first.axis, -fromStaff.dot(first.axis))
              .normalize();
          };
          // Check the final visible hand, after authored finger sculpt and contact:
          // must separate the thumb pad and index finger rather than sit beside both.
          expect(
            radial(first.worldPoints[2]!).dot(radial(first.worldPoints[4]!))
          ).toBeLessThan(-0.15);
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
            expect(point.distanceTo(closed.worldPoints[index]!)).toBeLessThan(
              1e-7
            )
          );
          expect(closedAgain.palmResidualM).toBeCloseTo(
            closed.palmResidualM,
            7
          );

          const required = first.fingers.filter(
            (finger) => finger.required !== false
          );
          expect(required.map((finger) => finger.finger)).toEqual([
            "thumb",
            "index",
          ]);
          expect(
            required.every((finger) => finger.supported === true),
            JSON.stringify({ required, palmResidualM: first.palmResidualM })
          ).toBe(true);
          expect(
            first.worldPoints[5]!.y - first.worldPoints[4]!.y
          ).toBeGreaterThan(0.014);
          expect(
            first.worldPoints[14]!.distanceTo(first.worldPoints[8]!)
          ).toBeLessThan(0.056);
          expect(
            solved.worldPoints[2]!.y - solved.worldPoints[0]!.y
          ).toBeGreaterThan(0.06);
          expect(
            first.fingers.filter((finger) => finger.required === false)
          ).toHaveLength(3);
          expect(
            closed.fingers.every((finger) => finger.required === true)
          ).toBe(true);
          expect(first.shaftIndexAngleRad).toBeLessThan(
            closed.shaftIndexAngleRad - 0.2
          );
          const travel = Array.from({ length: 9 }, (_, i) => {
            const phase = 1 + i / 4;
            return sample(
              phase,
              sampleTeachingPose(phase, keys).gripRelaxation,
              undefined,
              true
            );
          });
          for (const frame of travel) {
            expect(Number.isFinite(frame.palmResidualM)).toBe(true);
            expect(frame.fingers.every((finger) => finger.available)).toBe(
              true
            );
            expect(
              frame.fingers
                .filter((finger) => finger.required !== false)
                .every((finger) => finger.supported === true),
              JSON.stringify(frame.fingers)
            ).toBe(true);
            expect(
              Math.min(
                ...frame.fingers.map(
                  (finger) => finger.signedClearanceM ?? -Infinity
                )
              ),
              `phase ${frame.phase}: ${JSON.stringify(frame.fingers)}`
            ).toBeGreaterThanOrEqual(-0.001);
          }
          const transition = Array.from({ length: 204 }, (_, i) => {
            const phase = 0.99 + i / 100;
            return sample(
              phase,
              sampleTeachingPose(phase, keys).gripRelaxation,
              undefined,
              true
            );
          });
          const jointSteps = transition.slice(1).flatMap((frame, i) =>
            frame.worldPoints.map((point, joint) => ({
              phase: frame.phase,
              joint,
              distance: point.distanceTo(transition[i]!.worldPoints[joint]!),
            }))
          );
          const worstStep = jointSteps.reduce((worst, step) =>
            step.distance > worst.distance ? step : worst
          );
          const maxStep = worstStep.distance;
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
          const angleSteps = transition.slice(1).flatMap((frame, i) =>
            frame.rotations.map((rotation, joint) => ({
              phase: frame.phase,
              joint,
              angle: rotation
                .clone()
                .normalize()
                .angleTo(transition[i]!.rotations[joint]!.clone().normalize()),
            }))
          );
          const worstAngle = angleSteps.reduce((worst, step) =>
            step.angle > worst.angle ? step : worst
          );
          const worstClearance = Math.min(
            ...transition.flatMap((frame) =>
              frame.fingers.map(
                (finger) => finger.signedClearanceM ?? -Infinity
              )
            )
          );
          const unsupported = transition.flatMap((frame) =>
            frame.fingers
              .filter(
                (finger) => finger.required !== false && !finger.supported
              )
              .map((finger) => ({
                phase: frame.phase,
                finger: finger.finger,
                clearance: finger.signedClearanceM,
              }))
          );
          expect(
            maxStep,
            `phase ${worstStep.phase}, joint ${worstStep.joint}`
          ).toBeLessThan(0.018);
          expect(maxFingerStep).toBeLessThan(0.012);
          expect(worstClearance).toBeGreaterThanOrEqual(-0.001);
          expect(unsupported).toEqual([]);
          expect(
            worstAngle.angle,
            `phase ${worstAngle.phase}, joint ${worstAngle.joint}`
          ).toBeLessThan(0.23);
          return;
        }

        if (scenario === "saved transition") {
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
        }

        // Reproduce the saved Grip Lab frame where wrist sculpting used to happen
        // after contact solving and leave the shaft beside the index finger.
        keys = upsertTeachingKey(keys, 1.702, {
          elbowX: -1.5,
          elbowY: 0.14,
          elbowZ: -0.8296,
          gripRelaxation: 1,
          gripTilt: 0.8552,
          wristBend: 0.5236,
          wristTwist: -0.3142,
          thumbSpread: 0.3432,
          indexCurl: 0.6177,
          middleCurl: 0.3157,
          indexJoint1: -0.3569,
          indexJoint2: -0.2059,
          indexJoint3: 0.8236,
          wristRaise: -0.005,
        });
        keys = upsertTeachingKey(keys, 2, {
          gripRelaxation: 0.62,
          thumbSpread: 0.4363,
          indexCurl: 0.7854,
          middleCurl: 0.4014,
          indexJoint1: -0.4538,
          indexJoint2: -0.2618,
          indexJoint3: 1.0472,
        });
        const approach = Array.from(
          { length: 31 },
          (_, index) => 1 + (0.702 * index) / 30
        ).map((phase) =>
          sample(
            phase,
            sampleTeachingPose(phase, keys).gripRelaxation,
            undefined,
            true
          )
        );
        for (const frame of approach) {
          const required = frame.fingers.filter(
            (finger) => finger.required !== false
          );
          expect(
            required.every((finger) => finger.supported === true),
            `approach phase ${frame.phase}: ${JSON.stringify(required)}`
          ).toBe(true);
          expect(
            frame.palmResidualM,
            `approach phase ${frame.phase}`
          ).toBeLessThan(0.006);
        }
        const savedTransition = Array.from(
          { length: 31 },
          (_, index) => 1.702 + (0.298 * index) / 30
        ).map((phase) =>
          sample(
            phase,
            sampleTeachingPose(phase, keys).gripRelaxation,
            undefined,
            true
          )
        );
        // The saved North frame used to bend the hand more than 110 degrees
        // back across the forearm despite keeping the palm socket on the staff.
        // Check the visible hand direction after finger sculpt and contact.
        for (const frame of savedTransition.slice(0, 5)) {
          expect(frame.wristAngleRad, `phase ${frame.phase}`).toBeLessThan(
            0.95
          );
        }
        for (const frame of savedTransition) {
          const { phase } = frame;
          const required = frame.fingers.filter(
            (finger) => finger.required !== false
          );
          expect(required.map((finger) => finger.finger)).toEqual([
            "thumb",
            "index",
          ]);
          expect(
            required.every((finger) => finger.supported === true),
            `phase ${phase}: ${JSON.stringify(required)}`
          ).toBe(true);
          expect(frame.palmResidualM, `phase ${phase}`).toBeLessThan(0.006);
          const shaftRadial = (point: Vector3) => {
            const offset = point.clone().sub(frame.center);
            return offset
              .addScaledVector(frame.axis, -offset.dot(frame.axis))
              .normalize();
          };
          expect(
            shaftRadial(frame.worldPoints[2]!).dot(
              shaftRadial(frame.worldPoints[4]!)
            ),
            `thumb/index sides at phase ${phase}`
          ).toBeLessThan(0.1);
        }
        const savedFingerSteps = savedTransition
          .slice(1)
          .flatMap((frame, index) =>
            frame.phase > 1.966
              ? []
              : frame.worldPoints.slice(0, 6).map((point, joint) => ({
                  phase: frame.phase,
                  joint,
                  distance: point
                    .clone()
                    .sub(frame.wrist)
                    .distanceTo(
                      savedTransition[index]!.worldPoints[joint]!.clone().sub(
                        savedTransition[index]!.wrist
                      )
                    ),
                }))
          );
        const largestSavedStep = savedFingerSteps.reduce((largest, step) =>
          step.distance > largest.distance ? step : largest
        );
        expect(
          largestSavedStep.distance,
          `phase ${largestSavedStep.phase}, joint ${largestSavedStep.joint}`
        ).toBeLessThan(0.018);
        const reverseSeek = sample(1.702, 1, undefined, true);
        expect(
          reverseSeek.fingers
            .filter((finger) => finger.required !== false)
            .every((finger) => finger.supported),
          JSON.stringify(reverseSeek.fingers)
        ).toBe(true);
        expect(reverseSeek.palmResidualM).toBeLessThan(0.006);
        reverseSeek.worldPoints.forEach((point, joint) =>
          expect(
            point
              .clone()
              .sub(reverseSeek.wrist)
              .distanceTo(
                savedTransition[0]!.worldPoints[joint]!.clone().sub(
                  savedTransition[0]!.wrist
                )
              ),
            `seeked joint ${joint}`
          ).toBeLessThan(0.001)
        );
      },
      30_000
    );
  }
});
