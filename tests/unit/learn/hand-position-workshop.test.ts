import { describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getPlacementGridPoints } from "../../../src/lib/shared/pictograph/grid/services/placement-grid-points";
import {
  POSITION_CHALLENGES,
  POSITION_KINDS,
  positionKindFor,
  positionExample,
  positionPairPreview,
  POSITION_LETTERS,
  positionCorrection,
  positionCorrectionPair,
  changePositionGrid,
  restorePositionWorkshop,
  transformPosition,
} from "../../../src/lib/features/learn/components/interactive/positions/hand-position-lesson";
import { createPositionWorkshopState } from "../../../src/lib/features/learn/components/interactive/positions/positions-experience-state.svelte";
import { HandSide } from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PropPlacementChange } from "../../../src/lib/shared/pictograph/grid/domain/prop-placement";

function memory(saved?: unknown) {
  let workshop = saved;
  return {
    load: () => ({ step: 0, phaseData: { workshop } }),
    savePhaseData: vi.fn((_key: string, value: unknown) => {
      workshop = value;
    }),
    saveStep: vi.fn(),
    reset: vi.fn(),
    getPhaseData: <T>(_key: string, fallback: T) => fallback,
  };
}

describe("hand position workshop domain", () => {
  it("keeps the placement family through 45-degree rotations and every reflection axis", () => {
    for (const mode of [GridMode.DIAMOND, GridMode.BOX]) {
      for (const left of getPlacementGridPoints(mode)) {
        for (const right of getPlacementGridPoints(mode)) {
          const kind = positionKindFor(left.location, right.location);
          for (let step = -8; step <= 8; step++) {
            const rotated = transformPosition(
              left.location,
              right.location,
              "rotate",
              { rotationSteps: step }
            );
            expect(positionKindFor(rotated.left, rotated.right)).toBe(kind);
            expect(
              transformPosition(rotated.left, rotated.right, "rotate", {
                rotationSteps: -step,
              })
            ).toEqual({ left: left.location, right: right.location });
          }
          for (const reflectionAxis of [0, 1, 2, 3] as const) {
            const reflected = transformPosition(
              left.location,
              right.location,
              "mirror",
              { reflectionAxis }
            );
            expect(positionKindFor(reflected.left, reflected.right)).toBe(kind);
            expect(
              transformPosition(reflected.left, reflected.right, "mirror", {
                reflectionAxis,
              })
            ).toEqual({ left: left.location, right: right.location });
          }
        }
      }
    }
    expect(
      transformPosition(GridLocation.NORTH, GridLocation.EAST, "rotate", {
        rotationSteps: 1,
      })
    ).toEqual({ left: GridLocation.NORTHEAST, right: GridLocation.SOUTHEAST });
    expect(
      transformPosition(GridLocation.NORTH, GridLocation.EAST, "mirror", {
        reflectionAxis: 1,
      })
    ).toEqual({ left: GridLocation.EAST, right: GridLocation.NORTH });
  });
  it("renders the canonical static letter for every arrangement without changing either hand", () => {
    for (const mode of [GridMode.DIAMOND, GridMode.BOX]) {
      for (const left of getPlacementGridPoints(mode)) {
        for (const right of getPlacementGridPoints(mode)) {
          const pair = { left: left.location, right: right.location };
          const preview = positionPairPreview(pair, mode);
          const kind = positionKindFor(pair.left, pair.right)!;
          expect(preview.letter).toBe(POSITION_LETTERS[kind]);
          expect(preview.motions?.left?.startLocation).toBe(pair.left);
          expect(preview.motions?.right?.startLocation).toBe(pair.right);
        }
      }
    }
  });
  it("remembers the exact last arrangement of each family independently in each grid", () => {
    const workshop = createPositionWorkshopState(memory());
    workshop.rememberPosition(
      GridLocation.NORTH,
      GridLocation.WEST,
      GridMode.DIAMOND
    );
    workshop.rememberPosition(
      GridLocation.SOUTH,
      GridLocation.SOUTH,
      GridMode.DIAMOND
    );
    workshop.rememberPosition(
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridMode.BOX
    );
    workshop.rememberPosition(null, null, GridMode.DIAMOND);
    expect(workshop.examplePair("gamma", GridMode.DIAMOND)).toEqual({
      left: GridLocation.NORTH,
      right: GridLocation.WEST,
    });
    expect(workshop.examplePair("gamma", GridMode.BOX)).toEqual({
      left: GridLocation.NORTHEAST,
      right: GridLocation.SOUTHEAST,
    });
    expect(workshop.examplePair("beta", GridMode.DIAMOND)).toEqual({
      left: GridLocation.SOUTH,
      right: GridLocation.SOUTH,
    });
    workshop.rememberPosition(
      GridLocation.SOUTH,
      GridLocation.EAST,
      GridMode.DIAMOND
    );
    expect(workshop.examplePair("gamma", GridMode.DIAMOND)).toEqual({
      left: GridLocation.SOUTH,
      right: GridLocation.EAST,
    });
  });
  it("switches grids without changing the constructed family or losing a partial hand", () => {
    for (const left of getPlacementGridPoints(GridMode.DIAMOND)) {
      for (const right of getPlacementGridPoints(GridMode.DIAMOND)) {
        const box = changePositionGrid(
          left.location,
          right.location,
          GridMode.DIAMOND,
          GridMode.BOX
        );
        expect(positionKindFor(box.left, box.right)).toBe(
          positionKindFor(left.location, right.location)
        );
        expect(
          changePositionGrid(
            box.left,
            box.right,
            GridMode.BOX,
            GridMode.DIAMOND
          )
        ).toEqual({ left: left.location, right: right.location });
      }
    }
    expect(
      changePositionGrid(
        GridLocation.NORTH,
        null,
        GridMode.DIAMOND,
        GridMode.BOX
      )
    ).toEqual({ left: GridLocation.NORTHEAST, right: null });
  });
  for (const mode of [GridMode.DIAMOND, GridMode.BOX]) {
    it(`classifies all 16 ${mode} pairs and preserves families under transforms`, () => {
      const counts = { alpha: 0, beta: 0, gamma: 0 };
      const points = getPlacementGridPoints(mode);
      for (const left of points)
        for (const right of points) {
          const kind = positionKindFor(left.location, right.location)!;
          counts[kind]++;
          for (const action of ["rotate", "mirror", "swap"] as const) {
            const moved = transformPosition(
              left.location,
              right.location,
              action
            );
            expect(positionKindFor(moved.left, moved.right)).toBe(kind);
            expect(points.some((p) => p.location === moved.left)).toBe(true);
            expect(points.some((p) => p.location === moved.right)).toBe(true);
          }
        }
      expect(counts).toEqual({ alpha: 4, beta: 4, gamma: 8 });
    });

    it(`gives a valid one-hand correction for every wrong ${mode} answer`, () => {
      const points = getPlacementGridPoints(mode);
      for (const left of points)
        for (const right of points)
          for (const target of POSITION_KINDS) {
            if (positionKindFor(left.location, right.location) === target)
              continue;
            const message = positionCorrection(
              left.location,
              right.location,
              target,
              mode
            );
            const destination = points.find((point) =>
              message.endsWith(`to ${point.label}.`)
            );
            expect(destination).toBeDefined();
            expect(positionKindFor(left.location, destination!.location)).toBe(
              target
            );
          }
    });

    it(`renders examples on the selected ${mode} grid`, () => {
      const points = getPlacementGridPoints(mode);
      for (const kind of POSITION_KINDS) {
        const example = positionExample(kind, mode);
        expect(positionKindFor(example.left, example.right)).toBe(kind);
        expect(points.some((p) => p.location === example.left)).toBe(true);
        expect(points.some((p) => p.location === example.right)).toBe(true);
      }
    });
    it(`keeps the first hand fixed in every ${mode} visual correction`, () => {
      for (const point of getPlacementGridPoints(mode)) {
        for (const target of POSITION_KINDS) {
          const pair = positionCorrectionPair(point.location, target, mode);
          expect(pair.left).toBe(point.location);
          expect(positionKindFor(pair.left, pair.right)).toBe(target);
        }
      }
    });
  }

  it("never mislabels incomplete, center, or mixed-grid placements as Gamma", () => {
    expect(positionKindFor(null, GridLocation.NORTH)).toBeNull();
    expect(positionKindFor(GridLocation.CENTER, GridLocation.NORTH)).toBeNull();
    expect(
      positionKindFor(GridLocation.NORTH, GridLocation.NORTHEAST)
    ).toBeNull();
  });

  it("does not trust corrupt or legacy completion checkpoints", () => {
    for (const value of [
      null,
      { version: 0, round: 6 },
      { version: 1, phase: "complete", round: -1 },
      { version: 1, phase: "complete", round: 2.5 },
      { version: 1, phase: "complete", round: 999 },
    ]) {
      expect(restorePositionWorkshop(value)).toMatchObject({
        phase: "explore",
        round: 0,
      });
    }
    expect(
      restorePositionWorkshop({ version: 1, phase: "complete", round: 2 }).phase
    ).not.toBe("complete");
  });
});

