/**
 * The build-in borrows the world's own fog while it lifts the haze. If it
 * hands the fog back wrong (a density left thin, a near plane left at zero,
 * the stage's floor left in the scene), the world looks subtly off for the
 * rest of the session and nothing throws. Pinned down here.
 */

import { Fog, FogExp2, Mesh, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";

import {
  BUILD_IN_BASE_VISIBLE_RADIUS,
  createSceneBuildIn,
  exp2DensityForRadius,
  exp2RadiusForDensity,
  revealRadius,
} from "#lib/shared/3d/scene-boot/scene-build-in.js";

const SKY = { top: "#050510", mid: "#0d0d2a", horizon: "#1a1040" };

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("haze geometry", () => {
  it("round-trips a visible radius through FogExp2 density", () => {
    expect(exp2RadiusForDensity(exp2DensityForRadius(40))).toBeCloseTo(40, 6);
  });

  it("opens the haze geometrically, so the far reach does not rush", () => {
    expect(revealRadius(16, 1600, 0)).toBeCloseTo(16);
    expect(revealRadius(16, 1600, 0.5)).toBeCloseTo(160);
    expect(revealRadius(16, 1600, 1)).toBeCloseTo(1600);
  });
});

describe("createSceneBuildIn", () => {
  it("hides the world while it compiles and hands its fog back exactly", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    let release!: () => void;
    const buildIn = createSceneBuildIn({
      scene,
      sky: SKY,
      groundY: 0,
      revealMs: 1000,
      prepare: () => new Promise((resolve) => (release = resolve)),
    });
    buildIn.update(0, camera);
    const stageChildren = scene.children.length;

    const worldFog = new Fog(0x223344, 12, 300);
    const worldPiece = new Mesh();
    scene.add(worldPiece);
    scene.fog = worldFog;
    buildIn.environmentArrived();

    expect(buildIn.phase).toBe("preparing");
    expect(worldPiece.visible).toBe(false);
    expect(worldFog.far).toBeCloseTo(BUILD_IN_BASE_VISIBLE_RADIUS);

    release();
    await flush();
    expect(buildIn.phase).toBe("revealing");
    expect(worldPiece.visible).toBe(true);

    buildIn.update(100, camera);
    buildIn.update(600, camera);
    expect(worldFog.far).toBeGreaterThan(BUILD_IN_BASE_VISIBLE_RADIUS);
    expect(worldFog.far).toBeLessThan(300);

    buildIn.update(1200, camera);
    expect(buildIn.phase).toBe("done");
    expect(scene.fog).toBe(worldFog);
    expect(worldFog.near).toBe(12);
    expect(worldFog.far).toBe(300);
    expect(worldFog.color.getHex()).toBe(0x223344);
    expect(scene.children).toEqual([worldPiece]);
    expect(stageChildren).toBe(2);
  });

  it("restores an exp2 world's density and keeps its fog object", async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const buildIn = createSceneBuildIn({
      scene,
      sky: SKY,
      groundY: 0,
      revealMs: 500,
    });
    buildIn.update(0, camera);
    const worldFog = new FogExp2(0x101010, 0.004);
    scene.fog = worldFog;
    buildIn.environmentArrived();
    expect(worldFog.density).toBeGreaterThan(0.004);

    buildIn.update(10, camera);
    buildIn.update(600, camera);
    expect(buildIn.phase).toBe("done");
    expect(scene.fog).toBe(worldFog);
    expect(worldFog.density).toBe(0.004);
  });

  it("adopts fog a world sets a beat after it reports ready", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const buildIn = createSceneBuildIn({
      scene,
      sky: SKY,
      groundY: 0,
      revealMs: 500,
      prepare: () => new Promise(() => undefined),
    });
    buildIn.update(0, camera);
    buildIn.environmentArrived();

    const lateFog = new Fog(0x445566, 5, 200);
    scene.fog = lateFog;
    buildIn.update(16, camera);
    expect(lateFog.far).toBeCloseTo(BUILD_IN_BASE_VISIBLE_RADIUS);

    buildIn.finish();
    expect(scene.fog).toBe(lateFog);
    expect(lateFog.far).toBe(200);
    expect(lateFog.near).toBe(5);
  });

  it("puts the scene back as it found it when torn down mid-opening", () => {
    const scene = new Scene();
    const previousFog = new Fog(0x000000, 1, 2);
    scene.fog = previousFog;
    const buildIn = createSceneBuildIn({
      scene,
      sky: SKY,
      groundY: 0,
      revealMs: 500,
    });
    buildIn.dispose();
    expect(scene.fog).toBe(previousFog);
    expect(scene.background).toBeNull();
    expect(scene.children).toEqual([]);
  });
});

describe("a world that rewrites its fog after it reports ready", () => {
  it("keeps the haze on and ends at the world's latest values", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const buildIn = createSceneBuildIn({
      scene,
      sky: SKY,
      groundY: 0,
      revealMs: 500,
      prepare: () => new Promise(() => undefined),
    });
    buildIn.update(0, camera);
    const worldFog = new FogExp2(0x101010, 0.004);
    scene.fog = worldFog;
    buildIn.environmentArrived();

    // Autumn's config effect lands a beat later with its own density.
    worldFog.density = 0.0015;
    buildIn.update(16, camera);
    expect(worldFog.density).toBeCloseTo(
      exp2DensityForRadius(BUILD_IN_BASE_VISIBLE_RADIUS)
    );

    buildIn.finish();
    expect(worldFog.density).toBe(0.0015);
  });
});
