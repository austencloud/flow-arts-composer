import { describe, expect, it, vi } from "vitest";
import { LOOPComponent } from "@tka/sequence-engine/loop";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  DEFAULT_SOLO_LOOP_RECIPE,
  chooseFuseFlowerGenerationVariation,
  fitSoloPathToLoop,
  flowerMatchesRecipe,
  generateSoloLoop,
  generateRewoundSoloLoopFromMotions,
  generateStructuredSoloLoopFromMotions,
  reverseSoloLoopTraversal,
} from "#lib/features/fuse/services/solo-loop-generator.js";
import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";

const templates = [
  createMotionData({
    hand: HandSide.LEFT,
    gridMode: GridMode.DIAMOND,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 1,
  }),
  createMotionData({
    hand: HandSide.RIGHT,
    gridMode: GridMode.DIAMOND,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.SOUTH,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
  }),
];

const ringTemplates = [
  ...templates,
  createMotionData({
    hand: HandSide.LEFT,
    gridMode: GridMode.DIAMOND,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
  }),
  createMotionData({
    hand: HandSide.RIGHT,
    gridMode: GridMode.DIAMOND,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.WEST,
    endLocation: GridLocation.NORTH,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
  }),
];

const boxRingTemplates = [
  createMotionData({
    hand: HandSide.LEFT,
    gridMode: GridMode.BOX,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTHEAST,
    endLocation: GridLocation.SOUTHEAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
  }),
  createMotionData({
    hand: HandSide.RIGHT,
    gridMode: GridMode.BOX,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.SOUTHEAST,
    endLocation: GridLocation.SOUTHWEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
  }),
  createMotionData({
    hand: HandSide.LEFT,
    gridMode: GridMode.BOX,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTHWEST,
    endLocation: GridLocation.NORTHWEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
  }),
  createMotionData({
    hand: HandSide.RIGHT,
    gridMode: GridMode.BOX,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.NORTHWEST,
    endLocation: GridLocation.NORTHEAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
  }),
];

