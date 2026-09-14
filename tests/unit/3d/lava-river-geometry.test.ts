import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createLavaRiverStripGeometry,
  LAVA_RIVER_BANK_MARGIN_FRACTION,
  LAVA_RIVER_BANK_PLUNGE,
  LAVA_RIVER_GLOW,
  LAVA_RIVER_MARGIN_BURY,
  LAVA_RIVER_MAX_MARGIN_DROP,
  LAVA_RIVER_SURFACE_OFFSET,
  type LavaTerrainSampler,
} from "$lib/shared/3d/environments/scenes/ember/lava-river-geometry";
import { createDefaultEmberConfig } from "$lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config";
import volcanicWorldR7 from "$lib/shared/3d/environments/domain/models/scene-configs/ember-volcanic-world-r7.json";
import type { BufferGeometry } from "three";

const RIVER_COMPONENT = resolve(
  "src/lib/shared/3d/environments/scenes/ember/LavaRivers.svelte"
);

const LATERAL = 14;
const ROW_WIDTH = LATERAL + 1;

const AUTHORED = volcanicWorldR7.lavaRiver.pointsRuntimeXZHeight as [
  number,
  number,
  number,
][];
const HEAD = AUTHORED[0]!;
const TAIL = AUTHORED[AUTHORED.length - 1]!;

function bakedChannel() {
  const channel = createDefaultEmberConfig().lavaRivers?.channels[0];
  if (!channel) throw new Error("Ember ships one baked lava channel");
  return channel;
}

function buildStrip(overrides: Record<string, unknown> = {}) {
  return createLavaRiverStripGeometry({
    channel: bakedChannel(),
    poolPosition: { x: 0, z: 0 },
    groundY: 0,
    width: volcanicWorldR7.lavaRiver.width,
    longitudinalSegments: 60,
    lateralSegments: LATERAL,
    ...overrides,
  });
}

/** Rows are derived from the emitted geometry so the sample floor can move. */
function rowCount(geometry: BufferGeometry): number {
  return geometry.getAttribute("position").count / ROW_WIDTH;
}

function sampler(
  heightAt: (x: number, z: number) => number | null
): LavaTerrainSampler {
  return { meshCount: 1, heightAt };
}

/** Half the emitted width of one row, measured on the polygon edge. */
function rowHalfWidth(geometry: BufferGeometry, row: number): number {
  const position = geometry.getAttribute("position");
  const first = row * ROW_WIDTH;
  const last = first + LATERAL;
  return (
    Math.hypot(
      position.getX(last) - position.getX(first),
      position.getZ(last) - position.getZ(first)
    ) / 2
  );
}

function everyValueFinite(geometry: BufferGeometry): boolean {
  for (const name of ["position", "uv", "aCross", "aFlow", "aRun", "aGrade"]) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) return false;
    for (let index = 0; index < attribute.array.length; index += 1) {
      if (!Number.isFinite(attribute.array[index]!)) return false;
    }
  }
  return true;
}

