import { z } from "zod";

/**
 * A LOOP run: a clip that draws one sequence's steps as tiles, as a ring or in
 * rows, and plays out how a LOOP is built. The seed's tiles come in, each
 * repeat arrives the way its LOOP type changes the seed (turned round the
 * ring, reflected through a line, or wiped through a line into its swapped,
 * inverted or rewound twin), and a step can be performed inside its tile: the
 * props make the move from where the step before left them and the step's
 * arrows and letter fade in with the move. Once the LOOP is made it can be
 * played on a stage of its own, grid and props only, round and round with a
 * bar under the tile being played. Steps never read top-down: a repetition is
 * one row, read left to right.
 *
 * Everything here is a pure function of the clip's own seconds, so a paused
 * frame in the preview is the frame the export writes. The painter
 * (`services/loop-run-painter.ts`) only draws what `loopRunFrame` says.
 */

export const LOOP_RUN_CHANGES = [
  "rotated",
  "reflected",
  "swapped",
  "inverted",
  "rewound",
] as const;
export type LoopRunChange = (typeof LOOP_RUN_CHANGES)[number];

/**
 * `ring`: every step round a circle, starting just right of the top.
 * `rows`: one repetition per row, read left to right.
 * `pairs`: the seed down the left, each repeat in its own column to the right,
 * every step level with its twin.
 * `line`: every step in one row, read left to right.
 * `card`: every step in one row, edge to edge with square corners, as the app
 * draws a sequence, with the start position on the row above at the left. The
 * start position comes in once the row has settled; `cardStart: false` leaves
 * it out and centres the one row.
 */
export const LOOP_RUN_LAYOUTS = ["ring", "rows", "pairs", "line", "card"] as const;
export type LoopRunLayout = (typeof LOOP_RUN_LAYOUTS)[number];

/** The app's own colour for each change (`render-composition/src/loop-icons.ts`). */
export const LOOP_RUN_COLOURS: Record<LoopRunChange, string> = {
  rotated: "#36c3ff",
  reflected: "#6F2DA8",
  swapped: "#2ecc71",
  inverted: "#eb7d00",
  rewound: "#00bcd4",
};

const seconds = z.number().finite().min(0).max(3600);
const step = z.number().int().min(0).max(255);
const share = z.number().finite().min(0).max(1);

/** Room kept clear of pictures at each edge, as shares of the clip's height (top, bottom) and width (left, right). */
export const LoopRunRoomSchema = z
  .object({
    top: z.number().min(0).max(0.9).optional(),
    bottom: z.number().min(0).max(0.9).optional(),
    left: z.number().min(0).max(0.9).optional(),
    right: z.number().min(0).max(0.9).optional(),
  })
  .strict();
export type LoopRunRoom = z.infer<typeof LoopRunRoomSchema>;

/** The moments of a run, each on the clip's own seconds. */
export const LoopRunEventSchema = z.discriminatedUnion("kind", [
  /** The listed steps (default: the seed) appear one after another across `duration`. */
  z
    .object({
      kind: z.literal("reveal"),
      at: seconds,
      duration: seconds,
      steps: z.array(step).optional(),
    })
    .strict(),
  /**
   * The listed repetitions (default: every one after the seed) arrive by the
   * run's change, `stagger` seconds apart, each taking `duration`.
   */
  z
    .object({
      kind: z.literal("enter"),
      at: seconds,
      duration: seconds,
      passes: z.array(step).optional(),
      stagger: seconds.optional(),
    })
    .strict(),
  /** Every tile glides into `layout`, repetition by repetition `stagger` seconds apart. */
  z
    .object({
      kind: z.literal("layout"),
      at: seconds,
      duration: seconds,
      layout: z.enum(LOOP_RUN_LAYOUTS),
      stagger: seconds.optional(),
    })
    .strict(),
  /** Every tile's props, arrows and letter fade away, leaving its frame and grid. */
  z
    .object({ kind: z.literal("clear"), at: seconds, duration: seconds })
    .strict(),
  /** The listed steps are performed: props move, arrows and letter fade in with the move. */
  z
    .object({
      kind: z.literal("perform"),
      at: seconds,
      duration: seconds,
      steps: z.array(step).min(1),
    })
    .strict(),
  /** The props as the step before `step` left them slide over into `step`'s tile. */
  z
    .object({
      kind: z.literal("carry"),
      at: seconds,
      duration: seconds,
      step,
    })
    .strict(),
  /** The rows layout shows rows `rows[0]` to `rows[1]` filling the box. */
  z
    .object({
      kind: z.literal("view"),
      at: seconds,
      duration: seconds,
      rows: z.tuple([step, step]),
    })
    .strict(),
  /** The ring's home mark comes up to full strength. */
  z
    .object({ kind: z.literal("home"), at: seconds, duration: seconds })
    .strict(),
  /** The room eases to `room` over `duration`; an edge it leaves out stays where it is. */
  z
    .object({ kind: z.literal("room"), at: seconds, duration: seconds, room: LoopRunRoomSchema })
    .strict(),
  /**
   * The LOOP played on one large stage: grid and props only, every step in
   * order, `rounds` times at an even pace with no pause between steps or
   * rounds. The stage fades in with the props at home, over 0.4 s from
   * `from` (default: 0.4 s before `at`), and they rest there after the last
   * round. `stage` is its centre, as shares of
   * the clip's width and height, and its side, as a share of the clip's
   * width; `stage.grid` is the strength its big grid is drawn at (absent is
   * 1; the props stay whole). The tile whose step is playing wears the app's
   * gold selection ring; `marker: false` leaves every tile plain. `ring`
   * picks its look: `skin` (absent) is the step cell's rounded amber skin,
   * `card` the sequence card's square border with its glow inward.
   */
  z
    .object({
      kind: z.literal("play"),
      at: seconds,
      duration: seconds,
      rounds: z.number().int().min(1).max(20).optional(),
      from: seconds.optional(),
      stage: z
        .object({ x: share, y: share, size: z.number().finite().min(0).max(1.5), grid: share.optional() })
        .strict(),
      marker: z.boolean().optional(),
      ring: z.enum(["skin", "card"]).optional(),
    })
    .strict(),
]);
export type LoopRunEvent = z.infer<typeof LoopRunEventSchema>;
export type LoopRunEventKind = LoopRunEvent["kind"];

