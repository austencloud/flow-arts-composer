import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { auditPosedMeshAgainstStaff } from "$lib/shared/3d/diagnostics/contact-correct/posed-mesh-audit";

function meshWithTriangle(
  name: string,
  points: readonly [number, number, number][],
  boneName = "Face"
): SkinnedMesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(points.flat(), 3)
  );
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)
  );
  const mesh = new SkinnedMesh(geometry);
  mesh.name = name;
  const bone = new Bone();
  bone.name = boneName;
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  return mesh;
}

function closedTetrahedron(): SkinnedMesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [0.2, 0, 0, -0.1, 0.18, 0, -0.1, -0.09, 0.16, -0.1, -0.09, -0.16],
      3
    )
  );
  geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(Array(16).fill(0), 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4
    )
  );
  const mesh = new SkinnedMesh(geometry);
  const bone = new Bone();
  bone.name = "Torso";
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  return mesh;
}

const staff = {
  a: new Vector3(-1, 0, 0),
  b: new Vector3(1, 0, 0),
  radius: 0.05,
};

describe("posed mesh staff audit", () => {
  it("matches the renderer after a scaled skinned mesh is moved under a parent", () => {
    const root = new Object3D();
    root.add(
      meshWithTriangle(
        "hand",
        [
          [-0.5, -0.4, 0],
          [0.5, -0.4, 0],
          [0, 0.6, 0],
        ],
        "Index3"
      )
    );
    root.position.y = 3;
    root.scale.setScalar(1.4);
    const movedStaff = {
      a: staff.a.clone().add(new Vector3(0, 3, 0)),
      b: staff.b.clone().add(new Vector3(0, 3, 0)),
      radius: staff.radius,
    };
    const cold = auditPosedMeshAgainstStaff({ root, staff: movedStaff });
    root.updateMatrixWorld(true);
    const rendered = auditPosedMeshAgainstStaff({ root, staff: movedStaff });
    expect(cold.maximumPenetrationM).toBeCloseTo(0.05, 8);
    expect(rendered.maximumPenetrationM).toEqual(cold.maximumPenetrationM);
  });

  it("detects a shaft crossing a triangle whose vertices are all outside the cylinder", () => {
    const root = new Object3D();
    root.add(
      meshWithTriangle("face", [
        [-0.5, -0.4, 0],
        [0.5, -0.4, 0],
        [0, 0.6, 0],
      ])
    );
    const result = auditPosedMeshAgainstStaff({ root, staff });
    expect(result.status).toBe("available");
    expect(result.maximumPenetrationM).toBeCloseTo(0.05);
    expect(result.affectedRegions).toEqual(["face"]);
    expect(result.worstIntersection).toEqual({
      meshName: "face",
      triangleIndex: 0,
      boneNames: ["Face"],
      penetrationM: 0.05,
    });
  });

  it("does not exclude a finger merely because the grip window is active", () => {
    const root = new Object3D();
    root.add(
      meshWithTriangle(
        "right-pinky",
        [
          [-0.1, -0.1, 0],
          [0.1, -0.1, 0],
          [0, 0.1, 0],
        ],
        "RightHandPinky3"
      )
    );
    const result = auditPosedMeshAgainstStaff({
      root,
      staff,
      heldPalm: {
        boneNames: new Set(["RightHand"]),
        gripCenter: new Vector3(),
        gripAxis: new Vector3(1, 0, 0),
        halfAxialWindow: 0.5,
      },
    });
    expect(result.excludedPalmTriangles).toBe(0);
    expect(result.maximumPenetrationM).toBeGreaterThan(0);
  });

  it("uses the skinned mesh world matrix for transformed and scaled rigs", () => {
    const root = new Object3D();
    const mesh = meshWithTriangle("coat", [
      [-0.25, -0.2, 0],
      [0.25, -0.2, 0],
      [0, 0.3, 0],
    ]);
    mesh.position.set(0, 0, 0.2);
    mesh.scale.setScalar(2);
    root.add(mesh);
    const result = auditPosedMeshAgainstStaff({
      root,
      staff: { ...staff, radius: 0.05 },
    });
    // In local space this face crosses the shaft. Its posed world transform
    // moves it four staff radii away, so a local-space audit would fail here.
    expect(result.maximumPenetrationM).toBe(0);
  });

  it("fails closed when a rig exposes no skinned geometry", () => {
    const result = auditPosedMeshAgainstStaff({ root: new Object3D(), staff });
    expect(result).toMatchObject({
      status: "unavailable",
      maximumPenetrationM: null,
      reason: "no-skinned-mesh",
    });
  });

  it("returns exhausted instead of treating a bounded partial scan as clear", () => {
    const root = new Object3D();
    const mesh = meshWithTriangle("coat", [
      [-0.5, -0.4, 0],
      [0.5, -0.4, 0],
      [0, 0.6, 0],
    ]);
    mesh.geometry.setIndex([0, 1, 2, 0, 2, 1]);
    root.add(mesh);
    expect(
      auditPosedMeshAgainstStaff({ root, staff, maxTriangles: 1 }).status
    ).toBe("exhausted");
  });

  it("does not exhaust a budget that exactly covers all raw triangles", () => {
    const root = new Object3D();
    root.add(
      meshWithTriangle("coat", [
        [-0.5, -0.4, 0],
        [0.5, -0.4, 0],
        [0, 0.6, 0],
      ])
    );
    expect(
      auditPosedMeshAgainstStaff({ root, staff, maxTriangles: 1 }).status
    ).toBe("available");
  });

  it("ignores a hidden mesh that is not part of the rendered pose", () => {
    const root = new Object3D();
    const hidden = meshWithTriangle("hidden-coat", [
      [-0.5, -0.4, 0],
      [0.5, -0.4, 0],
      [0, 0.6, 0],
    ]);
    hidden.visible = false;
    root.add(hidden);
    expect(auditPosedMeshAgainstStaff({ root, staff }).status).toBe(
      "unavailable"
    );
  });

  it("detects a staff wholly contained by a watertight posed torso even without a surface crossing", () => {
    const root = new Object3D();
    root.add(closedTetrahedron());
    const result = auditPosedMeshAgainstStaff({
      root,
      staff: {
        a: new Vector3(-0.01, 0, 0),
        b: new Vector3(0.01, 0, 0),
        radius: 0.001,
      },
    });
    expect(result.maximumPenetrationM).toBe(0);
    expect(result.interiorContainment).toBe("contained");
  });
});