describe("lava river strip geometry", () => {
  it("parameterises U by arc length, not by curve parameter", () => {
    const { geometry, channelLength } = buildStrip();
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    const rows = rowCount(geometry) - 1;

    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(rows * ROW_WIDTH)).toBeCloseTo(1, 6);

    let previous = -1;
    let travelled = 0;
    const steps: number[] = [];
    for (let row = 0; row <= rows; row += 1) {
      const centre = row * ROW_WIDTH + 7;
      const u = uv.getX(centre);
      expect(u).toBeGreaterThanOrEqual(previous);
      previous = u;

      if (row > 0) {
        const previousCentre = (row - 1) * ROW_WIDTH + 7;
        const step = Math.hypot(
          position.getX(centre) - position.getX(previousCentre),
          position.getY(centre) - position.getY(previousCentre),
          position.getZ(centre) - position.getZ(previousCentre)
        );
        steps.push(step);
        travelled += step;
      }
      // Arc length measured on the emitted centreline, so the shader's world
      // frequency is exact rather than approximately right.
      expect(u * channelLength).toBeCloseTo(travelled, 3);
    }

    // The seventeen baked control points are spaced unevenly by a factor of
    // several. Stations walked at the curve parameter would inherit that
    // spread and stretch the crust pattern across the widest gaps; stations
    // walked by arc length come out even.
    const authored: number[] = [];
    for (let index = 1; index < AUTHORED.length; index += 1) {
      authored.push(
        Math.hypot(
          AUTHORED[index]![0] - AUTHORED[index - 1]![0],
          AUTHORED[index]![1] - AUTHORED[index - 1]![1]
        )
      );
    }
    expect(Math.max(...authored) / Math.min(...authored)).toBeGreaterThan(2);
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.25);
  });

  it("reserves a margin the shader can terminate inside", () => {
    const { geometry } = buildStrip();
    const cross = geometry.getAttribute("aCross");
    const span = 1 + LAVA_RIVER_BANK_MARGIN_FRACTION;

    let extreme = 0;
    for (let index = 0; index < cross.count; index += 1) {
      extreme = Math.max(extreme, Math.abs(cross.getX(index)));
    }
    expect(extreme).toBeCloseTo(span, 6);

    const source = readFileSync(RIVER_COMPONENT, "utf8");
    expect(source).toContain("if (bank > cut) discard;");
    const cut = source.match(
      /cut = 1\.0 \+ uMarginFraction\s*\*\s*\(([\d.]+) \+ ([\d.]+)/
    );
    expect(cut).not.toBeNull();
    const ceiling = Number(cut![1]) + Number(cut![2]);
    // Strictly under one: the ragged shore always lands inside the reserved
    // margin, so the strip's straight polygon edge is never the silhouette.
    expect(ceiling).toBeLessThan(1);
  });

  it("keeps the cross-river field off the vertex lattice", () => {
    const source = readFileSync(RIVER_COMPONENT, "utf8");
    // The lateral noise domain used to run at nine cells across a nine-column
    // strip, which showed up as rectangular bites along the shore.
    expect(source).not.toMatch(/vUv\.y\s*\*/);
    expect(source).toContain("attribute float aCross;");
    expect(source).toContain("attribute float aFlow;");
  });

  it("drops the reserved margin below the channel floor", () => {
    const { geometry } = buildStrip();
    const position = geometry.getAttribute("position");
    const cross = geometry.getAttribute("aCross");
    const row = Math.floor((rowCount(geometry) - 1) / 2) * ROW_WIDTH;

    const centre = position.getY(row + 7);
    let nominalEdge = 0;
    const outerEdge = position.getY(row);
    for (let column = 0; column <= LATERAL; column += 1) {
      if (Math.abs(Math.abs(cross.getX(row + column)) - 1) < 0.08) {
        nominalEdge = position.getY(row + column);
      }
    }

    expect(nominalEdge).toBeLessThan(centre);
    expect(centre - nominalEdge).toBeLessThan(0.1);
    expect(nominalEdge - outerEdge).toBeGreaterThan(LAVA_RIVER_BANK_PLUNGE * 0.5);
  });

  it("still opens from a point source and spaces its bank lights", () => {
    const { geometry, lightPositions } = buildStrip({
      lateralSegments: 4,
      longitudinalSegments: 20,
      lightCount: 5,
    });
    const position = geometry.getAttribute("position");
    const source = Array.from({ length: 5 }, (_, index) =>
      [
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ].join(",")
    );
    expect(new Set(source).size).toBe(1);
    expect(lightPositions).toHaveLength(5);
    for (let index = 1; index < lightPositions.length; index += 1) {
      expect(
        lightPositions[index]!.distanceTo(lightPositions[index - 1]!)
      ).toBeGreaterThan(1);
    }
  });
});

