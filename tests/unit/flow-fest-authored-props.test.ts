import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";

vi.mock("#lib/shared/3d/scene-boot/gltf-decoders.js", () => ({
  attachGltfDecoders: () => {},
}));

const { applyFlowFestAuthoredProps } = await import(
  "../../src/routes/test/flow-fest-sim/flow-fest-authored-props"
);

function dressingRoot() {
  const root = new Group();
  const canopy = new Group();
  canopy.name = "FFS_LEDFlowCircle_OpenCanopy_Authored";
  const anchor = new Group();
  anchor.name = "FFS_LEDFlowCircle_ModelAnchor";
  const post = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  post.name = "FFS_LEDFlowCircle_CanopyPost_1_Authored";
  const roof = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  roof.name = "FFS_LEDFlowCircle_FlatCanopy_Authored";
  const ring = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  ring.name = "FFS_LEDFlowCircle_HangingRing_Authored";
  canopy.add(anchor, post, roof, ring);
  const fireRing = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  fireRing.name = "FFS_FireJam_CentralFireRing_Authored";
  fireRing.position.set(4, 1, -2);
  const glowMaterial = new MeshBasicMaterial();
  const posts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 3);
  posts.name = "FFS_PathLanternPosts_AuthoredWayfinding";
  const glows = new InstancedMesh(new BoxGeometry(), glowMaterial, 3);
  glows.name = "FFS_PathLanterns_AuthoredWayfinding";
  for (let index = 0; index < 3; index += 1) {
    posts.setMatrixAt(index, new Matrix4().makeTranslation(index * 10, 2.02, 0));
  }
  root.add(canopy, fireRing, posts, glows);
  return { root, post, roof, ring, fireRing, posts, glows, glowMaterial };
}

const meshes = (names: string[]) =>
  names.map((name) => {
    const material = new MeshStandardMaterial();
    material.name = name;
    return { name, geometry: new BoxGeometry(), material };
  });

const fakeLoader = async (url: string) =>
  url.includes("lantern") ? meshes(["lantern-post", "lantern-glow"]) : meshes(["part-a", "part-b"]);

describe("Flow Fest authored props", () => {
  it("swaps every hero prop in and hides only the primitives it replaces", async () => {
    const scene = dressingRoot();
    const result = await applyFlowFestAuthoredProps(scene.root, () => true, fakeLoader);
    expect(result).toEqual({ canopy: true, fire: true, lanterns: true });
    expect(scene.post.visible).toBe(false);
    expect(scene.roof.visible).toBe(false);
    // The hanging LED ring is a runtime light, not part of the model.
    expect(scene.ring.visible).toBe(true);
    expect(scene.root.getObjectByName("FFS_LEDFlowCircle_TrussCanopy_GLB")).toBeInstanceOf(LOD);
    const fire = scene.root.getObjectByName("FFS_FireJam_FireCircle_GLB")!;
    expect(fire.position.toArray()).toEqual([4, 1, -2]);
    expect(scene.fireRing.visible).toBe(false);
    const glow = scene.root.getObjectByName("FFS_PathLanterns_GLB_lantern-glow") as InstancedMesh;
    expect(glow.count).toBe(3);
    // The glow keeps the runtime's lantern material so night tuning still applies.
    expect(glow.material).toBe(scene.glowMaterial);
    const matrix = new Matrix4();
    glow.getMatrixAt(2, matrix);
    expect(matrix.elements[12]).toBeCloseTo(20);
    expect(matrix.elements[13]).toBeCloseTo(2);
    expect(scene.posts.visible).toBe(false);
  });

  it("keeps the primitives when a GLB fails to load", async () => {
    const scene = dressingRoot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await applyFlowFestAuthoredProps(scene.root, () => true, async (url) => {
      if (url.includes("canopy")) throw new Error("404");
      return fakeLoader(url);
    });
    warn.mockRestore();
    expect(result.canopy).toBe(false);
    expect(scene.post.visible).toBe(true);
    expect(scene.roof.visible).toBe(true);
    expect(result.fire).toBe(true);
  });

  it("leaves a dressing alone once it has been replaced", async () => {
    const scene = dressingRoot();
    const result = await applyFlowFestAuthoredProps(scene.root, () => false, fakeLoader);
    expect(result).toEqual({ canopy: false, fire: false, lanterns: false });
    expect(scene.post.visible).toBe(true);
    expect(scene.fireRing.visible).toBe(true);
    expect(scene.posts.visible).toBe(true);
  });
});
