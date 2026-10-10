import type { GuideBlock } from "../guide-content-blocks";
import {
  createMotionData,
  createPlaceholderMotion,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
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
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

const { NORTH: N, EAST: E, SOUTH: SO_ } = GridLocation;
const { IN, OUT } = Orientation;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const CW = RotationDirection.CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;

// Real single-staff pictographs (red hand only) - copied verbatim from
// _pages/StaffMotionsPage.svelte. The halfway frame (a bare grid with a raw
// staff-SVG path hand-composited at a mid-motion pose) is sheet-only artwork,
// not pictograph data, and is intentionally NOT reproduced here - start / end /
// combined are the three REAL system-rendered pictographs per row.
const rightStaff = (
  id: string,
  type: MotionType,
  from: GridLocation,
  to: GridLocation,
  startOri: Orientation,
  endOri: Orientation,
  rot: RotationDirection
) => ({
  id: `sm-${id}`,
  letter: null,
  gridMode: GridMode.DIAMOND,
  motions: {
    right: createMotionData({
      motionType: type,
      rotationDirection: rot,
      startLocation: from,
      endLocation: to,
      startOrientation: startOri,
      endOrientation: endOri,
      turns: 0,
      hand: HandSide.RIGHT,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    }),
  },
});
const stat = (id: string, loc: GridLocation, ori: Orientation) =>
  rightStaff(id, MotionType.STATIC, loc, loc, ori, ori, NOROT);

type RowDef = {
  start: ReturnType<typeof rightStaff>;
  end: ReturnType<typeof rightStaff>;
  combined: ReturnType<typeof rightStaff>;
};
const ROWS: RowDef[] = [
  {
    // Prospin: isolation S→E, thumb stays in.
    start: stat("pro-start", SO_, IN),
    end: stat("pro-end", E, IN),
    combined: rightStaff("pro-full", MotionType.PRO, SO_, E, IN, IN, CCW),
  },
  {
    // Antispin: S→E, prop counter-rotates; thumb flips in → out.
    start: stat("anti-start", SO_, IN),
    end: stat("anti-end", E, OUT),
    combined: rightStaff("anti-full", MotionType.ANTI, SO_, E, IN, OUT, CW),
  },
  {
    // Dash: S→N through the center; thumb flips in → out.
    start: stat("dash-start", SO_, IN),
    end: stat("dash-end", N, OUT),
    combined: rightStaff("dash-full", MotionType.DASH, SO_, N, IN, OUT, NOROT),
  },
];

const rowItems = (row: RowDef): PictographData[] =>
  [row.start, row.end, row.combined] as unknown as PictographData[];

// DISPLAY shows all 3 real poses (start · end · combined); only start and
// combined form a real playable pair (end has no stepNumber of its own - it's
// a pose, not a chained step). Animation-only strip, same real motion data.
// `rightStaff` only sets the red hand (this page teaches single-staff isolation);
// the animation engine's both-required step contract needs a left motion on
// every step, so an invisible placeholder fills it - same recipe
// negative-space.content.ts uses for its single-staff sequences.
const rowSequenceItems = (row: RowDef): PictographData[] =>
  [
    {
      ...row.start,
      stepNumber: 0,
      motions: {
        ...row.start.motions,
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: row.start.motions.right.startLocation,
        }),
      },
    },
    {
      ...row.combined,
      stepNumber: 1,
      motions: {
        ...row.combined.motions,
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: row.start.motions.right.startLocation,
        }),
      },
    },
  ] as unknown as PictographData[];

/** STAFF props, TKA letter glyph off - matching StaffMotionsPage's PICTO_FLAGS (showTKA: false). */
const RENDER = { propType: PropType.STAFF, showTKA: false } as const;

/**
 * The prospin and antispin shifts as standalone strips. The Prospin and Inspin
 * page shows these same two motions, so it reads them from here instead of
 * building its own copies. `motion` is the one pictograph that draws the whole
 * shift, which that page shows beside the animation in place of the strip.
 */
export const SHIFT_DEMOS = {
  pro: {
    items: rowItems(ROWS[0]!),
    motion: ROWS[0]!.combined as unknown as PictographData,
    sequenceItems: rowSequenceItems(ROWS[0]!),
    render: RENDER,
  },
  anti: {
    items: rowItems(ROWS[1]!),
    motion: ROWS[1]!.combined as unknown as PictographData,
    sequenceItems: rowSequenceItems(ROWS[1]!),
    render: RENDER,
  },
};

// Verbatim prose lifted from _pages/StaffMotionsPage.svelte (Austen's words - never AI-written).
export const staffMotionsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Staff Motions" },

  { kind: "heading", level: 2, text: "Shift" },
  {
    kind: "prose",
    html: "During a shift, a prop can rotate in one of two directions - Prospin or Antispin",
  },

  { kind: "heading", level: 3, text: "Prospin" },
  {
    kind: "prose",
    html: "• <strong>Prospin</strong> - The prop rotates the same direction as the handpath<br>A 90 degree isolation is our base unit of a prospin.",
  },
  {
    kind: "pictographGroup",
    items: SHIFT_DEMOS.pro.items,
    flowCols: 3,
    layout: "strip",
    card: true,
    sequenceItems: SHIFT_DEMOS.pro.sequenceItems,
    render: SHIFT_DEMOS.pro.render,
    caption: "start · end · combined",
  },
  {
    kind: "prose",
    html: "In a base isolation, the thumb orientation remains the same for the entire motion.",
  },

  { kind: "heading", level: 3, text: "Antispin" },
  {
    kind: "prose",
    html: "• <strong>Antispin</strong> - The prop rotates in the opposite direction of the handpath<br>A 90 degree antispin is our base unit of antispin.",
  },
  {
    kind: "pictographGroup",
    items: SHIFT_DEMOS.anti.items,
    flowCols: 3,
    layout: "strip",
    card: true,
    sequenceItems: SHIFT_DEMOS.anti.sequenceItems,
    render: SHIFT_DEMOS.anti.render,
    caption: "start · end · combined",
  },
  {
    kind: "prose",
    html: "In an antispin, the ends swap orientation. Here, it moves from thumb in to thumb out.",
  },

  { kind: "heading", level: 2, text: "Dash" },
  {
    kind: "prose",
    html: "In a base dash, the thumb ends also swap orientation.",
  },
  {
    kind: "pictographGroup",
    items: rowItems(ROWS[2]!),
    flowCols: 3,
    layout: "strip",
    card: true,
    sequenceItems: rowSequenceItems(ROWS[2]!),
    render: RENDER,
    caption: "start · end · combined",
  },
  {
    kind: "prose",
    html: "Halfway through the motion, the center of the staff is at the grid’s center point.",
  },
];
