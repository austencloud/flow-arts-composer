import { describe, expect, it } from "vitest";
import { StartPlacementManager } from "$lib/shared/create/services/start-placement-manager";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getPlacementGridPoints } from "$lib/shared/pictograph/grid/services/placement-grid-points";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

describe("StartPlacementManager: direct construction", () => {
  const manager = new StartPlacementManager();

  it("round-trips through the same schema as a preset", () => {
    const preset = manager
      .getAllStartPlacementVariations(GridMode.DIAMOND)
      .find((entry) => entry.startPlacement === GridPlacement.ALPHA7);
    expect(preset).toBeDefined();

    const built = manager.createStartPlacementFromLocations({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      gridMode: GridMode.DIAMOND,
      id: preset!.id,
    });

    expect(built).toEqual(preset);
  });

  it("keeps independent prop types and orientations", () => {
    const built = manager.createStartPlacementFromLocations({
      leftLocation: GridLocation.WEST,
      rightLocation: GridLocation.WEST,
      gridMode: GridMode.DIAMOND,
      leftOrientation: Orientation.OUT,
      rightOrientation: Orientation.CLOCK,
      leftPropType: PropType.TORCH,
      rightPropType: PropType.BIGTORCH,
      id: "built-pose",
    });

    expect(built.startPlacement).toBe(GridPlacement.BETA7);
    expect(built.endPlacement).toBe(GridPlacement.BETA7);
    expect(built.motions[HandSide.LEFT]).toMatchObject({
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.WEST,
      startOrientation: Orientation.OUT,
      endOrientation: Orientation.OUT,
      propType: PropType.TORCH,
    });
    expect(built.motions[HandSide.RIGHT]).toMatchObject({
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.WEST,
      startOrientation: Orientation.CLOCK,
      endOrientation: Orientation.CLOCK,
      propType: PropType.BIGTORCH,
    });
  });

  it("builds Nick's two-torch outward horizontal pose directly", () => {
    const built = manager.createStartPlacementFromLocations({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      gridMode: GridMode.DIAMOND,
      leftOrientation: Orientation.OUT,
      rightOrientation: Orientation.OUT,
      leftPropType: PropType.TORCH,
      rightPropType: PropType.TORCH,
      id: "nick-horizontal-torches",
    });

    expect(built.startPlacement).toBe(GridPlacement.ALPHA7);
    expect(built.motions[HandSide.LEFT]).toMatchObject({
      startLocation: GridLocation.EAST,
      startOrientation: Orientation.OUT,
      propType: PropType.TORCH,
    });
    expect(built.motions[HandSide.RIGHT]).toMatchObject({
      startLocation: GridLocation.WEST,
      startOrientation: Orientation.OUT,
      propType: PropType.TORCH,
    });
  });

  it("names merged-grid zeta and eta placements", () => {
    const zeta = manager.createStartPlacementFromLocations({
      leftLocation: GridLocation.SOUTHWEST,
      rightLocation: GridLocation.NORTH,
      gridMode: GridMode.SKEWED,
    });
    const eta = manager.createStartPlacementFromLocations({
      leftLocation: GridLocation.NORTH,
      rightLocation: GridLocation.NORTHEAST,
      gridMode: GridMode.SKEWED,
    });

    expect(zeta.startPlacement).toBe(GridPlacement.ZETA1);
    expect(zeta.letter).toBe(Letter.ZETA);
    expect(eta.startPlacement).toBe(GridPlacement.ETA2);
    expect(eta.letter).toBe(Letter.ETA);
  });

  it("uses the canonical rendered hand points for every supported grid", () => {
    expect(getPlacementGridPoints(GridMode.DIAMOND)).toEqual([
      { location: GridLocation.NORTH, label: "North", x: 475, y: 331.9 },
      { location: GridLocation.EAST, label: "East", x: 618.1, y: 475 },
      { location: GridLocation.SOUTH, label: "South", x: 475, y: 618.1 },
      { location: GridLocation.WEST, label: "West", x: 331.9, y: 475 },
    ]);

    expect(getPlacementGridPoints(GridMode.BOX)).toEqual([
      {
        location: GridLocation.NORTHEAST,
        label: "Northeast",
        x: 576.2,
        y: 373.8,
      },
      {
        location: GridLocation.SOUTHEAST,
        label: "Southeast",
        x: 576.2,
        y: 576.2,
      },
      {
        location: GridLocation.SOUTHWEST,
        label: "Southwest",
        x: 373.8,
        y: 576.2,
      },
      {
        location: GridLocation.NORTHWEST,
        label: "Northwest",
        x: 373.8,
        y: 373.8,
      },
    ]);

    expect(
      getPlacementGridPoints(GridMode.SKEWED).map((point) => point.location)
    ).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridLocation.SOUTHWEST,
      GridLocation.NORTHWEST,
    ]);

    expect(getPlacementGridPoints(GridMode.SKEWED, true).at(-1)).toEqual({
      location: GridLocation.CENTER,
      label: "Center",
      x: 475,
      y: 475,
    });
  });
});
