/**
 * Mathematical Foundations - Content Data
 *
 * Real data for the mathematical foundations page.
 * Uses actual TKA concepts and domain models.
 */

import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  Orientation,
  RotationDirection,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation, GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Triad palette — single source for the thesis/antithesis/synthesis colors
 * used in data-driven styling. The CSS mirror lives in
 * ../components/triad-palette.css (.mf-triad-scope) — keep the two in sync.
 */
// NOTE: These hexes manually mirror the CSS custom properties in
// ../components/triad-palette.css (.mf-triad-scope: --mf-thesis/--mf-antithesis/
// --mf-synthesis). That .css file is the canonical source of truth for the triad
// palette; this object exists only for data-driven inline styles that can't read
// the CSS variables. If you change a color, update triad-palette.css FIRST, then
// match it here — there is no automated sync, so any drift is silent.
export const TRIAD_COLORS = {
  thesis: "#6366f1", // Indigo
  antithesis: "#ec4899", // Pink
  synthesis: "#14b8a6", // Teal
} as const;

export interface PlacementGroupData {
  name: string;
  greek: string;
  count: number;
  description: string;
  relationship: string;
  color: string;
}

export const PLACEMENT_GROUPS: PlacementGroupData[] = [
  {
    name: "Alpha",
    greek: "α",
    count: 8,
    description: "Hands point in opposite directions",
    relationship: "Hands at opposite points",
    color: TRIAD_COLORS.thesis
  },
  {
    name: "Beta",
    greek: "β",
    count: 8,
    description: "Hands point in the same direction",
    relationship: "0° apart",
    color: TRIAD_COLORS.antithesis
  },
  {
    name: "Gamma",
    greek: "γ",
    count: 16,
    description: "All other combinations (perpendicular, adjacent)",
    relationship: "Contains two halves (1-8 and 9-16)",
    color: TRIAD_COLORS.synthesis
  },
];

export interface LetterTriadData {
  letter: Letter;
  label: string;
  leftMotion: MotionType;
  rightMotion: MotionType;
  pattern: "thesis" | "antithesis" | "synthesis";
  patternLabel: string;
  description: string;
}

export const LETTER_TRIAD: LetterTriadData[] = [
  {
    letter: Letter.A,
    label: "A",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    pattern: "thesis",
    patternLabel: "Pro + Pro",
    description: "Both hands rotate with their movement direction",
  },
  {
    letter: Letter.B,
    label: "B",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    pattern: "antithesis",
    patternLabel: "Anti + Anti",
    description: "Both hands rotate against their movement direction",
  },
  {
    letter: Letter.C,
    label: "C",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.ANTI,
    pattern: "synthesis",
    patternLabel: "Pro + Anti",
    description: "One hand rotates with, one against - the hybrid",
  },
];

/**
 * Creates real PictographData for letter A (Pro + Pro)
 */
export function createLetterAPictograph(): PictographData {
  return {
    id: "math-foundations-letter-a",
    letter: Letter.A,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA3,
    motions: {
      left: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 0,
        hand: HandSide.LEFT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
      right: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}

/**
 * Creates real PictographData for letter B (Anti + Anti)
 */
export function createLetterBPictograph(): PictographData {
  return {
    id: "math-foundations-letter-b",
    letter: Letter.B,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA3,
    motions: {
      left: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 0,
        hand: HandSide.LEFT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
      right: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}

/**
 * Creates real PictographData for letter C (Pro + Anti hybrid)
 */
export function createLetterCPictograph(): PictographData {
  return {
    id: "math-foundations-letter-c",
    letter: Letter.C,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA3,
    motions: {
      left: createMotionData({
        motionType: MotionType.PRO,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.OUT,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        turns: 0,
        hand: HandSide.LEFT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
      right: createMotionData({
        motionType: MotionType.ANTI,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.IN,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}

export interface MotionTypeTriadData {
  type: MotionType | "SHIFT";
  label: string;
  pattern: "thesis" | "antithesis" | "synthesis";
  patternLabel: string;
  description: string;
  intensity: string;
  variations?: number;
}

export const MOTION_TYPE_TRIAD: MotionTypeTriadData[] = [
  {
    type: MotionType.STATIC,
    label: "Static",
    pattern: "antithesis",
    patternLabel: "No Movement",
    description: "The prop stays in place (0 steps) - no grid movement at all",
    intensity: "Minimal",
  },
  {
    type: MotionType.DASH,
    label: "Dash",
    pattern: "thesis",
    patternLabel: "Opposite Position",
    description: "The prop moves to the opposite position via straight line through center (2 steps)",
    intensity: "Maximum",
  },
  {
    type: "SHIFT",
    label: "Shift",
    pattern: "synthesis",
    patternLabel: "Adjacent Position",
    description: "The prop moves to an adjacent position (1 step) - TWO variations: clockwise or counter-clockwise",
    intensity: "Medium",
    variations: 2,
  },
];

export interface OrientationPairingData {
  family: string;
  members: string[];
  behavior: string;
  description: string;
  color: string;
}

export const ORIENTATION_PAIRINGS: OrientationPairingData[] = [
  {
    family: "Preserving",
    members: ["Pro", "Static"],
    behavior: "Retain orientation at 0 turns",
    description: "Both PRO and STATIC keep the prop pointing the same direction when no turns are applied",
    color: TRIAD_COLORS.thesis,
  },
  {
    family: "Swapping",
    members: ["Anti", "Dash"],
    behavior: "Swap orientation at 0 turns",
    description: "Both ANTI and DASH flip the prop's direction (IN↔OUT or CLOCK↔COUNTER) even with no turns",
    color: TRIAD_COLORS.antithesis,
  },
];

export interface OrientationData {
  value: Orientation;
  label: string;
  category: "radial" | "non-radial";
  description: string;
  opposite: Orientation;
}

export const ORIENTATIONS: OrientationData[] = [
  {
    value: Orientation.IN,
    label: "In",
    category: "radial",
    description: "Prop points toward the center",
    opposite: Orientation.OUT,
  },
  {
    value: Orientation.OUT,
    label: "Out",
    category: "radial",
    description: "Prop points away from the center",
    opposite: Orientation.IN,
  },
  {
    value: Orientation.CLOCK,
    label: "Clock",
    category: "non-radial",
    description: "Prop points in clockwise direction",
    opposite: Orientation.COUNTER,
  },
  {
    value: Orientation.COUNTER,
    label: "Counter",
    category: "non-radial",
    description: "Prop points in counter-clockwise direction",
    opposite: Orientation.CLOCK,
  },
];

export const CORE_PATTERN = {
  title: "The Core Pattern",
  subtitle: "Binary Synthesis",
};
