import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GripType } from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sampleStaffIsolation } from "$lib/shared/3d/performers/staff-isolation";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const HEIGHT = 1.905;

async function setup(id: string, side: "left" | "right") {
  const { scene } = await loadRig(
    id === "personal-metaperson"
      ? resolve(
          process.cwd(),
          "static/models/avatars/bakeoff/personal-metaperson.glb"
        )
      : avatar(id)
  );
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
  ).processGLTF(scene, null, id);
  services.skeleton.setHeight(HEIGHT);
  const group = new Group();
  group.add(scene);
  group.position.y = -services.skeleton.getFeetOffset();
  scene.updateWorldMatrix(true, true);
  services.fingers.initialize(services.skeleton.getState().fingerChains!);
  services.fingers.setCylinderContactStrict(true);
  services.fingers.setGrips(
    side === "left" ? GripType.SQUARE : GripType.IDLE,
    side === "right" ? GripType.SQUARE : GripType.IDLE
  );
  services.fingers.update(1);
  services.animator.setContactMode("prop-authoritative");
  const chains = [
    services.skeleton.getLeftArmChain()!,
    services.skeleton.getRightArmChain()!,
    services.skeleton.getLeftLegChain()!,
    services.skeleton.getRightLegChain()!,
  ];
  const lengths = chains.map((chain) => [
    chain.root
      .getWorldPosition(new Vector3())
      .distanceTo(chain.middle.getWorldPosition(new Vector3())),
    chain.middle
      .getWorldPosition(new Vector3())
      .distanceTo(chain.effector.getWorldPosition(new Vector3())),
  ]);
  const feet = chains
    .slice(2)
    .map((chain) => chain.effector.getWorldPosition(new Vector3()));
  return { services, chains, lengths, feet, side };
}

function sample(rig: Awaited<ReturnType<typeof setup>>, phase: number) {
  const { services, side } = rig;
  const authored = sampleStaffIsolation(phase);
  const target = authored.worldPosition.clone().add(ORIGIN);
  const orientation = authored.worldRotation
    .clone()
    .multiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
    );
  const prop = { ...authored, worldPosition: target };
  services.animator.setPropsAndBlend(
    side === "left" ? prop : null,
    side === "right" ? prop : null,
    undefined,
    {
      red: side === "right" ? orientation : null,
      blue: side === "left" ? orientation : null,
    }
  );
  services.fingers.update(1 / 120);
  services.animator.update(1 / 120);
  const palm = services.animator.getPalmWorldPoint(side, new Vector3())!;
  const axis = services.animator.getKnuckleLineWorld(side, new Vector3())!;
  const staffAxis = new Vector3(0, -1, 0)
    .applyQuaternion(orientation)
    .normalize();
  services.fingers.setCylinderContact(side, {
    a: target.clone().addScaledVector(staffAxis, -0.45),
    b: target.clone().addScaledVector(staffAxis, 0.45),
    radiusM: 0.0095,
    lengthM: 0.9,
  });
  services.fingers.solveCylinderContacts();
  const fingers = services.fingers
    .getCylinderContactReport(side)
    .map((finger) => ({ ...finger }));
  const solve = services.animator.getContactSolveDiagnostics();
  const points = [...services.skeleton.getState().bones.values()].map((bone) =>
    bone.getWorldPosition(new Vector3())
  );
  const rotations = [...services.skeleton.getState().bones.values()].map(
    (bone) => bone.getWorldQuaternion(new Quaternion()).normalize()
  );
  let limbErrorM = 0;
  for (const [index, chain] of rig.chains.entries()) {
    const actual = [
      chain.root
        .getWorldPosition(new Vector3())
        .distanceTo(chain.middle.getWorldPosition(new Vector3())),
      chain.middle
        .getWorldPosition(new Vector3())
        .distanceTo(chain.effector.getWorldPosition(new Vector3())),
    ];
    limbErrorM = Math.max(
      limbErrorM,
      ...actual.map((value, segment) =>
        Math.abs(value - rig.lengths[index]![segment]!)
      )
    );
  }
  const footErrorM = Math.max(
    ...rig.chains
      .slice(2)
      .map((chain, index) =>
        chain.effector
          .getWorldPosition(new Vector3())
          .distanceTo(rig.feet[index]!)
      )
  );
  return {
    phase,
    palmM: palm.distanceTo(target),
    axisDeg: (axis.angleTo(staffAxis) * 180) / Math.PI,
    reachM: solve.reachResidualM,
    clearanceM: solve.clearanceM,
    swingDeg: (solve.wristSwingRad * 180) / Math.PI,
    limbErrorM,
    footErrorM,
    points,
    rotations,
    fingers,
  };
}

