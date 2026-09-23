import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GripType } from "@austencloud/scene-3d";
import { createAvatarServices } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarServicesFactory";
import { fingerChainEnclosesCylinder } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator";
import { auditFireStaffProfile } from "$lib/shared/3d/diagnostics/contact-correct/fire-staff-mesh-audit";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";
import { sampleStaffIsolation } from "$lib/shared/3d/performers/staff-isolation";

const ORIGIN = new Vector3(0, 1.5621, 0.3);
const PHASE = 0.806;
const STAFF_RADIUS_M = 0.0102125;

describe.runIf(avatarAssetsPresent())("visible stationary staff grasp", () => {
  it("keeps ch07's right index skin outside the shaft while its thumb closes the grip", async () => {
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
    root.updateMatrixWorld(true);
    const state = services.skeleton.getState();
    services.fingers.initialize(state.fingerChains!, state.meshes);
    services.fingers.setGrips(GripType.IDLE, GripType.SQUARE);
    services.fingers.setCylinderContactStrict(true);
    services.animator.setContactMode("prop-authoritative");

    const authored = sampleStaffIsolation(PHASE);
    const center = authored.worldPosition.clone().add(ORIGIN);
    const orientation = authored.worldRotation
      .clone()
      .multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
      );
    services.animator.setPropsAndBlend(
      null,
      { ...authored, worldPosition: center },
      undefined,
      {
        blue: null,
        red: orientation,
      }
    );
    services.fingers.update(1 / 120);
    services.animator.update(1 / 120);
    const axis = new Vector3(0, -1, 0).applyQuaternion(orientation).normalize();
    const a = center.clone().addScaledVector(axis, -0.45);
    const b = center.clone().addScaledVector(axis, 0.45);
    services.fingers.setCylinderContact("right", {
      a,
      b,
      radiusM: STAFF_RADIUS_M,
      lengthM: 0.9,
    });
    services.fingers.solveCylinderContacts();
    root.updateMatrixWorld(true);

    // Replaying a held frame must retain the fitted grasp after the renderer
    // refreshes bind matrices and the body/finger owners run again.
    const heldRotations = [...state.fingerChains!.right.values()].map((bone) =>
      bone.quaternion.clone()
    );
    for (const delta of [1 / 120, 1 / 30]) {
      services.fingers.update(delta);
      services.animator.update(delta);
      services.fingers.solveCylinderContacts();
      root.updateMatrixWorld(true);
      [...state.fingerChains!.right.values()].forEach((bone, index) => {
        expect(bone.quaternion.angleTo(heldRotations[index]!)).toBeLessThan(
          1e-6
        );
      });
    }

    const fingers = services.fingers.getCylinderContactReport("right");
    const thumb = fingers.find((finger) => finger.finger === "thumb");
    for (const finger of fingers) {
      expect(
        finger.distalPadClearanceM,
        `${finger.finger} distal pad must close onto the shaft`
      ).toBeGreaterThanOrEqual(-0.0005);
      expect(finger.distalPadClearanceM).toBeLessThanOrEqual(0.002);
    }
    for (const name of ["Index", "Middle", "Ring", "Pinky"] as const) {
      const chain = [1, 2, 3].map(
        (joint) => state.fingerChains!.right.get(`${name}${joint}` as "Index1")!
      );
      const distal = chain[2]!;
      const tip =
        distal.children
          .find((child): child is import("three").Bone => child.isBone)
          ?.getWorldPosition(new Vector3()) ??
        distal.getWorldPosition(new Vector3());
      expect(
        fingerChainEnclosesCylinder(
          [...chain.map((bone) => bone.getWorldPosition(new Vector3())), tip],
          { a, b, radiusM: STAFF_RADIUS_M, lengthM: 0.9 }
        ),
        `${name} must loop around the shaft rather than touch from one side`
      ).toBe(true);
    }
    const index = state.fingerChains!.right.get("Index2")!;
    const thumbTip = state
      .fingerChains!.right.get("Thumb3")!
      .getWorldPosition(new Vector3());
    const indexPoint = index.getWorldPosition(new Vector3());
    const radial = (point: Vector3) => {
      const along = point.clone().sub(center).dot(axis);
      return point
        .clone()
        .sub(center)
        .addScaledVector(axis, -along)
        .normalize();
    };
    const mesh = auditFireStaffProfile(root, a, b, { deadlineMs: 3_000 });
    expect(thumb?.supported, "thumb must close onto the shaft").toBe(true);
    expect(
      radial(thumbTip).dot(radial(indexPoint)),
      "thumb and index must occupy opposing sides of the shaft"
    ).toBeLessThan(-0.15);
    expect(mesh.status).toBe("available");
    expect(
      mesh.maximumPenetrationM,
      JSON.stringify(mesh.worstIntersection)
    ).toBeLessThanOrEqual(0.0005);

    const cacheProbe = services.fingers as unknown as {
      rightHand: { contactCylinderLocal: object | null };
    };
    const cachedFit = cacheProbe.rightHand.contactCylinderLocal;
    const fittedRotations = [...state.fingerChains!.right.values()].map((bone) =>
      bone.quaternion.clone()
    );
    const nanometreNoise = new Vector3(2e-8, 0, 0);
    services.fingers.setCylinderContact("right", {
      a: a.clone().add(nanometreNoise),
      b: b.clone().add(nanometreNoise),
      radiusM: STAFF_RADIUS_M,
      lengthM: 0.9,
    });
    services.fingers.solveCylinderContacts();
    expect(cacheProbe.rightHand.contactCylinderLocal).toBe(cachedFit);
    [...state.fingerChains!.right.values()].forEach((bone, index) =>
      expect(bone.quaternion.angleTo(fittedRotations[index]!)).toBeLessThan(1e-6)
    );

    const solverResidual = new Vector3(0.00005, 0, 0);
    const shiftedA = a.clone().add(solverResidual);
    const shiftedB = b.clone().add(solverResidual);
    services.fingers.setCylinderContact("right", {
      a: shiftedA, b: shiftedB, radiusM: STAFF_RADIUS_M, lengthM: 0.9,
    });
    services.fingers.solveCylinderContacts();
    expect(cacheProbe.rightHand.contactCylinderLocal).toBe(cachedFit);
    root.updateMatrixWorld(true);
    const reusedMesh = auditFireStaffProfile(root, shiftedA, shiftedB, { deadlineMs: 3_000 });
    expect(reusedMesh.status).toBe("available");
    expect(reusedMesh.maximumPenetrationM).toBeLessThanOrEqual(0.0005);
    for (const finger of services.fingers.getCylinderContactReport("right")) {
      expect(finger.distalPadClearanceM).toBeGreaterThanOrEqual(-0.0005);
      expect(finger.distalPadClearanceM).toBeLessThanOrEqual(0.002);
    }

    // Moving the finite shaft along its own axis changes which part of the
    // handle a fingertip can support, so it must not reuse the old fit.
    services.fingers.setCylinderContact("right", {
      a: a.clone().addScaledVector(axis, 0.001),
      b: b.clone().addScaledVector(axis, 0.001),
      radiusM: STAFF_RADIUS_M,
      lengthM: 0.9,
    });
    services.fingers.solveCylinderContacts();
    expect(cacheProbe.rightHand.contactCylinderLocal).not.toBe(cachedFit);
  }, 10_000);
});
