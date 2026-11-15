/**
 * The rules behind the Start Placement chooser: a mode (Any, Pick one,
 * Custom), a kind of placement (hands apart, together or adjacent), a turn
 * stepper within a kind, and tapping a hand point.
 *
 * Everything works on the stored blocklist and on the start placement
 * variations loaded for the current grid mode, so box mode (even placement
 * numbers) and diamond mode (odd) both work without a table of names. The only
 * names this module knows are the alpha / beta / gamma prefixes.
 *
 * A wrong answer here is silent: the generator just starts somewhere else, so
 * every rule is unit tested (start-placement-chooser.test.ts).
 */

import type {
  GridLocation,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { blockAllExcept } from "#lib/shared/components/placement-picker/placement-selection.js";

export type StartMode = "any" | "one" | "custom";

/** Hands apart (alpha), together (beta) or adjacent (gamma), in that order. */
export type PlacementKind = "apart" | "together" | "adjacent";

export const PLACEMENT_KINDS: readonly PlacementKind[] = [
  "apart",
  "together",
  "adjacent",
];

const KIND_PREFIX: Record<PlacementKind, string> = {
  apart: "alpha",
  together: "beta",
  adjacent: "gamma",
};

/** One start placement and where each hand sits, in picker order. */
export interface StartChoice {
  placement: GridPlacement;
  kind: PlacementKind;
  left: GridLocation;
  right: GridLocation;
}

export function kindOf(placement: string): PlacementKind | null {
  for (const kind of PLACEMENT_KINDS) {
    const prefix = KIND_PREFIX[kind];
    if (
      placement.startsWith(prefix) &&
      /^\d+$/.test(placement.slice(prefix.length))
    ) {
      return kind;
    }
  }
  return null;
}

/** The loaded variations as choices. Variations of another kind are dropped. */
export function choicesFromVariations(
  variations: readonly PictographData[]
): StartChoice[] {
  const choices: StartChoice[] = [];
  for (const variation of variations) {
    const placement = variation.startPlacement as GridPlacement | undefined;
    const left = variation.motions?.left?.startLocation;
    const right = variation.motions?.right?.startLocation;
    if (!placement || !left || !right) continue;
    const kind = kindOf(placement);
    if (!kind) continue;
    choices.push({ placement, kind, left, right });
  }
  return choices;
}

function allowedChoices(
  choices: readonly StartChoice[],
  blocked: readonly GridPlacement[]
): StartChoice[] {
  const blockedSet = new Set(blocked);
  return choices.filter((choice) => !blockedSet.has(choice.placement));
}

/**
 * The mode the blocklist describes. Blocked names that are not in this grid
 * mode's set do not count, so a stale entry cannot turn Any into Custom.
 */
export function modeFromBlocked(
  choices: readonly StartChoice[],
  blocked: readonly GridPlacement[]
): StartMode {
  const allowed = allowedChoices(choices, blocked).length;
  if (allowed === choices.length) return "any";
  if (allowed === 1) return "one";
  return "custom";
}

/**
 * The mode the screen shows: what the data says, except that a tap on Custom
 * while the data still reads Any or Pick one shows the grid without changing
 * the setting until a cell is tapped.
 */
export function shownMode(
  dataMode: StartMode,
  customRequested: boolean
): StartMode {
  return customRequested ? "custom" : dataMode;
}

/**
 * The placement the big picture draws: the one allowed placement in Pick one,
 * otherwise the first allowed placement in picker order (the first of all in
 * Any).
 */
export function shownChoice(
  choices: readonly StartChoice[],
  blocked: readonly GridPlacement[]
): StartChoice | null {
  return allowedChoices(choices, blocked)[0] ?? choices[0] ?? null;
}

export function choicesOfKind(
  choices: readonly StartChoice[],
  kind: PlacementKind
): StartChoice[] {
  return choices.filter((choice) => choice.kind === kind);
}

/** The previous (-1) or next (+1) placement of the same kind, wrapping. */
export function stepWithinKind(
  choices: readonly StartChoice[],
  current: GridPlacement,
  delta: number
): GridPlacement {
  const from = choices.find((choice) => choice.placement === current);
  if (!from) return current;
  const sameKind = choicesOfKind(choices, from.kind);
  const index = sameKind.findIndex((choice) => choice.placement === current);
  const n = sameKind.length;
  const next = sameKind[(((index + delta) % n) + n) % n];
  return next?.placement ?? current;
}

/**
 * Switch to another kind, keeping the left hand where it is when that kind has
 * a placement there, else that kind's first placement. With no current
 * placement (Any), the kind's first placement.
 */
export function changeKind(
  choices: readonly StartChoice[],
  current: GridPlacement | null,
  kind: PlacementKind
): GridPlacement | null {
  const sameKind = choicesOfKind(choices, kind);
  const from = current
    ? choices.find((choice) => choice.placement === current)
    : undefined;
  if (from) {
    const keep = sameKind.find((choice) => choice.left === from.left);
    if (keep) return keep.placement;
  }
  return sameKind[0]?.placement ?? null;
}

/** The hand points this grid mode uses, in the order the variations name them. */
export function handPoints(choices: readonly StartChoice[]): GridLocation[] {
  const points: GridLocation[] = [];
  for (const choice of choices) {
    if (!points.includes(choice.left)) points.push(choice.left);
  }
  return points;
}

/**
 * Tap a hand point: the left (blue) hand moves there and the kind stays. For
 * adjacent hands, a tap on the point the left hand is already on swaps which
 * side the right hand is on; a move elsewhere keeps the right hand on the
 * same side (the same turn away from the left hand) as before.
 */
export function moveLeftHandTo(
  choices: readonly StartChoice[],
  current: GridPlacement,
  point: GridLocation
): GridPlacement {
  const from = choices.find((choice) => choice.placement === current);
  if (!from) return current;
  const sameKind = choicesOfKind(choices, from.kind);
  const there = sameKind.filter((choice) => choice.left === point);
  if (there.length === 0) return current;

  if (point === from.left) {
    const other = there.find((choice) => choice.right !== from.right);
    return other?.placement ?? current;
  }

  if (there.length === 1) return there[0]!.placement;

  // Several placements put the left hand there (adjacent hands): keep the
  // right hand the same turn away from the left hand as it is now.
  const turn = turnBetween(from.left, from.right);
  const sameSide = there.find(
    (choice) => turnBetween(choice.left, choice.right) === turn
  );
  return (sameSide ?? there[0]!).placement;
}

const LOCATION_ANGLE: Partial<Record<GridLocation, number>> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};

function turnBetween(from: GridLocation, to: GridLocation): number | null {
  const a = LOCATION_ANGLE[from];
  const b = LOCATION_ANGLE[to];
  if (a === undefined || b === undefined) return null;
  return (((b - a) % 360) + 360) % 360;
}

/** Block every placement but one. */
export function pickOnly(
  choices: readonly StartChoice[],
  placement: GridPlacement
): GridPlacement[] {
  return blockAllExcept(
    choices.map((choice) => choice.placement),
    placement
  );
}

/**
 * Leaving Custom through the mode control: Any clears the blocklist; Pick one
 * keeps the first allowed placement and blocks the rest.
 */
export function leaveCustom(
  choices: readonly StartChoice[],
  blocked: readonly GridPlacement[],
  target: "any" | "one"
): GridPlacement[] {
  if (target === "any") return [];
  const first = shownChoice(choices, blocked);
  return first ? pickOnly(choices, first.placement) : [...blocked];
}
