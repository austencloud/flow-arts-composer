import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FingerAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/FingerAnimator";
import { AvatarSkeletonBuilder } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarSkeletonBuilder";
import { measureCylindricalGripChannel } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/geometry/CylindricalGripGeometry";
import {
  GripType,
  type FingerBoneName,
} from "../../../node_modules/@austencloud/scene-3d/src/lib/domain/models/GripPose";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";

const HEIGHT_M = 1.905;
const STAFF_LENGTH_M = 0.9;
const STAFF_RADIUS_M = 0.0095;
const OUT = resolve(process.cwd(), ".tmp/contact-package/finger-fit.json");

type Side = "left" | "right";
type FingerSegments = {
  baseClearanceM: number;
  proximalMiddleM: number;
  middleDistalM: number;
  distalTipM: number;
};
type Row = {
  rig: string;
  side: Side;
  confidence: number;
  clearancesM: Record<string, number | null>;
  supported: Record<string, boolean | null>;
  segments: Record<string, FingerSegments>;
};

function segmentDistance(
  a0: Vector3,
  a1: Vector3,
  b0: Vector3,
  b1: Vector3
): number {
  const u = a1.clone().sub(a0);
  const v = b1.clone().sub(b0);
  const w = a0.clone().sub(b0);
  const uu = u.dot(u);
  const uv = u.dot(v);
  const vv = v.dot(v);
  const uw = u.dot(w);
  const vw = v.dot(w);
  const denominator = uu * vv - uv * uv;
  let s = denominator > 1e-12 ? (uv * vw - vv * uw) / denominator : 0;
  let t =
    denominator > 1e-12
      ? (uu * vw - uv * uw) / denominator
      : vv > 1e-12
        ? vw / vv
        : 0;
  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, Math.min(1, t));
  if (uu > 1e-12) s = Math.max(0, Math.min(1, (uv * t - uw) / uu));
  if (vv > 1e-12) t = Math.max(0, Math.min(1, (uv * s + vw) / vv));
  return a0
    .clone()
    .addScaledVector(u, s)
    .distanceTo(b0.clone().addScaledVector(v, t));
}

function diagnosticSegments(
  fingers: Map<FingerBoneName, import("three").Bone>,
  name: "Thumb" | "Index" | "Middle" | "Ring" | "Pinky",
  cylinder: { a: Vector3; b: Vector3 }
): FingerSegments {
  const one = fingers.get(`${name}1` as FingerBoneName)!;
  const two = fingers.get(`${name}2` as FingerBoneName)!;
  const three = fingers.get(`${name}3` as FingerBoneName)!;
  const a = one.getWorldPosition(new Vector3());
  const b = two.getWorldPosition(new Vector3());
  const c = three.getWorldPosition(new Vector3());
  const child = three.children.find(
    (node): node is import("three").Bone =>
      (node as import("three").Bone).isBone
  );
  const tip = child
    ? child.getWorldPosition(new Vector3())
    : c.clone().add(c.clone().sub(b));
  const radius = Math.max(0.003, a.distanceTo(b) * 0.115);
  const clearance = (start: Vector3, end: Vector3) =>
    segmentDistance(start, end, cylinder.a, cylinder.b) -
    STAFF_RADIUS_M -
    radius;
  return {
    baseClearanceM:
      a.distanceTo(
        cylinder.a
          .clone()
          .addScaledVector(
            cylinder.b.clone().sub(cylinder.a),
            Math.max(
              0,
              Math.min(
                1,
                a
                  .clone()
                  .sub(cylinder.a)
                  .dot(cylinder.b.clone().sub(cylinder.a)) /
                  cylinder.b.clone().sub(cylinder.a).lengthSq()
              )
            )
          )
      ) -
      STAFF_RADIUS_M -
      radius,
    proximalMiddleM: clearance(a, b),
    middleDistalM: clearance(b, c),
    distalTipM: clearance(c, tip),
  };
}

function measuredCylinder(
  fingers: Map<FingerBoneName, import("three").Bone>,
  hand: import("three").Bone
) {
  const index = fingers.get("Index1")!;
  const middle1 = fingers.get("Middle1")!;
  const middle2 = fingers.get("Middle2")!;
  const middle3 = fingers.get("Middle3")!;
  const pinky = fingers.get("Pinky1")!;
  const thumb = fingers.get("Thumb1")!;
  hand.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(hand.matrixWorld).invert();
  const local = (bone: import("three").Bone) =>
    bone.getWorldPosition(new Vector3()).applyMatrix4(inverse);
  const i = local(index);
  const p = local(pinky);
  const m = local(middle1);
  const t = local(thumb);
  const longitudinal = m.clone().normalize();
  const transverse = p.clone().sub(i);
  transverse
    .addScaledVector(longitudinal, -transverse.dot(longitudinal))
    .normalize();
  const palmNormal = new Vector3()
    .crossVectors(transverse, longitudinal)
    .normalize();
  if (palmNormal.dot(t.sub(m)) < 0) palmNormal.negate();
  const fallback = m.clone().multiplyScalar(0.65);
  const channel = new Vector3();
  const confidence = measureCylindricalGripChannel(
    local(middle1),
    local(middle2),
    local(middle3),
    longitudinal,
    palmNormal,
    transverse,
    fallback,
    channel
  );
  const center = hand.localToWorld(channel);
  const worldAxis = transverse
    .applyQuaternion(hand.getWorldQuaternion(new Quaternion()))
    .normalize();
  return {
    a: center.clone().addScaledVector(worldAxis, -STAFF_LENGTH_M / 2),
    b: center.clone().addScaledVector(worldAxis, STAFF_LENGTH_M / 2),
    confidence,
  };
}

