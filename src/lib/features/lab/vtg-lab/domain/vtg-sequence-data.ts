/**
 * VTG Sequence Data
 *
 * Defines 4-step cycle chains for all VTG modes.
 * Each chain represents one complete VTG pattern that can be
 * rendered as a horizontal strip of pictographs.
 *
 * Hand paths are derived from the CSV (DiamondPictographDataframe.csv)
 * and verified against all 22 Type 1 letters. The core insight:
 * within a single chain, both hands rotate around the grid at 90°
 * per beat - only the motion type and rotation direction differ
 * between letters.
 */

import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { VTGMode } from "$lib/features/learn/domain/constants/vtg-experience-data";
import type { RotationStyle } from "./vtg-lab-types";

// Shortcuts
const L = GridLocation;
const P = GridPlacement;
const M = MotionType;
const R = RotationDirection;

type FivePoints = [
  GridLocation,
  GridLocation,
  GridLocation,
  GridLocation,
  GridLocation,
];

/** Compact chain definition for a 4-step VTG cycle */
export interface ChainDef {
  /** Display label (letter or compound name) */
  label: string;
  /** Compound mnemonic (e.g. "Disco Jam") */
  mnemonic?: string;
  /** Rotation style for UI badges */
  rotationStyle: RotationStyle;
  /** Letters in the cycle - 1 for same-placement, 2 for compounds (alternating) */
  letters: [Letter] | [Letter, Letter];
  /** Left hand motion properties (constant across all 4 beats) */
  left: { motion: MotionType; rotation: RotationDirection };
  /** Right hand motion properties (constant across all 4 beats) */
  right: { motion: MotionType; rotation: RotationDirection };
  /** 5 left hand waypoints defining 4 beats (beat N: leftPath[N] → leftPath[N+1]) */
  leftPath: FivePoints;
  /** 5 right hand waypoints defining 4 beats */
  rightPath: FivePoints;
}

/**
 * Map (left location, right location) → GridPlacement.
 * Derived from the Diamond mode grid geometry.
 */
const LOCATION_TO_PLACEMENT: Record<string, GridPlacement> = {
  // Alpha - hands at opposite points
  [`${L.SOUTH},${L.NORTH}`]: P.ALPHA1,
  [`${L.WEST},${L.EAST}`]: P.ALPHA3,
  [`${L.NORTH},${L.SOUTH}`]: P.ALPHA5,
  [`${L.EAST},${L.WEST}`]: P.ALPHA7,
  // Beta - hands at the same point
  [`${L.NORTH},${L.NORTH}`]: P.BETA1,
  [`${L.EAST},${L.EAST}`]: P.BETA3,
  [`${L.SOUTH},${L.SOUTH}`]: P.BETA5,
  [`${L.WEST},${L.WEST}`]: P.BETA7,
  // Gamma set 1 - left one step CCW of right (90° apart)
  [`${L.WEST},${L.NORTH}`]: P.GAMMA1,
  [`${L.NORTH},${L.EAST}`]: P.GAMMA3,
  [`${L.EAST},${L.SOUTH}`]: P.GAMMA5,
  [`${L.SOUTH},${L.WEST}`]: P.GAMMA7,
  // Gamma set 2 - left one step CW of right (90° apart, other chirality)
  [`${L.EAST},${L.NORTH}`]: P.GAMMA9,
  [`${L.SOUTH},${L.EAST}`]: P.GAMMA11,
  [`${L.WEST},${L.SOUTH}`]: P.GAMMA13,
  [`${L.NORTH},${L.WEST}`]: P.GAMMA15,
};

function placementAt(
  leftLoc: GridLocation,
  rightLoc: GridLocation
): GridPlacement {
  const key = `${leftLoc},${rightLoc}`;
  const pos = LOCATION_TO_PLACEMENT[key];
  if (!pos)
    throw new Error(`No placement for left=${leftLoc}, right=${rightLoc}`);
  return pos;
}

// ─── Shared hand paths ─────────────────────────────────────────────────
// Hand paths are the same within a mode - only motion type/rotation differ.

