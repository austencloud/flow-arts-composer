import { describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "../../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getPlacementGridPoints } from "../../../src/lib/shared/pictograph/grid/services/placement-grid-points";
import {
  PLACEMENT_KINDS,
  placementKindFor,
  placementExample,
  placementPairPreview,
  PLACEMENT_LETTERS,
  changePlacementGrid,
  restorePlacementWorkshop,
  transformPlacement,
} from "../../../src/lib/features/learn/components/interactive/placements/hand-placement-lesson";
import { createPlacementWorkshopState } from "../../../src/lib/features/learn/components/interactive/placements/placement-experience-state.svelte";

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

describe("hand placement workshop domain", () => {
  it("keeps the placement family through 45-degree rotations and every reflection axis", () => {
    for (const mode of [GridMode.DIAMOND, GridMode.BOX]) {
      for (const left of getPlacementGridPoints(mode)) {
        for (const right of getPlacementGridPoints(mode)) {
          const kind = placementKindFor(left.location, right.location);
          for (let step = -8; step <= 8; step++) {
            const rotated = transformPlacement(
              left.location,
              right.location,
              "rotate",
              { rotationSteps: step }
            );
            expect(placementKindFor(rotated.left, rotated.right)).toBe(kind);
            expect(
              transformPlacement(rotated.left, rotated.right, "rotate", {
                rotationSteps: -step,
              })
            ).toEqual({ left: left.location, right: right.location });
          }
          for (const reflectionAxis of [0, 1, 2, 3] as const) {
            const reflected = transformPlacement(
              left.location,
              right.location,
              "mirror",
              { reflectionAxis }
            );
            expect(placementKindFor(reflected.left, reflected.right)).toBe(
              kind
            );
            expect(
              transformPlacement(reflected.left, reflected.right, "mirror", {
                reflectionAxis,
              })
            ).toEqual({ left: left.location, right: right.location });
          }
        }
      }
    }
    expect(
      transformPlacement(GridLocation.NORTH, GridLocation.EAST, "rotate", {
        rotationSteps: 1,
      })
    ).toEqual({ left: GridLocation.NORTHEAST, right: GridLocation.SOUTHEAST });
    expect(
      transformPlacement(GridLocation.NORTH, GridLocation.EAST, "mirror", {
        reflectionAxis: 1,
      })
    ).toEqual({ left: GridLocation.EAST, right: GridLocation.NORTH });
  });
  it("renders the canonical static letter for every arrangement without changing either hand", () => {
    for (const mode of [GridMode.DIAMOND, GridMode.BOX]) {
      for (const left of getPlacementGridPoints(mode)) {
        for (const right of getPlacementGridPoints(mode)) {
          const pair = { left: left.location, right: right.location };
          const preview = placementPairPreview(pair, mode);
          const kind = placementKindFor(pair.left, pair.right)!;
          expect(preview.letter).toBe(PLACEMENT_LETTERS[kind]);
          expect(preview.motions?.left?.startLocation).toBe(pair.left);
          expect(preview.motions?.right?.startLocation).toBe(pair.right);
        }
      }
    }
  });
  it("remembers the exact last arrangement of each family independently in each grid", () => {
    const workshop = createPlacementWorkshopState(memory());
    workshop.rememberPlacement(
      GridLocation.NORTH,
      GridLocation.WEST,
      GridMode.DIAMOND
    );
    workshop.rememberPlacement(
      GridLocation.SOUTH,
      GridLocation.SOUTH,
      GridMode.DIAMOND
    );
    workshop.rememberPlacement(
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridMode.BOX
    );
    workshop.rememberPlacement(null, null, GridMode.DIAMOND);
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
    workshop.rememberPlacement(
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
        const box = changePlacementGrid(
          left.location,
          right.location,
          GridMode.DIAMOND,
          GridMode.BOX
        );
        expect(placementKindFor(box.left, box.right)).toBe(
          placementKindFor(left.location, right.location)
        );
        expect(
          changePlacementGrid(
            box.left,
            box.right,
            GridMode.BOX,
            GridMode.DIAMOND
          )
        ).toEqual({ left: left.location, right: right.location });
      }
    }
    expect(
      changePlacementGrid(
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
          const kind = placementKindFor(left.location, right.location)!;
          counts[kind]++;
          for (const action of ["rotate", "mirror", "swap"] as const) {
            const moved = transformPlacement(
              left.location,
              right.location,
              action
            );
            expect(placementKindFor(moved.left, moved.right)).toBe(kind);
            expect(points.some((p) => p.location === moved.left)).toBe(true);
            expect(points.some((p) => p.location === moved.right)).toBe(true);
          }
        }
      expect(counts).toEqual({ alpha: 4, beta: 4, gamma: 8 });
    });

    it(`renders examples on the selected ${mode} grid`, () => {
      const points = getPlacementGridPoints(mode);
      for (const kind of PLACEMENT_KINDS) {
        const example = placementExample(kind, mode);
        expect(placementKindFor(example.left, example.right)).toBe(kind);
        expect(points.some((p) => p.location === example.left)).toBe(true);
        expect(points.some((p) => p.location === example.right)).toBe(true);
      }
    });
  }

  it("never mislabels incomplete, center, or mixed-grid placements as Gamma", () => {
    expect(placementKindFor(null, GridLocation.NORTH)).toBeNull();
    expect(
      placementKindFor(GridLocation.CENTER, GridLocation.NORTH)
    ).toBeNull();
    expect(
      placementKindFor(GridLocation.NORTH, GridLocation.NORTHEAST)
    ).toBeNull();
  });

  it("does not trust corrupt checkpoints", () => {
    for (const value of [
      null,
      { version: 0, phase: "complete" },
      { version: 3, phase: "complete" },
      { version: 1, phase: "complete", round: 2 },
      { version: 1, phase: "complete", round: 999 },
      { version: 2, phase: "box", explored: ["alpha"], boxFound: [] },
    ]) {
      expect(restorePlacementWorkshop(value).phase).toBe("explore");
    }
  });

  it("carries version 1 progress into the two rounds", () => {
    expect(
      restorePlacementWorkshop({ version: 1, phase: "complete", round: 6 })
        .phase
    ).toBe("complete");
    expect(
      restorePlacementWorkshop({
        version: 1,
        phase: "practice",
        round: 4,
        explored: ["alpha", "beta", "gamma"],
      })
    ).toMatchObject({ phase: "box", boxFound: [] });
    expect(
      restorePlacementWorkshop({
        version: 1,
        phase: "explore",
        round: 0,
        explored: ["beta", "nonsense"],
      })
    ).toMatchObject({ phase: "explore", explored: ["beta"] });
  });
});

