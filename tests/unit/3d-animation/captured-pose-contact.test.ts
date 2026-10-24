import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
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
import {
  captureNativeFrame,
  largestSkinnedMesh,
  posedBones,
} from "#lib/shared/3d/native-capture/native-capture.js";
import { CapturedPosePlayer } from "#lib/shared/3d/native-capture/captured-pose-player.js";

const staffLengthM = 0.8596;
const staffHorizontal = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);

function staffBranch(assembly: Group, side: string) {
  const branch = new Group();
  const anchor = new Group();
  const correction = new Group();
  const root = new Group();
  const body = new Group();
  body.name = `${side}-rotated-body`;
  body.add(
    new Mesh(
      new BoxGeometry(0.024, staffLengthM, 0.024),
      new MeshBasicMaterial()
    )
  );
  root.add(body);
  correction.add(root);
  anchor.add(correction);
  branch.add(anchor);
  assembly.add(branch);
  return { root, body };
}

describe("captured H contact playback", () => {
  it.runIf(avatarAssetsPresent())(
    "keeps both palms on their staff grips at source and half frames",
    async () => {
      const sequence = normalizeCaptureSequence(
        decodeSequenceWithCompression(
          "d1:Cw11dq5JTUxNrDCwglBAXnF-qYGekSlQAMqqKc4vT4WIwVkA"
        )
      );
      const state = createCharacterInstanceState(
        {
          id: "marcus-h-captured-contact",
          characterId: "ch01",
          persistent: false,
        },
        makeStandaloneDeps()
      );
      state.setPlaneMode(PlaneMode.WALL);
      state.loadSequence(sequence);
      state.loop = true;
      const model = (await loadRig(avatar("ch01"))).scene;
      const services = createAvatarServices({
        enableLocomotion: true,
        enableRootMotion: false,
        enableFootPlanting: true,
      });
      (
        services.skeleton as unknown as {
          processGLTF(root: Object3D, bounds: null, label: string): void;
        }
      ).processGLTF(model, null, "ch01");
      services.skeleton.setHeight(userProportionsState.heightCm / 100);
      const scene = new Scene();
      const assembly = new Group();
      scene.add(assembly);
      const performer = new Group();
      performer.name = "PERFORMER_marcus-h-captured-contact";
      assembly.add(performer);
      performer.add(model);
      performer.position.y = -services.skeleton.getFeetOffset();
      const props = [
        staffBranch(assembly, "left"),
        staffBranch(assembly, "right"),
      ];
      const rigState = services.skeleton.getState();
      services.fingers.initialize(rigState.fingerChains!, rigState.meshes);
      services.animator.setContactMode("prop-authoritative");
      const locomotion = services.locomotion!;
      const seam = locomotion as unknown as {
        pendingClips: Map<string, AnimationClip>;
        clipsLoaded: boolean;
      };
      seam.pendingClips = new Map(await loadPackClips());
      seam.clipsLoaded = true;
      locomotion.initialize(model);
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

      const frames: ReturnType<typeof captureNativeFrame>[] = [];
      let maxSourceGapM = 0;
      const frameCount = sequence.steps.length * 30;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const score = frame / 30;
        state.goToStep(state.motionStepOffset + Math.floor(score));
        state.setProgress(score - Math.floor(score));
        const contact = resolvePerformerContact(state, { staffLengthM });
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
        const targets = [contact.leftProp!, contact.rightProp!].map(
          (prop, index) => ({
            ...prop,
            worldPosition: prop.worldPosition
              .clone()
              .add(
                new Vector3(
                  0,
                  -userProportionsState.groundY,
                  0.3 +
                    (index === 0
                      ? contact.stance.leftDepthOffsetM
                      : contact.stance.rightDepthOffsetM)
                )
              ),
          })
        );
        services.animator.setStanceYaw?.(contact.stance.yawRad);
        services.animator.setStanceYawSegments?.(contact.stance.segments);
        services.animator.setPairSeparation?.(!contact.planned);
        services.animator.setPropsAndBlend(
          targets[0] as never,
          targets[1] as never,
          undefined,
          {
            blue:
              contact.leftProp?.worldRotation
                .clone()
                .multiply(staffHorizontal) ?? null,
            red:
              contact.rightProp?.worldRotation
                .clone()
                .multiply(staffHorizontal) ?? null,
          }
        );
        services.fingers.setCylinderContactStrict(true);
        services.fingers.setGrips(GripType.SQUARE, GripType.SQUARE);
        services.fingers.update(1 / 30);
        services.animator.update(1 / 30);
        const pair = services.animator.getContactPairTranslation!(
          new Vector3()
        );
        targets.forEach((target, index) => {
          const axis = new Vector3(0, 1, 0).applyQuaternion(
            target.worldRotation.clone().multiply(staffHorizontal)
          );
          const center = target.worldPosition.clone().add(pair);
          services.fingers.setCylinderContact(index === 0 ? "left" : "right", {
            a: center.clone().addScaledVector(axis, -staffLengthM / 2),
            b: center.clone().addScaledVector(axis, staffLengthM / 2),
            radiusM: 0.012,
            lengthM: staffLengthM,
          });
          props[index]!.root.position.copy(center);
          props[index]!.body.quaternion.copy(target.worldRotation).multiply(
            staffHorizontal
          );
        });
        services.fingers.solveCylinderContacts();
        scene.updateMatrixWorld(true);
        const palms = (["left", "right"] as const).map(
          (side) => services.animator.getPalmWorldPoint!(side, new Vector3())!
        );
        palms.forEach((palm, index) => {
          maxSourceGapM = Math.max(
            maxSourceGapM,
            palm.distanceTo(props[index]!.body.getWorldPosition(new Vector3()))
          );
        });
        frames.push(
          captureNativeFrame(
            scene,
            performer.name.slice("PERFORMER_".length),
            frame,
            score,
            {
              leftPalmWorld: palms[0]!.toArray() as [number, number, number],
              rightPalmWorld: palms[1]!.toArray() as [number, number, number],
              gripRelaxation: pair.length(),
            }
          )
        );
      }

      const player = new CapturedPosePlayer(
        scene,
        performer.name.slice("PERFORMER_".length),
        {
          frames,
          durationSeconds: frameCount / 30,
        }
      );
      const bones = posedBones(largestSkinnedMesh(performer)!);
      const handBones = (["left", "right"] as const).map(
        (side) =>
          bones.find((bone) =>
            (side === "left"
              ? /LeftHand$|^l_hand$|^hand\.L$/i
              : /RightHand$|^r_hand$|^hand\.R$/i
            ).test(bone.name)
          )!
      );
      let maxPlayedSourceGapM = 0;
      let maxPlayedInteriorGapM = 0;
      let maxPlayedLoopGapM = 0;
      for (let halfFrame = 0; halfFrame < frameCount * 2; halfFrame += 1) {
        player.apply(halfFrame / 60);
        const source = frames[Math.floor(halfFrame / 2)]!;
        handBones.forEach((bone, index) => {
          const palm = new Vector3()
            .fromArray(source.palmLocal!, index * 3)
            .applyMatrix4(bone.matrixWorld);
          const gap = palm.distanceTo(
            props[index]!.body.getWorldPosition(new Vector3())
          );
          if (halfFrame % 2 === 0)
            maxPlayedSourceGapM = Math.max(maxPlayedSourceGapM, gap);
          else if (halfFrame === frameCount * 2 - 1)
            maxPlayedLoopGapM = Math.max(maxPlayedLoopGapM, gap);
          else maxPlayedInteriorGapM = Math.max(maxPlayedInteriorGapM, gap);
        });
      }
      player.restore();
      state.destroy();
      expect(maxSourceGapM, "source frame contact").toBeLessThanOrEqual(0.002);
      expect(maxPlayedSourceGapM, "30 FPS replay contact").toBeLessThanOrEqual(
        0.002
      );
      expect(
        maxPlayedInteriorGapM,
        "60 FPS interior replay contact"
      ).toBeLessThanOrEqual(0.002);
      expect(maxPlayedLoopGapM, "60 FPS loop seam contact").toBeLessThanOrEqual(
        0.002
      );
    },
    60000
  );
});