// SS: Left shifts CCW, Right shifts CW (alpha → alpha)
const SS_LEFT: FivePoints = [L.WEST, L.NORTH, L.EAST, L.SOUTH, L.WEST];
const SS_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// TS: Both hands shift CW together (beta → beta)
const TS_LEFT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];
const TS_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// TO: Left CCW, Right CW - entering from β (β→α→β→α)
const TO_LEFT: FivePoints = [L.EAST, L.NORTH, L.WEST, L.SOUTH, L.EAST];
const TO_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// SO: Same compound cycle as TO, entering from α (α→β→α→β)
const SO_LEFT: FivePoints = [L.NORTH, L.WEST, L.SOUTH, L.EAST, L.NORTH];
const SO_RIGHT: FivePoints = [L.SOUTH, L.WEST, L.NORTH, L.EAST, L.SOUTH];

// QS set 1: Both CW (γ3→γ5→γ7→γ1)
const QS1_LEFT: FivePoints = [L.NORTH, L.EAST, L.SOUTH, L.WEST, L.NORTH];
const QS1_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// QS set 2: Both CW (γ11→γ13→γ15→γ9)
const QS2_LEFT: FivePoints = [L.SOUTH, L.WEST, L.NORTH, L.EAST, L.SOUTH];
const QS2_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// QO: Left CCW, Right CW - cross-set compound (γ3→γ13→γ7→γ9)
const QO_LEFT: FivePoints = [L.NORTH, L.WEST, L.SOUTH, L.EAST, L.NORTH];
const QO_RIGHT: FivePoints = [L.EAST, L.SOUTH, L.WEST, L.NORTH, L.EAST];

// ─── Chain definitions per mode ───────────────────────────────────────

