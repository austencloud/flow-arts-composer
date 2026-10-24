/**
 * Bridged words close as the LOOP they were asked for.
 *
 * A word whose letters have no direct transition gets bridge steps between
 * them, so the built sequence is longer than the word. The LOOP closure goal
 * (the requested variation of the start placement) belongs to the last BUILT
 * step, not to the last letter: a bridge before the final letter used to land
 * that letter off the closing placement, and WXYZ, ABCD and WY failed every
 * rotated, mirrored, swapped and inverted request. These run the production
 * dataframe and letter mappings through the real builder.
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
import { detectLOOPFromSteps } from "../../src/loop/detection/LOOPDetector.js";
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
  isBridge?: boolean;
  motions: Record<
    "left" | "right",
    { startOrientation?: unknown; endOrientation?: unknown }
  >;
};

/** The engine-side twin of the app's isSeamlesslyLoopable: placement and
 * both props' orientations return to where the sequence began. */
function isSeamless(sequence: readonly unknown[]): boolean {
  const first = sequence[0] as Step;
  const last = sequence[sequence.length - 1] as Step;
  return (
    first.startPlacement === last.endPlacement &&
    first.motions.left.startOrientation === last.motions.left.endOrientation &&
    first.motions.right.startOrientation === last.motions.right.endOrientation
  );
}

const CASES: Array<{
  name: string;
  type: LOOPType;
  period: Period;
  component: string;
}> = [
  {
    name: "rotated halved",
    type: LOOPType.ROTATED,
    period: Period.HALVED,
    component: "rotated",
  },
  {
    name: "rotated quartered",
    type: LOOPType.ROTATED,
    period: Period.QUARTERED,
    component: "rotated",
  },
  {
    name: "mirrored",
    type: LOOPType.MIRRORED,
    period: Period.HALVED,
    component: "mirrored",
  },
  {
    name: "swapped",
    type: LOOPType.SWAPPED,
    period: Period.HALVED,
    component: "swapped",
  },
  {
    name: "inverted",
    type: LOOPType.INVERTED,
    period: Period.HALVED,
    component: "inverted",
  },
];

describe("SequenceBuilder — bridged words close as LOOPs", () => {
  for (const word of ["WXYZ", "ABCD", "WY"]) {
    for (const loop of CASES) {
      for (const level of [1, 2]) {
        it(`${word} closes as a ${loop.name} LOOP at level ${level}`, () => {
          const result = builder().build({
            word,
            gridMode: "diamond",
            level,
            constraintPreset: "smooth",
            loop: {
              type: loop.type,
              period: loop.period,
              useTargetedGeneration: true,
            },
          });

          // The seed must actually carry a bridge, or this proves nothing.
          expect(result.bridgeStepIndices.length).toBeGreaterThan(0);
          expect(isSeamless(result.sequence)).toBe(true);
          expect(
            detectLOOPFromSteps(result.sequence as never).components
          ).toContain(loop.component);
        });
      }
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

describe("SequenceBuilder — builds without a closing goal are untouched", () => {
  // Fingerprints taken on the engine before the closing fix (61f0dcadfa's
  // tree). A word whose letters all connect directly never reaches the bridge
  // code, and a build without a LOOP has no closing placement to aim for, so
  // the fix must leave both byte for byte as they were.
  const BUILDS: Array<{
    word: string;
    loop: boolean;
    sha: string;
    bridges?: number[];
  }> = [
    {
      word: "AJGE",
      loop: false,
      sha: "36103b1b1a1bab5eb8497575df996a3f98e619f84e591ba40f1e6eda64cbebc8",
    },
    {
      word: "MNOP",
      loop: false,
      sha: "23abb4d4c8e436682b682286a338a7a48cb6ec90554238fb2bc08833c18c4b94",
    },
    {
      word: "AJGE",
      loop: true,
      sha: "36d0e596fdfe0f5885f74c3d6e76f3512184ccae6a7cbe703a6ffc5c86da35f7",
    },
    {
      word: "MNOP",
      loop: true,
      sha: "8e3230ef46cc4ba8d1219125050679ec13a75e498c8b02df35f72501f75f4525",
    },
    {
      word: "WXYZ",
      loop: false,
      sha: "6ed95b030a40e8e664bf3ee37aacd25dc3c76c6244f0d991fde7fde129e5cf0a",
      bridges: [2, 4, 6],
    },
    {
      word: "ABCDABCD",
      loop: false,
      sha: "cb2c9ab87f5a48d15503ca7d2c8b457d4e639baf92ce866c62b51587e33b12ed",
      bridges: [4, 9],
    },
  ];
  for (const { word, loop, sha, bridges = [] } of BUILDS) {
    it(`${word}${loop ? " as a rotated LOOP" : ""} builds as before`, () => {
      seedRandom(20261022);
      const result = builder().build({
        word,
        gridMode: "diamond",
        level: 2,
        constraintPreset: "smooth",
        ...(loop
          ? {
              loop: {
                type: LOOPType.ROTATED,
                period: Period.HALVED,
                useTargetedGeneration: true,
              },
            }
          : {}),
      });
      expect(result.bridgeStepIndices).toEqual(bridges);
      expect(fingerprint(result.sequence)).toBe(sha);
    });
  }
});

describe("SequenceBuilder — a word the data cannot close", () => {
  it("names the word, the LOOP and the placement gap", () => {
    // A runs alpha to alpha, one placement over either way
    // (DiamondPictographDataframe.csv: from alpha1 it ends at alpha3 or
    // alpha7), so it never reaches the half-turn placement a rotated LOOP
    // closes on, and A to A needs no bridge that could carry it there.
    const attempt = () =>
      builder().build({
        word: "A",
        gridMode: "diamond",
        level: 1,
        constraintPreset: "smooth",
        loop: {
          type: LOOPType.ROTATED,
          period: Period.HALVED,
          useTargetedGeneration: true,
        },
      });
    expect(attempt).toThrow(GenerationInfeasibleError);
    expect(attempt).toThrow(
      /"A" cannot close as a rotated LOOP: from alpha\d it ends at alpha\d\/alpha\d but must end at alpha\d/
    );
  });
});