describe("self-paced practice progress", () => {
  it("keeps completion available after free-play edits and clearing", () => {
    const state = createPositionWorkshopState(
      memory({ version: 1, phase: "complete", round: 6, explored: [] })
    );
    state.edited();
    state.evaluatePlacement({
      leftLocation: null,
      rightLocation: null,
      complete: false,
      activeHand: HandSide.LEFT,
      canUndo: false,
    });
    expect(state.canFinish).toBe(true);
    expect(state.builtCount).toBe(6);
    expect(state.feedback).toBe("idle");
  });
  const alphaPlacement: PropPlacementChange = {
    leftLocation: GridLocation.NORTH,
    rightLocation: GridLocation.SOUTH,
    activeHand: null,
    complete: true,
    canUndo: true,
  };

  it("confirms committed placements immediately without advancing or double-counting", () => {
    const state = createPositionWorkshopState(memory());
    state.practice();
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("correct");
    expect(state.builtCount).toBe(1);
    expect(state.round).toBe(0);
    state.evaluatePlacement(alphaPlacement);
    expect(state.builtCount).toBe(1);
    expect(state.next()).toBe(true);
    expect(state.builtCount).toBe(1);
    expect(state.next()).toBe(false);
  });

  it("withholds confirmation while editing and rechecks an unchanged committed point", () => {
    const state = createPositionWorkshopState(memory());
    state.practice();
    state.evaluatePlacement(alphaPlacement);
    state.evaluatePlacement({ ...alphaPlacement, activeHand: HandSide.RIGHT });
    expect(state.feedback).toBe("idle");
    expect(state.next()).toBe(false);
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("correct");
    state.evaluatePlacement({
      ...alphaPlacement,
      rightLocation: null,
      complete: false,
    });
    expect(state.feedback).toBe("idle");
    expect(state.builtCount).toBe(0);
    expect(state.next()).toBe(false);
  });

  it("rechecks wrong constructions but never grades free exploration", () => {
    const state = createPositionWorkshopState(memory());
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("idle");
    expect(state.builtCount).toBe(0);
    state.practice();
    state.evaluatePlacement({
      ...alphaPlacement,
      rightLocation: GridLocation.NORTH,
    });
    expect(state.feedback).toBe("incorrect");
    expect(state.next()).toBe(false);
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("correct");
    state.explore();
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("idle");
  });
  it("keeps wrong feedback through retry selection and only credits the correction", () => {
    const state = createPositionWorkshopState(memory());
    state.practice();
    const wrong = { ...alphaPlacement, rightLocation: GridLocation.NORTH };
    state.evaluatePlacement(wrong);
    state.evaluatePlacement({ ...wrong, activeHand: HandSide.RIGHT });
    expect(state.feedback).toBe("incorrect");
    expect(state.builtCount).toBe(0);
    expect(state.next()).toBe(false);
    state.evaluatePlacement(wrong);
    expect(state.feedback).toBe("incorrect");
    state.evaluatePlacement(alphaPlacement);
    expect(state.feedback).toBe("correct");
    expect(state.builtCount).toBe(1);
  });

  it("requires each correct construction, invalidates edited answers, and never double-advances", () => {
    const state = createPositionWorkshopState(memory());
    expect(state.next()).toBe(false);
    state.practice();
    state.check("beta");
    expect(state.feedback).toBe("incorrect");
    expect(state.next()).toBe(false);
    state.check("alpha");
    state.edited();
    expect(state.next()).toBe(false);
    for (const question of POSITION_CHALLENGES) {
      expect(state.canFinish).toBe(false);
      state.check(question.kind);
      expect(state.next()).toBe(true);
      expect(state.next()).toBe(false);
    }
    expect(state.canFinish).toBe(true);
  });

  it("resumes completed rounds without converting old checks into new passes", () => {
    const persistence = memory();
    const first = createPositionWorkshopState(persistence);
    first.practice();
    first.check("alpha");
    first.next();
    first.check("beta");
    const resumed = createPositionWorkshopState(persistence);
    expect(resumed.round).toBe(1);
    expect(resumed.challenge?.kind).toBe("beta");
    expect(resumed.feedback).toBe("idle");
    expect(resumed.next()).toBe(false);
    resumed.explore();
    resumed.practice();
    expect(resumed.round).toBe(1);
  });

  it("opens review in exploration without overwriting the saved lesson", () => {
    const persistence = memory({
      version: 1,
      phase: "practice",
      round: 4,
      explored: ["alpha"],
    });
    const review = createPositionWorkshopState(persistence, true);
    expect(review.phase).toBe("explore");
    review.discover("gamma");
    review.practice();
    review.check("alpha");
    review.next();
    expect(persistence.savePhaseData).not.toHaveBeenCalled();
  });

  it("counts distinct discoveries, and resets practice after a completed pass", () => {
    const state = createPositionWorkshopState(
      memory({ version: 1, phase: "complete", round: 6, explored: [] })
    );
    state.discover("beta");
    state.discover("beta");
    expect(state.explored).toEqual(["beta"]);
    state.explore();
    expect(state.canFinish).toBe(true);
    state.practice();
    expect(state.round).toBe(0);
    expect(state.canFinish).toBe(false);
  });
});
