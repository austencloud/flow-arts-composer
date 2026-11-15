import {
  CARD_QR_CAPTION_SIZE,
  lerpBox,
  qrLandingBox,
  type CardQrCaptionFace,
  type PostCardQrExit,
  type CardEndingFrame,
  type CardLayout,
  type CardPiece,
  type CardRect,
  type PostCardEnding,
  type PostFrameBox,
  type QrFlight,
} from "./card-ending";
import {
  BRAND_SERIF,
  BRAND_SERIF_FONT,
} from "#lib/shared/media-composition/services/brand-serif.js";

/**
 * Drawing a card's ending, shared by the preview and the export so the two
 * cannot drift: the measured layout of a drawn card, the cascade's mask, the
 * gold ring and the QR's flight. The timing itself is `card-ending.ts`.
 *
 * Like surfaces.ts, which uses it, this module never imports the plugin index
 * by value.
 */

// ---------------------------------------------------------------------------
// Measuring a drawn card
// ---------------------------------------------------------------------------

/** A drawn card's layout plus what the export needs to redraw its QR. */
export interface MeasuredCardLayout extends CardLayout {
  /** The QR image on the card, drawn again for the flight. */
  qrImage?: HTMLImageElement | undefined;
  /** The QR tile's own fill, which the flying QR keeps under it. */
  qrPlate?: string | undefined;
}

function rectIn(element: Element, frame: DOMRect): CardRect {
  const box = element.getBoundingClientRect();
  return {
    x: (box.left - frame.left) / frame.width,
    y: (box.top - frame.top) / frame.height,
    width: box.width / frame.width,
    height: box.height / frame.height,
  };
}

function transparent(color: string): boolean {
  return (
    !color ||
    color === "transparent" ||
    /rgba\([^)]*,\s*0\)$/.test(color.replace(/\s+/g, " "))
  );
}

/**
 * Where each tile of a drawn card sits, as fractions of `cardLayer` (the
 * `.choreo-layer`). Reads the card's own `data-card-step` marks and its QR
 * and mandala cells; a tile's box is its backing (the duration cell or grid
 * wrapper around it) and its cell is the pictograph square the ring outlines.
 */
export function measureCardLayout(cardLayer: HTMLElement): MeasuredCardLayout {
  const frame = cardLayer.getBoundingClientRect();
  if (frame.width <= 0 || frame.height <= 0) return { pieces: [] };
  const pieces: CardPiece[] = [];
  const backing = (cell: Element) =>
    cell.closest(".duration-cell, .cell-flip-wrapper") ?? cell;
  for (const cell of cardLayer.querySelectorAll<HTMLElement>(
    "[data-card-step]"
  )) {
    const step = Number(cell.dataset.cardStep);
    if (!Number.isFinite(step)) continue;
    pieces.push({
      kind: step < 0 ? "start" : "step",
      ...(step >= 0 ? { step } : {}),
      rect: rectIn(backing(cell), frame),
      cell: rectIn(cell, frame),
    });
  }
  let qrImage: HTMLImageElement | undefined;
  let qrPlate: string | undefined;
  let qr: CardRect | undefined;
  const qrCell = cardLayer.querySelector<HTMLElement>(".qr-cell");
  if (qrCell) {
    pieces.push({
      kind: "qr",
      rect: rectIn(backing(qrCell), frame),
      cell: rectIn(qrCell, frame),
    });
    qrImage =
      qrCell.querySelector<HTMLImageElement>("img.qr-code-image") ?? undefined;
    if (qrImage) qr = rectIn(qrImage, frame);
    const fill = getComputedStyle(qrCell).backgroundColor;
    qrPlate = transparent(fill)
      ? getComputedStyle(cardLayer).backgroundColor
      : fill;
  }
  for (const cell of cardLayer.querySelectorAll(".mandala-cell")) {
    pieces.push({
      kind: "mandala",
      rect: rectIn(backing(cell), frame),
      cell: rectIn(cell, frame),
    });
  }
  const letters = cardLayer.querySelector(".header-section .word-title > *");
  const word = letters ? rectIn(letters, frame) : undefined;
  return { pieces, qr, word, qrImage, qrPlate };
}