function makeRecipe(overrides: Partial<typeof DEFAULT_SOLO_LOOP_RECIPE> = {}) {
  return { ...DEFAULT_SOLO_LOOP_RECIPE, ...overrides };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("Fuse solo LOOP generator", () => {
  it("creates an exact-length loop without any paired sequence input", () => {
    const generated = generateRewoundSoloLoopFromMotions(templates, 4, () => 0);

    expect(generated.solo.steps).toHaveLength(4);
    expect(generated.solo.steps[0]!.startLocation).toBe(
      generated.solo.steps[3]!.endLocation
    );
    expect(generated.solo.steps[0]!.startOrientation).toBe(
      generated.solo.steps[3]!.endOrientation
    );
    expect(generated.loopSpec[LOOPComponent.REWOUND]).toEqual({ period: 2 });
  });

  it("rejects lengths that cannot close through a period-two LOOP", () => {
    expect(() => generateRewoundSoloLoopFromMotions(templates, 3)).toThrow(
      /positive even length/
    );
  });

  it("generates a transformed solo LOOP before using the rewound fallback", () => {
    const generated = generateStructuredSoloLoopFromMotions(
      templates,
      4,
      () => 0
    );

    expect(generated.loopSpec[LOOPComponent.ROTATED]).toEqual({ period: 4 });
    expect(generated.solo.steps.map((step) => step.startLocation)).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
    ]);
  });

  it("uses the canonical four-count source instead of inventing a path", async () => {
    const source = generateStructuredSoloLoopFromMotions(
      templates,
      4,
      () => 0
    ).solo;
    const loadFourCountSolo = vi.fn(async () => source);

    const requestedRecipe = makeRecipe({ level: 2, maxTurnIntensity: 1 });
    const random = () => 0.75;
    const generated = await generateSoloLoop(
      4,
      requestedRecipe,
      random,
      loadFourCountSolo
    );

    expect(loadFourCountSolo).toHaveBeenCalledWith(random, requestedRecipe);
    expect(generated.solo.steps).toEqual(source.steps);
  });

  it("keeps Level 1 solo paths free of turns", () => {
    const values = [0, 0.99, 0.99, 0.99, 0.99, 0.99];
    const generated = generateRewoundSoloLoopFromMotions(
      templates,
      4,
      () => values.shift() ?? 0.99,
      makeRecipe({ level: 1, maxTurnIntensity: 0 })
    );

    expect(generated.solo.steps.every((step) => step.turns === 0)).toBe(true);
  });

  it("allocates whole turns up to the Level 2 ceiling", () => {
    const values = [0, 0.99, 0.99, 0.99, 0.99, 0.99];
    const generated = generateRewoundSoloLoopFromMotions(
      templates,
      4,
      () => values.shift() ?? 0.99,
      makeRecipe({ level: 2, maxTurnIntensity: 1 })
    );

    expect(generated.solo.steps.map((step) => step.turns)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("materializes Level 3 floats without breaking LOOP closure", () => {
    const values = [0, 0.99, 0.99, 0.99, 0.99, 0.99];
    const generated = generateRewoundSoloLoopFromMotions(
      templates,
      4,
      () => values.shift() ?? 0.99,
      makeRecipe({ level: 3, maxTurnIntensity: 0.5 })
    );

    expect(generated.solo.steps.every((step) => step.turns === "fl")).toBe(
      true
    );
    expect(
      generated.solo.steps.every((step) => step.motionType === MotionType.FLOAT)
    ).toBe(true);
    expect(generated.solo.steps[0]!.startOrientation).toBe(
      generated.solo.steps.at(-1)!.endOrientation
    );
  });

  it("filters authored four-count flowers through the same recipe", () => {
    expect(
      flowerMatchesRecipe(
        { turns: 0 },
        makeRecipe({ level: 1, maxTurnIntensity: 0 })
      )
    ).toBe(true);
    expect(
      flowerMatchesRecipe(
        { turns: 1 },
        makeRecipe({ level: 1, maxTurnIntensity: 0 })
      )
    ).toBe(false);
    expect(
      flowerMatchesRecipe(
        { turns: 1 },
        makeRecipe({ level: 2, maxTurnIntensity: 1 })
      )
    ).toBe(true);
    expect(
      flowerMatchesRecipe(
        { turns: 0.5 },
        makeRecipe({ level: 2, maxTurnIntensity: 1 })
      )
    ).toBe(false);
    expect(
      flowerMatchesRecipe(
        { turns: 0.5 },
        makeRecipe({ level: 3, maxTurnIntensity: 0.5 })
      )
    ).toBe(true);
    expect(
      flowerMatchesRecipe(
        { turns: 1 },
        makeRecipe({ level: 3, maxTurnIntensity: 0.5 })
      )
    ).toBe(false);
  });

  it("samples the four start points without weighting a location by template count", () => {
    const starts = [0, 0.25, 0.5, 0.75].map(
      (value) =>
        generateRewoundSoloLoopFromMotions(
          ringTemplates,
          2,
          () => value,
          makeRecipe({ traversalDirection: "clockwise" })
        ).solo.startLocation
    );

    expect(starts).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
    ]);
  });

  it("keeps every supported generic length closed within its recipe", () => {
    const lengths = [2, 8, 12, 16, 24, 32];
    const recipes = [
      { level: 1, maxTurnIntensity: 0 },
      { level: 2, maxTurnIntensity: 2 },
      { level: 3, maxTurnIntensity: 1.5 },
    ] as const;
    const cardinalOrientations = new Set([
      Orientation.IN,
      Orientation.OUT,
      Orientation.CLOCK,
      Orientation.COUNTER,
    ]);

    for (const recipe of recipes) {
      for (const length of lengths) {
        const fullRecipe = makeRecipe(recipe);
        const generated = generateStructuredSoloLoopFromMotions(
          ringTemplates,
          length,
          seededRandom(length * 100 + recipe.level),
          fullRecipe
        );
        const steps = generated.solo.steps;
        const allowedOrientations =
          recipe.level === 3
            ? cardinalOrientations
            : new Set([Orientation.IN, Orientation.OUT]);

        expect(steps, `${length} steps at Level ${recipe.level}`).toHaveLength(
          length
        );
        expect(steps[0]!.startLocation).toBe(steps.at(-1)!.endLocation);
        expect(steps[0]!.startOrientation).toBe(steps.at(-1)!.endOrientation);
        expect(
          steps.every(
            (step) =>
              allowedOrientations.has(step.startOrientation) &&
              allowedOrientations.has(step.endOrientation)
          )
        ).toBe(true);
        expect(
          steps.every((step) => {
            if (step.turns === "fl") return recipe.level === 3;
            if (step.turns > recipe.maxTurnIntensity) return false;
            return recipe.level === 3 || Number.isInteger(step.turns);
          })
        ).toBe(true);
      }
    }
  });

  it("honors an explicit start point and level-valid start orientation", () => {
    const generated = generateStructuredSoloLoopFromMotions(
      ringTemplates,
      8,
      seededRandom(42),
      makeRecipe({
        level: 1,
        maxTurnIntensity: 0,
        startLocation: GridLocation.WEST,
        startOrientation: Orientation.OUT,
        traversalDirection: "clockwise",
      })
    );

    expect(generated.solo.startLocation).toBe(GridLocation.WEST);
    expect(generated.solo.startOrientation).toBe(Orientation.OUT);
  });

  it("uses dash frequency as a real motion-selection constraint", () => {
    const dash = createMotionData({
      hand: HandSide.LEFT,
      gridMode: GridMode.DIAMOND,
      motionType: MotionType.DASH,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.SOUTH,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 0,
    });
    const shift = createMotionData({
      ...templates[0],
      motionType: MotionType.PRO,
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
    });

    const low = generateRewoundSoloLoopFromMotions(
      [dash, shift],
      2,
      () => 0,
      makeRecipe({ motionTypeFilter: "no-dash" })
    );
    const high = generateRewoundSoloLoopFromMotions(
      [dash, shift],
      2,
      () => 0,
      makeRecipe({ motionTypeFilter: "prefer-dash" })
    );

    expect(
      low.solo.steps.every((step) => step.motionType !== MotionType.DASH)
    ).toBe(true);
    expect(
      high.solo.steps.every((step) => step.motionType === MotionType.DASH)
    ).toBe(true);
  });

  it("scores hand and prop continuity independently", () => {
    const first = createMotionData({
      ...templates[0],
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      rotationDirection: RotationDirection.CLOCKWISE,
    });
    const continuous = createMotionData({
      ...templates[0],
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.SOUTH,
      rotationDirection: RotationDirection.CLOCKWISE,
    });
    const reversing = createMotionData({
      ...templates[0],
      startLocation: GridLocation.EAST,
      endLocation: GridLocation.NORTH,
      rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    });

    const smooth = generateRewoundSoloLoopFromMotions(
      [first, continuous, reversing],
      4,
      () => 0,
      makeRecipe({
        constraintPreset: "smooth",
        handPathMode: "smooth",
        startLocation: GridLocation.NORTH,
      })
    );
    const choppy = generateRewoundSoloLoopFromMotions(
      [first, continuous, reversing],
      4,
      () => 0,
      makeRecipe({
        constraintPreset: "choppy",
        handPathMode: "choppy",
        startLocation: GridLocation.NORTH,
      })
    );

    expect(smooth.solo.steps[1]!.endLocation).toBe(GridLocation.SOUTH);
    expect(smooth.solo.steps[1]!.rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
    expect(choppy.solo.steps[1]!.endLocation).toBe(GridLocation.NORTH);
    expect(choppy.solo.steps[1]!.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
  });

  it("falls back to canonical motions when a four-step flower cannot satisfy the recipe", async () => {
    const loadFourCountSolo = vi.fn(async () => {
      throw new Error("No eligible flower");
    });
    const loadMotionTemplates = vi.fn(async () => ringTemplates);

    const generated = await generateSoloLoop(
      4,
      makeRecipe({ traversalDirection: "clockwise" }),
      () => 0,
      loadFourCountSolo,
      loadMotionTemplates
    );

    expect(loadFourCountSolo).toHaveBeenCalledOnce();
    expect(loadMotionTemplates).toHaveBeenCalledOnce();
    expect(generated.solo.steps).toHaveLength(4);
    expect(generated.solo.steps[0]!.startLocation).toBe(
      generated.solo.steps.at(-1)!.endLocation
    );
  });

  it("uses the selected Box vocabulary instead of the Diamond flower pool", async () => {
    const loadFourCountSolo = vi.fn(async () => {
      throw new Error("Box generation must not use the Diamond flower pool");
    });
    const loadMotionTemplates = vi.fn(async () => boxRingTemplates);

    const generated = await generateSoloLoop(
      4,
      makeRecipe({
        gridMode: GridMode.BOX,
        level: 1,
        maxTurnIntensity: 0,
        traversalDirection: "clockwise",
      }),
      () => 0,
      loadFourCountSolo,
      loadMotionTemplates
    );

    expect(loadFourCountSolo).not.toHaveBeenCalled();
    expect(loadMotionTemplates).toHaveBeenCalledWith(GridMode.BOX);
    expect(
      generated.solo.steps.every((step) =>
        [
          GridLocation.NORTHEAST,
          GridLocation.SOUTHEAST,
          GridLocation.SOUTHWEST,
          GridLocation.NORTHWEST,
        ].includes(step.startLocation)
      )
    ).toBe(true);
  });

  it("varies a flower's first step, prop orientation, and traversal independently", () => {
    const flower: Flower = {
      style: "pro",
      turns: 1,
      ori: "in",
      grid: "diamond",
      petals: 2,
    };
    const values = [0, 0, 0, 0, 0, 0.74, 0.74, 0.74];
    const random = () => values.shift() ?? 0;

    const first = chooseFuseFlowerGenerationVariation([flower], random);
    const second = chooseFuseFlowerGenerationVariation([flower], random);

    expect(first.flower).toBe(second.flower);
    expect(first.firstBeat).toBe(1);
    expect(first.startOrientation).toBe(Orientation.IN);
    expect(first.reverseTraversal).toBe(false);
    expect(second.firstBeat).toBe(3);
    expect(second.startOrientation).toBe(Orientation.OUT);
    expect(second.reverseTraversal).toBe(true);
  });

  it("can traverse the same four-step flower in the opposite direction", () => {
    const source = generateStructuredSoloLoopFromMotions(
      templates,
      4,
      () => 0
    ).solo;

    const reversed = reverseSoloLoopTraversal(source);

    expect(reversed.steps.map((step) => step.startLocation)).toEqual([
      GridLocation.NORTH,
      GridLocation.WEST,
      GridLocation.SOUTH,
      GridLocation.EAST,
    ]);
    expect(reversed.steps[0]!.startLocation).toBe(
      reversed.steps[3]!.endLocation
    );
    expect(reversed.steps[0]!.startOrientation).toBe(
      reversed.steps[3]!.endOrientation
    );
  });

  it("repeats a four-count authored LOOP to eight without reversing it", () => {
    const source = generateStructuredSoloLoopFromMotions(
      templates,
      4,
      () => 0
    ).solo;

    const fitted = fitSoloPathToLoop(source, 8);

    expect(fitted.solo.steps.map((step) => step.startLocation)).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
    ]);
  });
});
