/**
 * Asking the real builder to use a turn pattern.
 *
 * The point being proved here is about length. Turn allocation has always been
 * eager and sized to the word, but the search inserts bridge steps between
 * letters that have no direct transition, so the finished sequence is longer
 * than the word and its trailing steps come back with no turns at all. A
 * pattern is a period rather than an array: it is read modulo its own length,
 * so it has an answer at every index that will ever exist.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "../../src/generation/index.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData } from "../../src/generation/constraints/types.js";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(
  __dirname,
  "../../../../static/data/pictographs/DiamondPictographDataframe.csv"
);
const MAPPINGS_PATH = path.resolve(
  __dirname,
  "../../../../static/data/learn/letter-mappings.json"
);

function loadVariations(csvPath: string): PictographData[] {
  const lines = readFileSync(csvPath, "utf8").split("\n");
  const out: PictographData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPosition: c[1]!,
      endPosition: c[2]!,
      timing: c[3]!,
      direction: c[4]!,
      leftMotion: {
        hand: "left",
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        hand: "right",
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
        startOrientation: "in",
        endOrientation: "in",
      },
    } as unknown as PictographData);
  }
  return out;
}

class CsvVariationProvider implements IVariationProvider {
  private readonly index = new Map<string, PictographData[]>();

  constructor(private readonly data: PictographData[]) {
    for (const p of data) {
      const key = `${p.letter}:${p.startPosition}`;
      const bucket = this.index.get(key);
      if (bucket) bucket.push(p);
      else this.index.set(key, [p]);
    }
  }

  getVariations(letter: string, position: string): PictographData[] {
    return this.index.get(`${letter}:${position}`) ?? [];
  }

  getAllVariations(): PictographData[] {
    return this.data;
  }
}

function builder(): SequenceBuilder {
  return new SequenceBuilder(new CsvVariationProvider(loadVariations(CSV_PATH)));
}

it("preserves Level 2 turns through freeform generation and short LOOP expansion", () => {
  let seed = 42;
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  try {
    for (const looping of [false, true]) {
      for (let i = 0; i < 30; i++) {
        const result = builder().build({
          length: looping ? 2 : 8,
          level: 2,
          gridMode: "diamond",
          maxTurnIntensity: 1,
          constraintOptions: {
            propContinuity: "maximize",
            handPathContinuity: "allow-reversals",
          },
          ...(looping ? {
            loop: {
              type: LOOPType.ROTATED,
              period: Period.QUARTERED,
              useTargetedGeneration: true,
              requestedTotalLength: 8,
            },
          } : {}),
        });
        const steps = result.sequence.slice(1);
        const turns = steps.flatMap((s) => [s.motions.left.turns, s.motions.right.turns]);
        expect(steps).toHaveLength(8);
        expect(turns.some((turn) => turn === 1)).toBe(true);
        expect(turns.every((turn) => turn === 0 || turn === 1)).toBe(true);
      }
    }
  } finally {
    random.mockRestore();
  }
});

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

type TurnedStep = {
  motions: { left: { turns: unknown }; right: { turns: unknown } };
};

describe("SequenceBuilder — turnPattern", () => {
  it("gives every step a turn, including the bridges a word needs", () => {
    const result = builder().build({
      word: "WXYZWXYZWXYZWXYZ",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      turnPattern: { left: [0, 1.5], right: [0.5] },
    });

    const steps = result.sequence.slice(1) as never as TurnedStep[];

    // The word is 16 letters; bridges make the sequence longer than that.
    expect(steps.length).toBeGreaterThan(16);

    for (const [i, step] of steps.entries()) {
      expect(step.motions.left.turns, `left step ${i}`).toBeDefined();
      expect(step.motions.right.turns, `right step ${i}`).toBeDefined();
    }
  });

  it("repeats the period across the whole sequence", () => {
    const result = builder().build({
      word: "ABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      turnPattern: { left: [0, 2], right: [1] },
    });

    const steps = result.sequence.slice(1) as never as TurnedStep[];

    for (const [i, step] of steps.entries()) {
      expect(step.motions.right.turns, `right step ${i}`).toBe(1);
    }
  });
});