describe("find-all-three rounds", () => {
  it("finds all three on the diamond, then on the box grid, then opens free play", () => {
    const state = createPlacementWorkshopState(memory());
    expect(state.phase).toBe("explore");
    expect(state.advance()).toBe(false);
    for (const kind of PLACEMENT_KINDS) {
      expect(state.roundDone).toBe(false);
      state.discover(kind);
    }
    expect(state.roundDone).toBe(true);
    expect(state.advance()).toBe(true);
    expect(state.phase).toBe("box");
    expect(state.found).toEqual([]);
    expect(state.canFinish).toBe(false);
    state.discover("gamma");
    state.discover("alpha");
    expect(state.advance()).toBe(false);
    state.discover("beta");
    expect(state.advance()).toBe(true);
    expect(state.phase).toBe("complete");
    expect(state.canFinish).toBe(true);
    expect(state.roundDone).toBe(false);
    expect(state.advance()).toBe(false);
  });

  it("counts each placement once per round, in any order", () => {
    const state = createPlacementWorkshopState(memory());
    state.discover("beta");
    state.discover("beta");
    expect(state.explored).toEqual(["beta"]);
    state.discover("gamma");
    state.discover("alpha");
    state.advance();
    state.discover("beta");
    expect(state.boxFound).toEqual(["beta"]);
    expect(state.explored).toEqual(["beta", "gamma", "alpha"]);
  });

  it("saves each find and resumes the round in progress", () => {
    const persistence = memory();
    const first = createPlacementWorkshopState(persistence);
    for (const kind of PLACEMENT_KINDS) first.discover(kind);
    first.advance();
    first.discover("alpha");
    expect(persistence.load().phaseData.workshop).toEqual({
      version: 2,
      phase: "box",
      explored: ["alpha", "beta", "gamma"],
      boxFound: ["alpha"],
    });
    const resumed = createPlacementWorkshopState(persistence);
    expect(resumed.phase).toBe("box");
    expect(resumed.found).toEqual(["alpha"]);
  });

  it("opens review in exploration without overwriting the saved lesson", () => {
    const persistence = memory({
      version: 2,
      phase: "box",
      explored: ["alpha", "beta", "gamma"],
      boxFound: ["alpha"],
    });
    const review = createPlacementWorkshopState(persistence, true);
    expect(review.phase).toBe("explore");
    review.discover("gamma");
    review.advance();
    expect(persistence.savePhaseData).not.toHaveBeenCalled();
  });
});