describe("lava river resample and drape", () => {
  it("resamples to at least sixty centreline stations", () => {
    // Seventeen authored control points spaced up to thirty-one metres apart
    // cannot follow a bed whose relief changes over a few metres.
    const coarse = buildStrip({ longitudinalSegments: 12 });
    expect(coarse.centreline.length).toBeGreaterThanOrEqual(61);
    expect(rowCount(coarse.geometry)).toBe(coarse.centreline.length);

    const production = buildStrip({ longitudinalSegments: 152 });
    expect(production.centreline.length).toBe(153);
  });

  it("preserves the head and tail world positions", () => {
    for (const terrain of [
      null,
      sampler((_x, z) => -z * 0.04),
    ] as (LavaTerrainSampler | null)[]) {
      const { centreline } = buildStrip({ terrain });
      const head = centreline[0]!;
      const tail = centreline[centreline.length - 1]!;

      expect(head.x).toBeCloseTo(HEAD[0], 6);
      expect(head.z).toBeCloseTo(HEAD[1], 6);
      expect(tail.x).toBeCloseTo(TAIL[0], 6);
      expect(tail.z).toBeCloseTo(TAIL[1], 6);
    }
  });

  it("keeps the authored heights when no terrain is supplied", () => {
    const { centreline, draped } = buildStrip({ terrain: null });
    expect(draped).toBe(false);
    expect(centreline[0]!.y).toBeCloseTo(HEAD[2], 6);
    expect(centreline[centreline.length - 1]!.y).toBeCloseTo(TAIL[2], 6);
  });

  it("lays the centreline on the sampled ground plus the surface offset", () => {
    const bed = (_x: number, z: number) => -z * 0.05;
    const { centreline, draped } = buildStrip({ terrain: sampler(bed) });
    expect(draped).toBe(true);

    // Endpoints are held out of the smoothing pass, so the head and tail sit
    // exactly on the bed the sampler reported.
    const head = centreline[0]!;
    const tail = centreline[centreline.length - 1]!;
    expect(head.y).toBeCloseTo(bed(head.x, head.z) + LAVA_RIVER_SURFACE_OFFSET, 6);
    expect(tail.y).toBeCloseTo(bed(tail.x, tail.z) + LAVA_RIVER_SURFACE_OFFSET, 6);

    for (const point of centreline) {
      expect(point.y).toBeCloseTo(bed(point.x, point.z) + LAVA_RIVER_SURFACE_OFFSET, 1);
    }
  });

  it("descends monotonically down a monotonically descending bed", () => {
    // z runs 145 down to -122, so a bed of 0.06z falls the whole way.
    const { centreline, descent, peakGrade } = buildStrip({
      terrain: sampler((_x, z) => z * 0.06),
    });

    for (let index = 1; index < centreline.length; index += 1) {
      expect(centreline[index]!.y).toBeLessThanOrEqual(
        centreline[index - 1]!.y + 1e-9
      );
    }
    expect(descent).toBeCloseTo((HEAD[1] - TAIL[1]) * 0.06, 4);
    expect(peakGrade).toBeGreaterThan(0);
  });

  it("reports the fall the authored profile already carried", () => {
    const { descent } = buildStrip({ terrain: null });
    expect(descent).toBeCloseTo(HEAD[2] - TAIL[2], 6);
    expect(descent).toBeGreaterThan(15);
  });

  it("grades the steep headwaters above the flat lower run", () => {
    const { geometry } = buildStrip({ terrain: null });
    const grade = geometry.getAttribute("aGrade");
    const rows = rowCount(geometry);
    const headGrade = grade.getX(Math.round(rows * 0.05) * ROW_WIDTH + 7);
    const lowerGrade = grade.getX(Math.round(rows * 0.85) * ROW_WIDTH + 7);

    expect(headGrade).toBeGreaterThan(0.4);
    expect(lowerGrade).toBeLessThan(0.1);
  });

  it("buries the outer margin under the bank it meets", () => {
    const bed = (_x: number, z: number) => -z * 0.05;
    const terrain = sampler(bed);
    const { geometry } = buildStrip({ terrain });
    const position = geometry.getAttribute("position");
    const cross = geometry.getAttribute("aCross");

    for (let index = 0; index < position.count; index += 1) {
      if (Math.abs(cross.getX(index)) < 1.3) continue;
      const x = position.getX(index);
      const z = position.getZ(index);
      expect(position.getY(index)).toBeLessThanOrEqual(
        bed(x, z) - LAVA_RIVER_MARGIN_BURY + 1e-6
      );
    }
  });

  it("bounds the margin skirt where the bank falls away", () => {
    // A bed that tilts hard across the channel makes the margin on the low side
    // chase terrain downward. Without the cap it would hang a multi-metre
    // curtain off the shoulder of every ridge the run crosses.
    const { geometry } = buildStrip({
      terrain: sampler((x) => x * 1.2),
    });
    const position = geometry.getAttribute("position");
    const cross = geometry.getAttribute("aCross");
    const rows = rowCount(geometry);
    const ceiling =
      LAVA_RIVER_MAX_MARGIN_DROP + LAVA_RIVER_BANK_PLUNGE + 0.05 + 1e-6;

    for (let row = 0; row < rows; row += 1) {
      const centre = position.getY(row * ROW_WIDTH + 7);
      for (let column = 0; column <= LATERAL; column += 1) {
        const index = row * ROW_WIDTH + column;
        if (Math.abs(cross.getX(index)) <= 1) continue;
        expect(centre - position.getY(index)).toBeLessThanOrEqual(ceiling);
      }
    }
  });
});

