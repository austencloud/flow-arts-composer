import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MIN_LIGHTNING_INTERVAL_SECONDS,
  sampleVolcanicLightning,
  volcanicLightningCell,
} from "#lib/shared/3d/environments/scenes/ember/volcanic-lightning.js";
import { getEmberAtmosphereLook } from "#lib/shared/3d/environments/domain/models/scene-configs/ember-atmosphere-looks.js";
import { EMBER_ATMOSPHERE_LOOK_IDS } from "#lib/shared/3d/environments/domain/models/scene-configs/ember-atmosphere-looks.js";

const FRAME = 1 / 60;

function strikeTimes(intervalSeconds: number, windowSeconds: number): number[] {
  const times: number[] = [];
  for (let step = 0; step * FRAME < windowSeconds; step += 1) {
    const seconds = step * FRAME;
    if (sampleVolcanicLightning(seconds, intervalSeconds).energy > 0.8) {
      const previous = times[times.length - 1];
      if (previous === undefined || seconds - previous > FRAME * 1.5) {
        times.push(seconds);
      } else {
        times[times.length - 1] = seconds;
      }
    }
  }
  return times;
}

describe("volcanic lightning timing", () => {
  it("fires on the authored interval measured in real seconds", () => {
    // The dome's drift clock is scaled by animationSpeed. When lightning shared
    // it, a 7.5 s interval fired roughly every 341 s of wall time.
    const strikes = strikeTimes(7.5, 24);
    expect(strikes.length).toBeGreaterThanOrEqual(3);
    expect(strikes[0]).toBeLessThan(0.1);
    expect(strikes[1]).toBeGreaterThan(7.4);
    expect(strikes[1]).toBeLessThan(7.6);
    expect(strikes[2]).toBeGreaterThan(14.9);
    expect(strikes[2]).toBeLessThan(15.1);
  });

  it("keeps a strike brief no matter how far apart strikes are", () => {
    for (const interval of [1.5, 4.6, 7.5, 30]) {
      let brightSeconds = 0;
      for (let step = 0; step * FRAME < interval; step += 1) {
        if (sampleVolcanicLightning(step * FRAME, interval).energy > 0.5) {
          brightSeconds += FRAME;
        }
      }
      // The old fraction-of-interval envelope smeared the flash across three
      // percent of the cycle, so a long interval produced a long flash.
      expect(brightSeconds).toBeLessThan(0.12);
    }
  });

  it("decays to darkness well before the next cycle", () => {
    expect(sampleVolcanicLightning(1.0, 7.5).energy).toBe(0);
    expect(sampleVolcanicLightning(4.0, 7.5).energy).toBe(0);
  });

  it("carries return strokes and an afterglow inside one strike", () => {
    const leader = sampleVolcanicLightning(0, 7.5).energy;
    const betweenStrokes = sampleVolcanicLightning(0.1, 7.5).energy;
    const returnStroke = sampleVolcanicLightning(0.14, 7.5).energy;
    expect(leader).toBeCloseTo(1, 5);
    expect(returnStroke).toBeGreaterThan(betweenStrokes);
    expect(returnStroke).toBeLessThan(leader);
  });

  it("bounds energy and advances one cycle per interval", () => {
    for (let step = 0; step < 4000; step += 1) {
      const sample = sampleVolcanicLightning(step * FRAME, 4.6);
      expect(sample.energy).toBeGreaterThanOrEqual(0);
      expect(sample.energy).toBeLessThanOrEqual(1);
    }
    expect(sampleVolcanicLightning(0, 4.6).cycle).toBe(0);
    expect(sampleVolcanicLightning(4.5, 4.6).cycle).toBe(0);
    expect(sampleVolcanicLightning(4.7, 4.6).cycle).toBe(1);
    expect(sampleVolcanicLightning(9.3, 4.6).cycle).toBe(2);
  });

  it("refuses an interval that would strobe", () => {
    const clamped = sampleVolcanicLightning(
      MIN_LIGHTNING_INTERVAL_SECONDS * 3,
      0
    );
    expect(clamped.cycle).toBe(3);
  });

  it("places each cycle somewhere new, within mediump range", () => {
    const cells = new Set<string>();
    for (let cycle = 0; cycle < 64; cycle += 1) {
      const cell = volcanicLightningCell(cycle);
      for (const axis of cell) {
        expect(axis).toBeGreaterThanOrEqual(0);
        expect(axis).toBeLessThan(16);
      }
      cells.add(cell.map((axis) => axis.toFixed(4)).join(","));
    }
    expect(cells.size).toBe(64);
    expect(volcanicLightningCell(7)).toEqual(volcanicLightningCell(7));
  });
});

