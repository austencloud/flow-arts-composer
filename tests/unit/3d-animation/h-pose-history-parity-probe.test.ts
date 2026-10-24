import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Euler, Group, Quaternion, Vector3, type AnimationClip } from "three";
import {
  GripType,
  LocomotionState,
  PlaneMode,
  userProportionsState,
} from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import {
  avatar,
  avatarAssetsPresent,
  loadPackClips,
  loadRig,
} from "../3d/locomotion-harness";
import { decodeSequenceWithCompression } from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  normalizeCaptureSequence,
  scoreAtCaptureTime,
} from "#lib/shared/3d/native-capture/capture-score-time.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { resolvePerformerContact } from "#lib/shared/3d/domain/performer-contact-displacement.js";
import { DEFAULT_PERFORMER_HAND_DISTANCE } from "#lib/shared/3d/domain/performer-hand-distance.js";

const H_SEQUENCE = "d1:Cw11dq5JTUxNrDCwglBAXnF-qYGekSlQAMqqKc4vT4WIwVkA";
const GGGG_SEQUENCE =
  "d1:y8wMDq4pzi_OrzCwglBAXnlqMogHomrKU_PygTwIVZOXn5oI5EGomtTEYpAchAIA";
const STAFF_LENGTH_M = 0.8596;
const FRAME_SECONDS = 1 / 30;
const BONES = [
  "Hips",
  "Head",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "LeftFoot",
  "RightFoot",
] as const;

interface Pose {
  bones: Record<string, { position: number[]; rotation: number[] }>;
  targets: number[][];
  pair: number[];
  gripErrorsM: number[];
}

function difference(a: Pose, b: Pose) {
  const positionsM: Record<string, number> = {};
  const rotationsRad: Record<string, number> = {};
  for (const name of BONES) {
    positionsM[name] = new Vector3()
      .fromArray(a.bones[name]!.position)
      .distanceTo(new Vector3().fromArray(b.bones[name]!.position));
    rotationsRad[name] = new Quaternion()
      .fromArray(a.bones[name]!.rotation)
      .angleTo(new Quaternion().fromArray(b.bones[name]!.rotation));
  }
  return {
    positionsM,
    rotationsRad,
    maxPositionM: Math.max(...Object.values(positionsM)),
    maxRotationRad: Math.max(...Object.values(rotationsRad)),
    targetDifferenceM: Math.max(
      ...a.targets.map((target, i) =>
        new Vector3()
          .fromArray(target)
          .distanceTo(new Vector3().fromArray(b.targets[i]!))
      )
    ),
  };
}

