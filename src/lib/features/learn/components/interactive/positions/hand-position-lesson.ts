import {
  GridLocation,
  GridMode,
  GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridLocationsFromPosition,
  getGridPositionFromLocations,
} from "$lib/shared/pictograph/grid/services/grid-position-deriver";
import { getPlacementGridPoints } from "$lib/shared/pictograph/grid/services/placement-grid-points";
import { buildPlacementPictographData } from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import { mirrorLocation } from "$lib/shared/pictograph/shared/domain/geometry/mirror-vertical";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  POSITION_TYPE_INFO,
  type PositionType,
} from "../../../domain/constants/position-quiz-data";

export const POSITION_KINDS: PositionType[] = ["alpha", "beta", "gamma"];
export const POSITION_LETTERS: Record<PositionType, Letter> = {
  alpha: Letter.ALPHA,
  beta: Letter.BETA,
  gamma: Letter.GAMMA,
};

// Verbatim definitions from the written Level 1 Guide.
export const POSITION_DEFINITIONS: Record<PositionType, string> = {
  alpha: "In Alpha, the hands occupy the points across from each other.",
  beta: "In Beta, the hands occupy the same point.",
  gamma: "In Gamma, the hands form a right angle.",
};

export const POSITION_CHALLENGES = [
  { kind: "alpha", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "beta", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "gamma", gridMode: GridMode.DIAMOND, guided: true },
  { kind: "gamma", gridMode: GridMode.BOX, guided: false },
  { kind: "alpha", gridMode: GridMode.BOX, guided: false },
  { kind: "beta", gridMode: GridMode.BOX, guided: false },
] satisfies { kind: PositionType; gridMode: GridMode; guided: boolean }[];

export function positionKindFor(
  left: GridLocation | null,
  right: GridLocation | null
): PositionType | null {
  if (
    !left ||
    !right ||
    left === GridLocation.CENTER ||
    right === GridLocation.CENTER
  )
    return null;
  const position = getGridPositionFromLocations(left, right);
  return POSITION_KINDS.find((kind) => position.startsWith(kind)) ?? null;
}

export function positionExample(kind: PositionType, gridMode: GridMode) {
  const base = {
    alpha: GridPosition.ALPHA1,
    beta: GridPosition.BETA5,
    gamma: GridPosition.GAMMA11,
  };
  const [left, right] = getGridLocationsFromPosition(base[kind]);
  const turn = gridMode === GridMode.BOX ? 1 : 0;
  return {
    left: rotateLocation(left, turn) as GridLocation,
    right: rotateLocation(right, turn) as GridLocation,
  };
}

export function positionPreview(
  kind: PositionType,
  gridMode: GridMode,
  fixedLeft?: GridLocation
) {
  const example = fixedLeft
    ? positionCorrectionPair(fixedLeft, kind, gridMode)
    : positionExample(kind, gridMode);
  return positionPairPreview(example, gridMode);
}

export function positionPairPreview(
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
  const kind = positionKindFor(example.left, example.right);
  return { ...data, letter: kind ? POSITION_LETTERS[kind] : null };
}

/** Keep the learner's first hand in place so the visual target shows a single edit. */
export function positionCorrectionPair(
  left: GridLocation,
  target: PositionType,
  gridMode: GridMode
) {
  const point = getPlacementGridPoints(gridMode).find(
    (point) => positionKindFor(left, point.location) === target
  );
  return { left, right: point?.location ?? left };
}

export function transformPosition(
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

export function changePositionGrid(
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

export function positionCorrection(
  left: GridLocation,
  right: GridLocation,
  target: PositionType,
  gridMode: GridMode
) {
  const built = positionKindFor(left, right);
  if (!built || built === target) return "";
  const correction = positionCorrectionPair(left, target, gridMode);
  const point = getPlacementGridPoints(gridMode).find(
    (point) => point.location === correction.right
  );
  return `You built ${POSITION_TYPE_INFO[built].label}. ${POSITION_DEFINITIONS[built]}${point ? ` Keep the left hand where it is. Move the right hand to ${point.label}.` : ""}`;
}

export interface PositionWorkshopCheckpoint {
  version: 1;
  phase: "explore" | "practice" | "complete";
  round: number;
  explored: PositionType[];
}

export function restorePositionWorkshop(
  value: unknown
): PositionWorkshopCheckpoint {
  const fresh: PositionWorkshopCheckpoint = {
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
  const saved = value as Partial<PositionWorkshopCheckpoint>;
  const round =
    Number.isInteger(saved.round) &&
    saved.round! >= 0 &&
    saved.round! <= POSITION_CHALLENGES.length
      ? saved.round!
      : 0;
  return {
    version: 1,
    round,
    phase:
      round === POSITION_CHALLENGES.length
        ? "complete"
        : saved.phase === "practice"
          ? "practice"
          : "explore",
    explored: Array.isArray(saved.explored)
      ? POSITION_KINDS.filter((kind) => saved.explored!.includes(kind))
      : [],
  };
}
