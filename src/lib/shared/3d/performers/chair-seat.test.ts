import { describe, expect, it } from "vitest";
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import {
  SEATED_HIPS_BEHIND_CHAIR,
  applyChairPose,
  measureSeat,
  seatOnChair,
  seatedPlacement,
} from "./chair-seat";

/**
 * A small Mixamo-named body in the sitting clip's low-seat pose: hips 0.3 m
 * up, thighs angled up and forward to the knees, shins hanging, arms at the
 * sides. Faces +z. A few skinned points per bone stand in for the mesh.
 */
function lowSeatBody(): { root: Group; meshes: SkinnedMesh[] } {
  const bone = (
    name: string,
    x: number,
    y: number,
    z: number,
    parent?: Bone
  ) => {
    const b = new Bone();
    b.name = `mixamorig:${name}`;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const hips = bone("Hips", 0, 0.3, 0);
  const spine = bone("Spine", 0, 0.5, 0, hips);
  const bones = [hips, spine];
  for (const side of [1, -1]) {
    const prefix = side === 1 ? "Left" : "Right";
    const up = bone(`${prefix}UpLeg`, side * 0.1, -0.05, 0, hips);
    const knee = bone(`${prefix}Leg`, 0, 0.25, 0.35, up);
    const foot = bone(`${prefix}Foot`, 0, -0.42, 0.05, knee);
    const arm = bone(`${prefix}Arm`, side * 0.18, 0, 0, spine);
    const fore = bone(`${prefix}ForeArm`, 0, -0.28, 0, arm);
    const hand = bone(`${prefix}Hand`, 0, -0.25, 0, fore);
    bones.push(up, knee, foot, arm, fore, hand);
  }
  const root = new Group();
  root.add(hips);
  root.updateMatrixWorld(true);

  // One point at each bone, and one under the hips and each thigh: the seat.
  const points: number[] = [];
  const index: number[] = [];
  const weight: number[] = [];
  const add = (at: Vector3, boneIndex: number) => {
    points.push(at.x, at.y, at.z);
    index.push(boneIndex, 0, 0, 0);
    weight.push(1, 0, 0, 0);
  };
  bones.forEach((b, i) => {
    const at = b.getWorldPosition(new Vector3());
    add(at, i);
    if (/(Hips|UpLeg)$/.test(b.name)) add(at.clone().setY(at.y - 0.08), i);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(index, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weight, 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  return { root, meshes: [mesh] };
}

const SEAT_TOP = 0.46;

/** The chair: a seat point, facing the fire, on a floor 0.05 m up. */
const chair = { x: 2, z: -1, facing: 2.2 };
const FLOOR = 0.05;

function seated(scale: number) {
  const { root, meshes } = lowSeatBody();
  const holder = new Group();
  holder.add(root);
  const { pose, measure } = seatOnChair(root, meshes, SEAT_TOP / scale);
  const at = seatedPlacement(chair, FLOOR, SEAT_TOP, measure, scale);
  holder.position.set(at.x, at.y, at.z);
  holder.rotation.y = at.rotationY;
  holder.scale.setScalar(scale);
  holder.updateMatrixWorld(true);
  return { root, meshes, pose, holder };
}

function worldOf(root: Group, name: string): Vector3 {
  return root
    .getObjectByName(`mixamorig:${name}`)!
    .getWorldPosition(new Vector3());
}

describe("chair seat", () => {
  for (const scale of [1, 0.9]) {
    it(`puts the seat on the chair and the feet on the floor (scale ${scale})`, () => {
      const { root, meshes, pose } = seated(scale);
      expect(pose).not.toBeNull();
      // Re-bend in place, as each frame does, and read the world back.
      if (pose) applyChairPose(pose);
      const local = measureSeat(meshes, root);
      const seatWorld = root.localToWorld(new Vector3(0, local.seatY, 0)).y;
      expect(seatWorld).toBeCloseTo(FLOOR + SEAT_TOP, 3);

      for (const side of ["Left", "Right"]) {
        // Ankles stand 8 cm (scaled) above the floor, ahead of the hips.
        const ankle = worldOf(root, `${side}Foot`);
        expect(ankle.y).toBeCloseTo(FLOOR + 0.08 * scale, 2);
        const hip = worldOf(root, `${side}UpLeg`);
        const knee = worldOf(root, `${side}Leg`);
        // The thigh lies along the seat: the knee is near hip height.
        expect(Math.abs(knee.y - hip.y)).toBeLessThan(0.12 * scale);
        const forward = new Vector3(
          Math.cos(chair.facing),
          0,
          Math.sin(chair.facing)
        );
        expect(knee.clone().sub(hip).dot(forward)).toBeGreaterThan(
          0.25 * scale
        );
      }

      // The pelvis sits just behind the chair's centre, toward its back.
      const hips = worldOf(root, "Hips");
      expect(hips.x).toBeCloseTo(
        chair.x - Math.cos(chair.facing) * SEATED_HIPS_BEHIND_CHAIR,
        2
      );
      expect(hips.z).toBeCloseTo(
        chair.z - Math.sin(chair.facing) * SEATED_HIPS_BEHIND_CHAIR,
        2
      );
    });
  }

  it("sits on the ground itself when there is no chair", () => {
    const { root, meshes } = lowSeatBody();
    const measure = measureSeat(meshes, root);
    const at = seatedPlacement(chair, FLOOR, null, measure);
    expect(at.y + measure.seatY).toBeCloseTo(FLOOR, 6);
    // Facing: the model's +z turned onto the sim's facing.
    const forward = new Vector3(0, 0, 1).applyAxisAngle(
      new Vector3(0, 1, 0),
      at.rotationY
    );
    expect(forward.x).toBeCloseTo(Math.cos(chair.facing), 6);
    expect(forward.z).toBeCloseTo(Math.sin(chair.facing), 6);
  });
});
