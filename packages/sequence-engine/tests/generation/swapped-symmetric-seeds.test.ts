/**
 * Swapped LOOPs of seeds whose hands are symmetric.
 *
 * Every diamond A and B puts the right hand on the left hand's path turned
 * 180°, every D, E, J and K mirrors it across the axis through the shared
 * point, and every P and Q across a diagonal (DiamondPictographDataframe.csv).
 * Swapping the hands of such a seed lands them exactly where the rotation or
 * reflection would, so the build is both LOOPs at once and the detector names
 * the positional one. No other seed exists for these words, so the builder
 * used to reroll 40 times and fail with "identity mismatch". It now returns
 * the swapped LOOP and notes the equivalent label.
 *
 * Every diamond G and H puts both hands on the same path, so a swap changes
 * nothing: the swapped half repeats the seed. That is not a swapped LOOP, and
 * the builder says so.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { SequenceBuilder } from "../../src/generation/index.js";
import { GenerationInfeasibleError } from "../../src/generation/builder/generation-infeasible-error.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import { loopSignalSteps } from "../../src/loop/detection/LOOPDetector.js";
import { labelsEquivalentForHalves } from "../../src/loop/detection/label-equivalence.js";
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

afterEach(() => {
  vi.restoreAllMocks();
});

type Step = {
  startPlacement?: string;
  endPlacement?: string;
  motions: Record<
    "left" | "right",
    { startOrientation?: unknown; endOrientation?: unknown }
  >;
};

function isSeamless(sequence: readonly unknown[]): boolean {
  const first = sequence[0] as Step;
  const last = sequence[sequence.length - 1] as Step;
  return (
    first.startPlacement === last.endPlacement &&
    first.motions.left.startOrientation === last.motions.left.endOrientation &&
    first.motions.right.startOrientation === last.motions.right.endOrientation
  );
}

const swappedRequest = (word: string, level: number) => () =>
  builder().build({
    word,
    gridMode: "diamond",
    level,
    constraintPreset: "smooth",
    loop: {
      type: LOOPType.SWAPPED,
      period: Period.HALVED,
      useTargetedGeneration: true,
    },
  });

describe("SequenceBuilder — swapped LOOPs of hand-symmetric seeds", () => {
  // The equivalent label depends on where the seed starts (D from beta1
  // mirrors north-south, from beta3 east-west), so only its family is fixed.
  const SYMMETRIC: Array<{ word: string; alias: RegExp }> = [
    { word: "D", alias: /^(mirrored|flipped) \(/ },
    { word: "E", alias: /^(mirrored|flipped) \(/ },
    { word: "J", alias: /^(mirrored|flipped) \(/ },
    { word: "K", alias: /^(mirrored|flipped) \(/ },
    {
      word: "P",
      alias: /^mirrored \(north(east|west)-south(west|east) axis\)$/,
    },
    {
      word: "Q",
      alias: /^mirrored \(north(east|west)-south(west|east) axis\)$/,
    },
    { word: "AA", alias: /^rotated$/ },
    { word: "BA", alias: /^rotated$/ },
  ];
  for (const { word, alias } of SYMMETRIC) {
    for (const level of [1, 2]) {
      it(`${word} builds as a swapped LOOP at level ${level}`, () => {
        const result = swappedRequest(word, level)();

        expect(isSeamless(result.sequence)).toBe(true);
        expect(result.loop?.equivalentLabels).toHaveLength(1);
        expect(result.loop!.equivalentLabels![0]).toMatch(alias);
        // The swap itself holds on every half-pair the detector reads.
        expect(
          labelsEquivalentForHalves(
            loopSignalSteps(result.sequence),
            { components: ["swapped"] },
            { components: ["swapped"] }
          )
        ).toBe(true);
      });
    }
  }
});

describe("SequenceBuilder — a swap that changes nothing", () => {
  for (const word of ["GG", "HG"]) {
    for (const level of [1, 2]) {
      it(`${word} at level ${level} names the reason`, () => {
        const attempt = swappedRequest(word, level);
        expect(attempt).toThrow(GenerationInfeasibleError);
        expect(attempt).toThrow(
          `"${word}" cannot form a swapped LOOP: both hands follow the same ` +
            `path in every step, so swapping them changes nothing`
        );
      });
    }
  }
});

/** Deterministic Math.random so a build can be fingerprinted. */
function seedRandom(seed: number) {
  let a = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

function fingerprint(sequence: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(sequence)).digest("hex");
}

