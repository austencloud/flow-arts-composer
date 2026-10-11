import { describe, expect, it } from "vitest";
import { InstancedMesh, PointLight, Scene } from "three";
import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";
import { BloomRenderer3D } from "#lib/shared/3d/effects/bloom/bloom-renderer-3d.js";
import {
  resolveBloomFalloffCode,
  resolveBloomHistoryCapacity,
  resolveBloomOpticalFrame3D,
  resolveBloomSourceNormalization,
  shouldResetBloomHistory3D,
} from "#lib/shared/3d/effects/bloom/bloom-optics-3d.js";
import type { BloomTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolveBloom3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

function makeSource(
  overrides: Partial<BloomTipSource3D> = {}
): BloomTipSource3D {
  return {
    sourceId: 1,
    propIndex: 0,
    tipIndex: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 3, y: 0, z: 0 },
    speed: 3,
    currentStep: 0,
    propColor: "#3575e2",
    effect: "bloom",
    params: resolveBloom3D({
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      intensity: 0.8,
      radius: 56,
      pulse: 0,
      streak: 0.7,
      spikes: 0.6,
      afterglow: 0.8,
    }),
    qualityTier: QualityTier.HIGH,
    ...overrides,
  };
}

describe("Bloom Kinetic Optics response", () => {
  it("maps every authored optical control to a material or history response", () => {
    const low = resolveBloom3D({
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      intensity: 0.2,
      radius: 8,
      afterglow: 0,
    });
    const high = resolveBloom3D({
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      intensity: 1,
      radius: 90,
      afterglow: 1,
    });
    const frame = resolveBloomOpticalFrame3D(
      { ...high, pulse: 0, streak: 0.8, spikes: 0.7 },
      3,
      0,
      1
    );

    expect(high.haloRadiusWorld).toBeGreaterThan(low.haloRadiusWorld);
    expect(high.emissiveStrength).toBeGreaterThan(low.emissiveStrength);
    expect(high.historyLifetimeSeconds).toBeGreaterThan(
      low.historyLifetimeSeconds
    );
    expect(high.historySampleDistanceWorld).toBeLessThan(
      low.historySampleDistanceWorld
    );
    expect(frame.energy).toBeGreaterThan(0.9);
    expect(frame.stretch).toBeGreaterThan(1);
    expect(frame.streak).toBeGreaterThan(0);
    expect(frame.spikes).toBeGreaterThan(0);
    expect(resolveBloomFalloffCode("smooth")).toBe(0);
    expect(resolveBloomFalloffCode("sharp")).toBe(1);
    expect(resolveBloomFalloffCode("ring")).toBe(0);
  });

  it("pulses exposure without making the intensity control linear", () => {
    const params = resolveBloom3D({
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      intensity: 0.5,
      pulse: 1,
      pulseRate: 1,
    });
    const trough = resolveBloomOpticalFrame3D(params, 0, 0.75, 1).energy;
    const crest = resolveBloomOpticalFrame3D(params, 0, 0.25, 1).energy;
    expect(trough).toBe(0);
    expect(crest).toBeGreaterThan(0.1);
    expect(crest).toBeLessThan(0.25);
  });

  it("normalizes additive energy by prop count and bounds quality history", () => {
    expect(resolveBloomSourceNormalization(1)).toBe(1);
    expect(resolveBloomSourceNormalization(4)).toBe(0.5);
    expect(resolveBloomHistoryCapacity(QualityTier.HIGH)).toBe(72);
    expect(resolveBloomHistoryCapacity(QualityTier.MEDIUM)).toBeLessThan(72);
    expect(resolveBloomHistoryCapacity(QualityTier.LOW)).toBeLessThan(
      resolveBloomHistoryCapacity(QualityTier.MEDIUM)
    );
  });

  it("resets afterglow on backward scrubs and teleports", () => {
    expect(shouldResetBloomHistory3D(4, 3, 0.1)).toBe(true);
    expect(shouldResetBloomHistory3D(4, 4.1, 2)).toBe(true);
    expect(shouldResetBloomHistory3D(4, 4.1, 0.1)).toBe(false);
  });

  it("keeps the three shipped presets optically distinct", () => {
    expect(BLOOM_PRESETS.map((preset) => preset.name)).toEqual([
      "Supernova",
      "Comet",
      "Halo",
    ]);
    const signatures = new Map(
      BLOOM_PRESETS.map((preset) => {
        const params = resolveBloom3D({
          ...DEFAULT_EFFECTS_CONFIG.bloom,
          ...preset.patch,
        });
        return [
          preset.name,
          {
            params,
            frame: resolveBloomOpticalFrame3D(params, 3, 0, 1),
          },
        ] as const;
      })
    );

    const supernova = signatures.get("Supernova")!;
    const comet = signatures.get("Comet")!;
    const halo = signatures.get("Halo")!;
    expect(supernova.frame.coreStrength).toBe(1);
    expect(supernova.frame.spikes).toBeGreaterThan(0);
    expect(comet.frame.streak).toBe(1);
    expect(comet.params.historyLifetimeSeconds).toBeGreaterThan(
      supernova.params.historyLifetimeSeconds
    );
    expect(halo.frame.radiusWorld).toBeGreaterThan(supernova.frame.radiusWorld);
    // Halo's core was measured up from 0.04 to 0.20 (7e4671ee5c): at 0.04 it
    // peaked at 66 of 255 and read as a smudge on a dark stage. That put it
    // just above Comet, so coreStrength no longer separates the two — radius
    // and the streak/spike shape below do. What still has to hold is that the
    // core stays a diffuse orb: past ~0.30 it collapses to a pinpoint and the
    // preset stops being a halo.
    expect(halo.frame.coreStrength).toBeLessThan(0.3);
    expect(halo.frame.coreStrength).toBeLessThan(supernova.frame.coreStrength);
    expect(halo.frame.streak).toBe(0);
    expect(halo.frame.spikes).toBe(0);
  });
});