export const LOOP_RUN_MAX_EVENTS = 200;

/** The marks a badge can carry: a LOOP type's own icon, the app's staff outline, a plain ring, or none. */
export const LOOP_RUN_BADGE_ICONS = [...LOOP_RUN_CHANGES, "staff", "ring", "none"] as const;
export type LoopRunBadgeIcon = (typeof LOOP_RUN_BADGE_ICONS)[number];
export const LOOP_RUN_MAX_BADGE_LENGTH = 60;

/**
 * The name chip, at the top of the frame unless `top` says otherwise, dressed
 * the way the app dresses a LOOP type: its icon and its colour. It shows from
 * `at` until the next one. A badge with the same text as the one before and
 * another `top` glides the chip there over its `duration`.
 */
export const LoopRunBadgeSchema = z
  .object({
    at: seconds,
    text: z.string().max(LOOP_RUN_MAX_BADGE_LENGTH),
    icon: z.enum(LOOP_RUN_BADGE_ICONS).optional(),
    /** Absent is the run's own colour. */
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    /** The chip's top edge, as a share of the clip's height. Absent is the top of the frame. */
    top: share.optional(),
    /** The chip's left edge, as a share of the clip's width. Absent centres it. */
    left: share.optional(),
    /** Seconds the glide to this badge's `top` and `left` takes. */
    duration: seconds.optional(),
  })
  .strict();
export type LoopRunBadge = z.infer<typeof LoopRunBadgeSchema>;

/** What a run draws and how it plays, apart from the sequence it carries. */
export const LoopRunSettingsSchema = z
  .object({
    /** Steps in the seed; the sequence's steps are whole repetitions of it. */
    seed: z.number().int().min(1).max(64),
    change: z.enum(LOOP_RUN_CHANGES),
    /** Where the tiles start. */
    layout: z.enum(LOOP_RUN_LAYOUTS),
    /** The thin outline on every repeat, and the line a repeat passes through. */
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    events: z.array(LoopRunEventSchema).max(LOOP_RUN_MAX_EVENTS),
    badges: z.array(LoopRunBadgeSchema).max(20).optional(),
    /** Room kept clear of pictures at each edge: for a badge, a caption, an explanation or the stage. */
    room: LoopRunRoomSchema.optional(),
    /** A faint grid in each place a step has not reached yet, in place of the dashed outline. */
    waitingGrids: z.boolean().optional(),
    /** How far the reflection line runs past the outer tiles' centres, as a share of a tile; 0.62 when absent, 0.5 ends it flush. */
    lineReach: z.number().finite().min(0.5).max(1).optional(),
    /** The start position shows from the first frame, where the card puts it, so it never moves. */
    startAlways: z.boolean().optional(),
    /** `false` leaves the start position out of the card: the card is the one row, centred. Wins over `startAlways`. */
    cardStart: z.boolean().optional(),
    /** In pairs, the gaps between the columns (`across`, 0.22 when absent) and the rows (`down`, 0.08), as shares of a tile. */
    pairsGap: z.object({ across: share.optional(), down: share.optional() }).strict().optional(),
    /**
     * One kind of tile: square, no outline in the run's colour, one faint
     * hairline just inside its edge. A place not reached yet is that same
     * empty frame, and a revealed tile fades in without growing.
     */
    plainTiles: z.boolean().optional(),
  })
  .strict();
export type LoopRunSettings = z.infer<typeof LoopRunSettingsSchema>;

/** The settings that move tiles about inside a layout. */
export type LoopRunPlaceLook = Pick<LoopRunSettings, "cardStart" | "pairsGap">;