/** Two layouts differ enough to draw again: a tile count or a box moved. */
export function sameCardLayout(a: CardLayout, b: CardLayout): boolean {
  if (a.pieces.length !== b.pieces.length) return false;
  const close = (p?: CardRect, q?: CardRect) =>
    p === q ||
    (!!p &&
      !!q &&
      Math.abs(p.x - q.x) < 1e-4 &&
      Math.abs(p.y - q.y) < 1e-4 &&
      Math.abs(p.width - q.width) < 1e-4 &&
      Math.abs(p.height - q.height) < 1e-4);
  return (
    a.pieces.every(
      (piece, i) =>
        piece.kind === b.pieces[i]!.kind &&
        piece.step === b.pieces[i]!.step &&
        close(piece.rect, b.pieces[i]!.rect)
    ) &&
    close(a.qr, b.qr) &&
    close(a.word, b.word)
  );
}

// ---------------------------------------------------------------------------
// The cascade: which part of the card shows how strongly
// ---------------------------------------------------------------------------

function round(value: number): string {
  return (Math.round(value * 1e5) / 1e5).toString();
}

function svgRect(rect: CardRect): string {
  const { x, y, width, height } = rect;
  return `M${round(x)} ${round(y)}h${round(width)}v${round(height)}h${round(-width)}z`;
}

/**
 * The preview's mask for a frame: an SVG the size of the card in which
 * everything outside the tiles shows at the backing's strength and each tile
 * at its own. Null for a plain frame, so a settled card carries no mask.
 */