describe("lava river source and terminus", () => {
  it("spreads into a delta and rounds off at the tail", () => {
    const { geometry } = buildStrip({ longitudinalSegments: 152 });
    const rows = rowCount(geometry);
    const midRun = rowHalfWidth(geometry, Math.round(rows * 0.5));

    let widestToe = 0;
    for (let row = Math.round(rows * 0.915); row < rows; row += 1) {
      widestToe = Math.max(widestToe, rowHalfWidth(geometry, row));
    }

    // The delta genuinely spreads, and then the lobe closes instead of ending
    // on the square chop the audit caught mid-slope.
    expect(widestToe).toBeGreaterThan(midRun * 1.5);
    expect(rowHalfWidth(geometry, rows - 1)).toBeLessThan(midRun * 0.25);

    // The shader cuts the tip off while the lobe is still wide, on the shore
    // scallop, so the final narrowing rows never render as a dark slab.
    const source = readFileSync(RIVER_COMPONENT, "utf8");
    expect(source).toContain("uniform float uCapStart;");
    expect(source).toContain("if (capT > tipCut) discard;");
  });

  it("ends the ribbon on the authored tail, not short of it", () => {
    const { centreline } = buildStrip({ longitudinalSegments: 152 });
    const tail = centreline[centreline.length - 1]!;
    expect(tail.x).toBeCloseTo(TAIL[0], 6);
    expect(tail.z).toBeCloseTo(TAIL[1], 6);
  });

  it("opens a vent mouth at the head that is wider than the channel", () => {
    const { ventGeometry } = buildStrip();
    expect(ventGeometry).not.toBeNull();

    ventGeometry!.computeBoundingBox();
    const box = ventGeometry!.boundingBox!;
    expect(box.min.x).toBeLessThan(HEAD[0]);
    expect(box.max.x).toBeGreaterThan(HEAD[0]);
    expect(box.min.z).toBeLessThan(HEAD[1]);
    expect(box.max.z).toBeGreaterThan(HEAD[1]);

    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    expect(span).toBeGreaterThan(volcanicWorldR7.lavaRiver.width);
    // The baked crater at the head has a six metre radius; the mouth has to sit
    // inside it rather than spilling over the lip.
    expect(span).toBeLessThan(volcanicWorldR7.distantVent.craterRadius * 2);

    // A bowl, not a disc: the centre of the mouth sits below its rim.
    expect(box.min.y).toBeLessThan(HEAD[2]);
  });

  it("puts the whole vent mouth at the hot end of the run", () => {
    const { geometry, ventGeometry } = buildStrip();
    const ventRun = ventGeometry!.getAttribute("aRun");
    for (let index = 0; index < ventRun.count; index += 1) {
      expect(ventRun.getX(index)).toBe(0);
    }

    const run = geometry.getAttribute("aRun");
    expect(run.getX(0)).toBe(0);
    expect(run.getX(run.count - 1)).toBeCloseTo(1, 6);

    const source = readFileSync(RIVER_COMPONENT, "utf8");
    // The downstream gradient and the source term both read aRun, which is what
    // lets one material serve the mouth and the ribbon.
    expect(source).toContain("uThermalFalloff, smoothstep(0.0, 1.0, vRun)");
    expect(source).toContain("pow(clamp(1.0 - vRun, 0.0, 1.0), 6.0)");
  });

  it("omits the mouth when the source is disabled", () => {
    const { ventGeometry } = buildStrip({ source: { enabled: false } });
    expect(ventGeometry).toBeNull();
  });
});

