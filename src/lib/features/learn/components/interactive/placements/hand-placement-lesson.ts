import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  getGridLocationsFromPlacement,
  getGridPlacementFromLocations,
} from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
import { buildPlacementPictographData } from "#lib/shared/pictograph/grid/services/prop-placement-view-model.js";
import { rotateLocation } from "#lib/shared/create/services/rotation-helpers.js";
import { mirrorLocation } from "#lib/shared/pictograph/shared/domain/geometry/mirror-vertical.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
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

/**
 * The lesson is two rounds of finding all three placements, first on the
 * diamond grid and then on the box grid, then free play. There are no
 * prompts: every two-hand build is one of the three, so the learner fills
 * the slots in any order (Austen, 2026-10-14).
 */
export type PlacementWorkshopPhase = "explore" | "box" | "complete";

export interface PlacementWorkshopCheckpoint {
  version: 2;
  phase: PlacementWorkshopPhase;
  explored: PlacementType[];
  boxFound: PlacementType[];
}

function kindsFrom(value: unknown) {
  return Array.isArray(value)
    ? PLACEMENT_KINDS.filter((kind) => value.includes(kind))
    : [];
}

export function restorePlacementWorkshop(
  value: unknown
): PlacementWorkshopCheckpoint {
  const fresh: PlacementWorkshopCheckpoint = {
    version: 2,
    phase: "explore",
    explored: [],
    boxFound: [],
  };
  if (!value || typeof value !== "object" || !("version" in value))
    return fresh;
  const saved = value as Record<string, unknown>;
  // Version 1 had six prompted practice rounds. A finished pass stays
  // finished, and a learner part way through practice resumes on the box
  // round, which replaced it.
  if (saved.version === 1) {
    const explored = kindsFrom(saved.explored);
    if (saved.phase === "complete" && saved.round === 6)
      return { ...fresh, phase: "complete", explored: [...PLACEMENT_KINDS] };
    if (saved.phase === "practice" && explored.length === 3)
      return { ...fresh, phase: "box", explored };
    return { ...fresh, explored };
  }
  if (saved.version !== 2) return fresh;
  const explored = kindsFrom(saved.explored);
  const boxFound = kindsFrom(saved.boxFound);
  const phase: PlacementWorkshopPhase =
    saved.phase === "complete"
      ? "complete"
      : saved.phase === "box" && explored.length === 3
        ? "box"
        : "explore";
  return { version: 2, phase, explored, boxFound };
}
