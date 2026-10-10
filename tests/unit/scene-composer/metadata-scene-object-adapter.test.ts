import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
} from "three";
import {
  createMetadataSceneObjectAdapter,
  stableComposerMatrixKey,
} from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";

function createBatch(translations: number[]) {
  const geometry = new BoxGeometry();
  geometry.name = "ForestTreeMesh_canopy-beech";
  const batch = new InstancedMesh(
    geometry,
    new MeshBasicMaterial(),
    translations.length
  );
  for (let index = 0; index < translations.length; index += 1) {
    batch.setMatrixAt(
      index,
      new Matrix4().makeTranslation(
        translations[index],
        0,
        -translations[index]
      )
    );
  }
  return batch;
}

describe("createMetadataSceneObjectAdapter", () => {
  it("derives the same IDs after an instance batch is reordered", () => {
    const firstRoot = new Object3D();
    firstRoot.add(createBatch([2, 7, 11]));
    const secondRoot = new Object3D();
    secondRoot.add(createBatch([11, 2, 7]));
    const options = {
      sceneId: "forest",
      editableRoles: new Set<string>(),
      lockedRoles: new Set<string>(),
      editableInstancePatterns: [/ForestTreeMesh/],
    };

    const first = createMetadataSceneObjectAdapter(options)
      .enumerate(firstRoot)
      .map((handle) => handle.id)
      .sort();
    const second = createMetadataSceneObjectAdapter(options)
      .enumerate(secondRoot)
      .map((handle) => handle.id)
      .sort();

    expect(second).toEqual(first);
  });

  it("resolves manifest-backed IDs independently of the batch index", () => {
    const matrix = new Matrix4().makeTranslation(7, 0, -7);
    const adapter = createMetadataSceneObjectAdapter({
      sceneId: "winter",
      editableRoles: new Set<string>(),
      lockedRoles: new Set<string>(),
      editableInstancePatterns: [/ForestTreeMesh/],
      instanceDescriptorsByMatrixKey: {
        [stableComposerMatrixKey(matrix)]: {
          id: "winter:conifer:authored-tree-007",
          objectKey: "conifer",
          label: "Authored tree 007",
          locked: false,
        },
      },
    });
    const root = new Object3D();
    root.add(createBatch([11, 2, 7]));

    const mapped = adapter
      .enumerate(root)
      .find((handle) => handle.id === "winter:conifer:authored-tree-007");

    expect(mapped?.instanceId).toBe(2);
  });
});
