/**
 * Pictographs for the Glyphs / PADS figures. Letters and motions are copied
 * from GlyphsPadsPage.svelte (its MCP-verified `EX_*` examples); the print
 * page stays the source of truth. `GLYPH_A_TURN` is its A example with one
 * turn on the left hand, so the glyph has a number to show.
 */
import {
  createMotionData,
  createPlaceholderMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;
const B = HandSide.LEFT;
const R = HandSide.RIGHT;

const mo = (
  color: HandSide,
  type: MotionType,
  from: GridLocation,
  to: GridLocation,
  rot: RotationDirection,
  so: Orientation,
  eo: Orientation,
  turns = 0
) =>
  createMotionData({
    motionType: type,
    rotationDirection: rot,
    startLocation: from,
    endLocation: to,
    startOrientation: so,
    endOrientation: eo,
    turns,
    color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

const pic = (
  id: string,
  letter: PictographData["letter"],
  left: ReturnType<typeof mo>,
  right: ReturnType<typeof mo>
): PictographData => ({
  id: `l2gp-${id}`,
  letter,
  gridMode: GridMode.DIAMOND,
  motions: { left, right },
});

export const GLYPH_A_TURN = pic(
  "a-turn",
  Letter.A,
  mo(B, MotionType.PRO, S, W, CW, IN, OUT, 1),
  mo(R, MotionType.PRO, N, E, CW, IN, IN)
);
export const EX_C = pic(
  "c11",
  Letter.C,
  mo(B, MotionType.PRO, S, W, CW, IN, IN),
  mo(R, MotionType.ANTI, N, E, CCW, IN, OUT)
);
export const EX_S = pic(
  "s8",
  Letter.S,
  mo(B, MotionType.PRO, S, W, CW, IN, IN),
  mo(R, MotionType.PRO, E, S, CW, IN, IN)
);
export const EX_W = pic(
  "w9",
  Letter.W,
  mo(B, MotionType.PRO, S, W, CW, IN, IN),
  mo(R, MotionType.STATIC, E, E, NOROT, IN, IN)
);
export const EX_SIGMA_DASH = pic(
  "sigd9",
  Letter.SIGMA_DASH,
  mo(B, MotionType.PRO, S, W, CW, IN, IN),
  mo(R, MotionType.DASH, S, N, NOROT, IN, OUT)
);
export const EX_PHI = pic(
  "phi4",
  Letter.PHI,
  mo(B, MotionType.DASH, E, W, NOROT, IN, OUT),
  mo(R, MotionType.STATIC, E, E, NOROT, IN, IN)
);

/** One staff of each motion type, in PADS order, for the order figure. */
export const PADS_TILES: { key: "pro" | "anti" | "dash" | "static"; data: PictographData }[] = [
  {
    key: "pro",
    data: pic("pads-pro", null, createPlaceholderMotion(B, { location: W, orientation: IN }), mo(R, MotionType.PRO, E, S, CW, IN, IN)),
  },
  {
    key: "anti",
    data: pic("pads-anti", null, createPlaceholderMotion(B, { location: W, orientation: IN }), mo(R, MotionType.ANTI, E, S, CCW, IN, OUT)),
  },
  {
    key: "dash",
    data: pic("pads-dash", null, createPlaceholderMotion(B, { location: S, orientation: IN }), mo(R, MotionType.DASH, E, W, NOROT, IN, OUT)),
  },
  {
    key: "static",
    data: pic("pads-static", null, createPlaceholderMotion(B, { location: W, orientation: IN }), mo(R, MotionType.STATIC, E, E, NOROT, IN, IN)),
  },
];

/** The same A with no turn: the Level 2 front shows it beside GLYPH_A_TURN. */
export const GLYPH_A_PLAIN = pic(
  "a-plain",
  Letter.A,
  mo(B, MotionType.PRO, S, W, CW, IN, IN),
  mo(R, MotionType.PRO, N, E, CW, IN, IN)
);

/**
 * One thumbnail per Level 2 topic row (ChapterHub). Letters and motions come
 * from the same print examples as above, with turns added where the topic is
 * about turns.
 */
export const TOPIC_THUMBS: Record<string, PictographData> = {
  "turn-shifts": GLYPH_A_TURN,
  "turns-dashes-static": pic(
    "t-dash",
    Letter.SIGMA_DASH,
    mo(B, MotionType.PRO, S, W, CW, IN, OUT, 1),
    mo(R, MotionType.DASH, S, N, NOROT, IN, OUT)
  ),
  "glyphs-pads": pic(
    "t-hybrid",
    Letter.C,
    mo(B, MotionType.PRO, S, W, CW, IN, OUT, 1),
    mo(R, MotionType.ANTI, N, E, CCW, IN, OUT)
  ),
  "types-1-6-turns": pic(
    "t-w",
    Letter.W,
    mo(B, MotionType.PRO, S, W, CW, IN, OUT, 1),
    mo(R, MotionType.STATIC, E, E, NOROT, IN, IN)
  ),
  "s-and-t": EX_S,
  "opening-closing": pic(
    "t-lam",
    Letter.LAMBDA_DASH,
    mo(B, MotionType.DASH, W, E, NOROT, IN, OUT),
    mo(R, MotionType.DASH, S, N, CCW, IN, IN, 1)
  ),
  "one-one-turns": pic(
    "t-a11",
    Letter.A,
    mo(B, MotionType.PRO, S, W, CW, IN, OUT, 1),
    mo(R, MotionType.PRO, N, E, CW, IN, OUT, 1)
  ),
  "double-turn-shifts": pic(
    "t-a2",
    Letter.A,
    mo(B, MotionType.PRO, S, W, CW, IN, IN, 2),
    mo(R, MotionType.PRO, N, E, CW, IN, IN)
  ),
  "double-turn-dashes": pic(
    "t-dash2",
    Letter.SIGMA_DASH,
    mo(B, MotionType.PRO, S, W, CW, IN, IN, 2),
    mo(R, MotionType.DASH, S, N, NOROT, IN, OUT)
  ),
  "double-turn-static": pic(
    "t-alpha2",
    Letter.ALPHA,
    mo(B, MotionType.STATIC, W, W, NOROT, IN, IN),
    mo(R, MotionType.STATIC, E, E, RotationDirection.CLOCKWISE, IN, IN, 2)
  ),
};