async function createProbe(
  sequence: ReturnType<typeof normalizeCaptureSequence>,
  clips: Map<string, AnimationClip>
) {
  const duration = sequence.steps.reduce((sum, step) => sum + step.duration, 0);
  const targetSeconds = duration * 0.85;
  const targetScore = scoreAtCaptureTime(sequence.steps, targetSeconds);

  const state = createCharacterInstanceState(
    { id: "h-history-probe", characterId: "ch01", persistent: false },
    makeStandaloneDeps()
  );
  state.setPlaneMode(PlaneMode.WALL);
  state.loadSequence(sequence);
  state.loop = true;
  state.setHandDistance(DEFAULT_PERFORMER_HAND_DISTANCE);
  const { scene } = await loadRig(avatar("ch01"));
  const services = createAvatarServices({
    enableLocomotion: true,
    enableRootMotion: false,
    enableFootPlanting: true,
  });
  (
    services.skeleton as unknown as {
      processGLTF(
        root: import("three").Object3D,
        bounds: null,
        label: string
      ): void;
    }
  ).processGLTF(scene, null, "ch01");
  services.skeleton.setHeight(userProportionsState.heightCm / 100);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateWorldMatrix(true, true);
  const rig = services.skeleton.getState();
  services.fingers.initialize(rig.fingerChains!, rig.meshes);
  services.animator.setContactMode("prop-authoritative");
  const locomotion = services.locomotion!;
  const seam = locomotion as unknown as {
    pendingClips: Map<string, AnimationClip>;
    clipsLoaded: boolean;
  };
  seam.pendingClips = clips;
  seam.clipsLoaded = true;
  locomotion.initialize(scene);
  const planter = services.footPlanter!;
  planter.initialize(
    services.skeleton,
    services.legIKSolver!,
    services.contactCurveCache!
  );
  const soleOffset = locomotion.getSoleOffset?.() ?? 0;
  if (soleOffset > 0) planter.configure({ footHeightOffset: soleOffset });
  const toeOffset = locomotion.getToeOffset?.() ?? -1;
  if (toeOffset >= 0) planter.configure({ toeHeightOffset: toeOffset });
  const staffHorizontal = new Quaternion().setFromEuler(
    new Euler(0, 0, Math.PI / 2)
  );
  let lastResetKey: number | undefined;
  let neutralHips: Vector3 | null = null;

  function solve(score: number, delta: number): Pose {
    state.goToStep(state.motionStepOffset + Math.floor(score));
    state.setProgress(score - Math.floor(score));
    const contact = resolvePerformerContact(state, {
      staffLengthM: STAFF_LENGTH_M,
      measurements: null,
    });
    locomotion.setLocomotion({
      isMoving: false,
      speed: 0,
      moveDirection: { x: 0, z: 0 },
    });
    locomotion.update(delta);
    planter.update(delta, {
      groundY: 0,
      locomotionState: LocomotionState.IDLE,
      isMoving: false,
      contactLeft: locomotion.getFootContact?.()?.left,
      contactRight: locomotion.getFootContact?.()?.right,
      lockConfidence: locomotion.getFootPlantConfidence?.() ?? 1,
      strideScale: locomotion.getStrideScale?.() ?? 1,
    });
    const left = {
      ...contact.leftProp!,
      worldPosition: contact
        .leftProp!.worldPosition.clone()
        .add(
          new Vector3(
            0,
            -userProportionsState.groundY,
            0.3 + contact.stance.leftDepthOffsetM
          )
        ),
    };
    const right = {
      ...contact.rightProp!,
      worldPosition: contact
        .rightProp!.worldPosition.clone()
        .add(
          new Vector3(
            0,
            -userProportionsState.groundY,
            0.3 + contact.stance.rightDepthOffsetM
          )
        ),
    };
    if (lastResetKey !== contact.resetKey) {
      services.animator.resetContactHistory?.();
      lastResetKey = contact.resetKey;
    }
    services.animator.setStanceYaw?.(contact.stance.yawRad);
    services.animator.setStanceYawSegments?.(contact.stance.segments);
    services.animator.setPairSeparation?.(!contact.planned);
    services.animator.setPropsAndBlend(
      left as never,
      right as never,
      undefined,
      {
        blue: left.worldRotation.clone().multiply(staffHorizontal),
        red: right.worldRotation.clone().multiply(staffHorizontal),
      }
    );
    services.fingers.setCylinderContactStrict(true);
    services.fingers.setGrips(GripType.SQUARE, GripType.SQUARE);
    services.fingers.update(delta);
    neutralHips ??= rig.bones.get("Hips")!.getWorldPosition(new Vector3());
    services.animator.update(delta);
    const pair = services.animator.getContactPairTranslation!(new Vector3());
    for (const [side, prop] of [
      ["left", left],
      ["right", right],
    ] as const) {
      const axis = new Vector3(0, 1, 0).applyQuaternion(
        prop.worldRotation.clone().multiply(staffHorizontal)
      );
      const center = prop.worldPosition.clone().add(pair);
      services.fingers.setCylinderContact(side, {
        a: center.clone().addScaledVector(axis, -STAFF_LENGTH_M / 2),
        b: center.clone().addScaledVector(axis, STAFF_LENGTH_M / 2),
        radiusM: 0.012,
        lengthM: STAFF_LENGTH_M,
      });
    }
    services.fingers.solveCylinderContacts();
    root.updateWorldMatrix(true, true);
    const bones: Pose["bones"] = {};
    for (const name of BONES) {
      const bone = rig.bones.get(name)!;
      expect(bone, name).toBeDefined();
      bones[name] = {
        position: bone.getWorldPosition(new Vector3()).toArray(),
        rotation: bone.getWorldQuaternion(new Quaternion()).toArray(),
      };
    }
    return {
      bones,
      pair: pair.toArray(),
      targets: [left.worldPosition.toArray(), right.worldPosition.toArray()],
      gripErrorsM: (
        [
          ["left", left],
          ["right", right],
        ] as const
      ).map(([side, prop]) =>
        services.animator.getPalmWorldPoint!(side, new Vector3())!.distanceTo(
          prop.worldPosition.clone().add(pair)
        )
      ),
    };
  }
  function settle() {
    for (let frame = 0; frame < 90; frame++) solve(0, FRAME_SECONDS);
  }
  function sample(score: number, delta = FRAME_SECONDS) {
    solve(score, delta);
    return solve(score, 0);
  }
  function canonical() {
    settle();
    for (let frame = 0; frame < Math.ceil(duration * 30); frame++) {
      sample(
        scoreAtCaptureTime(sequence.steps, frame / 30),
        frame === 0 ? 0 : FRAME_SECONDS
      );
    }
    for (let frame = 0; frame / 30 < targetSeconds - 1e-8; frame++) {
      sample(
        scoreAtCaptureTime(sequence.steps, frame / 30),
        frame === 0 ? 0 : FRAME_SECONDS
      );
    }
    return sample(targetScore);
  }
  return {
    solve,
    sample,
    settle,
    canonical,
    getNeutralHips: () => neutralHips!.clone(),
    destroy: () => state.destroy(),
  };
}