describe("ember atmosphere looks", () => {
  it("gives every look a caldera-facing sky glow and haze underglow", () => {
    for (const id of EMBER_ATMOSPHERE_LOOK_IDS) {
      const look = getEmberAtmosphereLook(id);
      const glow = look.sky.horizonGlow;
      expect(glow, id).toBeDefined();
      expect(glow!.intensity, id).toBeGreaterThan(0);
      expect(look.volcanicHaze.underglowStrength, id).toBeGreaterThan(0);

      // The lit half of the sky has to agree with the lit terrain, or the
      // ridgeline is silhouetted against the wrong bearing.
      const light = look.rig.calderaLight.position;
      expect(glow!.direction[0], id).toBe(light[0]);
      expect(glow!.direction[2], id).toBe(light[2]);
      expect(look.volcanicHaze.underglowDirection?.[0], id).toBe(light[0]);
      expect(look.volcanicHaze.underglowDirection?.[2], id).toBe(light[2]);
    }
  });

  it("keeps blackglass the darkest look and furnace the brightest", () => {
    const blackglass = getEmberAtmosphereLook("blackglass-inferno");
    const furnace = getEmberAtmosphereLook("furnace-storm");
    const sulfur = getEmberAtmosphereLook("sulfur-caldera");

    expect(blackglass.sky.horizonGlow!.intensity!).toBeLessThan(
      sulfur.sky.horizonGlow!.intensity!
    );
    expect(sulfur.sky.horizonGlow!.intensity!).toBeLessThan(
      furnace.sky.horizonGlow!.intensity!
    );
    expect(blackglass.volcanicHaze.opacity).toBeLessThan(
      furnace.volcanicHaze.opacity
    );
  });
});

/**
 * three.js r182 punctual falloff, from
 * `ShaderChunk/lights_pars_begin.glsl.js` `getDistanceAttenuation`.
 */
function distanceAttenuation(
  distance: number,
  cutoff: number,
  decay: number
): number {
  let falloff = 1 / Math.max(Math.pow(distance, decay), 0.01);
  if (cutoff > 0) {
    const window = Math.min(
      Math.max(1 - Math.pow(distance / cutoff, 4), 0),
      1
    );
    falloff *= window * window;
  }
  return falloff;
}

/** Irradiance a point light lays on flat ground, `radius` metres out. */
function groundIrradiance(
  light: {
    position: [number, number, number];
    intensity: number;
    distance: number;
    decay?: number;
  },
  radius: number
): number {
  const height = light.position[1];
  const slant = Math.hypot(radius, height);
  return (
    light.intensity *
    (height / slant) *
    distanceAttenuation(slant, light.distance, light.decay ?? 2)
  );
}

describe("ember rig ground pools", () => {
  // Ground irradiance goes as height / slant^3, so dropping a light toward a
  // flat plain concentrates it into a disc no matter how the intensity is
  // tuned. The pair that painted the detached blob on the plain measured 196:1
  // and 14:1 from directly beneath to six metres out.
  const MAX_GROUND_CONTRAST = 12;

  it("keeps every rig light a wash rather than a spotlight", () => {
    for (const id of EMBER_ATMOSPHERE_LOOK_IDS) {
      const look = getEmberAtmosphereLook(id);
      for (const light of [...look.rig.points, look.rig.calderaLight]) {
        const contrast =
          groundIrradiance(light, 0) / groundIrradiance(light, 6);
        expect(contrast, `${id} ${JSON.stringify(light.position)}`).toBeLessThan(
          MAX_GROUND_CONTRAST
        );
      }
    }
  });

  it("derives the other looks without moving a light", () => {
    // The derivations scale intensity, which cancels out of a contrast ratio.
    // A derivation that edited a position or distance instead would not.
    const base = getEmberAtmosphereLook("blackglass-inferno").rig.points;
    for (const id of EMBER_ATMOSPHERE_LOOK_IDS) {
      const derived = getEmberAtmosphereLook(id).rig.points;
      expect(derived.length, id).toBe(base.length);
      derived.forEach((light, index) => {
        expect(light.position, id).toEqual(base[index]!.position);
        expect(light.distance, id).toBe(base[index]!.distance);
      });
    }
  });
});

