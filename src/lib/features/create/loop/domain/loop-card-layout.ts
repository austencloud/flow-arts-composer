/**
 * Where every square of the LOOP tab's card sits. The card always fits the
 * room it is given and is never scrolled; the squares glide between these
 * places as the LOOP is made.
 */

export interface CardCell {
  x: number;
  y: number;
  size: number;
}

export interface CardLayout {
  size: number;
  start: CardCell;
  /** One place per step, in order. */
  steps: CardCell[];
}

export interface Room {
  width: number;
  height: number;
}

const PAD = 12;
/** Past this a pictograph gains nothing from more room. */
const MAX_CELL = 230;

/**
 * A long repetition folds onto rows of four only when that makes its squares
 * clearly bigger, as on an upright phone. Otherwise one unbroken row reads best.
 */
const FOLD_GAIN = 1.25;
/** A seed this short is too thin for a row of its own: its repeats share one. */
const SHORT_SEED = 2;
/** The most squares a row of short repeats holds. */
const SHORT_ROW = 4;
/**
 * Two shapes whose squares are this close in size count as equal, so the
 * start keeps its place instead of hopping for a few pixels.
 */
const NEAR_EQUAL = 0.96;

/**
 * Where the start position sits: on its own row above the steps, or in its
 * own column to their left, the way the choreo card and the beat grid place it.
 */
export type StartLane = "top" | "left";

interface Shape {
  lane: StartLane;
  /** Squares across for the steps, not counting a start column. */
  columns: number;
  /** Rows of steps, not counting a start row. */
  rows: number;
}

const LANES: readonly StartLane[] = ["top", "left"];

/**
 * Made: the start in its lane, then the repetitions in order, read left to
 * right. A repetition of three or more steps gets a row of its own, and a long
 * one on a small screen folds onto more rows. Shorter repetitions share a row,
 * up to four squares across, so a one-step LOOP never stands as a column.
 */
export function madeLayout(
  room: Room,
  stepCount: number,
  partLength: number
): CardLayout {
  const part = Math.max(1, partLength);
  const repeats = Math.max(1, Math.ceil(stepCount / part));
  const plans: MadePlan[] = [];
  for (const lane of LANES) {
    if (part > SHORT_SEED) {
      const partColumns = foldPart(room, lane, part, repeats);
      const rows = repeats * Math.ceil(part / partColumns);
      plans.push({
        shape: { lane, columns: partColumns, rows },
        partColumns,
        perRow: 1,
      });
      continue;
    }
    for (let perRow = 1; perRow <= repeats; perRow++) {
      if (repeats % perRow !== 0 || perRow * part > SHORT_ROW) continue;
      // A single square across is the column this layout exists to avoid.
      if (perRow * part < 2 && repeats > 1) continue;
      plans.push({
        shape: { lane, columns: perRow * part, rows: repeats / perRow },
        partColumns: part,
        perRow,
      });
    }
  }
  const shape = pickShape(
    room,
    plans.map((plan) => plan.shape)
  );
  const { partColumns, perRow } = plans.find((plan) => plan.shape === shape)!;
  const rowsPerPart = Math.ceil(part / partColumns);
  const size = shapeSize(room, shape);
  const place = grid(room, size, shape, shape.columns);
  return {
    size,
    start: startCell(place, shape.lane),
    steps: Array.from({ length: stepCount }, (_, i) => {
      const repeat = Math.floor(i / part);
      const inPart = i % part;
      const row =
        Math.floor(repeat / perRow) * rowsPerPart +
        Math.floor(inPart / partColumns);
      const column = (repeat % perRow) * partColumns + (inPart % partColumns);
      return place(column, row);
    }),
  };
}

interface MadePlan {
  shape: Shape;
  /** Squares across for one repetition. */
  partColumns: number;
  /** Repetitions side by side in one row. */
  perRow: number;
}

