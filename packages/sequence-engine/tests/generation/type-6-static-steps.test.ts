/**
 * Static (Type 6) steps under an explicit turn pattern.
 *
 * α, β and γ are static: neither hand moves, and prop rotation is the whole
 * point of them. The generator used to refuse them everywhere except a start
 * position, so a user who asked for a specific figure of turns could never get
 * one built. Now they are offered whenever the caller asked for particular
 * turns — a turn pattern or a layer target — and Type6Constraint decides step
 * by step whether the step in front of it actually carries any.
 *
 * The two things worth guarding are the two ways this can go wrong: a static
 * step showing up with no turns (which reads as standing still), and static
 * steps leaking into ordinary undirected generation (which is what the old
 * blanket exclusion was protecting against).
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

const STATIC_LETTERS = new Set(["α", "β", "γ"]);

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

type BuiltStep = {
  letter: string | null;
  startPlacement: string | null;
  endPlacement: string | null;
  motions: {
    left: { turns: number | "fl" | undefined };
    right: { turns: number | "fl" | undefined };
  };
};

function turnCount(turns: number | "fl" | undefined): number {
  if (turns === "fl") return 1;
  return turns ?? 0;
}

/**
 * Static steps are one letter family out of six and have to beat every other
 * candidate at their position, so a single build lands one only now and then.
 * Every assertion here therefore samples a run of builds: it is the only way
 * to ask "can this happen" and "does this ever happen wrong" without either
 * question resting on one roll.
 *
 * Only the steps after the start position count — the start is static by
 * design and says nothing about generation.
 */
function staticStepsAcrossBuilds(
  options: Record<string, unknown>,
  runs = 100
): { statics: BuiltStep[]; buildsWithStatics: number } {
  const build = builder();
  const statics: BuiltStep[] = [];
  let buildsWithStatics = 0;

  for (let run = 0; run < runs; run++) {
    const generated = build
      .build(options as never)
      .sequence.slice(1) as never as BuiltStep[];
    const found = generated.filter(
      (step) => step.letter !== null && STATIC_LETTERS.has(step.letter)
    );
    if (found.length > 0) buildsWithStatics++;
    statics.push(...found);
  }

  return { statics, buildsWithStatics };
}

const WITH_PATTERN = {
  length: 16,
  gridMode: "diamond",
  level: 3,
  turnPattern: { left: [1], right: [1] },
};

describe("SequenceBuilder — static (Type 6) steps", () => {
  it("builds static steps when a turn pattern asks for turns", () => {
    const { buildsWithStatics } = staticStepsAcrossBuilds(WITH_PATTERN);
    expect(buildsWithStatics).toBeGreaterThan(0);
  });

  it("never builds a static step without turns on at least one hand", () => {
    // Left turns only on the even indices and right never, so the generator has
    // to tell one step from the next rather than being handed turns
    // everywhere. A static landing on an odd index would be standing still.
    const { statics } = staticStepsAcrossBuilds({
      ...WITH_PATTERN,
      turnPattern: { left: [1, 0], right: [0] },
    });

    for (const step of statics) {
      const total =
        turnCount(step.motions.left.turns) + turnCount(step.motions.right.turns);
      expect(
        total,
        `static step ${step.letter} carried no turns`
      ).toBeGreaterThan(0);
    }
  });

  it("leaves a static step's position unchanged", () => {
    const { statics } = staticStepsAcrossBuilds(WITH_PATTERN);
    expect(statics.length).toBeGreaterThan(0);

    for (const step of statics) {
      expect(step.startPlacement).toBe(step.endPlacement);
    }
  });

  it("builds no static steps when nothing asked for particular turns", () => {
    const { statics } = staticStepsAcrossBuilds({
      length: 16,
      gridMode: "diamond",
      level: 3,
    });
    expect(statics).toEqual([]);
  });

  it("builds no static steps when the caller turns them off explicitly", () => {
    const { statics } = staticStepsAcrossBuilds({
      ...WITH_PATTERN,
      allowStaticSteps: false,
    });
    expect(statics).toEqual([]);
  });

  it("builds no static steps at level 1, even with a turn pattern", () => {
    // Level 1 has no turns to give, so a static step there would be a step of
    // standing still. Type6Constraint refuses it outright.
    const { statics } = staticStepsAcrossBuilds({
      ...WITH_PATTERN,
      level: 1,
    });
    expect(statics).toEqual([]);
  });
});
