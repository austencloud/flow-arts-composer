/**
 * Arrow Grid Coordinate Service
 *
 * Uses the grid module's coordinate system instead of duplicating data.
 * Provides arrow-specific coordinate functionality using the authoritative grid data.
 */

import { GridLocation } from "../../../grid/domain/enums/grid-enums";
import { GridMode } from "../../../grid/domain/enums/grid-enums";
import type { MotionData } from "../../../shared/domain/models/motion-data";
import { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import { createGridPointData } from "../../../grid/utils/grid-coordinate-utils";

const SCENE_SIZE = 950;
const CENTER_X = 475.0;
const CENTER_Y = 475.0;

export function getInitialPosition(motion: MotionData, location: GridLocation, overrideGridMode?: GridMode): Point {
  const motionType = motion.motionType.toLowerCase();
  const gridMode =
    overrideGridMode || motion.gridMode || inferGridModeFromLocation(location);

  let coords: Point;
  if (["pro", "anti", "float"].includes(motionType || "")) {
    coords = getLayer2Coords(location, gridMode);
  } else if (["static", "dash"].includes(motionType || "")) {
    coords = getHandPointCoords(location, gridMode);
  } else {
    coords = getSceneCenter();
  }

  return coords;
}

export function getSceneCenter(): Point {
  return new Point(CENTER_X, CENTER_Y);
}

export function getSceneDimensions(): [number, number] {
  return [SCENE_SIZE, SCENE_SIZE];
}

export function validateCoordinates(point: Point): boolean {
  return (
    point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    point.x >= 0 &&
    point.x <= SCENE_SIZE &&
    point.y >= 0 &&
    point.y <= SCENE_SIZE
  );
}

export function getAllHandPoints(
  gridMode: GridMode = GridMode.DIAMOND
): Partial<Record<GridLocation, Point>> {
  const gridData = createGridPointData(gridMode);
  const handPoints: Partial<Record<GridLocation, Point>> = {};

  const locationMap: Record<string, GridLocation> = {
    n_diamond_hand_point_strict: GridLocation.NORTH,
    e_diamond_hand_point_strict: GridLocation.EAST,
    s_diamond_hand_point_strict: GridLocation.SOUTH,
    w_diamond_hand_point_strict: GridLocation.WEST,
    ne_box_hand_point_strict: GridLocation.NORTHEAST,
    se_box_hand_point_strict: GridLocation.SOUTHEAST,
    sw_box_hand_point_strict: GridLocation.SOUTHWEST,
    nw_box_hand_point_strict: GridLocation.NORTHWEST,
  };

  Object.entries(gridData.allHandPointsStrict).forEach(([key, value]) => {
    const location = locationMap[key];
    if (location && value.coordinates) {
      handPoints[location] = new Point(
        value.coordinates.x,
        value.coordinates.y
      );
    }
  });

  handPoints[GridLocation.CENTER] = new Point(CENTER_X, CENTER_Y);

  return handPoints;
}

export function getAllLayer2Points(
  gridMode: GridMode = GridMode.DIAMOND
): Partial<Record<GridLocation, Point>> {
  const gridData = createGridPointData(gridMode);
  const layer2Points: Partial<Record<GridLocation, Point>> = {};

  if (gridMode === GridMode.DIAMOND) {
    layer2Points[GridLocation.NORTHEAST] = new Point(625.0, 325.0);
    layer2Points[GridLocation.SOUTHEAST] = new Point(625.0, 625.0);
    layer2Points[GridLocation.SOUTHWEST] = new Point(325.0, 625.0);
    layer2Points[GridLocation.NORTHWEST] = new Point(325.0, 325.0);

    layer2Points[GridLocation.NORTH] = layer2Points[GridLocation.NORTHEAST];
    layer2Points[GridLocation.EAST] = layer2Points[GridLocation.SOUTHEAST];
    layer2Points[GridLocation.SOUTH] = layer2Points[GridLocation.SOUTHWEST];
    layer2Points[GridLocation.WEST] = layer2Points[GridLocation.NORTHWEST];
  } else if (gridMode === GridMode.SKEWED) {
    layer2Points[GridLocation.NORTH] = new Point(475.0, 325.0);
    layer2Points[GridLocation.EAST] = new Point(625.0, 475.0);
    layer2Points[GridLocation.SOUTH] = new Point(475.0, 625.0);
    layer2Points[GridLocation.WEST] = new Point(325.0, 475.0);
    layer2Points[GridLocation.NORTHEAST] = new Point(625.0, 325.0);
    layer2Points[GridLocation.SOUTHEAST] = new Point(625.0, 625.0);
    layer2Points[GridLocation.SOUTHWEST] = new Point(325.0, 625.0);
    layer2Points[GridLocation.NORTHWEST] = new Point(325.0, 325.0);
  } else {
    const locationMap: Record<string, GridLocation> = {
      n_box_layer2_point_strict: GridLocation.NORTH,
      e_box_layer2_point_strict: GridLocation.EAST,
      s_box_layer2_point_strict: GridLocation.SOUTH,
      w_box_layer2_point_strict: GridLocation.WEST,
    };

    Object.entries(gridData.allLayer2PointsStrict).forEach(([key, value]) => {
      const location = locationMap[key];
      if (location && value.coordinates) {
        layer2Points[location] = new Point(
          value.coordinates.x,
          value.coordinates.y
        );
      }
    });

    if (layer2Points[GridLocation.NORTH] && layer2Points[GridLocation.EAST]) {
      layer2Points[GridLocation.NORTHEAST] = layer2Points[GridLocation.NORTH];
      layer2Points[GridLocation.SOUTHEAST] = layer2Points[GridLocation.EAST];
      layer2Points[GridLocation.SOUTHWEST] = layer2Points[GridLocation.SOUTH];
      layer2Points[GridLocation.NORTHWEST] = layer2Points[GridLocation.WEST];
    }
  }

  return layer2Points;
}

export function getSupportedLocations(): GridLocation[] {
  return [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];
}

function getLayer2Coords(location: GridLocation, gridMode: GridMode): Point {
  let layer2Points = getAllLayer2Points(gridMode);
  let coords = layer2Points[location];

  if (!coords) {
    const altMode =
      gridMode === GridMode.DIAMOND ? GridMode.BOX : GridMode.DIAMOND;
    layer2Points = getAllLayer2Points(altMode);
    coords = layer2Points[location];

    if (coords) {
      console.debug(
        `Layer2 location ${location} not in ${gridMode} mode, found in ${altMode} mode`
      );
    }
  }

  if (!coords) {
    console.warn(
      `No layer2 coordinates for location: ${location} in any mode, using center`
    );
    return getSceneCenter();
  }
  return coords;
}

function getHandPointCoords(
  location: GridLocation,
  gridMode: GridMode
): Point {
  let handPoints = getAllHandPoints(gridMode);
  let coords = handPoints[location];

  if (!coords) {
    const altMode =
      gridMode === GridMode.DIAMOND ? GridMode.BOX : GridMode.DIAMOND;
    handPoints = getAllHandPoints(altMode);
    coords = handPoints[location];

    if (coords) {
      console.debug(
        `Location ${location} not in ${gridMode} mode, found in ${altMode} mode`
      );
    }
  }

  if (!coords) {
    console.warn(
      `No hand point coordinates for location: ${location} in any mode, using center`
    );
    return getSceneCenter();
  }
  return coords;
}

function inferGridModeFromLocation(location: GridLocation): GridMode {
  const boxLocations: GridLocation[] = [
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];
  return boxLocations.includes(location) ? GridMode.BOX : GridMode.DIAMOND;
}
