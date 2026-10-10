import { describe, expect, it, vi } from "vitest";
import {
  BufferGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Texture,
} from "three";

import { disposeSceneGraph } from "#lib/shared/3d/environments/utils/dispose-scene.js";

describe("Autumn environment disposal", () => {
  it("releases instancing buffers as well as GLTF geometry, materials, and textures", () => {
    const geometry = new BufferGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const mesh = new InstancedMesh(geometry, material, 2);
    const root = new Group();
    root.add(mesh);

    const meshDispose = vi.spyOn(mesh, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");

    disposeSceneGraph(root);

    expect(meshDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });
});