describe.runIf(
  avatarAssetsPresent() &&
    existsSync(
      resolve(
        process.cwd(),
        "static/models/avatars/bakeoff/personal-metaperson.glb"
      )
    )
)("real hand cylinder fit", () => {
  it("keeps every ch07, ch18, and personal-metaperson finger within the strict staff band", async () => {
    const paths = [
      ["ch07", avatar("ch07")],
      ["ch18", avatar("ch18")],
      [
        "personal-metaperson",
        resolve(
          process.cwd(),
          "static/models/avatars/bakeoff/personal-metaperson.glb"
        ),
      ],
    ] as const;
    const rows: Row[] = [];
    for (const [id, path] of paths) {
      const { scene } = await loadRig(path);
      const builder = new AvatarSkeletonBuilder() as unknown as {
        processGLTF(
          root: import("three").Object3D,
          bounds: null,
          label: string
        ): void;
        setHeight(height: number): void;
        state: {
          fingerChains: {
            left: Map<FingerBoneName, import("three").Bone>;
            right: Map<FingerBoneName, import("three").Bone>;
          } | null;
        };
        getLeftArmChain(): { effector: import("three").Bone } | null;
        getRightArmChain(): { effector: import("three").Bone } | null;
      };
      builder.processGLTF(scene, null, id);
      builder.setHeight(HEIGHT_M);
      scene.updateWorldMatrix(true, true);
      expect(builder.state.fingerChains, `${id} finger chains`).not.toBeNull();
      const animator = new FingerAnimator();
      animator.initialize(builder.state.fingerChains!);
      animator.setGrips(GripType.SQUARE, GripType.SQUARE);
      animator.setBlendSpeed(100);
      animator.update(1);
      animator.setCylinderContactStrict(true);
      for (const side of ["left", "right"] as const) {
        const hand =
          side === "left"
            ? builder.getLeftArmChain()!.effector
            : builder.getRightArmChain()!.effector;
        const cylinder = measuredCylinder(
          builder.state.fingerChains![side],
          hand
        );
        animator.setCylinderContact(side, {
          ...cylinder,
          radiusM: STAFF_RADIUS_M,
          lengthM: STAFF_LENGTH_M,
        });
        animator.solveCylinderContacts();
        const report = animator.getCylinderContactReport(side);
        rows.push({
          rig: id,
          side,
          confidence: cylinder.confidence,
          clearancesM: Object.fromEntries(
            report.map((item) => [item.finger, item.signedClearanceM])
          ),
          supported: Object.fromEntries(
            report.map((item) => [item.finger, item.supported])
          ),
          segments: Object.fromEntries([
            [
              "thumb",
              diagnosticSegments(
                builder.state.fingerChains![side],
                "Thumb",
                cylinder
              ),
            ],
            [
              "index",
              diagnosticSegments(
                builder.state.fingerChains![side],
                "Index",
                cylinder
              ),
            ],
            [
              "middle",
              diagnosticSegments(
                builder.state.fingerChains![side],
                "Middle",
                cylinder
              ),
            ],
            [
              "ring",
              diagnosticSegments(
                builder.state.fingerChains![side],
                "Ring",
                cylinder
              ),
            ],
            [
              "pinky",
              diagnosticSegments(
                builder.state.fingerChains![side],
                "Pinky",
                cylinder
              ),
            ],
          ]),
        });
        expect(report).toHaveLength(5);
      }
    }
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(rows, null, 2));
    for (const row of rows) {
      for (const [finger, clearance] of Object.entries(row.clearancesM)) {
        expect(clearance, `${row.rig}/${row.side}/${finger}`).not.toBeNull();
        expect(
          clearance!,
          `${row.rig}/${row.side}/${finger}`
        ).toBeGreaterThanOrEqual(-0.0005);
        expect(
          clearance!,
          `${row.rig}/${row.side}/${finger}`
        ).toBeLessThanOrEqual(0.002);
      }
    }
  });
});
