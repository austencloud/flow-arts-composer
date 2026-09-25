/**
 * The 3:4 skewed-arc flower, as real TKA pictographs.
 *
 * A beat normally moves a hand 90 degrees. One TKA turn is 180 degrees of
 * prop rotation. On a hand arc of alpha degrees with t pro turns:
 *
 *   prop/hand = 1 + 180t/alpha
 *
 * At alpha = 135 (a skewed arc) and t = 0.25, prop/hand = 1 + 45/135 = 4/3,
 * which is hand:prop 3:4. Eight beats of 135-degree pro arcs, each with 0.25
 * turns, close the loop: 8 x 135 = 1080 degrees of hand travel (3 hand
 * circles), 8 x (135 + 4 x 45) ... more directly, prop/hand = 4/3 means the
 * prop travels 1440 degrees (4 circles) in the same 8 beats.
 *
 * These are real rows from static/data/pictographs/SkewedPictographDataframe.csv:
 * every row below is letter A (pro/pro, cw/cw, both hands skewed +), category 2
 * (Full Plus - a diamond/box mode change, not a skewed-frame beat). The CSV
 * confirms each beat's end location equals the next beat's start location, for
 * both hands, closing after exactly 8 beats back to the start (alpha1):
 *
 *   alpha1 -> alpha4 -> alpha7 -> alpha2 -> alpha5 -> alpha8 -> alpha3 -> alpha6 -> alpha1
 *
 * The CSV carries no turns column (turns are a runtime per-motion value, not
 * baked into the letter dataframe), so the 0.25 here is the ratio's own
 * choice, applied on top of the real CSV locations and rotation directions.
 */