const SS_CHAINS: ChainDef[] = [
  {
    label: "A",
    rotationStyle: "pro/pro",
    letters: [Letter.A],
    left: { motion: M.PRO, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: SS_LEFT,
    rightPath: SS_RIGHT,
  },
  {
    label: "B",
    rotationStyle: "anti/anti",
    letters: [Letter.B],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: SS_LEFT,
    rightPath: SS_RIGHT,
  },
  {
    label: "C",
    rotationStyle: "hybrid",
    letters: [Letter.C],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: SS_LEFT,
    rightPath: SS_RIGHT,
  },
];

const TS_CHAINS: ChainDef[] = [
  {
    label: "G",
    rotationStyle: "pro/pro",
    letters: [Letter.G],
    left: { motion: M.PRO, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: TS_LEFT,
    rightPath: TS_RIGHT,
  },
  {
    label: "H",
    rotationStyle: "anti/anti",
    letters: [Letter.H],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: TS_LEFT,
    rightPath: TS_RIGHT,
  },
  {
    label: "I",
    rotationStyle: "hybrid",
    letters: [Letter.I],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: TS_LEFT,
    rightPath: TS_RIGHT,
  },
];

const TO_CHAINS: ChainDef[] = [
  {
    label: "DJ",
    mnemonic: "Disco Jam",
    rotationStyle: "pro/pro",
    letters: [Letter.D, Letter.J],
    left: { motion: M.PRO, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: TO_LEFT,
    rightPath: TO_RIGHT,
  },
  {
    label: "EK",
    mnemonic: "Exploding Kitten",
    rotationStyle: "anti/anti",
    letters: [Letter.E, Letter.K],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: TO_LEFT,
    rightPath: TO_RIGHT,
  },
  {
    label: "FL",
    mnemonic: "Fruity Loops",
    rotationStyle: "hybrid",
    letters: [Letter.F, Letter.L],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: TO_LEFT,
    rightPath: TO_RIGHT,
  },
];

const SO_CHAINS: ChainDef[] = [
  {
    label: "JD",
    mnemonic: "Disco Jam",
    rotationStyle: "pro/pro",
    letters: [Letter.J, Letter.D],
    left: { motion: M.PRO, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: SO_LEFT,
    rightPath: SO_RIGHT,
  },
  {
    label: "KE",
    mnemonic: "Exploding Kitten",
    rotationStyle: "anti/anti",
    letters: [Letter.K, Letter.E],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: SO_LEFT,
    rightPath: SO_RIGHT,
  },
  {
    label: "LF",
    mnemonic: "Fruity Loops",
    rotationStyle: "hybrid",
    letters: [Letter.L, Letter.F],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: SO_LEFT,
    rightPath: SO_RIGHT,
  },
];

const QS_CHAINS: ChainDef[] = [
  {
    label: "S",
    rotationStyle: "pro/pro",
    letters: [Letter.S],
    left: { motion: M.PRO, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: QS1_LEFT,
    rightPath: QS1_RIGHT,
  },
  {
    label: "T",
    rotationStyle: "anti/anti",
    letters: [Letter.T],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: QS1_LEFT,
    rightPath: QS1_RIGHT,
  },
  {
    label: "U",
    rotationStyle: "hybrid",
    letters: [Letter.U],
    left: { motion: M.PRO, rotation: R.CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: QS2_LEFT,
    rightPath: QS2_RIGHT,
  },
  {
    label: "V",
    rotationStyle: "hybrid",
    letters: [Letter.V],
    left: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: QS2_LEFT,
    rightPath: QS2_RIGHT,
  },
];

const QO_CHAINS: ChainDef[] = [
  {
    label: "MP",
    mnemonic: "Magic Potion",
    rotationStyle: "pro/pro",
    letters: [Letter.M, Letter.P],
    left: { motion: M.PRO, rotation: R.COUNTER_CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: QO_LEFT,
    rightPath: QO_RIGHT,
  },
  {
    label: "NQ",
    mnemonic: "Never Quit",
    rotationStyle: "anti/anti",
    letters: [Letter.N, Letter.Q],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.ANTI, rotation: R.COUNTER_CLOCKWISE },
    leftPath: QO_LEFT,
    rightPath: QO_RIGHT,
  },
  {
    label: "OR",
    mnemonic: "Open Road",
    rotationStyle: "hybrid",
    letters: [Letter.O, Letter.R],
    left: { motion: M.ANTI, rotation: R.CLOCKWISE },
    right: { motion: M.PRO, rotation: R.CLOCKWISE },
    leftPath: QO_LEFT,
    rightPath: QO_RIGHT,
  },
];

const MODE_CHAINS: Record<string, ChainDef[]> = {
  SS: SS_CHAINS,
  TS: TS_CHAINS,
  TO: TO_CHAINS,
  SO: SO_CHAINS,
  QS: QS_CHAINS,
  QO: QO_CHAINS,
};

/** Get the 4-step cycle chains for a VTG mode */
export function getModeChains(mode: VTGMode): ChainDef[] {
  return MODE_CHAINS[mode] ?? [];
}

/** Expand a compact chain definition into 4 renderable PictographData objects */
export function expandChain(
  chain: ChainDef,
  leftPropType: PropType = PropType.STAFF,
  rightPropType: PropType = PropType.STAFF
): PictographData[] {
  return [0, 1, 2, 3].map((i) => {
    const letter =
      chain.letters.length === 1 ? chain.letters[0] : chain.letters[i % 2];

    const leftStart = chain.leftPath[i]!;
    const leftEnd = chain.leftPath[i + 1]!;
    const rightStart = chain.rightPath[i]!;
    const rightEnd = chain.rightPath[i + 1]!;

    const startPos = placementAt(leftStart, rightStart);
    const endPos = placementAt(leftEnd, rightEnd);

    const leftMotion = createMotionData({
      motionType: chain.left.motion,
      rotationDirection: chain.left.rotation,
      startLocation: leftStart,
      endLocation: leftEnd,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 1,
      hand: HandSide.LEFT,
      isVisible: true,
      propType: leftPropType,
      arrowLocation: leftStart,
      gridMode: GridMode.DIAMOND,
    });

    const rightMotion = createMotionData({
      motionType: chain.right.motion,
      rotationDirection: chain.right.rotation,
      startLocation: rightStart,
      endLocation: rightEnd,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      turns: 1,
      hand: HandSide.RIGHT,
      isVisible: true,
      propType: rightPropType,
      arrowLocation: rightStart,
      gridMode: GridMode.DIAMOND,
    });

    return {
      id: `vtg-${chain.label}-beat${i + 1}`,
      letter,
      startPlacement: startPos,
      endPlacement: endPos,
      gridMode: GridMode.DIAMOND,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
    };
  });
}
