/**
 * Bridge steps get turns like every other step.
 *
 * A word is spelled letter by letter, but two letters with no direct
 * transition get a bridge step (or several) between them, so the sequence
 * comes back longer than the word. Random turns used to be rolled up front
 * for the letter count, so every step past that count, bridges and the
 * letters after them alike, came out with no turns at all: WXYZ×4 built 31
 * steps with the last 15 turnless. These run the production dataframe and
 * letter mappings through the real builder.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "../../src/generation/index.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import {
  formatSignature,
  layerSignature,
  isLayerClosed,
  layerPatternOf,
  parsePattern,
  signatureFromPattern,
  type LayerPattern,
} from "../../src/core/orientation/layer-signature.js";
import {
  detectLOOPFromSteps,
  isSequenceCircular,
} from "../../src/loop/detection/LOOPDetector.js";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS_PATH = path.resolve(
  __dirname,
  "../../../../static/data/learn/letter-mappings.json"
);

const variations = loadDiamondVariations();
const builder = () => new SequenceBuilder(new CsvVariationProvider(variations));

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

type Turned = {
  motions: {
    left: { turns: unknown; endOrientation: unknown };
    right: { turns: unknown; endOrientation: unknown };
  };
};

function turnless(sequence: readonly unknown[]): number[] {
  const steps = sequence.slice(1) as Turned[];
  return steps.flatMap((step, i) =>
    step.motions.left.turns === undefined ||
    step.motions.right.turns === undefined
      ? [i]
      : []
  );
}

const POOLS: Record<number, readonly unknown[]> = {
  2: [0, 1, 2, 3],
  3: [0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"],
};

describe("SequenceBuilder — turns on bridge steps", () => {
  const WORDS = ["WXYZWXYZWXYZWXYZ", "ABCDABCDABCDABCD"];

  for (const word of WORDS) {
    for (const level of [2, 3]) {
      it(`turns every step of ${word} at level ${level}`, () => {
        const result = builder().build({
          word,
          gridMode: "diamond",
          level,
          constraintPreset: "smooth",
        });

        // The word must actually need bridges, or this proves nothing.
        expect(result.bridgeStepIndices.length).toBeGreaterThan(0);
        expect(result.sequence.length - 1).toBeGreaterThan(word.length);
        expect(turnless(result.sequence)).toEqual([]);

        // Bridge turns come from the same level pool as the letters'. A float
        // that could not float materializes as 0, which the pool covers.
        for (const step of result.sequence.slice(1) as Turned[]) {
          expect(POOLS[level]).toContain(step.motions.left.turns);
          expect(POOLS[level]).toContain(step.motions.right.turns);
        }
        // And the reported allocation describes the steps that were built.
        expect(result.turnAllocation.left).toHaveLength(
          result.sequence.length - 1
        );
      });
    }
  }

  it("shapes the layers of a whole bridged word, bridges included", () => {
    // The pattern names the word's eight letters. The built sequence is longer,
    // and every step of it is accounted for: letters walk the pattern, bridges
    // hold their layer, and nothing is left turnless at the end.
    const word = "WXYZWXYZ";
    const wanted = parsePattern("1:XB.RXB.R")!;
    const result = builder().build({
      word,
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: wanted,
    });

    const steps = result.sequence.slice(1) as Array<
      Turned & { isBridge?: boolean }
    >;
    expect(result.bridgeStepIndices.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(word.length);
    expect(turnless(result.sequence)).toEqual([]);

    // Spread the pattern over the built steps the same way: a bridge is ".".
    let next = 0;
    const spread: LayerPattern = {
      ...wanted,
      flips: steps.map((step) => (step.isBridge ? "." : wanted.flips[next++]!)),
    };
    expect(next).toBe(wanted.flips.length);
    expect(formatSignature(layerSignature(steps as never))).toBe(
      formatSignature(signatureFromPattern(spread))
    );

    // The pattern is closed, so the bridged sequence comes home too.
    expect(isLayerClosed(wanted)).toBe(true);
    expect(isLayerClosed(layerPatternOf(steps as never))).toBe(true);
  });

  it("still closes a rotated LOOP built on a bridged word", () => {
    // ABCDABCD needs bridges and still closes. (WXYZ and ABCD on their own do
    // not close as a rotated LOOP, before or after this change: a bridge
    // before the last letter lands it off the closing placement.)
    const result = builder().build({
      word: "ABCDABCD",
      gridMode: "diamond",
      level: 2,
      constraintPreset: "smooth",
      loop: {
        type: LOOPType.ROTATED,
        period: Period.HALVED,
        useTargetedGeneration: true,
      },
    });

    expect(result.bridgeStepIndices.length).toBeGreaterThan(0);
    expect(turnless(result.sequence)).toEqual([]);
    expect(isSequenceCircular(result.sequence)).toBe(true);
    expect(detectLOOPFromSteps(result.sequence).components).toContain(
      "rotated"
    );

    // Seamless: each prop ends in the orientation it started in.
    const first = result.sequence[0] as Turned;
    const last = result.sequence[result.sequence.length - 1] as Turned;
    expect(last.motions.left.endOrientation).toBe(
      first.motions.left.endOrientation
    );
    expect(last.motions.right.endOrientation).toBe(
      first.motions.right.endOrientation
    );
  });
});
