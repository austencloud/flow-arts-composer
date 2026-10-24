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
import { normalizeCaptureSequence } from "#lib/shared/3d/native-capture/capture-score-time.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { resolvePerformerContact } from "#lib/shared/3d/domain/performer-contact-displacement.js";

describe("Marcus H capture contact", () => {
  it.runIf(avatarAssetsPresent())(
    "waits for idle clips before freezing strict contact rest",
    async () => {
      const clips = new Map(await loadPackClips());
      async function probe(clipsReadyAtStart: boolean) {
        const sequence = normalizeCaptureSequence(
          decodeSequenceWithCompression(
            "d1:Cw11dq5JTUxNrDCwglBAXnF-qYGekSlQAMqqKc4vT4WIwVkA"
          )
        );
        const state = createCharacterInstanceState(
          { id: "marcus-h-contact", characterId: "ch01", persistent: false },
          makeStandaloneDeps()
        );
        state.setPlaneMode(PlaneMode.WALL);
        state.loadSequence(sequence);
        state.loop = true;
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
        const rigState = services.skeleton.getState();
        services.fingers.initialize(rigState.fingerChains!, rigState.meshes);
        services.animator.setContactMode("prop-authoritative");
        const locomotion = services.locomotion!;
        const locomotionSeam = locomotion as unknown as {
          pendingClips: Map<string, AnimationClip>;
          clipsLoaded: boolean;
        };
        if (clipsReadyAtStart) {
          locomotionSeam.pendingClips = clips;
          locomotionSeam.clipsLoaded = true;
        }
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
        let firstFrameError = 0;
        let recordedError = 0;
        let pairLength = 0;
        let recordedPalm = new Vector3();
        let recordedGrip = new Vector3();
        let maxContactError = 0;
        let maxPairLength = 0;
        const frameCount = clipsReadyAtStart ? sequence.steps.length * 30 : 2;
        const staffHorizontal = new Quaternion().setFromEuler(
          new Euler(0, 0, Math.PI / 2)
        );
        for (let frame = 0; frame < frameCount; frame += 1) {
          if (frame === 1 && !clipsReadyAtStart) {
            locomotionSeam.pendingClips = clips;
            locomotionSeam.clipsLoaded = true;
            (
              locomotionSeam as unknown as { createActions(): void }
            ).createActions();
          }
          const score = clipsReadyAtStart ? frame / 30 : 0;
          state.goToStep(state.motionStepOffset + Math.floor(score));
          state.setProgress(score - Math.floor(score));
          const c = resolvePerformerContact(state, { staffLengthM: 0.8596 });
          locomotion.setLocomotion({
            isMoving: false,
            speed: 0,
            moveDirection: { x: 0, z: 0 },
          });
          locomotion.update(1 / 30);
          planter.update(1 / 30, {
            groundY: 0,
            locomotionState: LocomotionState.IDLE,
            isMoving: false,
            contactLeft: locomotion.getFootContact?.()?.left,
            contactRight: locomotion.getFootContact?.()?.right,
            lockConfidence: locomotion.getFootPlantConfidence?.() ?? 1,
            strideScale: locomotion.getStrideScale?.() ?? 1,
          });
          const left = c.leftProp && {
            ...c.leftProp,
            worldPosition: c.leftProp.worldPosition
              .clone()
              .add(
                new Vector3(
                  0,
                  -userProportionsState.groundY,
                  0.3 + c.stance.leftDepthOffsetM
                )
              ),
          };
          const right = c.rightProp && {
            ...c.rightProp,
            worldPosition: c.rightProp.worldPosition
              .clone()
              .add(
                new Vector3(
                  0,
                  -userProportionsState.groundY,
                  0.3 + c.stance.rightDepthOffsetM
                )
              ),
          };
          services.animator.setStanceYaw?.(c.stance.yawRad);
          services.animator.setStanceYawSegments?.(c.stance.segments);
          services.animator.setPairSeparation?.(!c.planned);
          services.animator.setPropsAndBlend(
            left as never,
            right as never,
            undefined,
            {
              blue:
                c.leftProp?.worldRotation.clone().multiply(staffHorizontal) ??
                null,
              red:
                c.rightProp?.worldRotation.clone().multiply(staffHorizontal) ??
                null,
            }
          );
          services.fingers.setCylinderContactStrict(true);
          services.fingers.setGrips(GripType.SQUARE, GripType.SQUARE);
          services.fingers.update(1 / 30);
          services.animator.update(1 / 30);
          for (const [side, target, rotation] of [
            ["left", left!.worldPosition, c.leftProp!.worldRotation],
            ["right", right!.worldPosition, c.rightProp!.worldRotation],
          ] as const) {
            const pair = services.animator.getContactPairTranslation!(
              new Vector3()
            );
            const axis = new Vector3(0, 1, 0).applyQuaternion(
              rotation.clone().multiply(staffHorizontal)
            );
            const center = target.clone().add(pair);
            services.fingers.setCylinderContact(side, {
              a: center.clone().addScaledVector(axis, -0.8596 / 2),
              b: center.clone().addScaledVector(axis, 0.8596 / 2),
              radiusM: 0.012,
              lengthM: 0.8596,
            });
          }
          services.fingers.solveCylinderContacts();
          root.updateWorldMatrix(true, true);
          const pair = services.animator.getContactPairTranslation!(
            new Vector3()
          );
          const palm = services.animator.getPalmWorldPoint!(
            "left",
            new Vector3()
          )!;
          const grip = left!.worldPosition.clone().add(pair);
          if (frame === 0) firstFrameError = palm.distanceTo(grip);
          recordedError = palm.distanceTo(grip);
          pairLength = pair.length();
          recordedPalm = palm;
          recordedGrip = grip;
          maxPairLength = Math.max(maxPairLength, pairLength);
          for (const [side, target] of [
            ["left", left!.worldPosition],
            ["right", right!.worldPosition],
          ] as const) {
            maxContactError = Math.max(
              maxContactError,
              services.animator.getPalmWorldPoint!(side, new Vector3())!
                .distanceTo(target.clone().add(pair))
            );
          }
        }
        state.destroy();
        return {
          firstFrameError,
          recordedError,
          pairLength,
          recordedPalm,
          recordedGrip,
          maxContactError,
          maxPairLength,
        };
      }
      const early = await probe(false);
      const ready = await probe(true);
      // Freezing the bind rest before the idle clips load still leaves a large
      // contact gap. Loaded clips must keep both grips attached for the score.
      expect(early.firstFrameError).toBeGreaterThan(0.1);
      expect(early.recordedError).toBeGreaterThan(0.1);
      expect(early.pairLength).toBe(0);
      expect(ready.maxContactError).toBeLessThanOrEqual(0.002);
      expect(ready.maxPairLength).toBeLessThanOrEqual(0.16);
    },
    30000
  );
});