describe("same-score pose history probe", () => {
  it.runIf(avatarAssetsPresent())(
    "measures capture traversal against a direct H seek on the real ch01 rig",
    async () => {
      const clips = new Map(await loadPackClips());
      const sequence = normalizeCaptureSequence(
        decodeSequenceWithCompression(H_SEQUENCE)
      );
      const duration = sequence.steps.reduce(
        (sum, step) => sum + step.duration,
        0
      );
      const targetScore = scoreAtCaptureTime(sequence.steps, duration * 0.85);
      const capture = await createProbe(sequence, clips);
      const direct = await createProbe(sequence, clips);
      const initialized = await createProbe(sequence, clips);
      try {
        const captured = capture.canonical();
        const directlySeeked = direct.sample(targetScore);
        let held = directlySeeked;
        for (let frame = 0; frame < 90; frame++)
          held = direct.solve(targetScore, FRAME_SECONDS);
        initialized.settle();
        const initializedSeek = initialized.sample(targetScore);
        let initializedHeld = initializedSeek;
        for (let frame = 0; frame < 90; frame++)
          initializedHeld = initialized.solve(targetScore, FRAME_SECONDS);
        const reconstructedSeek = initialized.canonical();
        const comparisons = {
          captureVsDirect: difference(captured, directlySeeked),
          captureVsHeld: difference(captured, held),
          captureVsInitializedSeek: difference(captured, initializedSeek),
          captureVsInitializedHeld: difference(captured, initializedHeld),
          directVsHeld: difference(directlySeeked, held),
          captureVsReconstructedSeek: difference(captured, reconstructedSeek),
        };
        const report = {
          duration,
          targetScore,
          comparisons,
          poses: {
            captured,
            directlySeeked,
            held,
            initializedSeek,
            initializedHeld,
            reconstructedSeek,
          },
        };
        if (process.env.H_POSE_HISTORY_REPORT) {
          writeFileSync(
            process.env.H_POSE_HISTORY_REPORT,
            JSON.stringify(report, null, 2)
          );
        }
        for (const pose of Object.values(report.poses)) {
          expect(Math.max(...pose.gripErrorsM)).toBeLessThanOrEqual(0.002);
        }
        // Both paths receive identical staff targets and the same initialized rig.
        // A different elbow route at one score therefore cannot be blamed on retargeting.
        expect(
          comparisons.captureVsInitializedSeek.targetDifferenceM
        ).toBeLessThan(1e-9);
        expect(
          comparisons.captureVsInitializedSeek.maxPositionM
        ).toBeGreaterThan(0.01);
        expect(
          comparisons.captureVsReconstructedSeek.maxPositionM
        ).toBeLessThan(1e-6);
      } finally {
        capture.destroy();
        direct.destroy();
        initialized.destroy();
      }
    },
    90000
  );

  it.runIf(avatarAssetsPresent())(
    "checks GGGG full capture loop with the normal 52cm hand orbit",
    async () => {
      expect(DEFAULT_PERFORMER_HAND_DISTANCE.left.max).toBe(0.52);
      expect(DEFAULT_PERFORMER_HAND_DISTANCE.right.max).toBe(0.52);
      const clips = new Map(await loadPackClips());
      const sequence = normalizeCaptureSequence(
        decodeSequenceWithCompression(GGGG_SEQUENCE)
      );
      const duration = sequence.steps.reduce(
        (sum, step) => sum + step.duration,
        0
      );
      const probe = await createProbe(sequence, clips);
      try {
        probe.settle();
        for (let frame = 0; frame < Math.ceil(duration * 30); frame++) {
          probe.sample(
            scoreAtCaptureTime(sequence.steps, frame / 30),
            frame === 0 ? 0 : FRAME_SECONDS
          );
        }
        const neutralHips = probe.getNeutralHips();
        const samples: { frame: number; score: number; pose: Pose }[] = [];
        const maxGripErrorsM = [0, 0];
        const maxGripFrames = [0, 0];
        const maxHipShiftM = { x: 0, z: 0 };
        const maxFootDriftM = [0, 0];
        let firstFeet: Vector3[] | null = null;
        for (let frame = 0; frame < Math.ceil(duration * 30); frame++) {
          const score = scoreAtCaptureTime(sequence.steps, frame / 30);
          const pose = probe.sample(score, frame === 0 ? 0 : FRAME_SECONDS);
          samples.push({ frame, score, pose });
          pose.gripErrorsM.forEach((error, side) => {
            if (error > maxGripErrorsM[side]!) {
              maxGripErrorsM[side] = error;
              maxGripFrames[side] = frame;
            }
          });
          const hips = new Vector3().fromArray(pose.bones.Hips!.position);
          maxHipShiftM.x = Math.max(
            maxHipShiftM.x,
            Math.abs(hips.x - neutralHips.x)
          );
          maxHipShiftM.z = Math.max(
            maxHipShiftM.z,
            Math.abs(hips.z - neutralHips.z)
          );
          const feet = ["LeftFoot", "RightFoot"].map((name) =>
            new Vector3().fromArray(pose.bones[name]!.position)
          );
          firstFeet ??= feet;
          feet.forEach((foot, side) => {
            maxFootDriftM[side] = Math.max(
              maxFootDriftM[side]!,
              foot.distanceTo(firstFeet![side]!)
            );
          });
        }
        const report = {
          duration,
          frames: samples.length,
          orbitM: 0.52,
          maxGripErrorsM,
          maxGripFrames,
          maxHipShiftM,
          maxFootDriftM,
          neutralHips: neutralHips.toArray(),
          samples,
        };
        if (process.env.GGGG_CONTACT_REPORT)
          writeFileSync(
            process.env.GGGG_CONTACT_REPORT,
            JSON.stringify(report, null, 2)
          );
        expect(maxGripErrorsM[0], "left palm").toBeLessThanOrEqual(0.002);
        expect(maxGripErrorsM[1], "right palm").toBeLessThanOrEqual(0.002);
        expect(maxHipShiftM.x, "pelvis lateral balance").toBeLessThanOrEqual(
          0.080001
        );
        expect(maxHipShiftM.z, "pelvis depth balance").toBeLessThanOrEqual(
          0.080001
        );
        expect(Math.max(...maxFootDriftM), "planted feet").toBeLessThanOrEqual(
          0.002
        );
      } finally {
        probe.destroy();
      }
    },
    90000
  );
});