export function cardEndingMask(
  frame: CardEndingFrame,
  layout: CardLayout
): string | null {
  if (frame.plain) return null;
  const holes = layout.pieces.map((piece) => svgRect(piece.rect)).join("");
  const tiles = layout.pieces
    .map((piece, i) =>
      frame.pieces[i]! > 0
        ? `<path d="${svgRect(piece.rect)}" fill-opacity="${round(frame.pieces[i]!)}"/>`
        : ""
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#fff">` +
    `<path fill-rule="evenodd" fill-opacity="${round(frame.backing)}" d="M0 0h1v1h-1z${holes}"/>` +
    tiles +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The export's version of the same mask: draws `card` into `context` at
 * `width` by `height`, the backing outside the tiles and each tile at its
 * own strength, then the rings over them.
 */
export function drawCardEnding(
  context: CanvasRenderingContext2D,
  card: CanvasImageSource,
  width: number,
  height: number,
  frame: CardEndingFrame,
  layout: CardLayout
): void {
  const scaled = (rect: CardRect) =>
    [
      rect.x * width,
      rect.y * height,
      rect.width * width,
      rect.height * height,
    ] as const;
  if (frame.backing > 0) {
    context.save();
    const outside = new Path2D();
    outside.rect(0, 0, width, height);
    for (const piece of layout.pieces) outside.rect(...scaled(piece.rect));
    context.clip(outside, "evenodd");
    context.globalAlpha = frame.backing;
    context.drawImage(card, 0, 0, width, height);
    context.restore();
  }
  layout.pieces.forEach((piece, i) => {
    const shown = frame.pieces[i]!;
    if (shown <= 0) return;
    context.save();
    context.beginPath();
    context.rect(...scaled(piece.rect));
    context.clip();
    context.globalAlpha = shown;
    context.drawImage(card, 0, 0, width, height);
    context.restore();
  });
  paintCardRings(context, width, height, frame, layout);
}

// ---------------------------------------------------------------------------
// The gold ring
// ---------------------------------------------------------------------------

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
const RING_GLOW = "rgba(251, 191, 36, 0.5)";
const RING_WIDE_GLOW = "rgba(251, 191, 36, 0.3)";
const RING_EDGE = "rgba(251, 191, 36, 0.2)";

/** One ring around `cell` (canvas pixels) at `strength`, 0 to 1. */
export function paintCardRing(
  context: CanvasRenderingContext2D,
  cell: { x: number; y: number; width: number; height: number },
  strength: number
): void {
  if (strength <= 0 || cell.width <= 0 || cell.height <= 0) return;
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

/** Every ring of a frame, over a card drawn `width` by `height`. */
export function paintCardRings(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: CardEndingFrame,
  layout: CardLayout
): void {
  for (const ring of frame.rings) {
    const cell = layout.pieces[ring.piece]?.cell;
    if (!cell) continue;
    paintCardRing(
      context,
      {
        x: cell.x * width,
        y: cell.y * height,
        width: cell.width * width,
        height: cell.height * height,
      },
      ring.strength
    );
  }
}

// ---------------------------------------------------------------------------
// The QR's flight
// ---------------------------------------------------------------------------

/** The plate under the flying QR, around it, as a share of its size. */
const QR_PLATE_PAD_SHARE = 0.06;
const QR_PLATE_RADIUS_SHARE = 0.08;
/**
 * The gap above the caption, as a share of the QR's size: the old end
 * screen's spacing, measured side by side with it on a 1080 frame.
 */
const QR_CAPTION_GAP_SHARE = 0.08;
const QR_CAPTION_STROKE_SHARE = 0.18;
const QR_CAPTION_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** The caption's canvas font at `px`. */
export function qrCaptionFont(face: CardQrCaptionFace, px: number): string {
  return face === "sans"
    ? `600 ${px}px ${QR_CAPTION_SANS}`
    : `${BRAND_SERIF_FONT} ${px}px ${BRAND_SERIF}`;
}

/** The QR's box partway through its flight, in frame fractions. */
export function qrFlightBox(
  ending: PostCardEnding,
  flight: QrFlight,
  from: PostFrameBox,
  aspect: number
): PostFrameBox {
  return lerpBox(from, qrLandingBox(ending.qrExit!, aspect), flight.progress);
}

/**
 * The flying QR on a frame `width` by `height` pixels: the frame going to
 * black behind it when its exit asks, its plate unless turned off, the code
 * drawn from its vector source at its size (so it is sharp when landed), and
 * the caption under it, sized with it.
 */
export function paintQrFlight(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: {
    image: CanvasImageSource;
    box: PostFrameBox;
    plate: string | undefined;
    qrExit: PostCardQrExit;
    flight: QrFlight;
  }
): void {
  const { qrExit, flight } = input;
  if (qrExit.backdrop === "black" && flight.progress > 0) {
    context.save();
    context.globalAlpha *= flight.progress;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  const x = input.box.x * width;
  const y = input.box.y * height;
  const w = input.box.width * width;
  const h = input.box.height * height;
  if (w <= 0 || h <= 0) return;
  const size = Math.min(w, h);
  const plated = qrExit.plate !== false && !!input.plate;
  const pad = plated ? size * QR_PLATE_PAD_SHARE : 0;
  context.save();
  if (plated) {
    context.fillStyle = input.plate!;
    context.beginPath();
    context.roundRect(
      x - pad,
      y - pad,
      w + pad * 2,
      h + pad * 2,
      size * QR_PLATE_RADIUS_SHARE
    );
    context.fill();
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(input.image, x, y, w, h);
  const caption = qrExit.caption?.trim();
  if (caption && flight.caption > 0) {
    const fontPx = size * (qrExit.captionSize ?? CARD_QR_CAPTION_SIZE);
    context.globalAlpha *= flight.caption;
    context.font = qrCaptionFont(qrExit.captionFace ?? "serif", fontPx);
    context.textAlign = "center";
    context.textBaseline = "top";
    const textY = y + h + pad + size * QR_CAPTION_GAP_SHARE;
    // On black the outline would only thicken the letters; over a picture
    // it keeps them readable.
    if (qrExit.backdrop !== "black") {
      context.lineJoin = "round";
      context.lineWidth = fontPx * QR_CAPTION_STROKE_SHARE;
      context.strokeStyle = "rgba(0, 0, 0, 0.75)";
      context.strokeText(caption, x + w / 2, textY);
    }
    context.fillStyle = "#ffffff";
    context.fillText(caption, x + w / 2, textY);
  }
  context.restore();
}
