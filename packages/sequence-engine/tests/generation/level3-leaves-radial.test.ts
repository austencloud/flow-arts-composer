/**
 * Level 3 means the sequence leaves radial somewhere.
 *
 * The difficulty badge grades a sequence level 3 only when some prop sits in a
 * clock or counter orientation. Turn allocation rolls each step from the level
 * 3 pool at random, so it could miss every half turn and hand back a sequence
 * that is level 3 in name and level 2 on the badge. `ensureLayerCrossing` is
 * the guarantee: after the search, if nothing crosses, one prop is given a half
 * turn out and another back (or, outside a LOOP, a single half turn when no
 * pair fits), and a LOOP seed with no room for that is rerolled. These tests
 * check the helper on hand-built steps, then drive the real builder many times
 * and read the orientations it propagated.
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
import { flipsLayer } from "../../src/core/orientation/layer-signature.js";
import {
  calculateEndOrientation,
  RADIAL_CW_CYCLE,
} from "../../src/core/orientation/OrientationCalculator.js";
import { ensureLayerCrossing } from "../../src/generation/turns/layer-targeting.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import {
  OrientationCalculator,
  OrientationPropagator,
} from "../../src/core/orientation/OrientationPropagator.js";
import type {
  SequenceStep,
  Motion,
} from "../../src/core/types/sequence-engine-types.js";

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

let variations: PictographData[];

beforeAll(async () => {
  variations = loadVariations(CSV_PATH);
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

function builder(): SequenceBuilder {
  return new SequenceBuilder(new CsvVariationProvider(variations));
}

const NON_RADIAL = new Set(["clock", "counter"]);

function leavesRadial(sequence: readonly SequenceStep[]): boolean {
  return sequence.some((step) =>
    [step.motions.left, step.motions.right].some(
      (m) =>
        NON_RADIAL.has(String(m.startOrientation)) ||
        NON_RADIAL.has(String(m.endOrientation))
    )
  );
}

// Hand-built steps

const SHIFT_PATHS: Array<[string, string]> = [
  ["s", "w"],
  ["w", "n"],
  ["n", "e"],
  ["e", "s"],
];

function motion(index: number, overrides: Partial<Motion> = {}): Motion {
  const [start, end] = SHIFT_PATHS[index % SHIFT_PATHS.length]!;
  return {
    motionType: "pro",
    startLocation: start,
    endLocation: end,
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "in",
    turns: 1,
    ...overrides,
  } as Motion;
}

function steps(
  length: number,
  overrides: Partial<Motion> = {}
): SequenceStep[] {
  const out: SequenceStep[] = [];
  for (let i = 0; i <= length; i++) {
    out.push({
      id: `step-${i}`,
      letter: null,
      startPlacement: null,
      endPlacement: null,
      stepNumber: i,
      duration: 1,
      motions: {
        left: motion(i, i === 0 ? { turns: 0 } : overrides),
        right: motion(i + 2, i === 0 ? { turns: 0 } : overrides),
      },
    } as SequenceStep);
  }
  return out;
}

function crossings(
  list: readonly SequenceStep[]
): Array<[number, "left" | "right"]> {
  const out: Array<[number, "left" | "right"]> = [];
  for (let i = 1; i < list.length; i++) {
    for (const hand of ["left", "right"] as const) {
      if (flipsLayer(list[i]!.motions[hand])) out.push([i, hand]);
    }
  }
  return out;
}

/** Where each prop ends up after the whole sequence, as a point on the cycle. */
function netShift(
  list: readonly SequenceStep[],
  hand: "left" | "right"
): number {
  // Where the prop finishes on the eight-point cycle, starting from "in",
  // by the same calculator propagation uses.
  let orientation = "in";
  for (let i = 1; i < list.length; i++) {
    const motion = list[i]!.motions[hand];
    orientation = calculateEndOrientation({
      motionType: motion.motionType,
      turns: motion.turns ?? 0,
      rotationDirection: motion.rotationDirection || "cw",
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      startOrientation: orientation,
    });
  }
  return RADIAL_CW_CYCLE.indexOf(orientation as never);
}

