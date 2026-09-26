import { describe, expect, it } from "vitest";
import { Euler, Group, Quaternion, Vector3, type SkinnedMesh } from "three";
import { createAvatarServices } from "@austencloud/scene-3d";
import {
  CLEARANCE_CALIBRATION_HEIGHT_M,
  DEFAULT_STAFF_BODY_CLEARANCE_BODY,
  STAFF_BODY_MARGIN_M,
  clearanceStaffForProp,
  staffBodyIntrusionM,
  type BodyYawPose,
  type ClearanceStaff,
} from "$lib/shared/3d/collision/staff-body-clearance";
import { avatar, avatarAssetsPresent, loadRig } from "./locomotion-harness";

/**
 * The section table in `staff-body-clearance.ts` against the rigs it was
 * measured from. The planner trusts it to say a staff is clear of the body, so
 * a skin vertex outside it is a staff the plan would pass through the mesh.
 */

const SQUARE: BodyYawPose = { spine1Rad: 0, chestRad: 0, headRad: 0 };
/** No staff radius and no margin: the bare table. */
const BARE_TABLE = {
  ...DEFAULT_STAFF_BODY_CLEARANCE_BODY,
  staffRadiusM: -STAFF_BODY_MARGIN_M,
};
/** The table's heights, with each section's 3.5 cm band. */
const TABLE_BOTTOM_M = 0.9 - 0.035;
const TABLE_TOP_M = 1.9 + 0.035;
/** The table is written to the millimetre. */
const ROUNDING_M = 0.001;

function point(x: number, y: number, z: number): ClearanceStaff {
  return {
    centerX: x,
    centerY: y,
    centerZ: z,
    axisX: 0,
    axisY: 0,
    axisZ: 0,
    halfLengthM: 0,
  };
}

/** The parts the table covers, by the bone that dominates a vertex: the
 *  torso, clavicles, neck and head. The hands hold the staffs; the arms and
 *  legs are measured on their own. */
function coveredByTable(boneName: string): boolean {
  return !/Hand|Thumb|Index|Middle|Ring|Pinky|Arm|Leg|Foot|Toe/.test(boneName);
}

/** Every covered skin vertex of a rig in its bind pose at the table's height,
 *  feet on the floor, in the performer frame. */
async function coveredVertices(id: string): Promise<Vector3[]> {
  const { scene } = await loadRig(avatar(id));
  const services = createAvatarServices({
    enableLocomotion: false,
    enableRootMotion: false,
    enableFootPlanting: false,
  });
  // processGLTF is on the implementation, not the contract.
  (
    services.skeleton as unknown as {
      processGLTF(scene: unknown, gltf: null, id: string): void;
    }
  ).processGLTF(scene, null, id);
  services.skeleton.setHeight(CLEARANCE_CALIBRATION_HEIGHT_M);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateMatrixWorld(true);

  const meshes: SkinnedMesh[] = [];
  root.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh) meshes.push(node as SkinnedMesh);
  });
  const vertices: Vector3[] = [];
  for (const mesh of meshes) {
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    const count = mesh.geometry.getAttribute("position").count;
    for (let i = 0; i < count; i++) {
      let bone = 0;
      let weight = -1;
      for (let slot = 0; slot < 4; slot++) {
        if (skinWeight.getComponent(i, slot) > weight) {
          weight = skinWeight.getComponent(i, slot);
          bone = skinIndex.getComponent(i, slot);
        }
      }
      if (!coveredByTable(mesh.skeleton.bones[bone]?.name ?? "")) continue;
      vertices.push(
        mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld)
      );
    }
  }
  return vertices;
}

describe("staff-body clearance", () => {
  it("turns the face toward the performer's left on a positive turn", () => {
    // Beside the head on the performer's left, clear of it while square.
    const besideHead = point(0.15, 1.8, 0);
    const turned = (yaw: number) =>
      staffBodyIntrusionM(
        [besideHead],
        { spine1Rad: 0.45 * yaw, chestRad: yaw, headRad: yaw },
        DEFAULT_STAFF_BODY_CLEARANCE_BODY
      );
    const yaw = (87 * Math.PI) / 180;
    expect(turned(0)).toBeLessThan(0);
    // Toward it, the face comes into the point; away, the back of the head
    // is shallower than the face and stays clear.
    expect(turned(yaw)).toBeGreaterThan(0);
    expect(turned(-yaw)).toBeLessThan(0);
  });

  it("lays a staff along the prop's local -x, or keeps only the grip without a rotation", () => {
    const body = DEFAULT_STAFF_BODY_CLEARANCE_BODY;
    const at = new Vector3(0.1, -0.2, 0.05);
    const grip = clearanceStaffForProp(
      { worldPosition: at },
      0,
      0.3,
      -0.16,
      body
    );
    expect(grip.halfLengthM).toBe(0);
    expect(grip.centerX).toBeCloseTo(0.1, 12);
    expect(grip.centerY).toBeCloseTo(body.gridHeightM - 0.2, 12);
    expect(grip.centerZ).toBeCloseTo(0.3 + 0.05 - 0.16, 12);

    const rotation = new Quaternion().setFromEuler(new Euler(0.4, -1.1, 0.7));
    const staff = clearanceStaffForProp(
      { worldPosition: at, worldRotation: rotation },
      0,
      0.3,
      -0.16,
      body
    );
    const axis = new Vector3(-1, 0, 0).applyQuaternion(rotation);
    expect(staff.halfLengthM).toBeCloseTo(body.staffLengthM / 2, 12);
    expect(staff.axisX).toBeCloseTo(axis.x, 12);
    expect(staff.axisY).toBeCloseTo(axis.y, 12);
    expect(staff.axisZ).toBeCloseTo(axis.z, 12);
  });

  it("reports nothing to hit when no staff point is level with the body", () => {
    expect(
      staffBodyIntrusionM(
        [point(0, 2.3, 0)],
        SQUARE,
        DEFAULT_STAFF_BODY_CLEARANCE_BODY
      )
    ).toBe(-Infinity);
  });

  it.skipIf(!avatarAssetsPresent())(
    "holds every torso, clavicle, neck and head vertex of both rigs",
    async () => {
      for (const id of ["ch07", "ch18"]) {
        const outside: string[] = [];
        let tested = 0;
        for (const v of await coveredVertices(id)) {
          if (v.y < TABLE_BOTTOM_M || v.y > TABLE_TOP_M) continue;
          tested++;
          const depth = staffBodyIntrusionM(
            [point(v.x, v.y, v.z)],
            SQUARE,
            BARE_TABLE
          );
          if (depth < -ROUNDING_M) {
            outside.push(
              `${id} (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) ${(-depth * 100).toFixed(1)} cm out`
            );
          }
        }
        expect(tested, `${id} vertices in the table's range`).toBeGreaterThan(
          1000
        );
        expect(outside.slice(0, 10)).toEqual([]);
      }
    },
    120_000
  );
});
