import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
  type WebGLRenderer,
} from "three";

import { createDefaultBlossomConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import { CANONICAL_PERFORMER_ANCHOR_Y } from "#lib/shared/3d/environments/domain/stage-coordinate-frame.js";
import { createBlossomRuntimeConfig } from "#lib/shared/3d/environments/scenes/cherry-blossom/blossom-runtime.js";
import { createBlossomAtmosphere } from "#lib/shared/3d/environments/worlds/blossom/blossom-atmosphere.js";
import {
  BLOSSOM_AUTHORED_RESOURCE_URLS,
  createBlossomEnvironmentWorld,
  type BlossomEnvironmentAssets,
} from "#lib/shared/3d/environments/worlds/blossom/blossom-environment-world.js";

function mesh(name: string, materialName = "", role = ""): Mesh {
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  material.name = materialName;
  const value = new Mesh(new BoxGeometry(1, 1, 1), material);
  value.name = name;
  value.userData.blossomRole = role;
  return value;
}

function assets(): BlossomEnvironmentAssets {
  const environmentRoot = new Group();
  environmentRoot.add(
    mesh("Amphitheatre_Terrain", "Amphitheatre moss", "terrain"),
    mesh("Stage_Base"),
    mesh("River_Water"),
    mesh("Ancient_Cherry_Wood", "", "bark"),
    mesh("Ancient_Cherry_Blossoms", "", "petals"),
    mesh("Distant_Grove", "", "grove-petals")
  );
  return {
    environmentRoot,
    moonTexture: new Texture(),
  };
}

const renderer = {} as WebGLRenderer;

describe("Blossom renderer-neutral world", () => {
  it("borrows packed court maps through glTF wrapper groups and disposes them once", () => {
    const bundle = assets();
    const proxy = new Group();
    proxy.name = "Stage_Planks";
    const slab = mesh("slate primitive", "Blossom court slate");
    const source = slab.material as MeshStandardMaterial;
    source.map = new Texture();
    const dispose = vi.spyOn(source.map, "dispose");
    proxy.add(slab);
    bundle.environmentRoot.add(proxy);
    const world = createBlossomEnvironmentWorld(
      { renderer, groundY: 0, qualityTier: "medium" },
      bundle
    );
    const court = world.root.getObjectByName("blossom-stage-slate") as Mesh;
    const material = court.material as MeshStandardMaterial;
    expect(material).not.toBe(source);
    expect(material.map).toBe(source.map);
    expect(material.vertexColors).toBe(false);
    const inlay = world.root.getObjectByName(
      "blossom-stage-bronze-inlay"
    ) as Mesh;
    const positions = inlay.geometry.getAttribute("position");
    let horizontalArea = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(positions, i);
      const b = new Vector3().fromBufferAttribute(positions, i + 1);
      const c = new Vector3().fromBufferAttribute(positions, i + 2);
      horizontalArea += Math.abs(b.sub(a).cross(c.sub(a)).z) / 4;
    }
    expect(horizontalArea).toBeLessThan(2);
    expect(horizontalArea).toBeGreaterThan(0.3);
    expect(proxy.visible).toBe(false);
    world.dispose();
    world.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("loads the packed venue and moon without obsolete habitat textures", () => {
    expect(BLOSSOM_AUTHORED_RESOURCE_URLS).toEqual([
      "/models/blossom/blossom_environment.glb",
      "/textures/moon.png",
    ]);
  });

  it("builds the complete authored world, exact stage, river, lighting, and globals", () => {
    const bundle = assets();
    const world = createBlossomEnvironmentWorld(
      {
        renderer,
        groundY: -1.5,
        stageWidth: 6,
        stageDepth: 6,
        stageZOffset: 1.25,
        showDirectionCues: true,
        qualityTier: "high",
      },
      bundle
    );
    const names: string[] = [];
    world.root.traverse((object) => names.push(object.name));

    expect(names).toContain("BlossomEnvironment");
    expect(names).toContain("blossom-sky-gradient");
    expect(names).toContain("blossom-starfield");
    expect(names).toContain("blossom-performance-stage");
    expect(names).toContain("blossom-stage-downstage-marker");
    expect(names).toContain("blossom-stage-bronze-inlay");
    expect(names).toContain("blossom-lighting");
    expect(names).toContain("blossom-moon-key");
    expect(names).toContain("blossom-lantern-light-2");
    expect(world.reflector?.name).toBe("blossom-reflective-river");
    const config = createDefaultBlossomConfig();
    expect(world.fog.color.getHexString()).toBe(config.fog.color.slice(1));
    expect(world.fog.density).toBe(config.fog.density);
    expect(world.background.getHexString()).toBe(config.sky.topColor.slice(1));
    const stageBounds = new Box3().setFromObject(
      world.root.getObjectByName("blossom-performance-stage")!
    );
    expect(stageBounds.max.x - stageBounds.min.x).toBeGreaterThanOrEqual(12);
    expect(stageBounds.max.z - stageBounds.min.z).toBeGreaterThanOrEqual(8);
    const deckBounds = new Box3().setFromObject(
      world.root.getObjectByName("blossom-stage-slate")!
    );
    expect(deckBounds.max.y).toBeCloseTo(
      -1.5 + CANONICAL_PERFORMER_ANCHOR_Y,
      5
    );
    expect(deckBounds.min.x).toBeCloseTo(-6, 5);
    expect(deckBounds.max.x).toBeCloseTo(6, 5);
    expect(
      (bundle.environmentRoot.getObjectByName("Ancient_Cherry_Wood") as Mesh)
        .castShadow
    ).toBe(true);
    expect(
      (
        bundle.environmentRoot.getObjectByName(
          "Ancient_Cherry_Blossoms"
        ) as Mesh
      ).castShadow
    ).toBe(true);
    expect(
      (bundle.environmentRoot.getObjectByName("Amphitheatre_Terrain") as Mesh)
        .receiveShadow
    ).toBe(true);
    expect(world.maxPixelRatio).toBe(2);

    const authored = world.root.getObjectByName("BlossomEnvironment")!;
    expect(authored.position.toArray()).toEqual([0, -1.5, 1.25]);
    expect(authored.rotation.y).toBeCloseTo(Math.PI, 6);
    expect(bundle.environmentRoot.getObjectByName("Stage_Base")!.visible).toBe(
      false
    );
    expect(bundle.environmentRoot.getObjectByName("River_Water")!.visible).toBe(
      false
    );
    expect(
      (bundle.environmentRoot.getObjectByName("Distant_Grove") as Mesh)
        .castShadow
    ).toBe(false);
    world.dispose();
  });

  it("tracks the camera and performer ground while animating the water", () => {
    const bundle = assets();
    const world = createBlossomEnvironmentWorld(
      { renderer, groundY: -1.5, qualityTier: "high" },
      bundle
    );
    const camera = new PerspectiveCamera();
    camera.position.set(3, 7, 11);
    const sky = world.root.getObjectByName("blossom-sky-gradient")!;
    const riverMaterial = world.reflector!.material as unknown as {
      uniforms: { uTime: { value: number } };
    };
    const before = riverMaterial.uniforms.uTime.value;

    world.update(0.25, camera);
    expect(sky.position.toArray()).toEqual([3, 7, 11]);
    expect(riverMaterial.uniforms.uTime.value).toBeCloseTo(
      before + 0.25 * 0.28,
      6
    );
    world.setGroundY(-2);
    expect(world.root.getObjectByName("BlossomEnvironment")!.position.y).toBe(
      -2
    );
    expect(
      world.root.getObjectByName("blossom-performance-stage")!.position.y
    ).toBe(-2);
    expect(world.reflector!.position.y).toBeCloseTo(-2.148, 6);
    world.setActive(false);
    expect(world.root.visible).toBe(false);
    expect(world.reflector!.visible).toBe(false);
    world.dispose();
  });

  it("uses the baked pond and disables tree shadows at low quality", () => {
    const bundle = assets();
    const world = createBlossomEnvironmentWorld(
      { renderer, groundY: -1.5, qualityTier: "low" },
      bundle
    );
    expect(bundle.environmentRoot.getObjectByName("River_Water")!.visible).toBe(
      true
    );
    expect(
      (bundle.environmentRoot.getObjectByName("Ancient_Cherry_Wood") as Mesh)
        .castShadow
    ).toBe(false);
    world.dispose();
  });

  it("keeps the dormant production atmosphere exact when its phase is enabled", () => {
    const config = createDefaultBlossomConfig();
    const runtime = createBlossomRuntimeConfig({
      tier: "high",
      prefersReducedMotion: false,
      stageWidth: 6,
      stageDepth: 6,
      stageZOffset: 0,
      groundY: -1.5,
      particleCounts: {
        petals: config.petals.count,
        distantPetals: config.distantPetals!.count,
        fireflies: config.fireflies!.count,
      },
      lightIntensities: { hemisphere: 0.68, key: 2.25 },
    });
    const atmosphere = createBlossomAtmosphere({
      config,
      runtime,
      moonTexture: new Texture(),
      decorativeAtmosphereEnabled: true,
      motionScale: 1,
      random: () => 0.5,
    });
    expect(atmosphere.object.getObjectByName("blossom-petals")).toBeDefined();
    expect(
      atmosphere.object.getObjectByName("blossom-distant-petals")
    ).toBeDefined();
    expect(
      atmosphere.object.getObjectByName("blossom-fireflies")
    ).toBeDefined();
    atmosphere.dispose();
  });

  it("disposes owned textures once even when disposal is repeated", () => {
    const bundle = assets();
    const textureDisposals = [bundle.moonTexture].map((texture) =>
      vi.spyOn(texture, "dispose")
    );
    const world = createBlossomEnvironmentWorld(
      { renderer, groundY: -1.5, qualityTier: "medium" },
      bundle
    );
    world.dispose();
    world.dispose();
    for (const dispose of textureDisposals) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });
});