/** Squares across for one long repetition: halved while that clearly grows them. */
function foldPart(
  room: Room,
  lane: StartLane,
  part: number,
  repeats: number
): number {
  const sizeAt = (columns: number) =>
    shapeSize(room, {
      lane,
      columns,
      rows: repeats * Math.ceil(part / columns),
    });
  let columns = part;
  while (columns > 4) {
    const folded = Math.ceil(columns / 2);
    if (sizeAt(folded) < sizeAt(columns) * FOLD_GAIN) break;
    columns = folded;
  }
  return columns;
}

/**
 * The biggest squares win. Near-equal shapes keep the start where the room's
 * shape puts it (beside the steps when wide, above them when tall), then take
 * the fewest rows.
 */
function pickShape(room: Room, shapes: readonly Shape[]): Shape {
  const sized = shapes.map((shape) => ({
    shape,
    size: shapeSize(room, shape),
  }));
  const biggest = Math.max(...sized.map((entry) => entry.size));
  const preferred: StartLane = room.width >= room.height ? "left" : "top";
  const near = sized.filter((entry) => entry.size >= biggest * NEAR_EQUAL);
  near.sort(
    (a, b) =>
      Number(b.shape.lane === preferred) - Number(a.shape.lane === preferred) ||
      totalRows(a.shape) - totalRows(b.shape) ||
      b.size - a.size
  );
  return near[0]!.shape;
}

function totalColumns(shape: Shape): number {
  return shape.columns + (shape.lane === "left" ? 1 : 0);
}

function totalRows(shape: Shape): number {
  return shape.rows + (shape.lane === "top" ? 1 : 0);
}

function shapeSize(room: Room, shape: Shape): number {
  return cellSize(room, totalColumns(shape), totalRows(shape));
}

type Place = (column: number, row: number) => CardCell;

/** The start's square: the top-left corner of the grid, whichever lane. */
function startCell(place: Place, lane: StartLane): CardCell {
  return lane === "top" ? place(0, -1) : place(-1, 0);
}

/**
 * Step squares by column and row, counted from the first step; the start's
 * lane sits at column -1 or row -1. Centred on the squares actually shown.
 */
function grid(
  room: Room,
  size: number,
  shape: Shape,
  shownColumns: number
): Place {
  const lead = shape.lane === "left" ? 1 : 0;
  const top = shape.lane === "top" ? 1 : 0;
  const across = Math.min(shownColumns, shape.columns) + lead;
  const x0 = (room.width - size * across) / 2 + lead * size;
  const y0 = (room.height - size * totalRows(shape)) / 2 + top * size;
  return (column, row) => ({
    x: x0 + column * size,
    y: y0 + row * size,
    size,
  });
}

/** How a row of steps sits in the comparison: how wide, and how big. */
export interface RowFit {
  columns: number;
  size: number;
}

export const COMPARED_GAP = 2;
/** Past this the five rows stop being read together. */
const MAX_COMPARED_CELL = 112;

/**
 * Comparing: every row is drawn at one size, as big as the longest row allows.
 * A long row folds onto a second line when that makes its squares bigger.
 */
export function comparedRow(room: Room, longest: number): RowFit {
  let best: RowFit = { columns: Math.max(1, longest), size: 0 };
  for (let columns = Math.max(1, longest); columns >= 1; columns--) {
    const lines = Math.ceil(longest / columns);
    const size = Math.min(
      (room.width - (columns - 1) * COMPARED_GAP) / columns,
      (room.height - (lines - 1) * COMPARED_GAP) / lines,
      MAX_COMPARED_CELL
    );
    if (size > best.size) best = { columns, size };
  }
  return best;
}

function cellSize(room: Room, columns: number, rows: number): number {
  return Math.max(
    0,
    Math.min(
      (room.width - PAD * 2) / columns,
      (room.height - PAD * 2) / rows,
      MAX_CELL
    )
  );
}