interface EmberSliceGltf {
  nodes?: Array<{
    name?: string;
    mesh?: number;
    translation?: [number, number, number];
    scale?: [number, number, number];
    extras?: { tka_role?: string };
  }>;
  meshes?: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
  accessors?: Array<{
    componentType: number;
    normalized?: boolean;
    min?: number[];
    max?: number[];
  }>;
}

function readEmberSlice(): EmberSliceGltf {
  // The fissure decals are authored in the R10 living-caldera world. The
  // shipping ember-production-slice.glb is now the R5 mid-flank bake, which
  // carries midflank-geology and midflank-lava roles instead, so this contract
  // follows the asset that owns the decals -- the same split the R10
  // production-slice contract test makes.
  const buffer = readFileSync(
    resolve("static/models/ember/ember-production-slice-r10.glb")
  );
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8")
  ) as EmberSliceGltf;
}

/** Quantized accessor bounds are stored in component units, not metres. */
function dequantize(
  value: number,
  accessor: { componentType: number; normalized?: boolean }
): number {
  if (!accessor.normalized) return value;
  if (accessor.componentType === 5122) return Math.max(value / 32767, -1);
  if (accessor.componentType === 5120) return Math.max(value / 127, -1);
  if (accessor.componentType === 5123) return value / 65535;
  if (accessor.componentType === 5121) return value / 255;
  return value;
}

describe("ember R10 production-slice fissure decals", () => {
  const gltf = readEmberSlice();

  function worldHeightRange(nodeIndex: number): { low: number; high: number } {
    const node = gltf.nodes![nodeIndex]!;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const primitive of gltf.meshes![node.mesh!]!.primitives) {
      const accessor = gltf.accessors![primitive.attributes.POSITION]!;
      low = Math.min(low, dequantize(accessor.min![1]!, accessor));
      high = Math.max(high, dequantize(accessor.max![1]!, accessor));
    }
    const scale = node.scale?.[1] ?? 1;
    const offset = node.translation?.[1] ?? 0;
    return { low: low * scale + offset, high: high * scale + offset };
  }

  function nodesWithRole(role: string): number[] {
    return gltf
      .nodes!.map((node, index) => ({ node, index }))
      .filter(({ node }) => node.extras?.tka_role === role)
      .map(({ index }) => index);
  }

  it("bakes every fissure as a flat plane buried inside the shelf surface", () => {
    const surface = nodesWithRole("playable-surface");
    expect(surface).toHaveLength(1);
    const shelf = worldHeightRange(surface[0]!);
    expect(shelf.high - shelf.low).toBeGreaterThan(0.05);

    const fissures = [
      ...nodesWithRole("cooled-fissure"),
      ...nodesWithRole("live-fissure"),
    ];
    expect(fissures.length).toBe(6);

    for (const index of fissures) {
      const range = worldHeightRange(index);
      const name = gltf.nodes![index]!.name;
      // Zero thickness: a decal plane, not a cut fissure.
      expect(range.high - range.low, name).toBeCloseTo(0, 6);
      // Inside the surface's own height range, so the surface swallows it and
      // only the grazing intersection contour is ever drawn.
      expect(range.low, name).toBeGreaterThan(shelf.low);
      expect(range.low, name).toBeLessThan(shelf.high);
    }
  });

  it("keeps the buried decal roles hidden by the shared world", () => {
    // The hiding pass moved out of EmberScene.svelte when the Ember world was
    // shared with the worker renderer, so the contract follows its owner.
    const source = readFileSync(
      resolve(
        "src/lib/shared/3d/environments/worlds/ember/ember-authored-surface.ts"
      ),
      "utf8"
    );
    expect(source).toContain("BURIED_FISSURE_DECAL_ROLES");
    expect(source).toContain('"cooled-fissure"');
    expect(source).toContain('"live-fissure"');
    expect(source).toContain("child.visible = false");
  });
});
