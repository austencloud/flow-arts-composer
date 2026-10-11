import { describe, expect, it } from "vitest";
import {
  InstancedMesh,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector4,
} from "three";
import type { WebGLRenderer } from "three";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolveBubbles3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
import type { BubbleTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import {
  BUBBLE_FRAGMENT_COUNT_MAX,
  BUBBLE_FRAGMENT_COUNT_MIN,
  BUBBLE_LIFETIME_SWELL,
  BUBBLE_MAX_DEFORMATION,
  BUBBLE_MAX_INHERITED_SPEED,
  BUBBLE_MAX_OPACITY,
  resolveAliveBubbleFrame3D,
  resolveBubbleDeformationScales3D,
  resolveBubbleDeformationTarget3D,
  resolveBubbleFragmentCount3D,
  resolveBubbleRuptureOrigin3D,
  resolveBubbleRuptureProgress3D,
  resolveBubbleSizeMultiplier3D,
  resolveBubbleVelocityInheritance3D,
  resolvePoppingBubbleFrame3D,
} from "#lib/shared/3d/effects/bubbles/bubble-art-direction-3d.js";
import { createBubbleFilmMaterial3D } from "#lib/shared/3d/effects/bubbles/bubble-film-material-3d.js";
import { BubbleFilmPool3D } from "#lib/shared/3d/effects/bubbles/bubble-film-pool-3d.js";
import {
  SCENE_COLOR_SNAPSHOT_SCALE_3D,
  SCENE_COLOR_SNAPSHOT_TTL_FRAMES_3D,
  clearSceneColorSnapshot3D,
  consumeSceneColorSnapshotDemand3D,
  publishSceneColorSnapshot3D,
  requestSceneColorSnapshot3D,
} from "#lib/shared/3d/effects/post-processing/scene-color-snapshot-3d.js";
import {
  BubbleRenderer3D,
  resolveBubbleCapacityForQuality3D,
  resolveBubbleCapacityTier3D,
} from "#lib/shared/3d/effects/bubbles/bubble-renderer-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";

function makeSource(
  sourceId: number,
  poolSize: number,
  overrides: Partial<BubbleTipSource3D["params"]> = {}
): BubbleTipSource3D {
  return {
    effect: "bubbles",
    sourceId,
    propIndex: 0,
    tipIndex: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    currentStep: 0,
    propColor: "#ffffff",
    qualityTier: QualityTier.HIGH,
    params: resolveBubbles3D(DEFAULT_EFFECTS_CONFIG.bubbles, {
      poolSize,
      ...overrides,
    }),
  };
}

describe("3D bubble art direction", () => {
  it("biases the field toward small bubbles while keeping a bounded hero size", () => {
    const smallest = resolveBubbleSizeMultiplier3D(0, 1);
    const median = resolveBubbleSizeMultiplier3D(0.5, 1);
    const largest = resolveBubbleSizeMultiplier3D(1, 1);

    expect(smallest).toBeCloseTo(0.2448, 4);
    expect(median).toBeLessThan(largest * 0.5);
    expect(largest).toBeLessThan(1.67);
  });

  it("keeps elastic deformation bounded and volume preserving", () => {
    const calm = resolveBubbleDeformationTarget3D(0, 0.4);
    const smallFast = resolveBubbleDeformationTarget3D(0.8, 0.4);
    const heroFast = resolveBubbleDeformationTarget3D(0.8, 1.5);
    const scales = resolveBubbleDeformationScales3D(heroFast);

    expect(calm).toBe(0);
    expect(heroFast).toBeGreaterThan(smallFast);
    expect(heroFast).toBeLessThanOrEqual(BUBBLE_MAX_DEFORMATION);
    expect(scales.major * scales.minor * scales.depth).toBeCloseTo(1, 5);
    expect(scales.major).toBeGreaterThan(1);
    expect(scales.minor).toBeLessThan(1);
  });

  it("ages without runaway growth and preserves the shell during rupture", () => {
    const baseRadius = 0.1;
    const mature = resolveAliveBubbleFrame3D(baseRadius, 1, 1, 0);
    const popping = resolvePoppingBubbleFrame3D(baseRadius, 0.14);

    expect(mature.radius).toBeCloseTo(baseRadius * (1 + BUBBLE_LIFETIME_SWELL));
    expect(mature.alpha).toBeCloseTo(0);
    expect(popping.scaleY).toBeGreaterThan(popping.scaleX * 0.85);
    expect(popping.alpha).toBeLessThan(BUBBLE_MAX_OPACITY * 0.6);
  });

  it("seeds a top-biased local rupture whose hole accelerates outward", () => {
    const first = resolveBubbleRuptureOrigin3D(0.25);
    const repeated = resolveBubbleRuptureOrigin3D(0.25);
    const early = resolveBubbleRuptureProgress3D(0.02);
    const late = resolveBubbleRuptureProgress3D(0.14);

    expect(first).toEqual(repeated);
    expect(first.y).toBeGreaterThan(0.3);
    expect(Math.hypot(first.x, first.y)).toBeLessThan(0.9);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early * 2);
    expect(late).toBeLessThanOrEqual(1);
  });

  it("keeps film fragment counts inside the authored pop range", () => {
    expect(resolveBubbleFragmentCount3D(0)).toBe(BUBBLE_FRAGMENT_COUNT_MIN);
    expect(resolveBubbleFragmentCount3D(0.5)).toBeGreaterThan(
      BUBBLE_FRAGMENT_COUNT_MIN
    );
    expect(resolveBubbleFragmentCount3D(1)).toBe(BUBBLE_FRAGMENT_COUNT_MAX);
  });

  it("inherits a bounded slice of prop velocity", () => {
    expect(resolveBubbleVelocityInheritance3D(0)).toBe(0);
    expect(resolveBubbleVelocityInheritance3D(1)).toBeCloseTo(0.22);
    expect(resolveBubbleVelocityInheritance3D(20) * 20).toBeCloseTo(
      BUBBLE_MAX_INHERITED_SPEED
    );
  });
});

