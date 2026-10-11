import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector2,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import { FOREST_FIREFLY_FIELDS } from "#lib/shared/3d/environments/scenes/forest/forest-firefly-fields.js";
import { createForestEnvironmentWorld } from "#lib/shared/3d/environments/worlds/forest/forest-environment-world.js";

function authoredMesh(name: string, role?: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = name;
  if (role) mesh.userData.tka_role = role;
  return mesh;
}

function rendererStub(): WebGLRenderer {
  return {
    capabilities: { getMaxAnisotropy: () => 16 },
    getSize: (target: Vector2) => target.set(1920, 1080),
  } as unknown as WebGLRenderer;
}

function childNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((object) => names.add(object.name));
  return names;
}

describe("Forest renderer-neutral environment parity", () => {
  it("owns the complete production Forest composition and lifecycle", async () => {
    const environmentRoot = new Group();
    environmentRoot.name = "authored-environment-root";
    const terrain = authoredMesh("authored-terrain", "terrain");
    const woodland = authoredMesh("authored-woodland", "woodland");
    environmentRoot.add(terrain, woodland);

    const nearFrameRoot = new Group();
    nearFrameRoot.name = "authored-near-frame-root";
    const staticProp = authoredMesh(
      "authored-deadwood",
      "near-frame-static-prop"
    );
    const grass = authoredMesh("authored-grass", "near-frame-grass");
    nearFrameRoot.add(staticProp, grass);

    const campsiteRoot = new Group();
    campsiteRoot.name = "authored-campsite-root";
    const tent = authoredMesh("authored-tent", "tent");
    const firePit = authoredMesh("authored-fire-pit", "fire-pit");
    campsiteRoot.add(tent, firePit);

    const stageRoot = new Group();
    stageRoot.name = "authored-stage-root";
    stageRoot.add(authoredMesh("authored-stage"));
    const moonTexture = new Texture();
    const loadedTextures: Texture[] = [];
    const loadTexture = vi.fn(async () => {
      const texture = new Texture();
      vi.spyOn(texture, "dispose");
      loadedTextures.push(texture);
      return texture;
    });
    const world = createForestEnvironmentWorld({
      assets: {
        environmentRoot,
        nearFrameRoot,
        campsiteRoot,
        stageRoot,
        moonTexture,
      },
      renderer: rendererStub(),
      groundY: -1.5,
      stageWidth: 9,
      stageDepth: 3,
      stageZOffset: -2,
      showTents: false,
      showCampfire: true,
      random: () => 0.5,
      loadTexture,
    });

    await world.ready;

    expect(loadTexture).toHaveBeenCalledTimes(5);
    expect(world.root.name).toBe("forest-environment-world");
    expect(world.fog.color.getHexString()).toBe("0a171c");
    expect(world.fog.density).toBeCloseTo(0.024);
    expect(world.root.getObjectByName(environmentRoot.name)).toBe(
      environmentRoot
    );
    expect(world.root.getObjectByName(nearFrameRoot.name)).toBe(nearFrameRoot);
    expect(world.root.getObjectByName(campsiteRoot.name)).toBe(campsiteRoot);
    expect(world.root.getObjectByName(stageRoot.name)).toBe(stageRoot);

    const names = childNames(world.root);
    expect(names.has("forest-sky-gradient")).toBe(true);
    expect(names.has("forest-starfield")).toBe(true);
    expect(names.has("forest-meteor-streaks")).toBe(true);
    expect(names.has("forest-falling-leaves")).toBe(true);
    expect(names.has("forest-canopy-flight")).toBe(true);
    expect(names.has("SharedVolumetricFire")).toBe(true);
    expect(names.has("forest-campfire-smoke")).toBe(true);
    expect(names.has("forest-lighting-rig")).toBe(true);
    for (const field of FOREST_FIREFLY_FIELDS) {
      expect(names.has(`forest-fireflies-${field.id}`)).toBe(true);
    }

    const sky = world.root.getObjectByName("forest-sky-gradient") as Mesh;
    world.setMoonTexture(null);
    expect((sky.material as ShaderMaterial).uniforms.uMoonEnabled?.value).toBe(
      0
    );
    world.setMoonTexture(moonTexture);
    expect((sky.material as ShaderMaterial).uniforms.uMoonTexture?.value).toBe(
      moonTexture
    );

    expect(terrain.castShadow).toBe(false);
    expect(terrain.receiveShadow).toBe(true);
    expect(woodland.castShadow).toBe(false);
    expect(woodland.receiveShadow).toBe(false);
    expect(staticProp.castShadow).toBe(true);
    expect(staticProp.receiveShadow).toBe(true);
    expect(grass.castShadow).toBe(false);
    expect(grass.receiveShadow).toBe(true);
    expect(tent.visible).toBe(false);
    expect(firePit.visible).toBe(true);

    const environmentPlacement = world.root.getObjectByName(
      "forest-authored-environment-placement"
    );
    const nearFramePlacement = world.root.getObjectByName(
      "forest-near-frame-placement"
    );
    const campsitePlacement = world.root.getObjectByName(
      "forest-campsite-placement"
    );
    const stagePlacement = world.root.getObjectByName("forest-stage-placement");
    expect(environmentPlacement?.position.y).toBe(-1.5);
    expect(nearFramePlacement?.position.y).toBe(-1.5);
    expect(campsitePlacement?.position.y).toBe(-1.25);
    expect(stagePlacement?.position.y).toBe(-1.5);
    expect(stagePlacement?.position.z).toBe(-2);
    expect(stagePlacement?.scale.toArray()).toEqual([1.5, 1, 0.5]);

    world.setGroundY(-2.25);
    expect(environmentPlacement?.position.y).toBe(-2.25);
    expect(nearFramePlacement?.position.y).toBe(-2.25);
    expect(campsitePlacement?.position.y).toBe(-2);
    expect(stagePlacement?.position.y).toBe(-2.25);

    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);
    world.update(1 / 60, camera);
    expect(
      world.root.getObjectByName("forest-sky-gradient")?.position.toArray()
    ).toEqual([4, 5, 6]);

    const originalEnvironmentTransform = environmentRoot.position.toArray();
    const originalStageScale = stageRoot.scale.toArray();
    world.dispose();
    world.dispose();
    expect(world.root.children).toHaveLength(0);
    expect(environmentRoot.parent).toBeNull();
    expect(nearFrameRoot.parent).toBeNull();
    expect(campsiteRoot.parent).toBeNull();
    expect(stageRoot.parent).toBeNull();
    expect(environmentRoot.position.toArray()).toEqual(
      originalEnvironmentTransform
    );
    expect(stageRoot.scale.toArray()).toEqual(originalStageScale);
    for (const texture of loadedTextures) {
      expect(texture.dispose).toHaveBeenCalledOnce();
    }
  });

  it("fails closed instead of approximating the document-backed cloud editor", () => {
    const config = createDefaultForestFireflyConfig();
    config.clouds = { enabled: true } as NonNullable<typeof config.clouds>;
    expect(() =>
      createForestEnvironmentWorld({
        assets: { environmentRoot: new Group() },
        renderer: rendererStub(),
        groundY: -1.5,
        config,
        loadTexture: async () => new Texture(),
      })
    ).toThrow(/document-backed Celestial cloud editor/);
  });
});
