/**
 * The app's gold selection ring, painted on a canvas: the one the card
 * ending puts round a cell and the LOOP run puts round the step it is
 * playing. One painter with two looks, so neither can drift from the app:
 * `skin` (the default) is StepCell's `.selection-skin`, rounded with its glow
 * outside; `card` is the sequence card's current cell
 * (`CardGridLayout.svelte`, `.pictograph-cell.current::after`), a square
 * border wholly inside the cell with its glow going inward.
 */

/**
 * The ring's gold (`rgba(251, 191, 36, a)`, the app's amber-400) at `alpha`:
 * the one gold every LOOP run mark that echoes the ring is drawn in.
 */
export function selectionGold(alpha: number): string {
  return `rgba(251, 191, 36, ${alpha})`;
}

/**
 * The app's amber selection skin (StepCell's `.selection-skin`), as shares of
 * the cell's width so it keeps its look at every size: a 3 px gradient
 * border, 12 px corners and two soft glows on a cell about 120 px wide.
 */
const RING_BORDER_SHARE = 0.025;
const RING_RADIUS_SHARE = 0.1;
const RING_GLOW_SHARE = 0.167;
const RING_WIDE_GLOW_SHARE = 0.267;
const RING_WIDE_GLOW_DROP_SHARE = 0.067;
const RING_MIN_BORDER_PX = 1.5;
const RING_FROM = "#f59e0b";
const RING_TO = "#d97706";
const RING_GLOW = selectionGold(0.5);
const RING_WIDE_GLOW = selectionGold(0.3);
const RING_EDGE = selectionGold(0.2);

/**
 * The sequence card's current cell (`3px solid rgba(251, 191, 36, 0.9)`,
 * `inset 0 0 14px rgba(251, 191, 36, 0.5)`), as shares of the cell's width:
 * a 6 px border and a 28 px inward glow on a 254 px cell.
 */
const CARD_BORDER_SHARE = 6 / 254;
const CARD_GLOW_SHARE = 28 / 254;
const CARD_BORDER = selectionGold(0.9);
const CARD_GLOW = selectionGold(0.5);

export type SelectionRingLook = "skin" | "card";

type RingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RingCell = { x: number; y: number; width: number; height: number };

/** One ring around `cell` (canvas pixels) at `strength`, 0 to 1, in `look`. */
export function paintSelectionRing(
  context: RingContext,
  cell: RingCell,
  strength: number,
  look: SelectionRingLook = "skin"
): void {
  if (strength <= 0 || cell.width <= 0 || cell.height <= 0) return;
  if (look === "card") {
    paintCardRing(context, cell, strength);
    return;
  }
  const { x, y, width, height } = cell;
  const border = Math.max(RING_MIN_BORDER_PX, width * RING_BORDER_SHARE);
  const radius = width * RING_RADIUS_SHARE;
  context.save();
  context.globalAlpha *= strength;
  // The glows fall outside the ring only, so the pictograph stays clean.
  context.save();
  const outside = new Path2D();
  const reach = width * (RING_WIDE_GLOW_SHARE + RING_WIDE_GLOW_DROP_SHARE) * 2;
  outside.rect(x - reach, y - reach, width + reach * 2, height + reach * 2);
  outside.roundRect(x, y, width, height, radius);
  context.clip(outside, "evenodd");
  context.fillStyle = RING_FROM;
  context.shadowColor = RING_GLOW;
  context.shadowBlur = width * RING_GLOW_SHARE;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.shadowColor = RING_WIDE_GLOW;
  context.shadowBlur = width * RING_WIDE_GLOW_SHARE;
  context.shadowOffsetY = width * RING_WIDE_GLOW_DROP_SHARE;
  context.fill();
  context.restore();
  const gradient = context.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, RING_FROM);
  gradient.addColorStop(1, RING_TO);
  context.strokeStyle = gradient;
  context.lineWidth = border;
  context.beginPath();
  context.roundRect(
    x + border / 2,
    y + border / 2,
    width - border,
    height - border,
    Math.max(0, radius - border / 2)
  );
  context.stroke();
  context.strokeStyle = RING_EDGE;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x - 0.5, y - 0.5, width + 1, height + 1, radius + 0.5);
  context.stroke();
  context.restore();
}

/** The card's look: square, nothing outside the cell, the glow falling inward from the border. */
function paintCardRing(context: RingContext, cell: RingCell, strength: number): void {
  const { x, y, width, height } = cell;
  const border = Math.min(Math.max(RING_MIN_BORDER_PX, width * CARD_BORDER_SHARE), width / 2, height / 2);
  const glow = width * CARD_GLOW_SHARE;
  const inner = { x: x + border, y: y + border, width: width - 2 * border, height: height - 2 * border };
  context.save();
  context.globalAlpha *= strength;
  if (inner.width > 0 && inner.height > 0) {
    // Only the shadow of a frame round the inner box falls inside it, as CSS's inset shadow does.
    context.save();
    context.beginPath();
    context.rect(inner.x, inner.y, inner.width, inner.height);
    context.clip();
    const reach = width + glow * 4;
    const frame = new Path2D();
    frame.rect(x - reach, y - reach, width + reach * 2, height + reach * 2);
    frame.rect(inner.x, inner.y, inner.width, inner.height);
    context.fillStyle = "#000";
    context.shadowColor = CARD_GLOW;
    context.shadowBlur = glow;
    context.fill(frame, "evenodd");
    context.restore();
  }
  context.strokeStyle = CARD_BORDER;
  context.lineWidth = border;
  context.strokeRect(x + border / 2, y + border / 2, width - border, height - border);
  context.restore();
}
