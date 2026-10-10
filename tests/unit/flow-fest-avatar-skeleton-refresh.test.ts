import { describe, expect, it } from "vitest";
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import { refreshSkinnedSkeletons } from "#lib/features/flow-fest-sim/services/flow-fest-avatar-skeleton-refresh.js";

function skinnedMeshWithOneBone(): { mesh: SkinnedMesh; bone: Bone } {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0], 4));
  const bone = new Bone();
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  return { mesh, bone };
}

describe("refreshSkinnedSkeletons", () => {
  it("pushes bones moved after the last refresh into the bone matrices", () => {
    const root = new Group();
    const { mesh, bone } = skinnedMeshWithOneBone();
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.skeleton.update();

    // A later pose stage lifts the bone without refreshing the skeleton.
    bone.position.y = 1.8;

    expect(mesh.skeleton.boneMatrices[13]).toBe(0);
    expect(refreshSkinnedSkeletons(root)).toBe(1);
    expect(mesh.skeleton.boneMatrices[13]).toBeCloseTo(1.8);
  });

  it("ignores plain meshes", () => {
    const root = new Group();
    root.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    expect(refreshSkinnedSkeletons(root)).toBe(0);
  });
});