describe("ensureLayerCrossing", () => {
  it("gives an all-whole-turn level 3 sequence a crossing out and back on one prop", () => {
    const input = steps(4);
    expect(crossings(input)).toHaveLength(0);
    const result = ensureLayerCrossing(input, {
      level: 3,
      maxTurnIntensity: 3,
    });
    expect(result.satisfied).toBe(true);
    const found = crossings(result.steps);
    expect(found).toHaveLength(2);
    expect(found[0]![1]).toBe(found[1]![1]);
    expect(found[0]![0]).not.toBe(found[1]![0]);
    expect(found[0]![0]).toBeGreaterThanOrEqual(1);
  });

  it("leaves each prop ending where it would have, so a LOOP closes on time", () => {
    // Room for 0.5 and 1.5 either side of each whole turn, so the prop can
    // go out one way and come back the other.
    for (let n = 0; n < 40; n++) {
      const input = steps(4);
      const result = ensureLayerCrossing(input, {
        level: 3,
        maxTurnIntensity: 2,
        keepClosure: true,
      });
      expect(result.satisfied).toBe(true);
      expect(netShift(result.steps, "left")).toBe(netShift(input, "left"));
      expect(netShift(result.steps, "right")).toBe(netShift(input, "right"));
    }
  });

  it("ends every prop in the same orientation by the real propagator", () => {
    // Mixed motion types, spins and whole turns, read back through the
    // engine's own propagator, the path the builder takes.
    const types = ["pro", "anti", "pro", "anti"] as const;
    const spins = ["cw", "ccw", "ccw", "cw"] as const;
    const propagator = new OrientationPropagator(new OrientationCalculator());
    const ends = (list: SequenceStep[]) => {
      let p = propagator.propagateForColor([...list], "left", "in");
      p = propagator.propagateForColor(p, "right", "in");
      const last = p[p.length - 1]!.motions;
      return [last.left.endOrientation, last.right.endOrientation];
    };
    for (let n = 0; n < 60; n++) {
      const input = steps(4).map((step, i) =>
        i === 0
          ? step
          : {
              ...step,
              motions: {
                left: motion(i, {
                  motionType: types[i % 4] as Motion["motionType"],
                  rotationDirection: spins[
                    i % 4
                  ] as Motion["rotationDirection"],
                  turns: (n + i) % 2,
                }),
                right: motion(i + 2, {
                  motionType: types[(i + 1) % 4] as Motion["motionType"],
                  rotationDirection: spins[
                    (i + n) % 4
                  ] as Motion["rotationDirection"],
                  turns: (n + i + 1) % 2,
                }),
              },
            }
      );
      const result = ensureLayerCrossing(input, {
        level: 3,
        maxTurnIntensity: 1,
        keepClosure: true,
      });
      expect(result.satisfied).toBe(true);
      expect(crossings(result.steps).length).toBeGreaterThan(0);
      expect(ends(result.steps)).toEqual(ends(input));
    }
  });

  it("does not always pick the same steps", () => {
    const picked = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const result = ensureLayerCrossing(steps(4), { level: 3 });
      picked.add(
        crossings(result.steps)
          .map(([i, h]) => `${i}${h}`)
          .join()
      );
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it("falls back to a single crossing when there is only one step", () => {
    const result = ensureLayerCrossing(steps(1), { level: 3 });
    expect(result.satisfied).toBe(true);
    expect(crossings(result.steps)).toHaveLength(1);
  });

  it("leaves a one-step LOOP seed alone rather than change where it closes", () => {
    const input = steps(1);
    const result = ensureLayerCrossing(input, { level: 3, keepClosure: true });
    expect(result.satisfied).toBe(false);
    expect(result.misses.length).toBeGreaterThan(0);
    expect(result.steps).toEqual(input);
  });

  it("leaves level 2 untouched", () => {
    const input = steps(4);
    const result = ensureLayerCrossing(input, {
      level: 2,
      maxTurnIntensity: 3,
    });
    expect(result.steps).toEqual(input);
    expect(crossings(result.steps)).toHaveLength(0);
  });

  it("leaves a sequence that already crosses untouched", () => {
    const input = steps(4);
    input[2] = {
      ...input[2]!,
      motions: { ...input[2]!.motions, left: motion(2, { turns: 1.5 }) },
    };
    const result = ensureLayerCrossing(input, { level: 3 });
    expect(result.satisfied).toBe(true);
    expect(result.steps).toEqual(input);
  });

  it("crosses both hands on the same steps with equal turns when hands are matched", () => {
    for (let n = 0; n < 20; n++) {
      const input = steps(4);
      const result = ensureLayerCrossing(input, {
        level: 3,
        matchHands: true,
      });
      expect(result.satisfied).toBe(true);
      const found = crossings(result.steps);
      expect(found).toHaveLength(4);
      const crossed = new Set(found.map(([i]) => i));
      expect(crossed.size).toBe(2);
      for (const i of crossed) {
        const step = result.steps[i]!;
        expect(step.motions.left.turns).toBe(step.motions.right.turns);
      }
      expect(netShift(result.steps, "left")).toBe(netShift(input, "left"));
      expect(netShift(result.steps, "right")).toBe(netShift(input, "right"));
    }
  });

  it("gives a held dash or static a rotation direction when it takes the turn", () => {
    const input = steps(2, {
      motionType: "static" as Motion["motionType"],
      rotationDirection: "noRotation" as Motion["rotationDirection"],
      turns: 0,
    });
    const result = ensureLayerCrossing(input, { level: 3 });
    expect(result.satisfied).toBe(true);
    for (const [i, hand] of crossings(result.steps)) {
      expect(result.steps[i]!.motions[hand].rotationDirection).not.toBe(
        "noRotation"
      );
    }
  });

  it("reports a miss when the pool has no half turn", () => {
    const input = steps(4, { turns: 0 });
    const result = ensureLayerCrossing(input, {
      level: 3,
      maxTurnIntensity: 0,
    });
    expect(result.satisfied).toBe(false);
    expect(result.misses.length).toBeGreaterThan(0);
    expect(result.steps).toEqual(input);
  });
});

// The real builder

const ROTATED_HALVED = {
  length: 4,
  gridMode: "diamond",
  level: 3,
  maxTurnIntensity: 1,
  constraintOptions: {
    propContinuity: "maximize",
    handPathContinuity: "maximize",
  },
  loop: {
    type: LOOPType.ROTATED,
    period: Period.HALVED,
    useTargetedGeneration: true,
    requestedTotalLength: 8,
  },
} as const;

function countRadialOnly(options: object, runs: number): number {
  let radialOnly = 0;
  for (let n = 0; n < runs; n++) {
    const result = builder().build(options as never);
    if (!leavesRadial(result.sequence)) radialOnly++;
  }
  return radialOnly;
}

describe("SequenceBuilder — level 3 leaves radial", () => {
  it("rotated halved LOOP", () => {
    expect(countRadialOnly(ROTATED_HALVED, 60)).toBe(0);
  }, 60_000);

  it("rotated halved LOOP with matched hand turns", () => {
    expect(
      countRadialOnly({ ...ROTATED_HALVED, matchHandTurns: true }, 60)
    ).toBe(0);
  }, 60_000);

  it("rotated quartered LOOP", () => {
    const options = {
      ...ROTATED_HALVED,
      length: 2,
      loop: { ...ROTATED_HALVED.loop, period: Period.QUARTERED },
    };
    expect(countRadialOnly(options, 60)).toBe(0);
  }, 60_000);

  it("rotated swapped halved LOOP still closes on time", () => {
    // A lone half turn would leave a prop a quarter round at the end of the
    // seed, so the LOOP would need more passes than the 8 steps allow and
    // the retry would get stuck regenerating shorter seeds. The out-and-back
    // pair keeps the closure the seed already had.
    //
    // This LOOP type gives up after 40 rerolls now and then with or without
    // the crossing (about 1 build in 600 measured before this change), so a
    // rare throw is tolerated; every build that does come back is checked.
    const options = {
      ...ROTATED_HALVED,
      loop: { ...ROTATED_HALVED.loop, type: LOOPType.ROTATED_SWAPPED },
    };
    let built = 0;
    for (let n = 0; n < 30; n++) {
      let result;
      try {
        result = builder().build(options as never);
      } catch (error) {
        expect(String(error)).toMatch(/Unable to generate a valid/);
        continue;
      }
      built++;
      expect(result.sequence.length - 1).toBe(8);
      expect(leavesRadial(result.sequence)).toBe(true);
    }
    expect(built).toBeGreaterThanOrEqual(28);
  }, 60_000);

  it("freeform", () => {
    const options = {
      length: 4,
      gridMode: "diamond",
      level: 3,
      maxTurnIntensity: 1,
    };
    expect(countRadialOnly(options, 60)).toBe(0);
  }, 60_000);

  it("level 2 stays radial", () => {
    let nonRadial = 0;
    for (let n = 0; n < 30; n++) {
      const result = builder().build({ ...ROTATED_HALVED, level: 2 } as never);
      if (leavesRadial(result.sequence)) nonRadial++;
    }
    expect(nonRadial).toBe(0);
  }, 60_000);
});