import {
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";

export const TURNS_PER_BEAT = 0.25;
export const ARC_DEGREES = 135;

interface BeatRow {
  readonly startPlacement: GridPlacement;
  readonly endPlacement: GridPlacement;
  readonly blue: readonly [GridLocation, GridLocation];
  readonly red: readonly [GridLocation, GridLocation];
}

// Real rows from SkewedPictographDataframe.csv, letter A, category 2
// (Full Plus), pro/cw/+ on both hands. blue = left hand, red = right hand.
const BEAT_ROWS: readonly BeatRow[] = [
  {
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA4,
    blue: [GridLocation.SOUTH, GridLocation.NORTHWEST],
    red: [GridLocation.NORTH, GridLocation.SOUTHEAST],
  },
  {
    startPlacement: GridPlacement.ALPHA4,
    endPlacement: GridPlacement.ALPHA7,
    blue: [GridLocation.NORTHWEST, GridLocation.EAST],
    red: [GridLocation.SOUTHEAST, GridLocation.WEST],
  },
  {
    startPlacement: GridPlacement.ALPHA7,
    endPlacement: GridPlacement.ALPHA2,
    blue: [GridLocation.EAST, GridLocation.SOUTHWEST],
    red: [GridLocation.WEST, GridLocation.NORTHEAST],
  },
  {
    startPlacement: GridPlacement.ALPHA2,
    endPlacement: GridPlacement.ALPHA5,
    blue: [GridLocation.SOUTHWEST, GridLocation.NORTH],
    red: [GridLocation.NORTHEAST, GridLocation.SOUTH],
  },
  {
    startPlacement: GridPlacement.ALPHA5,
    endPlacement: GridPlacement.ALPHA8,
    blue: [GridLocation.NORTH, GridLocation.SOUTHEAST],
    red: [GridLocation.SOUTH, GridLocation.NORTHWEST],
  },
  {
    startPlacement: GridPlacement.ALPHA8,
    endPlacement: GridPlacement.ALPHA3,
    blue: [GridLocation.SOUTHEAST, GridLocation.WEST],
    red: [GridLocation.NORTHWEST, GridLocation.EAST],
  },
  {
    startPlacement: GridPlacement.ALPHA3,
    endPlacement: GridPlacement.ALPHA6,
    blue: [GridLocation.WEST, GridLocation.NORTHEAST],
    red: [GridLocation.EAST, GridLocation.SOUTHWEST],
  },
  {
    startPlacement: GridPlacement.ALPHA6,
    endPlacement: GridPlacement.ALPHA1,
    blue: [GridLocation.NORTHEAST, GridLocation.SOUTH],
    red: [GridLocation.SOUTHWEST, GridLocation.NORTH],
  },
];

export interface SkewedRatioBeat {
  readonly index: number;
  readonly pictograph: PictographData;
  readonly caption: string;
}

/**
 * Confirms each beat's end location equals the next beat's start location,
 * for both hands, wrapping from beat 8 back to beat 1. This is the actual
 * chain check, run against the real BEAT_ROWS data above, not asserted.
 */
export function verifyChain(): { ok: boolean; breaks: string[] } {
  const breaks: string[] = [];
  for (let i = 0; i < BEAT_ROWS.length; i++) {
    const cur = BEAT_ROWS[i]!;
    const next = BEAT_ROWS[(i + 1) % BEAT_ROWS.length]!;
    if (cur.blue[1] !== next.blue[0]) {
      breaks.push(
        `beat ${i + 1}->${i + 2}: blue ${cur.blue[1]} != ${next.blue[0]}`
      );
    }
    if (cur.red[1] !== next.red[0]) {
      breaks.push(
        `beat ${i + 1}->${i + 2}: red ${cur.red[1]} != ${next.red[0]}`
      );
    }
    if (cur.endPlacement !== next.startPlacement) {
      breaks.push(
        `beat ${i + 1}->${i + 2}: placement ${cur.endPlacement} != ${next.startPlacement}`
      );
    }
  }
  return { ok: breaks.length === 0, breaks };
}

/**
 * Builds the 8 pictographs, chaining orientation with the real
 * calculateEndOrientation (the same function the production CSV loader and
 * step operators use) rather than hand-picking orientations per beat.
 */
export function buildSkewedRatioBeats(): SkewedRatioBeat[] {
  let blueOri: Orientation = Orientation.IN;
  let redOri: Orientation = Orientation.IN;

  return BEAT_ROWS.map((row, i) => {
    const blueMotion = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: row.blue[0],
      endLocation: row.blue[1],
      startOrientation: blueOri,
      turns: TURNS_PER_BEAT,
      hand: HandSide.LEFT,
    });
    const blueEndOri = calculateEndOrientation(blueMotion, HandSide.LEFT);

    const redMotion = createMotionData({
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      startLocation: row.red[0],
      endLocation: row.red[1],
      startOrientation: redOri,
      turns: TURNS_PER_BEAT,
      hand: HandSide.RIGHT,
    });
    const redEndOri = calculateEndOrientation(redMotion, HandSide.RIGHT);

    const pictograph = createPictographData({
      letter: Letter.A,
      startPlacement: row.startPlacement,
      endPlacement: row.endPlacement,
      category: 2,
      motions: {
        [HandSide.LEFT]: { ...blueMotion, endOrientation: blueEndOri },
        [HandSide.RIGHT]: { ...redMotion, endOrientation: redEndOri },
      },
    });

    const caption =
      `Beat ${i + 1}, ${row.startPlacement} to ${row.endPlacement}, ` +
      `arc ${ARC_DEGREES}°, ${TURNS_PER_BEAT} turns pro`;

    blueOri = blueEndOri;
    redOri = redEndOri;

    return { index: i + 1, pictograph, caption };
  });
}

export interface OrientationClosure {
  readonly blueStart: Orientation;
  readonly blueEnd: Orientation;
  readonly redStart: Orientation;
  readonly redEnd: Orientation;
  readonly closes: boolean;
}

/** Whether the 8th beat's end orientation returns to the 1st beat's start. */
export function checkOrientationClosure(
  beats: SkewedRatioBeat[]
): OrientationClosure {
  const first = beats[0]!.pictograph.motions[HandSide.LEFT]!;
  const firstRed = beats[0]!.pictograph.motions[HandSide.RIGHT]!;
  const last = beats[beats.length - 1]!.pictograph.motions[HandSide.LEFT]!;
  const lastRed = beats[beats.length - 1]!.pictograph.motions[HandSide.RIGHT]!;
  return {
    blueStart: first.startOrientation as Orientation,
    blueEnd: last.endOrientation as Orientation,
    redStart: firstRed.startOrientation as Orientation,
    redEnd: lastRed.endOrientation as Orientation,
    closes:
      first.startOrientation === last.endOrientation &&
      firstRed.startOrientation === lastRed.endOrientation,
  };
}
