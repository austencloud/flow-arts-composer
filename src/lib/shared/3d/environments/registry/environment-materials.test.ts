import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { dressEnvironmentMaterials } from "./environment-materials";

function bake() {
  const shared = new MeshStandardMaterial({ color: 0xffffff });
  const geometry = new BoxGeometry();
  const root = new Group();
  const a = new Mesh(geometry, shared);
  const b = new Mesh(geometry, shared);
  const c = new Mesh(geometry, [shared, new MeshStandardMaterial()]);
  root.add(a, b, c);
  return { root, shared, a, b, c };
}

const meshes = (root: Group | ReturnType<typeof bake>["root"]) =>
  root.children as Mesh[];

describe("dressEnvironmentMaterials", () => {
  const options = {
    vertexColors: true,
    tint: [0.2, 0.25, 0.26] as [number, number, number],
    envMapIntensity: 0.16,
  };

  it("never touches the cached GLB's nodes or materials", () => {
    const { root, shared, a } = bake();
    dressEnvironmentMaterials(root, options, new Texture());
    expect(a.material).toBe(shared);
    expect(shared.vertexColors).toBe(false);
    expect(shared.color.getHex()).toBe(0xffffff);
    expect(shared.envMap).toBeNull();
  });

  it("applies vertex colours, the tint and the per-material image light to the copy", () => {
    const { root } = bake();
    const envMap = new Texture();
    const dressed = dressEnvironmentMaterials(root, options, envMap);
    const material = meshes(dressed.root as Group)[0]!
      .material as MeshStandardMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.color.r).toBeCloseTo(0.2);
    expect(material.color.g).toBeCloseTo(0.25);
    expect(material.color.b).toBeCloseTo(0.26);
    expect(material.envMap).toBe(envMap);
    expect(material.envMapIntensity).toBeCloseTo(0.16);
  });

  it("keeps a material shared across meshes shared in the copy, arrays included", () => {
    const { root, a } = bake();
    const dressed = dressEnvironmentMaterials(root, options);
    const [da, db, dc] = meshes(dressed.root as Group);
    expect(da!.material).toBe(db!.material);
    expect((dc!.material as MeshStandardMaterial[])[0]).toBe(da!.material);
    expect(da!.geometry).toBe(a.geometry);
  });

  it("disposes only the copies it made", () => {
    const { root, shared } = bake();
    const dressed = dressEnvironmentMaterials(root, options);
    const copy = meshes(dressed.root as Group)[0]!
      .material as MeshStandardMaterial;
    let copyDisposed = false;
    let sharedDisposed = false;
    copy.addEventListener("dispose", () => (copyDisposed = true));
    shared.addEventListener("dispose", () => (sharedDisposed = true));
    dressed.dispose();
    expect(copyDisposed).toBe(true);
    expect(sharedDisposed).toBe(false);
  });
});
