import type { StepLike } from "$lib/shared/mandala/services/types";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  flowerPetals,
  type FlowerStyle,
  type RotatingFlower,
  type RotatingFlowerOri,
} from "$lib/shared/shape-matrix/domain/flower-signature";

export interface ShapeLink {
  readonly href: string;
  readonly label: string;
}

/**
 * A flower comes off the Shape Engine's axis. A sequence is traced by the
 * same mandala geometry from its own steps, both ends of the staff.
 */
export type ShapeDrawing =
  | { readonly kind: "flower"; readonly flower: RotatingFlower }
  | {
      readonly kind: "sequence";
      readonly steps: readonly StepLike[];
      readonly facts: string;
    };

export interface NamedShape {
  readonly id: string;
  readonly name: string;
  readonly drawing: ShapeDrawing;
  /**
   * Austen's own words for the name. Left unset until he writes it; the page
   * shows only the drawing and its facts until then.
   */
  readonly definition?: string;
  readonly link?: ShapeLink;
}

export interface ShapeGroup {
  readonly id: string;
  readonly title: string;
  readonly shapes: readonly NamedShape[];
}

/**
 * Flowers start pointing out by default, the classic picture: a four-petal
 * antispin flower then has its petal tips at the top, bottom, and sides.
 */
function flower(
  id: string,
  name: string,
  style: FlowerStyle,
  turns: number,
  ori: RotatingFlowerOri = "out"
): NamedShape {
  return {
    id,
    name,
    drawing: {
      kind: "flower",
      flower: {
        style,
        turns,
        ori,
        grid: "diamond",
        petals: flowerPetals({ style, turns }),
      },
    },
  };
}

/**
 * The left hand, so the path draws in the flowers' blue ink. Starting out
 * points the thumb end away, so a one-ended prop traces the tall lens; the
 * end that starts in stays near the hand and draws only the small bow-tie.
 */
function dashWithTurn(from: GridLocation, to: GridLocation): StepLike {
  return {
    motions: {
      left: createMotionData({
        motionType: MotionType.DASH,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: from,
        endLocation: to,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.OUT,
        turns: 1,
        hand: HandSide.LEFT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };
}

export const SHAPE_GROUPS: readonly ShapeGroup[] = [
  {
    id: "flowers",
    title: "Flowers",
    // Ordered by ratio, one prop rotation more per hand cycle at each step.
    shapes: [
      // Starting in lays the eye on its side; starting out stands it upright.
      flower("cat-eye", "Cat-eye", "anti", 0, "in"),
      flower("triquetra", "Triquetra", "anti", 0.5),
      flower("antispin-flower", "Antispin flower", "anti", 1),
      flower("inspin-flower", "Inspin flower", "pro", 1.5),
    ],
  },
  {
    id: "dashes",
    title: "Dashes",
    shapes: [
      {
        id: "linear-extension",
        name: "Linear extension",
        // The Guide's dash with a turn, south to north and back, spinning
        // the same way both ways.
        drawing: {
          kind: "sequence",
          steps: [
            dashWithTurn(GridLocation.SOUTH, GridLocation.NORTH),
            dashWithTurn(GridLocation.NORTH, GridLocation.SOUTH),
          ],
          facts: "Dash with a turn, on repeat",
        },
        // Austen's words from the linked Guide page.
        definition:
          "It feels peculiar to execute with staves because one end is in pro and the other end is in anti. It helps to focus on the half that's in antispin.",
        link: {
          href: "/guide/level-2/turns-dashes-static#turn-dashes",
          label: "1-Turns: Dashes / Static",
        },
      },
    ],
  },
];

export const NAMED_SHAPES: readonly NamedShape[] = SHAPE_GROUPS.flatMap(
  (group) => group.shapes
);
