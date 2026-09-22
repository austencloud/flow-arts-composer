import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  completeLOOPExtension,
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
  loopSpecFromLegacy,
} from "@tka/sequence-engine/loop";
import { SequenceExtender } from "$lib/features/create/shared/services/sequence-extender";
import { LOOPValidator } from "$lib/features/create/shared/services/loop-validator";
import { SequenceAnalyzer } from "$lib/features/create/shared/services/sequence-analyzer";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { CsvLoader } from "$lib/shared/foundation/services/data/csv-loader";
import { csvParser } from "$lib/shared/foundation/services/implementations/data/csv-parser";
import { betaDetector } from "$lib/shared/pictograph/prop/services/beta-detector";
import { MotionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
import { csvPictographParser } from "$lib/shared/pictograph/shared/services/csv-pictograph-parser";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import {
  buildSeed,
  loadPictographRows,
} from "./opus-sequence-parity/harness/canonical-fixtures";

function seedFor(letter: string, from: string, to: string): StepData[] {
  const row = loadPictographRows("diamond").find(
    (candidate) =>
      candidate.letter === letter &&
      candidate.startPlacement === from &&
      candidate.endPlacement === to
  );
  if (!row) throw new Error(`Missing canonical seed ${letter} ${from}→${to}`);
  return buildSeed([row], "diamond");
}

const DIAMOND_CSV = readFileSync(
  path.resolve(
    process.cwd(),
    "static/data/pictographs/DiamondPictographDataframe.csv"
  ),
  "utf8"
);

function createExtender(csv = DIAMOND_CSV): SequenceExtender {
  const motionQueryHandler = new MotionQueryHandler(
    {
      async loadCSVDataSet() {
        return {
          success: true,
          data: { diamondData: csv, boxData: csv },
          sources: { diamond: "fetch", box: "fetch" },
        };
      },
    } as CsvLoader,
    csvParser,
    csvPictographParser
  );

  return new SequenceExtender(
    { processReversals: (sequence) => sequence } as never,
    {} as never,
    {} as never,
    new LOOPValidator(),
    new SequenceAnalyzer(betaDetector),
    {} as never,
    motionQueryHandler
  );
}

function sequenceFromSeparateStart(seed: StepData[]): SequenceData {
  const start = seed[0]!;
  return {
    id: "sequence-loop",
    word: "A",
    gridMode: start.gridMode,
    startPlacement: {
      id: "separate-start-placement",
      isStartPlacement: true,
      gridPlacement: start.startPlacement,
      motions: start.motions,
    },
    steps: seed.slice(1),
  } as SequenceData;
}

describe("SequenceExtender LOOP completion", () => {
  it("extends a separate-start sequence through real canonical lookup without changing its authored beat", async () => {
    const seed = seedFor("A", "alpha3", "alpha5");
    const authored = seed[1]! as StepData & { viewTag?: string };
    authored.duration = 2.5;
    authored.viewTag = "keep-me";
    authored.motions.left.isVisible = true;
    authored.motions.right.isVisible = true;
    const sequence = sequenceFromSeparateStart(seed);
    sequence.steps[0] = { ...sequence.steps[0]!, id: "sequence-loop-3" };
    const before = structuredClone(sequence);

    const extended = await createExtender().extendSequence(sequence, {
      loopType: LOOPType.ROTATED_INVERTED,
      period: Period.QUARTERED,
    });

    expect(sequence).toEqual(before);
    expect(extended.steps).toHaveLength(4);
    expect(extended.steps[0]).toEqual(before.steps[0]);
    // The CSV-backed application lookup, not the executor's copied source
    // letter, is the authority for generated labels.
    expect(extended.word).toBe("ABAB");
    expect(extended.steps.map((step) => step.letter)).toEqual([
      "A",
      "B",
      "A",
      "B",
    ]);
    expect(extended.steps.map((step) => step.stepNumber)).toEqual([1, 2, 3, 4]);
    expect(new Set(extended.steps.map((step) => step.id)).size).toBe(4);
    expect(
      extended.steps.slice(1).every((step) => step.id !== "sequence-loop-3")
    ).toBe(true);
    expect(extended.steps[0]!.duration).toBe(2.5);
    expect((extended.steps[0] as typeof authored).viewTag).toBe("keep-me");

    const completed = [seed[0]!, ...extended.steps];
    expect(completed.at(-1)!.endPlacement).toBe(
      sequence.startPlacement?.gridPlacement
    );
    for (let index = 1; index < completed.length; index++) {
      const previous = completed[index - 1]!;
      const step = completed[index]!;
      expect(step.startPlacement).toBe(previous.endPlacement);
      for (const hand of ["left", "right"] as const) {
        expect(step.motions[hand].startLocation).toBe(
          previous.motions[hand].endLocation
        );
      }
      expect(
        getGridPlacementFromLocations(
          step.motions.left.endLocation as GridLocation,
          step.motions.right.endLocation as GridLocation
        )
      ).toBe(step.endPlacement);
    }
  });

  it.each([
    ["clockwise", "alpha5"],
    ["counterclockwise", "alpha1"],
  ])("closes a %s canonical quarter orbit", (_direction, endPlacement) => {
    const seed = seedFor("A", "alpha3", endPlacement);
    const completed = completeLOOPExtension(seed, {
      loopType: EngineLOOPType.ROTATED,
      period: EnginePeriod.QUARTERED,
    }).steps as StepData[];

    expect(completed.at(-1)!.endPlacement).toBe(seed[0]!.startPlacement);
    expect(completed.at(-1)!.motions.left.endOrientation).toBe(
      seed[0]!.motions.left.startOrientation
    );
    expect(completed.at(-1)!.motions.right.endOrientation).toBe(
      seed[0]!.motions.right.startOrientation
    );
  });

  it("rejects a selected seed that is invalid for the requested operation", () => {
    expect(() =>
      completeLOOPExtension(seedFor("A", "alpha3", "alpha5"), {
        loopType: EngineLOOPType.MIRRORED,
        period: EnginePeriod.HALVED,
      })
    ).toThrow(/Selected seed is not valid for this .*LOOP/);
  });

  it("fixes D1: mirrored-swapped-inverted derives placement from its hands", () => {
    const completed = completeLOOPExtension(seedFor("α", "alpha3", "alpha3"), {
      spec: loopSpecFromLegacy(EngineLOOPType.MIRRORED_SWAPPED_INVERTED, 2),
    }).steps as StepData[];
    const last = completed.at(-1)!;
    expect(
      getGridPlacementFromLocations(
        last.motions.left.endLocation as GridLocation,
        last.motions.right.endLocation as GridLocation
      )
    ).toBe(last.endPlacement);
    expect(last.endPlacement).toBe(completed[0]!.startPlacement);
  });

  it("fixes D2: quartered rotated-inverted completes the four-placement orbit", () => {
    const completed = completeLOOPExtension(seedFor("A", "alpha3", "alpha5"), {
      loopType: EngineLOOPType.ROTATED_INVERTED,
      period: EnginePeriod.QUARTERED,
    }).steps as StepData[];
    expect(completed.map((step) => step.endPlacement)).toEqual([
      "alpha3",
      "alpha5",
      "alpha7",
      "alpha1",
      "alpha3",
    ]);
  });

  it("refuses visible paired generated motions when the canonical lookup has no matching letter", async () => {
    const seed = seedFor("A", "alpha3", "alpha5");
    const sequence = sequenceFromSeparateStart(seed);
    const before = structuredClone(sequence);

    await expect(
      createExtender(`${DIAMOND_CSV.split(/\r?\n/)[0]}\n`).extendSequence(
        sequence,
        {
          loopType: LOOPType.ROTATED,
          period: Period.QUARTERED,
        }
      )
    ).rejects.toThrow("Cannot derive a canonical letter for generated step");
    expect(sequence).toEqual(before);
  });
});