describe("BloomRenderer3D", () => {
  it("renders live optics and exposure history through one instanced surface", () => {
    const scene = new Scene();
    const renderer = new BloomRenderer3D();
    const source = makeSource();
    renderer.initialize(scene);
    renderer.update([source], 1 / 60);
    source.position.x = 0.2;
    renderer.update([source], 1 / 60);

    const opticalMeshes = scene.children.filter(
      (child): child is InstancedMesh => child instanceof InstancedMesh
    );
    expect(opticalMeshes).toHaveLength(1);
    expect(opticalMeshes[0]!.count).toBeGreaterThan(1);
    const geometry = opticalMeshes[0]!.geometry;
    expect(
      Object.keys(geometry.attributes).filter((name) => name.startsWith("a"))
    ).toEqual([
      "aCenter",
      "aVelocitySeed",
      "aColor",
      "aOptics",
      "aLens",
      "aCoreStrength",
    ]);
    expect(geometry.getAttribute("aLens").itemSize).toBe(3);
    expect(geometry.getAttribute("aOptics").getZ(0)).toBeGreaterThan(1);
    expect(geometry.getAttribute("aOptics").getW(0)).toBeGreaterThan(0);
    expect(geometry.getAttribute("aLens").getX(0)).toBeGreaterThan(0);
    expect(geometry.getAttribute("aLens").getZ(1)).toBe(1);
    expect(geometry.getAttribute("aCoreStrength").getX(0)).toBeGreaterThan(0);
    expect(geometry.getAttribute("aCoreStrength").getX(1)).toBe(0);

    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("keeps captured history color stable when the live prop color changes", () => {
    const scene = new Scene();
    const renderer = new BloomRenderer3D();
    const source = makeSource({ propColor: "#0000ff" });
    source.params = { ...source.params, colorMode: "prop-matched" };
    renderer.initialize(scene);
    renderer.update([source], 1 / 60);
    source.position.x = 0.2;
    source.propColor = "#ff0000";
    renderer.update([source], 1 / 60);

    const color = renderer.object3D.geometry.getAttribute("aColor");
    expect(color.getX(0)).toBeGreaterThan(color.getZ(0));
    expect(color.getZ(1)).toBeGreaterThan(color.getX(1));
    renderer.dispose();
  });

  it("wires every Bloom color mode into the 3D material", () => {
    const scene = new Scene();
    const renderer = new BloomRenderer3D();
    const baseParams = resolveBloom3D({
      ...DEFAULT_EFFECTS_CONFIG.bloom,
      pulse: 0,
      afterglow: 0,
    });
    const source = makeSource({ params: baseParams, propColor: "#2979ff" });
    renderer.initialize(scene);

    const signature = () => {
      const color = renderer.object3D.geometry.getAttribute("aColor");
      return [color.getX(0), color.getY(0), color.getZ(0)];
    };

    source.params = { ...baseParams, colorMode: "solid", color: "#ff1744" };
    renderer.update([source], 1 / 60);
    const solid = signature();

    source.params = { ...baseParams, colorMode: "prop-matched" };
    renderer.update([source], 1 / 60);
    const prop = signature();

    source.params = {
      ...baseParams,
      colorMode: "palette",
      palette: ["#00e676"],
    };
    renderer.update([source], 1 / 60);
    const palette = signature();

    source.params = { ...baseParams, colorMode: "rainbow" };
    renderer.update([source], 1 / 60);
    const rainbow = signature();

    expect(new Set([solid, prop, palette, rainbow].map(String)).size).toBe(4);
    expect(solid[0]).toBeGreaterThan(solid[2]!);
    expect(prop[2]).toBeGreaterThan(prop[0]!);
    expect(palette[1]).toBeGreaterThan(palette[0]!);
    renderer.dispose();
  });

  it("anchors Bloom scene lights to real moving tips", () => {
    const scene = new Scene();
    const renderer = new BloomRenderer3D();
    const sources = [
      makeSource({ sourceId: 1, position: { x: -2, y: 0, z: 0 } }),
      makeSource({ sourceId: 2, tipIndex: 1, position: { x: 2, y: 0, z: 0 } }),
    ];
    renderer.initialize(scene);
    renderer.update(sources, 1 / 60);

    const positions = scene.children
      .filter(
        (child): child is PointLight =>
          child instanceof PointLight && child.intensity > 0
      )
      .map((light) => light.position.x)
      .sort((a, b) => a - b);
    expect(positions).toEqual([-2, 2]);

    sources[0]!.position.x = -3;
    sources[1]!.position.x = 3;
    renderer.update(sources, 1 / 60);
    expect(
      scene.children
        .filter(
          (child): child is PointLight =>
            child instanceof PointLight && child.intensity > 0
        )
        .map((light) => light.position.x)
        .sort((a, b) => a - b)
    ).toEqual([-3, 3]);
    renderer.dispose();
  });

  it("spreads a limited light budget across performers without averaging", () => {
    const scene = new Scene();
    const renderer = new BloomRenderer3D();
    const sources = Array.from({ length: 16 }, (_, index) => {
      const physicalProp = Math.floor(index / 2);
      return makeSource({
        sourceId: index + 1,
        propIndex: (physicalProp % 2) as 0 | 1,
        tipIndex: (index % 2) as 0 | 1,
        position: { x: physicalProp * 10 + (index % 2) * 2, y: 0, z: 0 },
      });
    });
    renderer.initialize(scene);
    renderer.update(sources, 1 / 60);

    const lightPositions = scene.children
      .filter(
        (child): child is PointLight =>
          child instanceof PointLight && child.visible
      )
      .map((light) => light.position.x)
      .sort((a, b) => a - b);
    const sourcePositions = new Set(sources.map((source) => source.position.x));
    expect(lightPositions).toHaveLength(4);
    expect(
      lightPositions.every((position) => sourcePositions.has(position))
    ).toBe(true);
    expect(lightPositions[0]).toBeLessThan(10);
    expect(lightPositions.at(-1)).toBeGreaterThan(60);
    renderer.dispose();
  });

  it("respects the quality-tier light budget and disables lights on low quality", () => {
    const highScene = new Scene();
    const highRenderer = new BloomRenderer3D();
    highRenderer.initialize(highScene);
    highRenderer.update(
      [
        makeSource(),
        makeSource({ sourceId: 2, tipIndex: 1 }),
        makeSource({ sourceId: 3, propIndex: 1 }),
      ],
      1 / 60
    );
    const highLights = highScene.children.filter(
      (child): child is PointLight => child instanceof PointLight
    );
    expect(highLights).toHaveLength(4);
    expect(highLights.filter((light) => light.intensity > 0)).toHaveLength(3);
    highRenderer.dispose();

    const lowScene = new Scene();
    const lowRenderer = new BloomRenderer3D();
    lowRenderer.initialize(lowScene);
    lowRenderer.update([makeSource({ qualityTier: QualityTier.LOW })], 1 / 60);
    expect(lowScene.children.some((child) => child instanceof PointLight)).toBe(
      false
    );
    lowRenderer.dispose();
  });
});
