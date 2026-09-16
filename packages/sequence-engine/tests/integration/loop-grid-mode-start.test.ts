/**
 * Regression lock: LOOP seed start selection must respect the grid mode.
 *
 * Bug (2026-07-14): `SequenceBuilder.constrainStartForLoopType` pinned a random
 * start from all 8 beta indices for rotated_swapped[_inverted] LOOPs, ignoring
 * the grid mode. But the two grid modes occupy disjoint grid points — diamond
 * uses the cardinal (odd-index) placements (beta1/3/5/7…), box uses the
 * intercardinal (even-index) ones (beta2/4/6/8…). When the pin landed on a
 * parity absent from the active grid, the beam search had zero variations there
 * and the backward reachability pass threw
 *   "No valid N-step path exists: step 1 has no reachable placements …"
 * ~50% of the time in BOTH modes (reported in box). Mirror+swap combinations
 * once pinned beta1/beta5 (cardinal only), which made them fail in box.
 *
 * Drives the REAL builder over the canonical Box/Diamond CSV datasets — same
 * pipeline as MCP `generate_sequence loopType=…` and the app's circular
 * generator (see scripts/generate-loop-audit-fixtures.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData } from "../../src/generation/constraints/types.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import {
  LOOPComponent,
  symmetricSpec,
  type LOOPSpec,
} from "../../src/loop/loop-spec.js";
import { loopDetectorClass } from "../../src/loop/detection/LOOPDetector.js";
import {
  REFLECTION_AXES,
  type ReflectionAxis,
} from "../../src/loop/placement-maps/strict-loop-placement-maps.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = (name: string) =>
  path.resolve(__dirname, "../../../../static/data/pictographs", name);

function loadCsv(name: string): PictographData[] {
  const lines = readFileSync(csvPath(name), "utf8").trim().split(/\r?\n/);
  const headers = lines[0]!.split(",");
  const column = (name: string) => headers.indexOf(name);
  const value = (cells: string[], name: string) => cells[column(name)]!;

  return lines
    .slice(1)
    .map((l) => l.split(","))
    .filter(
      (cells) =>
        cells.length === headers.length && value(cells, "blueMotionType")
    )
    .map((c) => ({
      letter: value(c, "letter"),
      startPlacement: value(c, "startPlacement"),
      endPlacement: value(c, "endPlacement"),
      timing: "together",
      direction: "together",
      leftMotion: {
        hand: "left",
        motionType: value(c, "blueMotionType"),
        rotationDirection: value(c, "blueRotationDirection"),
        startLocation: value(c, "blueStartLocation"),
        endLocation: value(c, "blueEndLocation"),
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
      },
      rightMotion: {
        hand: "right",
        motionType: value(c, "redMotionType"),
        rotationDirection: value(c, "redRotationDirection"),
        startLocation: value(c, "redStartLocation"),
        endLocation: value(c, "redEndLocation"),
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
      },
    }));
}

class CsvVariationProvider implements IVariationProvider {
  private readonly index = new Map<string, PictographData[]>();
  constructor(private readonly all: PictographData[]) {
    for (const p of all) {
      const k = `${p.letter}:${p.startPlacement}`;
      const bucket = this.index.get(k);
      if (bucket) bucket.push(p);
      else this.index.set(k, [p]);
    }
  }
  getVariations(letter: string, placement: string): PictographData[] {
    return this.index.get(`${letter}:${placement}`) ?? [];
  }
  getAllVariations(): PictographData[] {
    return this.all;
  }
}

const boxBuilder = new SequenceBuilder(
  new CsvVariationProvider(loadCsv("BoxPictographDataframe.csv"))
);
const diamondBuilder = new SequenceBuilder(
  new CsvVariationProvider(loadCsv("DiamondPictographDataframe.csv"))
);
const skewedBuilder = new SequenceBuilder(
  new CsvVariationProvider(loadCsv("SkewedPictographDataframe.csv"))
);

const REACHABILITY_ERROR = /no reachable placements/;

function buildLoop(
  builder: SequenceBuilder,
  gridMode: string,
  type: LOOPType,
  startPlacement?: string,
  period = Period.HALVED,
  loopSpec?: LOOPSpec
) {
  return builder.build({
    length: 8, // seed for a halved length-16 loop
    gridMode,
    level: 2,
    constraintPreset: "smooth",
    maxTurnIntensity: 1,
    startPlacement,
    loop: { type, period, loopSpec, useTargetedGeneration: true },
  });
}

function reflectionSpec(reflectionAxis: ReflectionAxis): LOOPSpec {
  return symmetricSpec(
    new Map([[LOOPComponent.MIRRORED, { period: 2, reflectionAxis }]])
  );
}

function parityOf(placement: string | undefined): "even" | "odd" | "none" {
  const n = Number(placement?.match(/\d+$/)?.[0]);
  if (!Number.isFinite(n)) return "none";
  return n % 2 === 0 ? "even" : "odd";
}

const TRIALS = 25;
const REFLECTION_TRIALS = 10;

describe("LOOP seed start respects grid mode", () => {
  it("box rotated_swapped_inverted never hits the reachability wall; starts stay intercardinal (even)", () => {
    for (let i = 0; i < TRIALS; i++) {
      const r = buildLoop(boxBuilder, "box", LOOPType.ROTATED_SWAPPED_INVERTED);
      const start = r.sequence[0]?.startPlacement;
      expect(parityOf(start)).toBe("even"); // box has only beta2/4/6/8, gamma even, …
    }
  });

  it("box rotated_swapped never hits the reachability wall; starts stay intercardinal (even)", () => {
    for (let i = 0; i < TRIALS; i++) {
      const r = buildLoop(boxBuilder, "box", LOOPType.ROTATED_SWAPPED);
      expect(parityOf(r.sequence[0]?.startPlacement)).toBe("even");
    }
  });

  it("diamond rotated_swapped_inverted starts stay cardinal (odd)", () => {
    for (let i = 0; i < TRIALS; i++) {
      const r = buildLoop(
        diamondBuilder,
        "diamond",
        LOOPType.ROTATED_SWAPPED_INVERTED
      );
      expect(parityOf(r.sequence[0]?.startPlacement)).toBe("odd");
    }
  });

  it("forcing a cardinal start (beta1) in box reproduces the reachability wall", () => {
    // Documents the exact reported failure: a diamond placement has zero box
    // variations, so the backward reachability pass empties out at step 1.
    expect(() =>
      buildLoop(boxBuilder, "box", LOOPType.ROTATED_SWAPPED_INVERTED, "beta1")
    ).toThrow(REACHABILITY_ERROR);
  });

  it("mirror+swap combinations use valid box starts instead of being rejected", () => {
    for (let i = 0; i < TRIALS; i++) {
      const result = buildLoop(
        boxBuilder,
        "box",
        LOOPType.MIRRORED_SWAPPED_INVERTED
      );
      expect(parityOf(result.sequence[0]?.startPlacement)).toBe("even");
    }
  });

  it("mirror+rotation combinations close from valid Box starts", () => {
    for (const type of [
      LOOPType.MIRRORED_ROTATED,
      LOOPType.MIRRORED_INVERTED_ROTATED,
    ]) {
      for (const period of [Period.HALVED, Period.QUARTERED]) {
        for (let i = 0; i < 5; i++) {
          const result = buildLoop(boxBuilder, "box", type, undefined, period);
          const first = result.sequence[0]!;
          const last = result.sequence[result.sequence.length - 1]!;
          expect(parityOf(first.startPlacement)).toBe("even");
          expect(last.endPlacement).toBe(first.startPlacement);
          expect(last.motions.left.endOrientation).toBe(
            first.motions.left.startOrientation
          );
          expect(last.motions.right.endOrientation).toBe(
            first.motions.right.startOrientation
          );
        }
      }
    }
  });
});

describe("real builder supports every reflection axis in every grid mode", () => {
  const gridCases = [
    { gridMode: "diamond", builder: diamondBuilder },
    { gridMode: "box", builder: boxBuilder },
    { gridMode: "skewed", builder: skewedBuilder },
  ] as const;

  for (const { gridMode, builder } of gridCases) {
    for (const reflectionAxis of REFLECTION_AXES) {
      it(`${gridMode} generates and detects ${reflectionAxis} reflection`, () => {
        for (let trial = 0; trial < REFLECTION_TRIALS; trial++) {
          const result = buildLoop(
            builder,
            gridMode,
            LOOPType.MIRRORED,
            undefined,
            Period.HALVED,
            reflectionSpec(reflectionAxis)
          );
          const first = result.sequence[0]!;
          const last = result.sequence[result.sequence.length - 1]!;
          const detected = loopDetectorClass.detectLOOPType(result.sequence);

          expect(last.endPlacement).toBe(first.startPlacement);
          expect(last.motions.left.endOrientation).toBe(
            first.motions.left.startOrientation
          );
          expect(last.motions.right.endOrientation).toBe(
            first.motions.right.startOrientation
          );
          expect(detected.isCircular).toBe(true);
          expect(detected.reflectionAxis).toBe(reflectionAxis);
        }
      });
    }
  }
});
