import { rotateMotion } from "$lib/shared/create/services/motion-transforms";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { generatePlacementKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

export type PlacementMotionName = "pro" | "anti" | "float" | "dash" | "static";
export type PlacementMap = Record<string, Record<string, [number, number]>>;

export interface PlacementFixture {
  diamond: PictographData;
  box: PictographData;
  diamondMotion: MotionData;
  boxMotion: MotionData;
}

export interface PlacementTurnOption {
  value: string;
  rotationDirections: RotationDirection[];
}

export interface PlacementKeyOption {
  placementKey: string;
  turns: PlacementTurnOption[];
}

export interface PlacementMotionCatalog {
  motionType: PlacementMotionName;
  keys: PlacementKeyOption[];
}

export function buildPlacementFixture(
  motionType: PlacementMotionName,
  placementKey: string,
  turns: number | "fl",
  rotationDirection: RotationDirection
): PlacementFixture {
  const identity = parsePlacementIdentity(placementKey);
  const [selectedStartOrientation, otherStartOrientation] =
    startOrientationsFor(identity.layer, motionType);
  const [startLocation, endLocation] = pathFor(motionType, rotationDirection);
  const [otherStart, otherEnd] = companionPathFor(
    motionType,
    rotationDirection
  );

  const diamondMotion = withCalculatedEndOrientation(
    createMotionData({
      motionType: motionType as MotionType,
      rotationDirection,
      startLocation,
      endLocation,
      arrowLocation: endLocation,
      startOrientation: selectedStartOrientation,
      endOrientation: selectedStartOrientation,
      turns,
      hand: HandSide.LEFT,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    }),
    HandSide.LEFT
  );
  const diamondOther = withCalculatedEndOrientation(
    createMotionData({
      motionType: motionType as MotionType,
      rotationDirection,
      startLocation: otherStart,
      endLocation: otherEnd,
      arrowLocation: otherEnd,
      startOrientation: otherStartOrientation,
      endOrientation: otherStartOrientation,
      turns,
      hand: HandSide.RIGHT,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    }),
    HandSide.RIGHT
  );
  const diamond: PictographData = {
    id: `diamond-${motionType}-${placementKey}-${turns}-${rotationDirection}`,
    letter: identity.letter as never,
    gridMode: GridMode.DIAMOND,
    motions: { left: diamondMotion, right: diamondOther },
  };
  const boxMotion = rotateMotion(diamondMotion, 1);
  const boxOther = rotateMotion(diamondOther, 1);
  const box: PictographData = {
    ...diamond,
    id: `box-${motionType}-${placementKey}-${turns}-${rotationDirection}`,
    gridMode: GridMode.BOX,
    motions: { left: boxMotion, right: boxOther },
  };

  return { diamond, box, diamondMotion, boxMotion };
}

export function buildPictographPlacementFixture(
  source: PictographData,
  turns: number
): PlacementFixture {
  const sourceLeft = source.motions.left;
  const sourceRight = source.motions.right;
  if (!sourceLeft || !sourceRight) {
    throw new Error("The placement lab needs a pictograph with two motions");
  }

  const diamondMotion = materializePictographMotion(
    sourceLeft,
    HandSide.LEFT,
    turns
  );
  const diamondOther = materializePictographMotion(
    sourceRight,
    HandSide.RIGHT,
    turns
  );
  const sourceId = source.id || source.letter || "pictograph";
  const diamond: PictographData = {
    ...source,
    id: `diamond-${sourceId}-${turns}`,
    gridMode: GridMode.DIAMOND,
    motions: {
      ...source.motions,
      left: diamondMotion,
      right: diamondOther,
    },
  };
  const boxMotion = rotateMotion(diamondMotion, 1);
  const boxOther = rotateMotion(diamondOther, 1);
  const box: PictographData = {
    ...diamond,
    id: `box-${sourceId}-${turns}`,
    gridMode: GridMode.BOX,
    startPlacement: getGridPlacementFromLocations(
      boxMotion.startLocation,
      boxOther.startLocation
    ),
    endPlacement: getGridPlacementFromLocations(
      boxMotion.endLocation,
      boxOther.endLocation
    ),
    motions: {
      ...diamond.motions,
      left: boxMotion,
      right: boxOther,
    },
  };

  return { diamond, box, diamondMotion, boxMotion };
}

function materializePictographMotion(
  source: MotionData,
  color: HandSide,
  turns: number
): MotionData {
  const motion = {
    ...source,
    color,
    turns: source.motionType === MotionType.FLOAT ? ("fl" as const) : turns,
    gridMode: GridMode.DIAMOND,
    arrowLocation: source.arrowLocation || source.endLocation,
  };
  return withCalculatedEndOrientation(motion, color);
}

function withCalculatedEndOrientation(
  motion: MotionData,
  color: HandSide
): MotionData {
  return {
    ...motion,
    endOrientation: calculateEndOrientation(motion, color),
  };
}

function startOrientationsFor(
  layer: "layer1" | "layer2" | "radial_layer3" | "nonradial_layer3",
  motionType: PlacementMotionName
): [Orientation, Orientation] {
  // Float advances each prop by one nonradial quadrant. Starting from the
  // opposite layer lets the rendered end state exercise the selected key.
  if (motionType === "float") {
    switch (layer) {
      case "layer2":
        return [Orientation.IN, Orientation.OUT];
      case "radial_layer3":
        return [Orientation.CLOCK, Orientation.OUT];
      case "nonradial_layer3":
        return [Orientation.IN, Orientation.COUNTER];
      default:
        return [Orientation.CLOCK, Orientation.COUNTER];
    }
  }

  switch (layer) {
    case "layer2":
      return [Orientation.CLOCK, Orientation.COUNTER];
    case "radial_layer3":
      return [Orientation.IN, Orientation.COUNTER];
    case "nonradial_layer3":
      return [Orientation.CLOCK, Orientation.OUT];
    default:
      return [Orientation.IN, Orientation.OUT];
  }
}

export function buildPlacementCatalog(
  maps: Record<PlacementMotionName, PlacementMap>
): PlacementMotionCatalog[] {
  return (Object.keys(maps) as PlacementMotionName[])
    .map((motionType) => ({
      motionType,
      keys: buildKeyOptions(motionType, maps[motionType]),
    }))
    .filter((entry) => entry.keys.length > 0);
}

export function rotationDirectionsFor(
  motionType: PlacementMotionName
): RotationDirection[] {
  if (motionType === "float") return [RotationDirection.NO_ROTATION];
  if (motionType === "dash" || motionType === "static") {
    return [
      RotationDirection.CLOCKWISE,
      RotationDirection.COUNTER_CLOCKWISE,
      RotationDirection.NO_ROTATION,
    ];
  }
  return [RotationDirection.CLOCKWISE, RotationDirection.COUNTER_CLOCKWISE];
}

function buildKeyOptions(
  motionType: PlacementMotionName,
  placementMap: PlacementMap
): PlacementKeyOption[] {
  const availableKeys = Object.keys(placementMap);
  return availableKeys
    .map((placementKey) => {
      const turns = Object.keys(placementMap[placementKey] ?? {})
        .map((value): PlacementTurnOption | null => {
          const parsedTurns = value === "fl" ? value : Number(value);
          if (parsedTurns !== "fl" && !Number.isFinite(parsedTurns))
            return null;

          const rotationDirections = rotationDirectionsFor(motionType).filter(
            (rotationDirection) => {
              const fixture = buildPlacementFixture(
                motionType,
                placementKey,
                parsedTurns,
                rotationDirection
              );
              const resolvedKey = generatePlacementKey(
                fixture.diamondMotion,
                fixture.diamond,
                availableKeys
              );
              return availableKeys.includes(resolvedKey);
            }
          );
          return rotationDirections.length > 0
            ? { value, rotationDirections }
            : null;
        })
        .filter((turn): turn is PlacementTurnOption => turn !== null)
        .sort(compareTurns);

      return turns.length > 0 ? { placementKey, turns } : null;
    })
    .filter((entry): entry is PlacementKeyOption => entry !== null)
    .sort((a, b) => a.placementKey.localeCompare(b.placementKey));
}

function compareTurns(a: PlacementTurnOption, b: PlacementTurnOption): number {
  if (a.value === "fl") return -1;
  if (b.value === "fl") return 1;
  return Number(a.value) - Number(b.value);
}

function parsePlacementIdentity(placementKey: string): {
  layer: "layer1" | "layer2" | "radial_layer3" | "nonradial_layer3";
  letter: string;
} {
  const match = placementKey.match(
    /_to_(layer1|layer2|radial_layer3|nonradial_layer3)_(alpha|beta|gamma)(?:_(.+))?$/
  );
  if (!match) return { layer: "layer1", letter: "A" };
  const [, layer, group, suffix] = match;
  const fallback = group === "beta" ? "G" : group === "gamma" ? "M" : "A";
  const letter = suffix ? suffix.replace(/_dash$/, "-") : fallback;
  return {
    layer: layer as "layer1" | "layer2" | "radial_layer3" | "nonradial_layer3",
    letter,
  };
}

function pathFor(
  motionType: PlacementMotionName,
  rotationDirection: RotationDirection
): [GridLocation, GridLocation] {
  if (motionType === "static") return [GridLocation.NORTH, GridLocation.NORTH];
  if (motionType === "dash") return [GridLocation.NORTH, GridLocation.SOUTH];
  if (rotationDirection === RotationDirection.COUNTER_CLOCKWISE) {
    return [GridLocation.NORTH, GridLocation.WEST];
  }
  return [GridLocation.NORTH, GridLocation.EAST];
}

function companionPathFor(
  motionType: PlacementMotionName,
  rotationDirection: RotationDirection
): [GridLocation, GridLocation] {
  if (motionType === "static") return [GridLocation.SOUTH, GridLocation.SOUTH];
  if (motionType === "dash") return [GridLocation.SOUTH, GridLocation.NORTH];
  if (rotationDirection === RotationDirection.COUNTER_CLOCKWISE) {
    return [GridLocation.SOUTH, GridLocation.EAST];
  }
  return [GridLocation.SOUTH, GridLocation.WEST];
}