describe("SequenceBuilder — other LOOP builds are untouched", () => {
  // Fingerprints taken on the engine before this change (cef5a61d55's tree).
  // The length builds reroll past rejected seeds before they pass (the
  // reroll count is in the name), so they also prove the new checks on a
  // rejected attempt leave the random stream alone.
  const BUILDS: Array<{
    name: string;
    word?: string;
    length?: number;
    type: LOOPType;
    level: number;
    seed: number;
    sha: string;
  }> = [
    {
      name: "AJGE swapped",
      word: "AJGE",
      type: LOOPType.SWAPPED,
      level: 2,
      seed: 20261022,
      sha: "459472b5e63e1b3c61c1d204fa076642a7655796ef9a5d1a763925154dd79a07",
    },
    {
      name: "DA swapped (mixed symmetry)",
      word: "DA",
      type: LOOPType.SWAPPED,
      level: 1,
      seed: 20261022,
      sha: "2cddce54ee44a5061fc2aa55079e7ccb0c986820b4aaff2ace779dcf47dd8a79",
    },
    {
      name: "ABCD inverted",
      word: "ABCD",
      type: LOOPType.INVERTED,
      level: 1,
      seed: 20261022,
      sha: "014237239207ad63d515422512b16a81ebd89fb33cd01d9418b8bd652f1ee364",
    },
    {
      name: "4-step mirrored",
      length: 4,
      type: LOOPType.MIRRORED,
      level: 2,
      seed: 20261022,
      sha: "78829ea6045a5dde4ce078b2a817b70ec31ca90aeb6c8e8a6e0389bbaf494c9d",
    },
    {
      name: "4-step rotated",
      length: 4,
      type: LOOPType.ROTATED,
      level: 1,
      seed: 20261022,
      sha: "837131f6fe3fbfc6cec8218c7c1c54654ac13f31ac924b7888e26ccd5d49beab",
    },
    {
      name: "2-step swapped, 2 rerolls",
      length: 2,
      type: LOOPType.SWAPPED,
      level: 1,
      seed: 5,
      sha: "6ecd37905e422829d180372f50af3ff0f9e0e18d0ac03539e8d5628de9bb52d9",
    },
    {
      name: "2-step swapped, 4 rerolls",
      length: 2,
      type: LOOPType.SWAPPED,
      level: 2,
      seed: 2,
      sha: "1eae57e9253629f2055ea3acd3d8e876f3c5a5dbdb6dfb7588375efe36f5f8f9",
    },
    {
      name: "3-step swapped, 1 reroll",
      length: 3,
      type: LOOPType.SWAPPED,
      level: 2,
      seed: 2,
      sha: "d3ce8f61ca98be9c754f759eed4a03222081f89b33ce5f781184f1a7c3939271",
    },
  ];
  for (const { name, word, length, type, level, seed, sha } of BUILDS) {
    it(`${name} at level ${level} builds as before`, () => {
      seedRandom(seed);
      const result = builder().build({
        ...(word ? { word } : { length }),
        gridMode: "diamond",
        level,
        constraintPreset: "smooth",
        loop: { type, period: Period.HALVED, useTargetedGeneration: true },
      });
      expect(fingerprint(result.sequence)).toBe(sha);
      expect(result.loop?.equivalentLabels).toBeUndefined();
    });
  }
});