describe.runIf(avatarAssetsPresent())("contact-correct avatar sweep", () => {
  for (const id of ["ch07", "ch12", "ch18", "personal-metaperson"])
    for (const side of ["right", "left"] as const) {
      it(`${id} ${side}: authored contact, fixed limb lengths, planted feet, deterministic seeks`, async () => {
        const rig = await setup(id, side);
        const samples = Array.from({ length: 961 }, (_, index) =>
          sample(rig, index / 240)
        );
        const maxStepM = Math.max(
          ...samples
            .slice(1)
            .map((value, index) =>
              Math.max(
                ...value.points.map((point, bone) =>
                  point.distanceTo(samples[index]!.points[bone]!)
                )
              )
            )
        );
        const maxStepDeg = Math.max(
          ...samples
            .slice(1)
            .map((value, index) =>
              Math.max(
                ...value.rotations.map(
                  (rotation, bone) =>
                    (rotation.angleTo(samples[index]!.rotations[bone]!) * 180) /
                    Math.PI
                )
              )
            )
        );
        const summary = {
          id,
          side,
          count: samples.length,
          armLength: rig.chains[side === "right" ? 1 : 0]!.totalLength,
          palmM: Math.max(...samples.map((value) => value.palmM)),
          axisDeg: Math.max(...samples.map((value) => value.axisDeg)),
          reachM: Math.max(...samples.map((value) => value.reachM)),
          clearanceM: Math.min(...samples.map((value) => value.clearanceM)),
          swingDeg: Math.max(...samples.map((value) => value.swingDeg)),
          limbErrorM: Math.max(...samples.map((value) => value.limbErrorM)),
          footErrorM: Math.max(...samples.map((value) => value.footErrorM)),
          maxStepM,
          maxStepDeg,
          unsupportedFingerSamples: samples.filter(
            (value) =>
              value.fingers.length !== 5 ||
              value.fingers.some(
                (finger) => !finger.available || !finger.supported
              )
          ).length,
          minFingerClearanceM: Math.min(
            ...samples.flatMap((value) =>
              value.fingers.map(
                (finger) => finger.signedClearanceM ?? -Infinity
              )
            )
          ),
          maxFingerClearanceM: Math.max(
            ...samples.flatMap((value) =>
              value.fingers.map((finger) => finger.signedClearanceM ?? Infinity)
            )
          ),
          maxRotationBone: (() => {
            for (let index = 1; index < samples.length; index++)
              for (
                let bone = 0;
                bone < samples[index]!.rotations.length;
                bone++
              )
                if (
                  (samples[index]!.rotations[bone]!.angleTo(
                    samples[index - 1]!.rotations[bone]!
                  ) *
                    180) /
                    Math.PI ===
                  maxStepDeg
                )
                  return [...rig.services.skeleton.getState().bones.keys()][
                    bone
                  ];
          })(),
          maxStepPhase: samples
            .slice(1)
            .find(
              (value, index) =>
                Math.max(
                  ...value.points.map((point, bone) =>
                    point.distanceTo(samples[index]!.points[bone]!)
                  )
                ) === maxStepM
            )?.phase,
        };
        const output = resolve(
          process.cwd(),
          `.tmp/contact-package/avatar-sweep-${id}-${side}.json`
        );
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(
          output,
          JSON.stringify(
            {
              summary,
              samples: samples.map(({ points, rotations, ...value }) => value),
            },
            null,
            2
          )
        );
        for (let index = 0; index <= 16; index += 1) {
          const cold = sample(await setup(id, side), index / 4);
          const chronological = samples[index * 60]!;
          for (let bone = 0; bone < cold.points.length; bone += 1) {
            expect(
              cold.points[bone]!.distanceTo(chronological.points[bone]!)
            ).toBeLessThan(1e-7);
            expect(
              cold.rotations[bone]!.angleTo(chronological.rotations[bone]!)
            ).toBeLessThan(1e-6);
          }
        }
        for (let bone = 0; bone < samples[0]!.points.length; bone += 1) {
          expect(
            samples[0]!.points[bone]!.distanceTo(samples[960]!.points[bone]!)
          ).toBeLessThan(1e-7);
        }
        expect.soft(summary.palmM).toBeLessThan(0.002);
        expect.soft(summary.axisDeg).toBeLessThan(2);
        expect.soft(summary.reachM).toBeLessThan(0.001);
        expect.soft(summary.clearanceM).toBeGreaterThanOrEqual(0);
        expect.soft(summary.swingDeg).toBeLessThan(35);
        expect.soft(summary.limbErrorM).toBeLessThan(1e-6);
        expect.soft(summary.footErrorM).toBeLessThan(0.002);
        expect.soft(summary.maxStepM).toBeLessThan(0.025);
        expect.soft(summary.maxStepDeg).toBeLessThan(10);
        expect.soft(summary.unsupportedFingerSamples).toBe(0);
      }, 30000);
    }
});