describe("lava river corridor glow", () => {
  it("reaches well past the channel edge without spending a light", () => {
    const { glowGeometry } = buildStrip();
    expect(glowGeometry).not.toBeNull();

    const cross = glowGeometry!.getAttribute("aCross");
    let extreme = 0;
    for (let index = 0; index < cross.count; index += 1) {
      extreme = Math.max(extreme, Math.abs(cross.getX(index)));
    }
    expect(extreme).toBeGreaterThan(1 + LAVA_RIVER_BANK_MARGIN_FRACTION);

    const source = readFileSync(RIVER_COMPONENT, "utf8");
    expect(source).toContain("blending: AdditiveBlending");
    // Additive geometry must fade to black with distance; mixing toward
    // fogColor the way the stock chunk does would add fog to the scene.
    expect(source).toContain("color *= 1.0 - fogFactor;");
  });

  it("never collapses to a degenerate strip where the channel tapers", () => {
    const { glowGeometry, centreline } = buildStrip();
    const position = glowGeometry!.getAttribute("position");
    const columns = Math.max(6, Math.round(LAVA_RIVER_GLOW.columns)) + 1;
    expect(position.count).toBe(columns * centreline.length);

    // The channel tapers to a point at the source and closes to a rounded tip
    // at the toe. Scaled off those rows the skirt would be degenerate exactly
    // where the corridor most needs the light.
    let minimumSpan = Infinity;
    for (let row = 0; row < centreline.length; row += 1) {
      const first = row * columns;
      const last = first + columns - 1;
      minimumSpan = Math.min(
        minimumSpan,
        Math.hypot(
          position.getX(last) - position.getX(first),
          position.getZ(last) - position.getZ(first)
        )
      );
    }
    expect(minimumSpan).toBeGreaterThan(volcanicWorldR7.lavaRiver.width);
  });

  it("keeps the skirt on the corridor instead of fanning with the delta", () => {
    const { glowGeometry, geometry } = buildStrip({ longitudinalSegments: 152 });
    const position = glowGeometry!.getAttribute("position");
    const columns = Math.max(6, Math.round(LAVA_RIVER_GLOW.columns)) + 1;
    const rows = rowCount(geometry);
    const span = (row: number) => {
      const first = row * columns;
      const last = first + columns - 1;
      return Math.hypot(
        position.getX(last) - position.getX(first),
        position.getZ(last) - position.getZ(first)
      );
    };
    const midSpan = span(Math.round(rows * 0.5));
    let widestToe = 0;
    for (let row = Math.round(rows * 0.915); row < rows; row += 1) {
      widestToe = Math.max(widestToe, span(row));
    }
    // The ribbon spreads more than 1.5x here; the light must not.
    expect(widestToe).toBeLessThanOrEqual(midSpan * 1.15);
  });

  it("omits the skirt when the glow is disabled", () => {
    const { glowGeometry } = buildStrip({ glow: { enabled: false } });
    expect(glowGeometry).toBeNull();
  });
});

describe("lava river geometry integrity", () => {
  it("emits finite values across every surface it builds", () => {
    const built = buildStrip({
      terrain: sampler((x, z) => -z * 0.05 + Math.sin(x * 0.3) * 0.4),
      longitudinalSegments: 152,
    });
    expect(everyValueFinite(built.geometry)).toBe(true);
    expect(everyValueFinite(built.ventGeometry!)).toBe(true);
    expect(everyValueFinite(built.glowGeometry!)).toBe(true);
    for (const point of built.centreline) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.z)).toBe(true);
    }
  });

  it("survives a sampler that covers nothing", () => {
    const { centreline, draped } = buildStrip({ terrain: sampler(() => null) });
    expect(draped).toBe(false);
    expect(centreline[0]!.y).toBeCloseTo(HEAD[2], 6);
  });
});
