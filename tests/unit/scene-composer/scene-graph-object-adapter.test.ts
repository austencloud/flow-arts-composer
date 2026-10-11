import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { SceneGraphObjectAdapter } from "#lib/shared/3d/scene-composer/scene-graph-object-adapter.js";
import { CommandStack } from "#lib/shared/history/command-stack.svelte.js";
import { serializeComposerPlacementManifest } from "#lib/shared/3d/scene-composer/persistence/manifest-persistence.js";

function createInstanceBatch(ids: string[]) {
  const batch = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    ids.length
  );
  batch.userData.composerInstanceIds = ids;
  for (let index = 0; index < ids.length; index += 1) {
    batch.setMatrixAt(
      index,
      new Matrix4().makeTranslation(index * 3, 2, -index)
    );
  }
  return batch;
}

function createAdapter() {
  return new SceneGraphObjectAdapter((object, instanceId) => {
    const ids = object.userData.composerInstanceIds as string[] | undefined;
    if (!ids || instanceId === undefined) return null;
    return {
      id: ids[instanceId],
      objectKey: "tree",
      locked: ids[instanceId] === "tree-locked",
    };
  });
}

function readInstanceMatrix(batch: InstancedMesh, instanceId: number) {
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  batch.getMatrixAt(instanceId, matrix);
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

describe("SceneGraphObjectAdapter", () => {
  it("enumerates instanced props with authored IDs instead of transient indexes", () => {
    const root = new Object3D();
    const batch = createInstanceBatch(["tree-west", "tree-locked"]);
    root.add(batch);

    const handles = createAdapter().enumerate(root);

    expect(handles.map((handle) => handle.id)).toEqual([
      "tree-west",
      "tree-locked",
    ]);
    expect(handles[0]).toMatchObject({ kind: "instance", locked: false });
    expect(handles[1]).toMatchObject({ kind: "instance", locked: true });
  });

  it("writes proxy transforms back to one member without changing batch size", () => {
    const root = new Object3D();
    const batch = createInstanceBatch(["tree-west", "tree-east"]);
    root.add(batch);
    const adapter = createAdapter();
    const handle = adapter.enumerate(root)[1];
    const target = adapter.createTransformTarget(handle);

    target.position.set(14, 4, -8);
    target.rotation.set(0, Math.PI / 3, 0);
    target.scale.set(1.2, 1.4, 1.2);
    adapter.previewTransform(handle, target);

    const changed = readInstanceMatrix(batch, 1);
    const untouched = readInstanceMatrix(batch, 0);
    expect(changed.position.toArray()).toEqual([14, 4, -8]);
    expect(changed.scale.x).toBeCloseTo(1.2);
    expect(changed.scale.y).toBeCloseTo(1.4);
    expect(changed.scale.z).toBeCloseTo(1.2);
    expect(untouched.position.x).toBeCloseTo(0);
    expect(untouched.position.y).toBeCloseTo(2);
    expect(untouched.position.z).toBeCloseTo(0);
    expect(batch.count).toBe(2);

    adapter.disposeTransformTarget(handle, target);
    expect(target.parent).toBeNull();
  });

  it("hides and restores an instance without compacting later IDs", () => {
    const root = new Object3D();
    const batch = createInstanceBatch(["tree-west", "tree-east"]);
    root.add(batch);
    const adapter = createAdapter();
    const handle = adapter.enumerate(root)[0];
    const before = adapter.read(handle);

    adapter.applyPlacement(handle, { ...before, visible: false });
    const hidden = new Matrix4();
    batch.getMatrixAt(0, hidden);
    expect(hidden.elements.slice(0, 3)).toEqual([0, 0, 0]);
    expect(hidden.elements.slice(4, 7)).toEqual([0, 0, 0]);
    expect(hidden.elements.slice(8, 11)).toEqual([0, 0, 0]);
    expect(batch.count).toBe(2);

    adapter.applyPlacement(handle, { ...before, visible: true });
    const restored = readInstanceMatrix(batch, 0);
    expect(restored.position.x).toBeCloseTo(0);
    expect(restored.position.y).toBeCloseTo(2);
    expect(restored.position.z).toBeCloseTo(0);
    expect(readInstanceMatrix(batch, 1).position.toArray()).toEqual([3, 2, -1]);
    expect(batch.count).toBe(2);
  });

  it("rejects mutations for locked structural handles", () => {
    const root = new Object3D();
    const batch = createInstanceBatch(["tree-locked"]);
    root.add(batch);
    const adapter = createAdapter();
    const handle = adapter.enumerate(root)[0];
    const placement = adapter.read(handle);

    expect(() =>
      adapter.applyPlacement(handle, {
        ...placement,
        position: [10, 10, 10],
      })
    ).toThrow("is locked");
    const unchanged = readInstanceMatrix(batch, 0);
    expect(unchanged.position.x).toBeCloseTo(0);
    expect(unchanged.position.y).toBeCloseTo(2);
    expect(unchanged.position.z).toBeCloseTo(0);
  });

  it("moves every mesh member that shares one authored prop ID", () => {
    const root = new Object3D();
    const trunks = createInstanceBatch(["tree-west"]);
    const crowns = createInstanceBatch(["tree-west"]);
    root.add(trunks, crowns);
    const adapter = createAdapter();
    const handles = adapter.enumerate(root);
    const handle = handles[0];
    const target = adapter.createTransformTarget(handle);

    expect(handles).toHaveLength(1);
    expect(handle.members).toHaveLength(2);
    target.position.set(8, 3, -5);
    adapter.previewTransform(handle, target);
    expect(readInstanceMatrix(trunks, 0).position.toArray()).toEqual([
      8, 3, -5,
    ]);
    expect(readInstanceMatrix(crowns, 0).position.toArray()).toEqual([
      8, 3, -5,
    ]);
  });

  it("preserves ID and transform through delete, undo, redo, and manifest reload", () => {
    const root = new Object3D();
    const batch = createInstanceBatch(["tree-west", "tree-east"]);
    root.add(batch);
    const adapter = createAdapter();
    const handle = adapter.enumerate(root)[0];
    const before = adapter.read(handle);
    const deleted = {
      ...before,
      position: [8, 3, -5] as [number, number, number],
      visible: false,
    };
    const commands = new CommandStack();

    commands.execute({
      label: "Delete tree-west",
      execute: () => adapter.applyPlacement(handle, deleted),
      undo: () => adapter.applyPlacement(handle, before),
    });
    expect(adapter.read(handle)).toMatchObject({
      id: "tree-west",
      position: [8, 3, -5],
      visible: false,
    });

    commands.undo();
    expect(adapter.read(handle)).toMatchObject({
      id: "tree-west",
      position: [0, 2, 0],
      visible: true,
    });

    commands.redo();
    const reloaded = JSON.parse(
      serializeComposerPlacementManifest([adapter.read(handle)])
    ).placements[0];
    expect(reloaded).toMatchObject({
      id: "tree-west",
      position: [8, 3, -5],
      visible: false,
      source: "native",
    });
    expect(batch.count).toBe(2);
  });
});
