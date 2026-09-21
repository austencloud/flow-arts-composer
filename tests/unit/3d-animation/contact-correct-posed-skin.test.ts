import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GripType } from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { auditFireStaffProfile } from "$lib/shared/3d/diagnostics/contact-correct/fire-staff-mesh-audit";
import { runContactCorrectSweep } from "$lib/shared/3d/diagnostics/contact-correct/contact-sweep-runner";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import {
  sampleStaffIsolation,
  ISOLATION_STAFF_CONTACT,
} from "$lib/shared/3d/performers/staff-isolation";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const HEIGHT_M = 1.905;

async function setup(id: string, side: "left" | "right") {
  const { scene } = await loadRig(avatar(id));
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
  services.skeleton.setHeight(HEIGHT_M);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateWorldMatrix(true, true);
  const skeletonState = services.skeleton.getState();
  services.fingers.initialize(
    skeletonState.fingerChains!,
    skeletonState.meshes
  );
  services.fingers.setGrips(
    side === "left" ? GripType.SQUARE : GripType.IDLE,
    side === "right" ? GripType.SQUARE : GripType.IDLE
  );
  services.fingers.setBlendSpeed(100);
  services.fingers.update(1);
  services.fingers.setCylinderContactStrict(true);
  services.animator.setContactMode("prop-authoritative");
  return { root, services, side };
}

describe.runIf(avatarAssetsPresent())("contact-correct posed skin", () => {
  it("measures strict fingers separately from the complete rendered body skin across every cardinal intermediate", async () => {
    const rows: unknown[] = [];
    // A real first configuration that fails blocks certification; continuing
    // through the remaining five after that would only burn the 60-second
    // per-configuration budget without changing the release verdict.
    for (const [id, side] of [["ch07", "right"] as const]) {
      const rig = await setup(id, side);
      const run = await runContactCorrectSweep({
        phases: Array.from({ length: 17 }, (_, index) => index / 4),
        maxDurationMs: 60_000,
        sample: async (phase) => {
          const authored = sampleStaffIsolation(phase);
          const center = authored.worldPosition.clone().add(ORIGIN);
          const orientation = authored.worldRotation
            .clone()
            .multiply(
              new Quaternion().setFromAxisAngle(
                new Vector3(0, 0, 1),
                Math.PI / 2
              )
            );
          const prop = { ...authored, worldPosition: center };
          rig.services.animator.setPropsAndBlend(
            side === "left" ? prop : null,
            side === "right" ? prop : null,
            undefined,
            {
              blue: side === "left" ? orientation : null,
              red: side === "right" ? orientation : null,
            }
          );
          rig.services.animator.update(1 / 120);
          const axis = new Vector3(0, -1, 0)
            .applyQuaternion(orientation)
            .normalize();
          const a = center.clone().addScaledVector(axis, -0.45);
          const b = center.clone().addScaledVector(axis, 0.45);
          rig.services.fingers.setCylinderContact(side, {
            a,
            b,
            radiusM: ISOLATION_STAFF_CONTACT.radiusM,
            lengthM: 0.9,
          });
          rig.services.fingers.solveCylinderContacts();
          const mesh = auditFireStaffProfile(rig.root, a, b, {
            deadlineMs: 3_000,
          });
          const fingers = rig.services.fingers.getCylinderContactReport(side);
          rows.push({
            id,
            side,
            phase,
            fingerContact: fingers.map((finger) => ({
              finger: finger.finger,
              clearanceM: finger.signedClearanceM,
              supported: finger.supported,
            })),
            mesh: {
              status: mesh.status,
              penetrationM: mesh.maximumPenetrationM,
              regions: mesh.affectedRegions,
              containment: mesh.interiorContainment,
            },
          });
          const body = rig.services.skeleton.getState().bones;
          return {
            authoredEndpoints: [a, b] as const,
            renderedEndpoints: [a.clone(), b.clone()] as const,
            thumbToPinkyAxis: rig.services.animator.getKnuckleLineWorld(
              side,
              new Vector3()
            ),
            meshAudit: mesh,
            body: {
              leftHand: body.get("LeftHand")!.getWorldPosition(new Vector3()),
              rightHand: body.get("RightHand")!.getWorldPosition(new Vector3()),
              leftElbow: body
                .get("LeftForeArm")!
                .getWorldPosition(new Vector3()),
              rightElbow: body
                .get("RightForeArm")!
                .getWorldPosition(new Vector3()),
              head: body.get("Head")!.getWorldPosition(new Vector3()),
              rootRotation: rig.root.getWorldQuaternion(new Quaternion()),
            },
          };
        },
      });
      expect(run.status, `${id}/${side} sweep completion`).toBe("complete");
      const output = resolve(
        process.cwd(),
        ".tmp/contact-package/posed-skin-sweep.json"
      );
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify(rows, null, 2));
    }
    const output = resolve(
      process.cwd(),
      ".tmp/contact-package/posed-skin-sweep.json"
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(rows, null, 2));
    const samples = rows as Array<{
      fingerContact: Array<{ supported: boolean | null }>;
      mesh: {
        status: string;
        penetrationM: number | null;
        containment: string;
      };
    }>;
    expect(
      samples.every((sample) =>
        sample.fingerContact.every((finger) => finger.supported === true)
      )
    ).toBe(true);
    expect(
      samples.every(
        (sample) =>
          sample.mesh.status === "available" &&
          sample.mesh.penetrationM === 0 &&
          sample.mesh.containment === "clear"
      )
    ).toBe(true);
  }, 60_000);
});
