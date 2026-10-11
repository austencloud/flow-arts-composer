/**
 * The Construct preview's choices are real. The start box offers the start
 * position picker's own placements; each step box offers moves the option
 * picker lists after the demo sequence's steps before it. The baked file must
 * match what the production pipeline builds now (`vitest -u` rewrites it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { csvParser } from "#lib/shared/foundation/services/implementations/data/csv-parser.js";
import { StartPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { csvPictographParser } from "#lib/shared/pictograph/shared/services/csv-pictograph-parser.js";
import { MotionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import {
  CONSTRUCT_CHOICE_COUNT,
  CONSTRUCT_MAX_SLOTS,
} from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import {
  CONSTRUCT_DECOYS,
  constructPick,
  decoySpots,
} from "#lib/features/create/shared/components/method-previews/method-preview-construct.js";
import {
  DEMO_SEQUENCE,
  openingSteps,
  startPictograph,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";

const CHOICES_FILE =
  "../../../src/lib/features/create/shared/components/method-previews/method-preview-construct-choices.json";

/** The real Construct options pipeline, fed the dataset file from disk. */
function optionSource(): MotionQueryHandler {
  const diamondData = readFileSync(
    resolve(
      process.cwd(),
      "static/data/pictographs/DiamondPictographDataframe.csv"
    ),
    "utf8"
  );
  const loader = {
    loadCSVDataSet: async () => ({
      data: { diamondData, boxData: "", skewedData: "" },
    }),
  };
  return new MotionQueryHandler(
    loader as never,
    csvParser,
    csvPictographParser
  );
}

/**
 * Two other moves from a box's options, spread through its letters so
 * neighboring boxes differ: the first option of the letters a third and two
 * thirds of the way along, skipping the real step's letter.
 */
function spreadPicks(
  options: readonly PictographData[],
  realLetter: string | null | undefined
): PictographData[] {
  const letters = [...new Set(options.map((option) => option.letter))].filter(
    (letter) => letter !== realLetter
  );
  return [1, 2].map((third) => {
    const letter = letters[Math.floor((letters.length * third) / 3)];
    return options.find((option) => option.letter === letter)!;
  });
}

/** Stable ids, so the baked file only changes when the moves change. */
function withIds(slot: number, decoys: PictographData[]): PictographData[] {
  return decoys.map((decoy, index) => ({
    ...decoy,
    id: `construct-choice-${slot}-${index}`,
  }));
}

async function buildDecoys(): Promise<PictographData[][]> {
  const start = startPictograph(DEMO_SEQUENCE)!;
  const steps = openingSteps(DEMO_SEQUENCE, CONSTRUCT_MAX_SLOTS - 1);
  const placements = new StartPlacementManager()
    .getDefaultStartPlacements(GridMode.DIAMOND)
    .filter((placement) => placement.letter !== start.letter);
  const decoys = [withIds(0, placements)];
  const source = optionSource();
  const sequence: PictographData[] = [start];
  for (const [index, step] of steps.entries()) {
    const options = await source.getNextOptionsForSequence(
      sequence,
      GridMode.DIAMOND
    );
    decoys.push(withIds(index + 1, spreadPicks(options, step.letter)));
    sequence.push(step);
  }
  return decoys;
}

describe("Construct preview choices", () => {
  it("bakes the moves the production pipeline offers in each box", async () => {
    const decoys = await buildDecoys();
    expect(decoys).toHaveLength(CONSTRUCT_MAX_SLOTS);
    for (const pair of decoys) {
      expect(pair).toHaveLength(CONSTRUCT_CHOICE_COUNT - 1);
    }
    await expect(`${JSON.stringify(decoys, null, 2)}\n`).toMatchFileSnapshot(
      CHOICES_FILE
    );
    expect(CONSTRUCT_DECOYS).toEqual(decoys);
  });

  it("offers moves that differ from the real step and from each other", () => {
    const real = [
      startPictograph(DEMO_SEQUENCE)!,
      ...openingSteps(DEMO_SEQUENCE, CONSTRUCT_MAX_SLOTS - 1),
    ];
    for (const [slot, pair] of CONSTRUCT_DECOYS.entries()) {
      const letters = [
        real[slot]!.letter,
        ...pair.map((decoy) => decoy.letter),
      ];
      expect(new Set(letters).size, `slot ${slot}: ${letters.join(" ")}`).toBe(
        CONSTRUCT_CHOICE_COUNT
      );
    }
  });
});

describe("Construct preview pick", () => {
  it("never puts neighboring boxes' real step in the same spot", () => {
    for (let play = 0; play < CONSTRUCT_CHOICE_COUNT; play++) {
      for (let slot = 1; slot < CONSTRUCT_MAX_SLOTS; slot++) {
        expect(constructPick(slot, play)).not.toBe(
          constructPick(slot - 1, play)
        );
      }
    }
  });

  it("steps the pick one spot left per box, keeping the finger's hops short", () => {
    expect([0, 1, 2, 3].map((slot) => constructPick(slot, 0))).toEqual([
      0, 2, 1, 0,
    ]);
    expect([0, 1, 2, 3].map((slot) => constructPick(slot, 1))).toEqual([
      1, 0, 2, 1,
    ]);
  });

  it("moves the first box's pick each turn", () => {
    expect([0, 1, 2, 3].map((play) => constructPick(0, play))).toEqual([
      0, 1, 2, 0,
    ]);
  });

  it("puts the other two moves in the spots the pick leaves", () => {
    expect(decoySpots(0)).toEqual([1, 2]);
    expect(decoySpots(1)).toEqual([0, 2]);
    expect(decoySpots(2)).toEqual([0, 1]);
  });
});
