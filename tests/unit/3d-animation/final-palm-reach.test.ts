import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { planUpperBodyStance } from "#lib/shared/3d/collision/upper-body-stance-planner.js";

describe.runIf(avatarAssetsPresent())("final calibrated palm reach", () => {
  it.each(["x-bot", "ch01"])(
    "keeps the %s torso balanced over planted feet during a side hold",
    async (rig) => {
      const { scene } = await loadRig(avatar(rig));
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
      ).processGLTF(scene, null, rig);
      services.skeleton.setHeight(1.905);
      const root = new Group();
      root.add(scene);
      root.position.y = -services.skeleton.getFeetOffset();
      root.updateWorldMatrix(true, true);
      const state = services.skeleton.getState();
      services.fingers.initialize(state.fingerChains!, state.meshes);
      services.animator.setContactMode("prop-authoritative");
      const feet = [state.leftLegChain!, state.rightLegChain!].map((chain) =>
        chain.effector.getWorldPosition(new Vector3())
      );
      const neutralHips = state.bones
        .get("Hips")!
        .getWorldPosition(new Vector3());

      for (const direction of [-1, 1]) {
        const stance = planUpperBodyStance({
          left: { x: direction * 0.48, z: 0.3 },
          right: { x: direction * 0.44, z: 0.3 },
        });
        const targets = [
          new Vector3(direction * 0.48, 1.67, 0.3 + stance.leftDepthOffsetM),
          new Vector3(direction * 0.44, 1.7, 0.3 + stance.rightDepthOffsetM),
        ];
        const props = targets.map((worldPosition) => ({
          worldPosition,
          staffRotationAngle: 0,
          plane: "wall",
        }));
        services.animator.setStanceYaw?.(stance.yawRad);
        services.animator.setPropsAndBlend(
          props[0] as never,
          props[1] as never,
          undefined,
          { blue: new Quaternion(), red: new Quaternion() }
        );
        services.animator.update(1 / 30);
        root.updateWorldMatrix(true, true);
        const hips = state.bones.get("Hips")!.getWorldPosition(new Vector3());
        const head = state.bones.get("Head")!.getWorldPosition(new Vector3());
        expect(Math.abs(hips.z - neutralHips.z)).toBeLessThanOrEqual(0.081);
        const footCenterX = (feet[0]!.x + feet[1]!.x) / 2;
        expect(Math.abs(hips.x - neutralHips.x)).toBeLessThanOrEqual(0.081);
        expect(Math.abs(head.x - footCenterX)).toBeLessThan(0.15);
        expect(Math.abs(hips.x - neutralHips.x)).toBeGreaterThan(0.04);
        for (const index of [0, 1]) {
          const side = index === 0 ? "left" : "right";
          const contactError = services.animator.getPalmWorldPoint!(
            side,
            new Vector3()
          )!.distanceTo(targets[index]!);
          expect(contactError).toBeLessThan(0.002);
          const leg = index === 0 ? state.leftLegChain! : state.rightLegChain!;
          expect(
            leg.effector
              .getWorldPosition(new Vector3())
              .distanceTo(feet[index]!)
          ).toBeLessThan(0.002);
        }
      }
    },
    30_000
  );
  it("keeps both authored grips attached through wrist roll and replants feet", async () => {
    const { scene } = await loadRig(avatar("x-bot"));
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
    ).processGLTF(scene, null, "x-bot");
    services.skeleton.setHeight(1.905);
    const root = new Group();
    root.add(scene);
    root.position.y = -services.skeleton.getFeetOffset();
    root.updateWorldMatrix(true, true);
    const state = services.skeleton.getState();
    services.fingers.initialize(state.fingerChains!, state.meshes);
    services.animator.setContactMode("prop-authoritative");
    const feet = [state.leftLegChain!, state.rightLegChain!].map((chain) =>
      chain.effector.getWorldPosition(new Vector3())
    );
    for (let sample = 0; sample < 24; sample += 1) {
      const angle = (sample * Math.PI) / 12;
      const targets = [
        new Vector3(-0.24525, 1.67502, 0.39),
        new Vector3(0.31188, 1.7057, 0.21),
      ];
      const rotations = [
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -angle),
      ];
      const props = targets.map((worldPosition) => ({
        worldPosition,
        staffRotationAngle: angle,
        plane: "wall",
      }));
      services.animator.setPropsAndBlend(
        props[0] as never,
        props[1] as never,
        undefined,
        { blue: rotations[0]!, red: rotations[1]! }
      );
      services.animator.update(1 / 30);
      root.updateWorldMatrix(true, true);
      for (const [index, side] of (["left", "right"] as const).entries()) {
        expect(
          services.animator.getPalmWorldPoint!(side, new Vector3())!.distanceTo(
            targets[index]!
          )
        ).toBeLessThan(0.002);
        const leg = index === 0 ? state.leftLegChain! : state.rightLegChain!;
        expect(
          leg.effector.getWorldPosition(new Vector3()).distanceTo(feet[index]!)
        ).toBeLessThan(0.002);
      }
    }
  }, 30_000);
});
