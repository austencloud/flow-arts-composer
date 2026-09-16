import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridLocationsFromPlacement,
  getGridPlacementFromLocations,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { getPlacementGridPoints } from "$lib/shared/pictograph/grid/services/placement-grid-points";
import { buildPlacementPictographData } from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import { mirrorLocation } from "$lib/shared/pictograph/shared/domain/geometry/mirror-vertical";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  PLACEMENT_TYPE_INFO,
  type PlacementType,
} from "../../../domain/constants/placement-quiz-data";

export const PLACEMENT_KINDS: PlacementType[] = ["alpha", "beta", "gamma"];
export const PLACEMENT_LETTERS: Record<PlacementType, Letter> = {
  alpha: Letter.ALPHA,
  beta: Letter.BETA,
  gamma: Letter.GAMMA,
};

// Verbatim definitions from the written Level 1 Guide.
export const PLACEMENT_DEFINITIONS: Record<PlacementType, string> = {
  alpha: "In Alpha, the hands occupy the points across from each other.",
  beta: "In Beta, the hands occupy the same point.",
  gamma: "In Gamma, the hands form a right angle.",
};

export const PLACEMENT_CHALLENGES = [
  { kind: "alpha", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "beta", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "gamma", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "gamma", gridMode: GridMode.BOX, guided: false },
  { kind: "alpha", gridMode: GridMode.BOX, guided: false },
  { kind: "beta", gridMode: GridMode.BOX, guided: false },
] satisfies { kind: PlacementType; gridMode: GridMode; guided: boolean }[];

export function placementKindFor(
  left: GridLocation | null,
  right: GridLocation | null
): PlacementType | null {
  if (
    !left ||
    !right ||
    left === GridLocation.CENTER ||
    right === GridLocation.CENTER
  )
    return null;
  const placement = getGridPlacementFromLocations(left, right);
  return PLACEMENT_KINDS.find((kind) => placement.startsWith(kind)) ?? null;
}

export function placementExample(kind: PlacementType, gridMode: GridMode) {
  const base = {
    alpha: GridPlacement.ALPHA1,
    beta: GridPlacement.BETA5,
    gamma: GridPlacement.GAMMA11,
  };
  const [left, right] = getGridLocationsFromPlacement(base[kind]);
  const turn = gridMode === GridMode.BOX ? 1 : 0;
  return {
    left: rotateLocation(left, turn) as GridLocation,
    right: rotateLocation(right, turn) as GridLocation,
  };
}

export function placementPreview(
  kind: PlacementType,
  gridMode: GridMode,
  fixedLeft?: GridLocation
) {
  const example = fixedLeft
    ? placementCorrectionPair(fixedLeft, kind, gridMode)
    : placementExample(kind, gridMode);
  return placementPairPreview(example, gridMode);
}

export function placementPairPreview(
  example: { left: GridLocation; right: GridLocation },
  gridMode: GridMode
) {
  const data = buildPlacementPictographData({
    gridMode,
    leftLocation: example.left,
    rightLocation: example.right,
    leftOrientation: Orientation.IN,
    rightOrientation: Orientation.IN,
    leftPropType: PropType.HAND,
    rightPropType: PropType.HAND,
    betaSwapped: false,
    previewPictographData: null,
  });
  const kind = placementKindFor(example.left, example.right);
  return { ...data, letter: kind ? PLACEMENT_LETTERS[kind] : null };
}

/** Keep the learner's first hand in place so the visual target shows a single edit. */
export function placementCorrectionPair(
  left: GridLocation,
  target: PlacementType,
  gridMode: GridMode
) {
  const point = getPlacementGridPoints(gridMode).find(
    (point) => placementKindFor(left, point.location) === target
  );
  return { left, right: point?.location ?? left };
}

export function transformPlacement(
  left: GridLocation,
  right: GridLocation,
  action: "rotate" | "mirror" | "swap",
  options: { rotationSteps?: number; reflectionAxis?: 0 | 1 | 2 | 3 } = {}
) {
  if (action === "swap") return { left: right, right: left };
  const axis = options.reflectionAxis ?? 0;
  const transform =
    action === "rotate"
      ? (location: GridLocation) =>
          rotateLocation(location, options.rotationSteps ?? 2) as GridLocation
      : (location: GridLocation) =>
          rotateLocation(
            mirrorLocation(rotateLocation(location, -axis)) as GridLocation,
            axis
          ) as GridLocation;
  return { left: transform(left), right: transform(right) };
}

export function changePlacementGrid(
  left: GridLocation | null,
  right: GridLocation | null,
  from: GridMode,
  to: GridMode
) {
  const turn = from === to ? 0 : to === GridMode.BOX ? 1 : -1;
  return {
    left: left ? (rotateLocation(left, turn) as GridLocation) : null,
    right: right ? (rotateLocation(right, turn) as GridLocation) : null,
  };
}

export function placementCorrection(
  left: GridLocation,
  right: GridLocation,
  target: PlacementType,
  gridMode: GridMode
) {
  const built = placementKindFor(left, right);
  if (!built || built === target) return "";
  const correction = placementCorrectionPair(left, target, gridMode);
  const point = getPlacementGridPoints(gridMode).find(
    (point) => point.location === correction.right
  );
  return `You built ${PLACEMENT_TYPE_INFO[built].label}. ${PLACEMENT_DEFINITIONS[built]}${point ? ` Keep the left hand where it is. Move the right hand to ${point.label}.` : ""}`;
}

export interface PlacementWorkshopCheckpoint {
  version: 1;
  phase: "explore" | "practice" | "complete";
  round: number;
  explored: PlacementType[];
}

export function restorePlacementWorkshop(
  value: unknown
): PlacementWorkshopCheckpoint {
  const fresh: PlacementWorkshopCheckpoint = {
    version: 1,
    phase: "explore",
    round: 0,
    explored: [],
  };
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    return fresh;
  const saved = value as Partial<PlacementWorkshopCheckpoint>;
  const round =
    Number.isInteger(saved.round) &&
    saved.round! >= 0 &&
    saved.round! <= PLACEMENT_CHALLENGES.length
      ? saved.round!
      : 0;
  return {
    version: 1,
    round,
    phase:
      round === PLACEMENT_CHALLENGES.length
        ? "complete"
        : saved.phase === "practice"
          ? "practice"
          : "explore",
    explored: Array.isArray(saved.explored)
      ? PLACEMENT_KINDS.filter((kind) => saved.explored!.includes(kind))
      : [],
  };
}