describe("BubbleFilmPool3D", () => {
  it("uses a clear-center Fresnel film shader with restrained normal blending", () => {
    const material = createBubbleFilmMaterial3D();

    expect(material.blending).toBe(NormalBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.forceSinglePass).toBe(true);
    expect(material.vertexShader).toContain("attribute vec3 aFilm");
    expect(material.vertexShader).toContain("attribute vec4 aDynamics");
    expect(material.vertexShader).toContain("attribute vec3 aRupture");
    expect(material.vertexShader).toContain(
      "viewPosition.xy += surfacePosition"
    );
    expect(material.fragmentShader).toContain("uniform sampler2D uSceneColor");
    expect(material.fragmentShader).toContain("uniform sampler2D uSceneDepth");
    expect(material.fragmentShader).toContain("float fresnel");
    expect(material.fragmentShader).toContain("vec3 interference");
    expect(material.fragmentShader).toContain("float thicknessNm");
    expect(material.fragmentShader).toContain("float refractionCoverage");
    expect(material.fragmentShader).toContain("float drainedTop");
    expect(material.fragmentShader).toContain("float ruptureHole");
    expect(material.fragmentShader).toContain("float depthAwareRefraction");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    material.dispose();

    const fragmentMaterial = createBubbleFilmMaterial3D("fragment");
    expect(fragmentMaterial.forceSinglePass).toBe(true);
    fragmentMaterial.dispose();
  });

  it("packs every shell and fragment into one stable instanced mesh", () => {
    const parent = new Object3D();
    const pool = new BubbleFilmPool3D(2);
    pool.initialize(parent);
    pool.beginFrame(2.5);
    const instance = {
      x: 1,
      y: 2,
      z: 3,
      scaleX: 0.2,
      scaleY: 0.18,
      scaleZ: 0.21,
      right: 0.3,
      green: 0.5,
      left: 0.8,
      alpha: 0.7,
      filmSeed: 0.4,
      filmStrength: 0.9,
      filmLife: 0.35,
      deformationX: 0.7,
      deformationY: 0.2,
      deformationZ: 0.68,
      deformation: 0.12,
      ruptureOriginX: 0.14,
      ruptureOriginY: 0.58,
      ruptureProgress: 0.3,
    };
    expect(pool.write(instance)).toBe(true);
    expect(pool.write(instance)).toBe(true);
    expect(pool.write(instance)).toBe(false);
    pool.commit();

    expect(parent.children).toEqual([pool.mesh]);
    expect(pool.mesh.count).toBe(2);
    expect(
      Array.from(pool.mesh.geometry.getAttribute("aScale").array).slice(0, 3)
    ).toEqual([
      expect.closeTo(0.2),
      expect.closeTo(0.18),
      expect.closeTo(0.21),
    ]);
    expect(pool.mesh.geometry.getAttribute("aFilm").getX(0)).toBeCloseTo(0.4);
    expect(pool.mesh.geometry.getAttribute("aFilm").getZ(0)).toBeCloseTo(0.35);
    expect(pool.mesh.geometry.getAttribute("aDynamics").getW(0)).toBeCloseTo(
      0.12
    );
    expect(pool.mesh.geometry.getAttribute("aRupture").getY(0)).toBeCloseTo(
      0.58
    );
    expect((pool.mesh.material as ShaderMaterial).uniforms.uTime?.value).toBe(
      2.5
    );

    pool.clear();
    expect(pool.mesh.count).toBe(0);
    pool.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("sorts by view depth when radial camera distance disagrees", () => {
    const pool = new BubbleFilmPool3D(3);
    const instance = {
      x: 100,
      y: 0,
      z: -2,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      right: 1,
      green: 1,
      left: 1,
      alpha: 1,
      filmSeed: 0,
      filmStrength: 1,
      filmLife: 0.5,
      deformationX: 1,
      deformationY: 0,
      deformationZ: 0,
      deformation: 0,
      ruptureOriginX: 0,
      ruptureOriginY: 0.5,
      ruptureProgress: 0,
    };
    pool.beginFrame(0);
    pool.write(instance);
    pool.write({ ...instance, x: 0, z: -10 });
    pool.commit();

    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld(true);
    pool.mesh.updateMatrixWorld(true);
    pool.mesh.onBeforeRender(
      null as never,
      null as never,
      camera,
      null as never,
      null as never,
      null as never
    );

    expect(pool.mesh.geometry.getAttribute("aCenter").getZ(0)).toBe(-10);
    expect(pool.mesh.geometry.getAttribute("aCenter").getZ(1)).toBe(-2);
    pool.dispose();
  });

  it("sorts with the mesh's transformed parent in the model-view path", () => {
    const parent = new Object3D();
    parent.rotation.y = Math.PI / 2;
    parent.scale.set(2, 3, 0.5);
    const pool = new BubbleFilmPool3D(2);
    pool.initialize(parent);
    const instance = {
      x: 1,
      y: 0,
      z: -100,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      right: 1,
      green: 1,
      left: 1,
      alpha: 1,
      filmSeed: 0,
      filmStrength: 1,
      filmLife: 0.5,
      deformationX: 1,
      deformationY: 0,
      deformationZ: 0,
      deformation: 0,
      ruptureOriginX: 0,
      ruptureOriginY: 0.5,
      ruptureProgress: 0,
    };
    pool.beginFrame(0);
    pool.write(instance);
    pool.write({ ...instance, x: 5, z: 0 });
    pool.commit();

    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    pool.mesh.onBeforeRender(
      null as never,
      null as never,
      camera,
      null as never,
      null as never,
      null as never
    );

    expect(pool.mesh.geometry.getAttribute("aCenter").getX(0)).toBe(5);
    expect(pool.mesh.geometry.getAttribute("aCenter").getX(1)).toBe(1);
    pool.dispose();
  });

  it("uses one analytic two-triangle surface for every capacity tier", () => {
    const lowShells = new BubbleFilmPool3D(512, "shell");
    const highShells = new BubbleFilmPool3D(2048, "shell");
    const fragments = new BubbleFilmPool3D(2048, "fragment");

    expect(lowShells.mesh.geometry.getAttribute("position").count).toBe(4);
    expect(highShells.mesh.geometry.getAttribute("position").count).toBe(4);
    expect(lowShells.mesh.geometry.index?.count).toBe(6);
    expect(highShells.mesh.geometry.index?.count).toBe(6);
    expect(fragments.mesh.geometry.index?.count).toBe(6);

    lowShells.dispose();
    highShells.dispose();
    fragments.dispose();
  });

  it("binds the compositor snapshot without copying the live framebuffer", () => {
    expect(SCENE_COLOR_SNAPSHOT_SCALE_3D).toBe(1 / 16);
    const pool = new BubbleFilmPool3D(1, "shell");
    const instance = {
      x: 0,
      y: 0,
      z: -2,
      scaleX: 0.1,
      scaleY: 0.1,
      scaleZ: 0.1,
      right: 1,
      green: 1,
      left: 1,
      alpha: 0.8,
      filmSeed: 0.2,
      filmStrength: 0.7,
      filmLife: 0.4,
      deformationX: 0.5,
      deformationY: 0.5,
      deformationZ: 0,
      deformation: 0.08,
      ruptureOriginX: 0.1,
      ruptureOriginY: 0.55,
      ruptureProgress: 0,
    };
    pool.beginFrame(0);
    pool.write(instance);
    pool.commit();

    let copyCount = 0;
    const renderer = {
      outputColorSpace: SRGBColorSpace,
      getCurrentViewport(target: Vector4) {
        return target.set(4, 8, 320, 180);
      },
      copyFramebufferToTexture() {
        copyCount++;
      },
    } as unknown as WebGLRenderer;
    const snapshotTexture = new Texture();
    const depthTexture = new Texture();
    publishSceneColorSnapshot3D(renderer, {
      texture: snapshotTexture,
      depthTexture,
      colorSpace: SRGBColorSpace,
    });
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld(true);
    pool.mesh.updateMatrixWorld(true);
    pool.mesh.onBeforeRender(
      renderer,
      null as never,
      camera,
      null as never,
      null as never,
      null as never
    );

    const material = pool.mesh.material as ShaderMaterial;
    expect(copyCount).toBe(0);
    expect(material.uniforms.uSceneColor?.value).toBe(snapshotTexture);
    expect(material.uniforms.uSceneDepth?.value).toBe(depthTexture);
    expect(material.uniforms.uSceneColorReady?.value).toBe(1);
    expect(material.uniforms.uSceneDepthReady?.value).toBe(1);
    expect(material.uniforms.uSceneColorIsSrgb?.value).toBe(1);
    expect(material.uniforms.uViewport?.value).toEqual(
      expect.objectContaining({ x: 4, y: 8, z: 320, w: 180 })
    );
    clearSceneColorSnapshot3D(renderer);
    snapshotTexture.dispose();
    depthTexture.dispose();
    pool.dispose();
  });

  it("keeps compositor capture alive only while bubble film requests it", () => {
    const renderer = {} as WebGLRenderer;

    expect(consumeSceneColorSnapshotDemand3D(renderer)).toBe(false);
    requestSceneColorSnapshot3D(renderer);
    for (let frame = 0; frame < SCENE_COLOR_SNAPSHOT_TTL_FRAMES_3D; frame++) {
      expect(consumeSceneColorSnapshotDemand3D(renderer)).toBe(true);
    }
    expect(consumeSceneColorSnapshotDemand3D(renderer)).toBe(false);
    clearSceneColorSnapshot3D(renderer);
  });
});

describe("BubbleRenderer3D", () => {
  it("resolves and reallocates the authored 512/1024/2048 capacity tiers", () => {
    expect(resolveBubbleCapacityTier3D(1)).toBe(512);
    expect(resolveBubbleCapacityTier3D(513)).toBe(1024);
    expect(resolveBubbleCapacityTier3D(2048)).toBe(2048);
    expect(resolveBubbleCapacityForQuality3D(2048, QualityTier.HIGH)).toBe(
      2048
    );
    expect(resolveBubbleCapacityForQuality3D(2048, QualityTier.MEDIUM)).toBe(
      1024
    );
    expect(resolveBubbleCapacityForQuality3D(2048, QualityTier.LOW)).toBe(512);

    const parent = new Object3D();
    const renderer = new BubbleRenderer3D();
    renderer.initialize(parent);
    expect(
      parent.children.map(
        (child) => (child as InstancedMesh).instanceMatrix.count
      )
    ).toEqual([512, 512]);

    renderer.update([makeSource(1, 1024)], 0);
    expect(
      parent.children.map(
        (child) => (child as InstancedMesh).instanceMatrix.count
      )
    ).toEqual([1024, 1024]);

    renderer.update([makeSource(1, 512)], 0);
    expect(
      parent.children.map(
        (child) => (child as InstancedMesh).instanceMatrix.count
      )
    ).toEqual([512, 512]);
    renderer.dispose();
  });

  it("bounds synchronized emission and lets live shells drain without sources", () => {
    const parent = new Object3D();
    const renderer = new BubbleRenderer3D();
    renderer.initialize(parent);
    const source = makeSource(1, 512, {
      ambientEmission: 1,
      motionEmission: 0,
      ambientSpawnRate: 100_000,
      lifetime: 0.2,
    });

    renderer.update([source], 1 / 60);
    const shellMesh = parent.children.find(
      (child) => child.renderOrder === 104
    ) as InstancedMesh;
    expect(shellMesh.count).toBe(512);

    renderer.update([], 1 / 60);
    expect(shellMesh.count).toBeGreaterThan(0);
    for (let frame = 0; frame < 40; frame++) renderer.update([], 1 / 60);
    expect(shellMesh.count).toBe(0);
    renderer.dispose();
  });

  it("releases per-source emission accumulators when source IDs churn", () => {
    const renderer = new BubbleRenderer3D();
    const source = makeSource(1, 512, {
      ambientEmission: 1,
      motionEmission: 0,
      ambientSpawnRate: 1,
    });
    for (let sourceId = 1; sourceId <= 200; sourceId++) {
      source.sourceId = sourceId;
      renderer.update([source], 1 / 120);
    }
    const accumulators = (
      renderer as unknown as { accumulators: Map<number, number> }
    ).accumulators;
    expect(accumulators.size).toBe(1);
    expect(accumulators.has(200)).toBe(true);
    renderer.dispose();
  });
});