// ─── Small maths ─────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 before `a`, 1 after `b`, a smooth step between. */
export function ramp(t: number, a: number, b: number): number {
  if (b <= a) return t >= a ? 1 : 0;
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** An angle folded into (-180, 180]. */
export function halfTurn(deg: number): number {
  const d = ((((deg % 360) + 540) % 360) - 180) as number;
  return d === -180 ? 180 : d;
}

// ─── The run's shape ─────────────────────────────────────────────────────────

/** A run's counts, from its settings and its sequence's length. */
export interface LoopRunShape {
  /** Tiles: one per step of the sequence, start position excluded. */
  steps: number;
  seed: number;
  passes: number;
}

export function loopRunShape(settings: { seed: number }, steps: number): LoopRunShape {
  const seed = Math.max(1, Math.min(settings.seed, Math.max(1, steps)));
  return { steps, seed, passes: Math.max(1, Math.ceil(steps / seed)) };
}

export const passOf = (shape: LoopRunShape, s: number) => Math.floor(s / shape.seed);

/** The step a repeat is made from: the one a pass before, or, rewound, its mirror in the pass before. */
export function sourceOf(change: LoopRunChange, shape: LoopRunShape, s: number): number {
  const pass = passOf(shape, s);
  if (pass === 0) return s;
  if (change === "rewound")
    return (pass - 1) * shape.seed + (shape.seed - 1 - (s % shape.seed));
  return s - shape.seed;
}

// ─── Layouts ─────────────────────────────────────────────────────────────────

export interface LoopRunRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One tile's place: its centre and its side, in the rect's pixels. */
export interface LoopTilePlace {
  x: number;
  y: number;
  size: number;
}

/** Rows shown in the rows layout: the first one and how many fill the box. */
export interface LoopRunView {
  first: number;
  count: number;
}

/** Share of the rect kept clear at each edge. */
const EDGE = 0.03;
/** The gap between neighbouring tiles, as a share of a tile. */
const GAP = 0.08;
/** In pairs, the seed and its repeats sit further apart, with the line between. */
const PAIR_GAP = 0.22;

/** The ring's radius and tile, as shares of the rect's shorter side (q5a). */
function ringGeometry(n: number): { radius: number; size: number } {
  const sin = Math.sin(Math.PI / Math.max(2, n));
  const radius = 0.495 / (1 + sin / 1.42);
  return { radius, size: (2 * radius * sin) / 1.42 };
}

/** Degrees round the ring of step `s` of `n`; 0 is to the right, -90 the top. */
export function ringDegrees(s: number, n: number): number {
  return -90 + ((s + 0.5) * 360) / n;
}

function ringPlace(rect: LoopRunRect, n: number, deg: number): LoopTilePlace {
  const side = Math.min(rect.width, rect.height);
  const { radius, size } = ringGeometry(n);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const a = (deg * Math.PI) / 180;
  return {
    x: cx + Math.cos(a) * radius * side,
    y: cy + Math.sin(a) * radius * side,
    size: size * side,
  };
}

/** A grid's tile side for `cols` by `rows` in the rect. */
function gridTile(rect: LoopRunRect, cols: number, rows: number, colGap: number, rowGap = GAP): number {
  const w = rect.width * (1 - 2 * EDGE);
  const h = rect.height * (1 - 2 * EDGE);
  const across = cols + colGap * (cols - 1);
  const down = rows + rowGap * (rows - 1);
  return Math.max(0, Math.min(w / across, h / down));
}

/** Column and row of step `s` in a grid layout, and the grid's size. */
function gridCell(
  layout: Exclude<LoopRunLayout, "ring">,
  change: LoopRunChange,
  shape: LoopRunShape,
  s: number,
  look?: LoopRunPlaceLook
): { col: number; row: number; cols: number; rows: number; colGap: number; rowGap: number } {
  const pass = passOf(shape, s);
  const within = s % shape.seed;
  if (layout === "rows")
    return { col: within, row: pass, cols: shape.seed, rows: shape.passes, colGap: GAP, rowGap: GAP };
  if (layout === "pairs") {
    // Rewound runs back up its column, so each step sits beside the one it undoes.
    const row = change === "rewound" && pass % 2 === 1 ? shape.seed - 1 - within : within;
    const colGap = look?.pairsGap?.across ?? PAIR_GAP;
    const rowGap = look?.pairsGap?.down ?? GAP;
    return { col: pass, row, cols: shape.passes, rows: shape.seed, colGap, rowGap };
  }
  if (layout === "card") return { col: s, row: 0, cols: shape.steps, rows: 1, colGap: 0, rowGap: GAP };
  return { col: s, row: 0, cols: shape.steps, rows: 1, colGap: GAP, rowGap: GAP };
}

/** Where step `s` sits in `layout`. The view only moves the rows layout; `look` carries the card's start and the pairs' gaps. */
export function loopTilePlace(
  layout: LoopRunLayout,
  change: LoopRunChange,
  shape: LoopRunShape,
  rect: LoopRunRect,
  s: number,
  view?: LoopRunView,
  look?: LoopRunPlaceLook
): LoopTilePlace {
  if (layout === "ring") return ringPlace(rect, shape.steps, ringDegrees(s, shape.steps));
  if (layout === "card") return cardPlace(rect, shape, s, look?.cardStart !== false);
  const cell = gridCell(layout, change, shape, s, look);
  const shown = layout === "rows" && view ? view : { first: 0, count: cell.rows };
  const size = gridTile(rect, cell.cols, Math.max(1, shown.count), cell.colGap, cell.rowGap);
  const pitchX = size * (1 + cell.colGap);
  const pitchY = size * (1 + cell.rowGap);
  return {
    x: rect.x + rect.width / 2 + (cell.col - (cell.cols - 1) / 2) * pitchX,
    y: rect.y + rect.height / 2 + (cell.row - shown.first - (shown.count - 1) / 2) * pitchY,
    size,
  };
}

/**
 * Step `s` in the card: edge to edge, the row and the start position above it
 * centred together in the rect. Step -1 is the start position. Without the
 * start position (`withStart` false) the one row is centred on its own.
 */
function cardPlace(rect: LoopRunRect, shape: LoopRunShape, s: number, withStart = true): LoopTilePlace {
  const w = rect.width * (1 - 2 * EDGE);
  const h = rect.height * (1 - 2 * EDGE);
  const size = Math.max(0, Math.min(w / Math.max(1, shape.steps), withStart ? h / 2 : h));
  const col = Math.max(0, s);
  const drop = withStart ? (s < 0 ? -size / 2 : size / 2) : 0;
  return {
    x: rect.x + rect.width / 2 + (col - (shape.steps - 1) / 2) * size,
    y: rect.y + rect.height / 2 + drop,
    size,
  };
}

// ─── Reading the events ──────────────────────────────────────────────────────

type EventOf<K extends LoopRunEventKind> = Extract<LoopRunEvent, { kind: K }>;

function eventsOf<K extends LoopRunEventKind>(events: readonly LoopRunEvent[], kind: K): EventOf<K>[] {
  return events
    .filter((event): event is EventOf<K> => event.kind === kind)
    .sort((a, b) => a.at - b.at);
}

/** The layout every tile is in at `t`, and how far each repetition has got into it. */
interface LayoutState {
  from: LoopRunLayout;
  to: LoopRunLayout;
  /** Linear progress of repetition p into `to`. */
  progress: (pass: number) => number;
}

function layoutState(settings: LoopRunSettings, shape: LoopRunShape, t: number): LayoutState {
  let current: LoopRunLayout = settings.layout;
  for (const event of eventsOf(settings.events, "layout")) {
    if (t < event.at) break;
    const stagger = event.stagger ?? 0;
    const end = event.at + event.duration + stagger * (shape.passes - 1);
    if (t >= end) {
      current = event.layout;
      continue;
    }
    const from = current;
    return {
      from,
      to: event.layout,
      progress: (pass) => {
        const start = event.at + stagger * pass;
        if (event.duration <= 0) return t >= start ? 1 : 0;
        return clamp01((t - start) / event.duration);
      },
    };
  }
  return { from: current, to: current, progress: () => 1 };
}

/** The rows shown at `t`: all of them until a view event says otherwise. */
function viewAt(settings: LoopRunSettings, shape: LoopRunShape, t: number): LoopRunView {
  let view: LoopRunView = { first: 0, count: shape.passes };
  for (const event of eventsOf(settings.events, "view")) {
    if (t < event.at) break;
    const first = Math.min(event.rows[0], event.rows[1]);
    const last = Math.max(event.rows[0], event.rows[1]);
    const next = { first, count: last - first + 1 };
    const u = ramp(t, event.at, event.at + event.duration);
    view = { first: lerp(view.first, next.first, u), count: lerp(view.count, next.count, u) };
  }
  return view;
}

/** Where step `s` is at `t`: between two layouts it parts sideways first and then comes level. */
function placeAt(
  settings: LoopRunSettings,
  shape: LoopRunShape,
  rect: LoopRunRect,
  state: LayoutState,
  view: LoopRunView,
  s: number
): LoopTilePlace {
  const a = loopTilePlace(state.from, settings.change, shape, rect, s, view, settings);
  if (state.from === state.to) return a;
  const b = loopTilePlace(state.to, settings.change, shape, rect, s, view, settings);
  const u = state.progress(passOf(shape, s));
  const across = ramp(u, 0, 0.6);
  const level = ramp(u, 0.4, 1);
  return { x: lerp(a.x, b.x, across), y: lerp(a.y, b.y, level), size: lerp(a.size, b.size, across) };
}

/** How far a layout has left `layout` behind: 0 while in it, 1 once gone. */
function awayFrom(state: LayoutState, shape: LoopRunShape, layout: LoopRunLayout): number {
  if (state.from === layout && state.to !== layout) return ramp(state.progress(0), 0, 0.6);
  if (state.from === layout) return 0;
  if (state.to === layout) return 1 - ramp(state.progress(shape.passes - 1), 0.4, 1);
  return 1;
}

// ─── One frame ───────────────────────────────────────────────────────────────

/** Where a tile's props stand: as tile `step` leaves them, or `progress` of the way through its move. */
export interface LoopPropsDraw {
  step: number;
  /** 1 rests at the step's end; less is that far through the move from the step before. */
  progress: number;
  opacity: number;
  /** Step 0 of a round after the first: it starts where the last step left the props. */
  continued?: boolean;
}

export interface LoopTileDraw extends LoopTilePlace {
  step: number;
  /** The frame and grid. */
  opacity: number;
  /** Grows from 0.8 as a revealed tile appears. */
  scale: number;
  /** The thin outline in the run's colour on a repeat. */
  outline: number;
  /** 1 with rounded corners; 0 square, edge to edge in the card, with its hairline edge. */
  corner: number;
  letter: number;
  arrows: number;
  props: LoopPropsDraw | null;
}

/**
 * A repeat on its way in: the source step's picture travelling to its place.
 * `turn` turns its props and arrows, `flip` reflects them left to right
 * (1 as it is, -1 reflected), and `wipe` is the line, in the rect's pixels,
 * left of which the source shows and right of which the repeat does.
 */
export interface LoopCopyDraw extends LoopTilePlace {
  from: number;
  to: number;
  opacity: number;
  turn: number;
  flip: number;
  wipe: number | null;
}

/** The props a step left, sliding over into the next tile. */
export interface LoopGhostDraw extends LoopTilePlace {
  step: number;
  opacity: number;
}

export interface LoopLineDraw {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  opacity: number;
}

/** A gold selection ring on a tile's own box, in the rect's pixels, at `strength` 0 to 1. */
export interface LoopRingDraw {
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
  /** The ring's look (`paintSelectionRing`); absent is the step cell's skin. */
  look?: LoopRingLook;
}

export type LoopRingLook = "skin" | "card";

/** The LOOP played on its stage: grid and props, and the ring on the tile being played. */
export interface LoopStageDraw extends LoopTilePlace {
  opacity: number;
  /** The strength the stage's big grid is drawn at, against the stage's own. */
  grid: number;
  /**
   * The props as `step`'s move leaves them `progress` of the way through it;
   * step -1 is home. `continued` is a round after the first, whose first step
   * starts where the last step left the props rather than at the start position.
   */
  props: { step: number; progress: number; continued: boolean };
  /** The ring on the tile being played, and on the one before it while they cross-fade. */
  rings: LoopRingDraw[];
}

export interface LoopRunFrame {
  /** Each step's place while one waits; `waiting` is 1 until the step's tile has come in. */
  slots: (LoopTilePlace & { opacity: number; waiting: number })[];
  tiles: LoopTileDraw[];
  copies: LoopCopyDraw[];
  ghosts: LoopGhostDraw[];
  /** The line a repeat passes through, between the seed and its repeats. */
  line: LoopLineDraw | null;
  /** The ring's home mark at its top. */
  home: LoopLineDraw | null;
  /** The start position, on the row above the card. */
  start: (LoopTilePlace & { opacity: number }) | null;
  /** The LOOP played, once a play event comes. */
  stage: LoopStageDraw | null;
}

/** How long the stage takes to fade in before its play starts. */
const STAGE_FADE = 0.4;
/** How long the ring takes to cross-fade on to the next tile, and to go after the last round. */
const RING_SWAP = 0.12;
const RING_FADE = 0.3;

/** How long the start position takes to come in once the card has settled. */
const START_FADE = 0.5;

/** How long before a move its props fade in, when the tile had none. */
const PROPS_LEAD = 0.2;
/** How long a revealed tile takes to appear. */
const REVEAL_FADE = 0.25;

/** How far round the ring a rotated repeat is turned from the pass before. */
export function loopRunTurnDegrees(
  firstLocations: readonly (string | null | undefined)[]
): number {
  const AT: Record<string, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const [a, b] = firstLocations;
  const from = a ? AT[a] : undefined;
  const to = b ? AT[b] : undefined;
  if (from === undefined || to === undefined) return 90;
  return halfTurn(to - from);
}

/** The props of tile `s` at `t`: resting, cleared, or making the move. */
function propsAt(
  settings: LoopRunSettings,
  s: number,
  t: number
): { props: LoopPropsDraw | null; arrows: number; letter: number } {
  const performs = eventsOf(settings.events, "perform").filter((event) => event.steps.includes(s));
  const clears = eventsOf(settings.events, "clear");
  const carries = eventsOf(settings.events, "carry").filter((event) => event.step === s);
  const started = performs.filter((event) => t >= event.at - PROPS_LEAD);
  const last = started.at(-1);
  if (last) {
    const u = ramp(t, last.at, last.at + last.duration);
    const carried = carries.some((event) => event.at <= last.at && t >= event.at + event.duration);
    const lead = ramp(t, last.at - PROPS_LEAD, last.at);
    // A move performed a second time starts from where it last ended, in view.
    const shown = started.length > 1 || carried ? 1 : lead;
    return { props: shown > 0 ? { step: s, progress: u, opacity: shown } : null, arrows: u, letter: u };
  }
  const next = performs[0];
  const clearedBy = clears.filter((event) => t >= event.at && (!next || event.at < next.at));
  if (next && !clears.some((event) => event.at < next.at)) {
    // A step waiting to be performed with no clear before it waits empty. Props carried in stay.
    const carried = carries.some((event) => t >= event.at + event.duration);
    return { props: carried ? { step: s, progress: 0, opacity: 1 } : null, arrows: 0, letter: 0 };
  }
  const clear = clearedBy.at(-1);
  const whole = clear ? 1 - ramp(t, clear.at, clear.at + clear.duration) : 1;
  return { props: whole > 0 ? { step: s, progress: 1, opacity: whole } : null, arrows: whole, letter: whole };
}

/**
 * Everything a run draws at `t` seconds into the clip, in `rect`.
 * `turnDegrees` is how far a rotated repeat turns (`loopRunTurnDegrees`).
 */
export function loopRunFrame(
  settings: LoopRunSettings,
  steps: number,
  clipRect: LoopRunRect,
  t: number,
  turnDegrees = 90
): LoopRunFrame {
  const rect = roomFor(roomAt(settings, t), clipRect);
  const shape = loopRunShape(settings, steps);
  const state = layoutState(settings, shape, t);
  const view = viewAt(settings, shape, t);
  const reveals = eventsOf(settings.events, "reveal");
  const enters = eventsOf(settings.events, "enter");

  /** When repetition `pass` lands, and the event that brings it, if one does. */
  const entry = (pass: number) => {
    for (const event of enters) {
      const passes = event.passes ?? Array.from({ length: shape.passes - 1 }, (_, i) => i + 1);
      const k = passes.indexOf(pass);
      if (k < 0) continue;
      const start = event.at + (event.stagger ?? 0) * k;
      return { start, end: start + event.duration };
    }
    return null;
  };
  /** When step `s` is revealed, if an event reveals it. */
  const revealOf = (s: number) => {
    for (const event of reveals) {
      const listed = event.steps ?? Array.from({ length: shape.seed }, (_, i) => i);
      const k = listed.indexOf(s);
      if (k < 0) continue;
      const every = listed.length > 0 ? event.duration / listed.length : 0;
      const start = event.at + k * every;
      return { start, fade: every > 0 ? Math.min(REVEAL_FADE, every) : REVEAL_FADE };
    }
    return null;
  };

  const plain = settings.plainTiles === true;
  const tiles: LoopTileDraw[] = [];
  const copies: LoopCopyDraw[] = [];
  for (let s = 0; s < shape.steps; s++) {
    const pass = passOf(shape, s);
    const place = placeAt(settings, shape, rect, state, view, s);
    const reveal = revealOf(s);
    const arrive = pass > 0 ? entry(pass) : null;
    let opacity = 1;
    let scale = 1;
    if (reveal) {
      opacity = ramp(t, reveal.start, reveal.start + reveal.fade);
      // A plain tile's empty frame already stands, so it fades in without growing.
      if (!plain) scale = lerp(0.8, 1, opacity);
    } else if (arrive) {
      opacity = ramp(t, arrive.end - 0.15, arrive.end + 0.05);
    }
    // In rows, a row outside the rows in view waits unseen and comes in as the view grows to it.
    if (state.from === "rows" && state.to === "rows") opacity *= rowInView(view, pass);
    const { props, arrows, letter } = propsAt(settings, s, t);
    const corner = plain ? 0 : 1 - cardShare(state, pass);
    const outline = !plain && pass > 0 ? 1 : 0;
    tiles.push({ ...place, step: s, opacity, scale, outline, corner, letter, arrows, props });

    if (arrive && t >= arrive.start && t < arrive.end + 0.2) {
      const from = sourceOf(settings.change, shape, s);
      const u = ramp(t, arrive.start, Math.max(arrive.start, arrive.end - 0.2));
      const fromPlace = loopTilePlace(state.from, settings.change, shape, rect, from, view, settings);
      const toPlace = loopTilePlace(state.from, settings.change, shape, rect, s, view, settings);
      let at: LoopTilePlace;
      if (state.from === "ring") {
        const d0 = ringDegrees(from, shape.steps);
        const d1 = d0 + halfTurnForward(ringDegrees(s, shape.steps) - d0);
        at = ringPlace(rect, shape.steps, lerp(d0, d1, u));
      } else {
        at = {
          x: lerp(fromPlace.x, toPlace.x, u),
          y: lerp(fromPlace.y, toPlace.y, u),
          size: lerp(fromPlace.size, toPlace.size, u),
        };
      }
      const wiped = settings.change === "swapped" || settings.change === "inverted" || settings.change === "rewound";
      copies.push({
        ...at,
        from,
        to: s,
        opacity: ramp(t, arrive.start, arrive.start + 0.12) * (1 - ramp(t, arrive.end, arrive.end + 0.2)),
        turn: settings.change === "rotated" ? turnDegrees * u : 0,
        flip: settings.change === "reflected" ? 1 - 2 * u : 1,
        wipe: wiped ? (fromPlace.x + toPlace.x) / 2 : null,
      });
    }
  }

  // The props a step left slide over into the next tile, then stay there.
  const ghosts: LoopGhostDraw[] = [];
  for (const carry of eventsOf(settings.events, "carry")) {
    if (carry.step < 1 || carry.step >= shape.steps) continue;
    if (t < carry.at || t >= carry.at + carry.duration) continue;
    const u = ramp(t, carry.at, carry.at + carry.duration);
    const a = tiles[carry.step - 1]!;
    const b = tiles[carry.step]!;
    ghosts.push({
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      size: lerp(a.size, b.size, u),
      step: carry.step - 1,
      opacity: 1,
    });
  }

  // Empty places wait in the ring and in pairs, and go once the tiles leave.
  const slotsShown = Math.max(1 - awayFrom(state, shape, "ring"), 1 - awayFrom(state, shape, "pairs"));
  const slots =
    slotsShown > 0
      ? Array.from({ length: shape.steps }, (_, s) => ({
          ...loopTilePlace(state.from === "ring" || state.from === "pairs" ? state.from : state.to, settings.change, shape, rect, s, view, settings),
          opacity: slotsShown,
          waiting: 1 - tiles[s]!.opacity,
        }))
      : [];

  // The line a repeat passes through, between the seed's column and the next.
  let line: LoopLineDraw | null = null;
  const firstEnter = enters[0];
  if (settings.change !== "rotated" && firstEnter && shape.passes >= 2) {
    const away = awayFrom(state, shape, "pairs");
    const enterEnd = firstEnter.at + firstEnter.duration;
    const opacity =
      ramp(t, firstEnter.at - 0.5, firstEnter.at) * (1 - 0.55 * ramp(t, enterEnd + 0.4, enterEnd + 0.8)) * (1 - away);
    if (opacity > 0) {
      const pairs = (s: number) => loopTilePlace("pairs", settings.change, shape, rect, s, undefined, settings);
      const left = pairs(0);
      const right = pairs(shape.seed);
      const top = pairs(0);
      const bottom = pairs(shape.seed - 1);
      const x = (left.x + right.x) / 2;
      const reach = top.size * (settings.lineReach ?? 0.62);
      line = { x0: x, y0: top.y - reach, x1: x, y1: bottom.y + reach, opacity };
    }
  }

  // The ring's home mark, in the gap at its top, between the last step and the first.
  let home: LoopLineDraw | null = null;
  const ringShown = 1 - awayFrom(state, shape, "ring");
  if (ringShown > 0 && (settings.layout === "ring" || state.to === "ring")) {
    const homeEvent = eventsOf(settings.events, "home")[0];
    const strength = homeEvent ? ramp(t, homeEvent.at, homeEvent.at + homeEvent.duration) : 0;
    const side = Math.min(rect.width, rect.height);
    const { radius, size } = ringGeometry(shape.steps);
    const x = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const half = (size + 0.02) * side * 0.5;
    home = {
      x0: x,
      y0: cy - radius * side - half,
      x1: x,
      y1: cy - radius * side + half,
      opacity: (0.35 + 0.65 * strength) * ringShown,
    };
  }

  // Once every tile has settled into the card, the start position comes in on the row above.
  let start: LoopRunFrame["start"] = null;
  const settled = cardSettledAt(settings, shape);
  // Without its start position the card is the one row, whatever `startAlways` says.
  const withStart = settings.cardStart !== false;
  if (withStart && settings.startAlways) {
    // Where the card will put it, in the room the card has then, so it is still when the card comes.
    const cardRect = settled === null ? rect : roomFor(roomAt(settings, Math.max(t, settled)), clipRect);
    start = { ...cardPlace(cardRect, shape, -1), opacity: 1 };
  } else if (withStart && settled !== null && state.to === "card") {
    const opacity = ramp(t, settled - 0.1, settled - 0.1 + START_FADE);
    if (opacity > 0) start = { ...cardPlace(rect, shape, -1), opacity };
  }

  return { slots, tiles, copies, ghosts, line, home, start, stage: stageAt(settings, shape, clipRect, tiles, t) };
}

/**
 * The stage at `t`: the last play that has begun to fade in. Inside a round
 * each step's move runs linearly at one even pace, so the end of one step is
 * the start of the next and the end of a round is the start of the next round.
 */
function stageAt(
  settings: LoopRunSettings,
  shape: LoopRunShape,
  clip: LoopRunRect,
  tiles: readonly LoopTileDraw[],
  t: number
): LoopStageDraw | null {
  const fadeFrom = (event: EventOf<"play">) => Math.min(event.at, event.from ?? event.at - STAGE_FADE);
  const play = eventsOf(settings.events, "play")
    .filter((event) => t >= fadeFrom(event))
    .at(-1);
  if (!play || shape.steps < 1) return null;
  const opacity = ramp(t, fadeFrom(play), Math.min(play.at, fadeFrom(play) + STAGE_FADE));
  const rounds = play.rounds ?? 2;
  const total = rounds * shape.steps;
  const per = play.duration / total;
  const elapsed = t - play.at;
  let props: LoopStageDraw["props"];
  /** The step being played, the one before it, and how far into the step `t` is in seconds. */
  let k = 0;
  let into = 0;
  if (elapsed < 0 || per <= 0) props = { step: -1, progress: 1, continued: false };
  else if (elapsed >= play.duration) {
    props = { step: shape.steps - 1, progress: 1, continued: total > shape.steps };
    k = total - 1;
    into = per;
  } else {
    k = Math.min(total - 1, Math.floor(elapsed / per));
    into = elapsed - k * per;
    props = { step: k % shape.steps, progress: clamp01(into / per), continued: k >= shape.steps };
  }

  // The app's selection does not slide: the ring cross-fades from tile to tile.
  const rings: LoopRingDraw[] = [];
  if (play.marker !== false) {
    const gone = elapsed >= play.duration ? ramp(t, play.at + play.duration, play.at + play.duration + RING_FADE) : 0;
    const strength = opacity * (1 - gone);
    const u = k === 0 || elapsed < 0 ? 1 : clamp01(into / RING_SWAP);
    const ring = (tile: LoopTileDraw | undefined, share: number) => {
      if (!tile || share * strength <= 0) return;
      const half = tile.size / 2;
      rings.push({
        x: tile.x - half,
        y: tile.y - half,
        width: tile.size,
        height: tile.size,
        strength: share * strength,
        ...(play.ring ? { look: play.ring } : {}),
      });
    };
    if (u < 1) ring(tiles[(k + shape.steps - 1) % shape.steps], 1 - u);
    ring(tiles[k % shape.steps], u);
  }
  return {
    x: clip.x + play.stage.x * clip.width,
    y: clip.y + play.stage.y * clip.height,
    size: play.stage.size * clip.width,
    opacity,
    grid: play.stage.grid ?? 1,
    props,
    rings,
  };
}

/** Every edge's room, starting from the run's own and eased by each room event in turn. */
function roomAt(settings: LoopRunSettings, t: number): Required<LoopRunRoom> {
  let room: Required<LoopRunRoom> = {
    top: settings.room?.top ?? 0,
    bottom: settings.room?.bottom ?? 0,
    left: settings.room?.left ?? 0,
    right: settings.room?.right ?? 0,
  };
  for (const event of eventsOf(settings.events, "room")) {
    if (t < event.at) break;
    const u = ramp(t, event.at, event.at + event.duration);
    const next = { ...room, ...event.room };
    room = {
      top: lerp(room.top, next.top, u),
      bottom: lerp(room.bottom, next.bottom, u),
      left: lerp(room.left, next.left, u),
      right: lerp(room.right, next.right, u),
    };
  }
  return room;
}

/** The part of the clip the pictures may use, once the room at each edge is kept clear. */
function roomFor(room: Required<LoopRunRoom>, rect: LoopRunRect): LoopRunRect {
  const down = Math.max(0.1, 1 - room.top - room.bottom);
  const across = Math.max(0.1, 1 - room.left - room.right);
  return {
    x: rect.x + rect.width * room.left,
    y: rect.y + rect.height * room.top,
    width: rect.width * across,
    height: rect.height * down,
  };
}

/** 1 for a row inside `view`, fading to 0 within one row outside it. */
function rowInView(view: LoopRunView, row: number): number {
  return clamp01(view.first + view.count - row) * clamp01(row - view.first + 1);
}

/** How far repetition `pass` has closed up into the card: square corners as it parts sideways. */
function cardShare(state: LayoutState, pass: number): number {
  if (state.from === "card" && state.to === "card") return 1;
  if (state.to === "card") return ramp(state.progress(pass), 0, 0.6);
  if (state.from === "card") return 1 - ramp(state.progress(pass), 0, 0.6);
  return 0;
}

/** When the run's tiles have all settled into the card: 0 when it starts there, null when it never goes. */
function cardSettledAt(settings: LoopRunSettings, shape: LoopRunShape): number | null {
  let settled: number | null = settings.layout === "card" ? 0 : null;
  for (const event of eventsOf(settings.events, "layout")) {
    settled = event.layout === "card" ? event.at + event.duration + (event.stagger ?? 0) * (shape.passes - 1) : null;
  }
  return settled;
}

/** A turn folded into (0, 360]: the way forward round the ring. */
function halfTurnForward(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d === 0 ? 360 : d;
}

// ─── Ready-made plays ────────────────────────────────────────────────────────

/** The run's last moment worth showing, in clip seconds. */
export function loopRunLength(settings: LoopRunSettings, steps: number): number {
  const shape = loopRunShape(settings, steps);
  let end = 0;
  for (const event of settings.events) {
    const stagger = "stagger" in event ? (event.stagger ?? 0) : 0;
    const spread = event.kind === "layout" || event.kind === "enter" ? stagger * Math.max(0, shape.passes - 1) : 0;
    end = Math.max(end, event.at + event.duration + spread);
  }
  return end;
}

/** Seconds a badge takes to come up. */
const BADGE_FADE = 0.28;

/** The badge showing `t` seconds into the run, with how far it has come up. */
export function loopRunBadgeAt(
  settings: Pick<LoopRunSettings, "badges" | "colour" | "change">,
  t: number
): {
  text: string;
  icon: LoopRunBadgeIcon;
  colour: string;
  opacity: number;
  /** Where the chip's top edge is, gliding `glide` of the way from `from` to `to`; undefined is the top of the frame. */
  top: { from: number | undefined; to: number | undefined; glide: number };
  /** Where the chip's left edge is, the same way; undefined centres it. */
  left: { from: number | undefined; to: number | undefined; glide: number };
} | null {
  const badges = [...(settings.badges ?? [])].sort((a, b) => a.at - b.at);
  let index = -1;
  badges.forEach((badge, i) => {
    if (badge.at <= t) index = i;
  });
  const shown = badges[index];
  if (!shown || !shown.text) return null;
  // The same name somewhere else glides there; a new name takes over in its own place.
  const before = badges[index - 1];
  const glides =
    before !== undefined && before.text === shown.text && (before.top !== shown.top || before.left !== shown.left);
  const glide = glides ? ramp(t, shown.at, shown.at + (shown.duration ?? 0)) : 1;
  const top = { from: glides ? before.top : shown.top, to: shown.top, glide };
  const left = { from: glides ? before.left : shown.left, to: shown.left, glide };
  // The run's first badge comes up with it; a later one takes over in place, as the reference does going on from the ring.
  return {
    text: shown.text,
    icon: shown.icon ?? settings.change,
    colour: shown.colour ?? settings.colour,
    opacity: index === 0 ? 0.35 + 0.65 * ramp(t, shown.at, shown.at + BADGE_FADE) : 1,
    top,
    left,
  };
}

/**
 * The plays the explainer settled on, as a starting point for a new run: a
 * rotated ring that comes home and opens into rows; a pair of columns that a
 * repeat crosses into and that ends in one row (inverted and rewound are
 * performed first); or rows performed step after step with each staff
 * carried on. Times are seconds on the clip.
 */
export function loopRunDefaultEvents(
  change: LoopRunChange,
  layout: LoopRunLayout,
  steps: number,
  seed: number
): LoopRunEvent[] {
  const shape = loopRunShape({ seed }, steps);
  const reveal: LoopRunEvent = { kind: "reveal", at: 0.8, duration: shape.seed };
  if (layout === "ring")
    return [
      reveal,
      { kind: "enter", at: 3.2, duration: 1.2, stagger: 2 },
      { kind: "home", at: 3.2 + 2 * (shape.passes - 2) + 1.7, duration: 0.4 },
      { kind: "layout", at: 3.2 + 2 * (shape.passes - 2) + 6, duration: 0.8, layout: "rows", stagger: 0.22 },
    ];
  if (layout === "pairs") {
    const events: LoopRunEvent[] = [reveal, { kind: "enter", at: 3.2, duration: 1.6 }];
    if (change === "inverted") {
      events.push({ kind: "clear", at: 5.7, duration: 0.4 });
      for (let row = 0; row < shape.seed; row++)
        events.push({
          kind: "perform",
          at: 6.4 + row * 2,
          duration: 1.35,
          steps: Array.from({ length: shape.passes }, (_, p) => p * shape.seed + row),
        });
      events.push({ kind: "layout", at: 6.4 + shape.seed * 2 - 0.1, duration: 1.2, layout: "card" });
      return events;
    }
    if (change === "rewound") {
      events.push({ kind: "clear", at: 5.9, duration: 0.4 });
      for (let s = 0; s < shape.steps; s++)
        events.push({ kind: "perform", at: 6.6 + s * 1.5, duration: 1.15, steps: [s] });
      events.push({ kind: "layout", at: 6.6 + shape.steps * 1.5 - 0.15, duration: 1.2, layout: "card" });
      return events;
    }
    events.push({ kind: "layout", at: 5.1, duration: 1.2, layout: "card" });
    return events;
  }
  // Rows: every step performed in turn, each staff carried on from the tile before.
  const events: LoopRunEvent[] = [{ kind: "perform", at: 0.6, duration: 1.6, steps: [0] }];
  let t = 2.2;
  for (let s = 1; s < shape.steps; s++) {
    events.push({ kind: "carry", at: t, duration: 0.6, step: s });
    events.push({ kind: "perform", at: t + 0.7, duration: 1.6, steps: [s] });
    t += 2.4;
  }
  return events;
}

// ─── The compiled plan ───────────────────────────────────────────────────────

/** The sequence a run carries, as a mandala clip carries its own. */
export interface LoopRunSequenceSnapshot {
  id: string;
  name: string;
  sequence: import("#lib/shared/foundation/domain/models/sequence-data.js").SequenceData;
}

/** What a LOOP run clip draws, for `loop-run-painter.ts`. */
export interface LoopRunPlan {
  itemId: string;
  /** The role its painted layer draws under. */
  role: string;
  start: number;
  end: number;
  sequence: LoopRunSequenceSnapshot;
  settings: LoopRunSettings;
}

export function loopRunPlanOf(
  item: LoopRunSettings & { id: string; start: number; duration: number; sequence: LoopRunSequenceSnapshot },
  role: string
): LoopRunPlan {
  const { seed, change, layout, colour, events, badges, room, waitingGrids, lineReach, startAlways, cardStart, pairsGap, plainTiles } =
    item;
  return {
    itemId: item.id,
    role,
    start: item.start,
    end: item.start + item.duration,
    sequence: item.sequence,
    settings: {
      seed,
      change,
      layout,
      colour,
      events,
      ...(badges ? { badges } : {}),
      ...(room ? { room } : {}),
      ...(waitingGrids !== undefined ? { waitingGrids } : {}),
      ...(lineReach !== undefined ? { lineReach } : {}),
      ...(startAlways !== undefined ? { startAlways } : {}),
      ...(cardStart !== undefined ? { cardStart } : {}),
      ...(pairsGap ? { pairsGap } : {}),
      ...(plainTiles !== undefined ? { plainTiles } : {}),
    },
  };
}
