/**
 * The claim that justifies putting the turn pattern into the build.
 *
 * A pattern could have been applied to the finished sequence, the way the
 * Actions panel already does. It goes into the search instead, and this is why:
 * the search picks the letters, and some letters cannot honour a pattern. Type 6
 * is the static family — lowercase alpha, beta and gamma, in which neither hand
 * travels anywhere. Give one of those no turns either and the step is a step in
 * which nothing at all happens. The search has to see the pattern while it is
 * still choosing, so it can choose something else.
 */
import { beforeAll, describe, expect, it } from "vitest";
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
      startPlacement: c[1]!,
      endPlacement: c[2]!,
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
      const key = `${p.letter}:${p.startPlacement}`;
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

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

/** The static family: both hands hold still for the whole step. */
const TYPE_6 = new Set(["α", "β", "γ"]);

type BuiltStep = {
  letter: string;
  motions: { left: { turns: unknown }; right: { turns: unknown } };
};

describe("a zeroed step gets a letter that can survive it", () => {
  it("places no static letter where the pattern asks for no turns", () => {
    // Every odd step is zeroed for both props. A static letter landing on one
    // would produce a step with no hand travel and no prop rotation.
    const result = builder().build({
      word: "ABCDABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      turnPattern: { left: [1.5, 0], right: [1.5, 0] },
    });

    const steps = result.sequence.slice(1) as never as BuiltStep[];
    expect(steps.length).toBeGreaterThan(0);

    for (const [i, step] of steps.entries()) {
      if (i % 2 !== 1) continue;
      expect(TYPE_6.has(step.letter), `step ${i} is ${step.letter}`).toBe(false);
    }
  });

  it("still honours the pattern it steered by", () => {
    // The point above is only worth anything if the turns it protected are the
    // ones that actually come out the far end.
    const result = builder().build({
      word: "ABCDABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      turnPattern: { left: [1.5, 0], right: [1.5, 0] },
    });

    const steps = result.sequence.slice(1) as never as BuiltStep[];
    for (const [i, step] of steps.entries()) {
      const expected = i % 2 === 0 ? 1.5 : 0;
      expect(step.motions.left.turns, `left step ${i}`).toBe(expected);
      expect(step.motions.right.turns, `right step ${i}`).toBe(expected);
    }
  });
});
