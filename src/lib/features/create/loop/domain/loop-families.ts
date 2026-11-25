/**
 * The five ways a run of steps can repeat itself, as the LOOP tab offers them.
 *
 * One family can be reached in more than one form: a Rotated LOOP turns by a
 * quarter or by a half, a Reflected LOOP mirrors across one line or the other.
 * The person picks the family; where their steps end decides the form.
 */

import {
  LOOPType,
  Period,
} from "#lib/shared/foundation/domain/models/generation/circular-models.js";

export type LoopFamily =
  | "rotated"
  | "reflected"
  | "swapped"
  | "inverted"
  | "rewound";

export interface LoopVariant {
  loopType: LOOPType;
  period: Period;
}

export interface LoopFamilyInfo {
  id: LoopFamily;
  /** The type's own colour, matching the LOOP component colours. */
  color: string;
  /** The same colour, light enough to read as words on a dark surface. */
  ink: string;
  /** What reads on top of a solid patch of the type's own colour. */
  on: string;
  /** Font Awesome icon class. */
  icon: string;
  variants: readonly LoopVariant[];
}

const halved = (loopType: LOOPType): LoopVariant => ({
  loopType,
  period: Period.HALVED,
});

export const LOOP_FAMILIES: readonly LoopFamilyInfo[] = [
  {
    id: "rotated",
    color: "#36c3ff",
    ink: "#36c3ff",
    on: "#0b0f17",
    icon: "fa-rotate",
    variants: [
      { loopType: LOOPType.ROTATED, period: Period.QUARTERED },
      halved(LOOPType.ROTATED),
    ],
  },
  {
    id: "reflected",
    color: "#6F2DA8",
    ink: "#a274d6",
    on: "#ffffff",
    icon: "fa-arrows-left-right",
    variants: [halved(LOOPType.MIRRORED), halved(LOOPType.FLIPPED)],
  },
  {
    id: "swapped",
    color: "#2ecc71",
    ink: "#2ecc71",
    on: "#0b0f17",
    icon: "fa-shuffle",
    variants: [halved(LOOPType.SWAPPED)],
  },
  {
    id: "inverted",
    color: "#eb7d00",
    ink: "#eb7d00",
    on: "#0b0f17",
    icon: "fa-circle-half-stroke",
    variants: [halved(LOOPType.INVERTED)],
  },
  {
    id: "rewound",
    color: "#00bcd4",
    ink: "#00bcd4",
    on: "#0b0f17",
    icon: "fa-backward",
    variants: [halved(LOOPType.STRICT_REWOUND)],
  },
];

const BY_ID = new Map(LOOP_FAMILIES.map((info) => [info.id, info]));

export function loopFamily(id: LoopFamily): LoopFamilyInfo {
  return BY_ID.get(id)!;
}

/** A quarter LOOP wears its own icon, so it never looks like a half one. */
export function loopFamilyIcon(
  id: LoopFamily,
  variant: LoopVariant | null
): string {
  return id === "rotated" && variant?.period === Period.QUARTERED
    ? "fa-arrows-spin"
    : loopFamily(id).icon;
}

/** Whether steps that start and end at these placements can repeat this way. */
export type LoopSeedCheck = (
  loopType: LOOPType,
  placementPair: string,
  period: Period
) => boolean;

/** The form this family takes for steps ending here, or null if it can't yet. */
export function variantFor(
  id: LoopFamily,
  startPlacement: string,
  endPlacement: string,
  isSeedValid: LoopSeedCheck
): LoopVariant | null {
  return (
    loopFamily(id).variants.find((variant) =>
      isSeedValid(
        variant.loopType,
        `${startPlacement},${endPlacement}`,
        variant.period
      )
    ) ?? null
  );
}

/** How one row of the finished card differs from the row above it. */
export type RowChange = "r90" | "r180" | "r270" | "mx" | "my" | "same";

/** Where both hands of one step begin and end. */
export interface StepLocations {
  leftStart: string;
  leftEnd: string;
  rightStart: string;
  rightEnd: string;
}

// Clockwise from east, the way a page turns: south is a quarter on from east.
const ANGLES: Readonly<Record<string, number>> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: 225,
  n: 270,
  ne: 315,
};

const MOVES: readonly { id: RowChange; map: (angle: number) => number }[] = [
  { id: "r90", map: (a) => a + 90 },
  { id: "r180", map: (a) => a + 180 },
  { id: "r270", map: (a) => a + 270 },
  { id: "mx", map: (a) => 180 - a },
  { id: "my", map: (a) => 360 - a },
];

const normal = (angle: number) => ((angle % 360) + 360) % 360;

/**
 * The move that carries the first step of a row onto the first step of the
 * next one, so the copies can fly the way the LOOP really works. Swapped,
 * Inverted and Rewound rows keep their shape on the page, so they say "same"
 * and redraw in place.
 */
export function rowChange(
  family: LoopFamily,
  from: StepLocations | null,
  to: StepLocations | null
): RowChange {
  if (family !== "rotated" && family !== "reflected") return "same";
  if (!from || !to) return "same";
  const before = [from.leftStart, from.leftEnd, from.rightStart, from.rightEnd];
  const after = [to.leftStart, to.leftEnd, to.rightStart, to.rightEnd];
  for (const move of MOVES) {
    const fits = before.every((location, index) => {
      const a = ANGLES[location];
      const b = ANGLES[after[index]!];
      return a !== undefined && b !== undefined && normal(move.map(a)) === b;
    });
    if (fits) return move.id;
  }
  return "same";
}

/**
 * The turn or mirror that takes a row's change back. A copy draws the step it
 * will land as under this, so once it has turned it is exactly that step.
 */
export function rowChangeUndo(change: RowChange): string {
  switch (change) {
    case "r90":
      return "rotate(-90deg)";
    case "r180":
      return "rotate(-180deg)";
    case "r270":
      return "rotate(90deg)";
    default:
      // A mirror takes itself back.
      return rowChangeTransform(change);
  }
}

/** The CSS turn or mirror that a copy makes while it travels down a row. */
export function rowChangeTransform(change: RowChange): string {
  switch (change) {
    case "r90":
      return "rotate(90deg)";
    case "r180":
      return "rotate(180deg)";
    case "r270":
      return "rotate(-90deg)";
    case "mx":
      return "scaleX(-1)";
    case "my":
      return "scaleY(-1)";
    default:
      return "none";
  }
}
