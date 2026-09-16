/**
 * card-front-regions
 *
 * Computes the anatomy spotlight rects (word / start / steps / mandalas / QR)
 * for a printed choreo-card FRONT, in % of the DISPLAYED image, for ANY step
 * count. The marketing "What's on the Card" shuffle renders 8/12/16-count
 * cards, and the front layout reflows with the count (column layout at 8/12,
 * row layout at 16, different grid dims each), so the spotlight rects cannot
 * be hardcoded — they are derived from the same print layout math the renderer
 * uses (`calculateLayout` + `getCatalogLayoutPolicy` + `getMandalaPlacements`).
 *
 * Coordinate chain: grid cell (content space, 678x978) → framed canvas
 * (822x1122, content inset by the 72px border) → displayed image (object-fit:
 * cover into a 5:7 box crops ~1.25% off each horizontal edge).
 *
 * `computeFrontQrCellRect` maps that same QR cell into a SECOND display space:
 * the trimmed card DeckFanCover shows (the guillotine cut, bleed removed). Both
 * spaces read the one grid computation below, so nothing about where the QR
 * lands is written down twice.
 */
import { calculateLayout } from "$lib/shared/render/services/layout-calculator";
import { getCatalogLayoutPolicy } from "$lib/features/choreo-card/domain/catalog-layout-policy";
import { getMandalaPlacements } from "$lib/shared/sequence-viewer/services/get-mandala-placements";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// MPC poker card + frame geometry — must match build-front-compose-options.ts.
const CANVAS_W = 822;
const CANVAS_H = 1122;
const BORDER = 72; // round(bleed 36 * BORDER_SCALE 2.0)
const CONTENT_W = CANVAS_W - BORDER * 2; // 678
const CONTENT_H = CANVAS_H - BORDER * 2; // 978
// deckCard header/footer ratios (card-front-assembler.ts). Word header + the
// brand/element footer both always render for catalog cards.
const HEADER_H = Math.floor(CONTENT_W * 0.133);
const FOOTER_H = Math.floor(CONTENT_W * 0.067);

// object-fit: cover crop of an 822x1122 image into a 5:7 box. Image is wider
// than the box, so height fills and each horizontal edge loses this fraction.
const BOX_ASPECT = 5 / 7;
const IMG_ASPECT = CANVAS_W / CANVAS_H;
const X_CROP = (1 - BOX_ASPECT / IMG_ASPECT) / 2;

// The guillotine cut. MPC trims the 36px bleed off every edge, leaving the
// 750x1050 card a buyer actually holds — exactly 5:7. DeckFanCover displays
// that trim (its overscan fractions ARE these numbers: 822/750, 1122/1050,
// offset by one bleed), so anything meant to land on a card in a fan is
// measured against the trim rather than the full bled canvas.
const BLEED = 36;
const TRIM_W = CANVAS_W - BLEED * 2; // 750
const TRIM_H = CANVAS_H - BLEED * 2; // 1050

interface Grid {
  cols: number;
  rows: number;
  stepSize: number;
  offX: number;
  offY: number;
}

function grid(stepCount: number): Grid {
  const policy = getCatalogLayoutPolicy(stepCount);
  const [cols, rows] = calculateLayout(stepCount, true, policy);
  const availH = CONTENT_H - HEADER_H - FOOTER_H;
  const stepSize = Math.floor(Math.min(CONTENT_W / cols, availH / rows));
  const gridW = cols * stepSize;
  const gridH = rows * stepSize;
  const offX = Math.floor((CONTENT_W - gridW) / 2);
  const offY = HEADER_H + Math.floor((CONTENT_H - HEADER_H - FOOTER_H - gridH) / 2);
  return { cols, rows, stepSize, offX, offY };
}

/** Content-space rect (px within 678x978) for a span of grid cells (0-based,
 *  inclusive). */
function cellSpan(g: Grid, c0: number, r0: number, c1: number, r1: number): Rect {
  const x = c0 * g.stepSize + g.offX;
  const y = r0 * g.stepSize + g.offY;
  return {
    x,
    y,
    w: (c1 - c0 + 1) * g.stepSize,
    h: (r1 - r0 + 1) * g.stepSize,
  };
}

/**
 * The grid cell the QR prints into: the LAST cell of the leading column (8/12
 * steps) or of the leading row (everything else). It is the cell the step grid
 * leaves empty, which is why it moves with the step count and can never be a
 * fixed corner.
 */
function qrCellSpan(g: Grid, policy: "row" | "column"): Rect {
  return policy === "column"
    ? cellSpan(g, 0, g.rows - 1, 0, g.rows - 1)
    : cellSpan(g, g.cols - 1, 0, g.cols - 1, 0);
}

/** content px rect → displayed-image % rect (through the frame inset + cover
 *  crop). */
function toDisplay(r: Rect): Rect {
  const cx0 = (BORDER + r.x) / CANVAS_W;
  const cx1 = (BORDER + r.x + r.w) / CANVAS_W;
  const cy0 = (BORDER + r.y) / CANVAS_H;
  const cy1 = (BORDER + r.y + r.h) / CANVAS_H;
  const dx = (v: number) => ((v - X_CROP) / (1 - 2 * X_CROP)) * 100;
  return {
    x: dx(cx0),
    y: cy0 * 100,
    w: dx(cx1) - dx(cx0),
    h: (cy1 - cy0) * 100,
  };
}

/**
 * The five front spotlight regions for a card of `stepCount` steps, as % of the
 * displayed 5:7 image. Ids match the page's front legend + BACK_SELECTORS keys.
 */
export function computeFrontRegions(stepCount: number): Record<string, Rect> {
  const g = grid(stepCount);
  const policy = getCatalogLayoutPolicy(stepCount);
  const { cols, rows } = g;

  const { placements } = getMandalaPlacements({
    stepCount,
    cols,
    rows,
    includeStartPlacement: true,
    showQRCode: true,
    leftVisible: true,
    rightVisible: true,
    mandalaEnabled: true,
    startPlacementLayout: policy,
  });

  // Mandala bounding box (placements are 1-based).
  let mand: Rect;
  if (placements.length) {
    const c0 = Math.min(...placements.map((p) => p.col)) - 1;
    const r0 = Math.min(...placements.map((p) => p.row)) - 1;
    const c1 = Math.max(...placements.map((p) => p.col)) - 1;
    const r1 = Math.max(...placements.map((p) => p.row)) - 1;
    mand = cellSpan(g, c0, r0, c1, r1);
  } else {
    mand = cellSpan(g, 0, 1, 0, 1);
  }

  // Column layout: left column is start (row0) · mandalas · QR (last row), and
  // the steps fill cols 1+. Row layout transposes it.
  const steps =
    policy === "column"
      ? cellSpan(g, 1, 0, cols - 1, rows - 1)
      : cellSpan(g, 0, 1, cols - 1, rows - 1);
  const qr = qrCellSpan(g, policy);

  const start = cellSpan(g, 0, 0, 0, 0);

  // Word: the header band, inset horizontally so the spotlight hugs the glyphs
  // rather than the full card width.
  const word: Rect = { x: CONTENT_W * 0.12, y: 0, w: CONTENT_W * 0.76, h: HEADER_H };

  return {
    word: toDisplay(word),
    start: toDisplay(start),
    steps: toDisplay(steps),
    mandalas: toDisplay(mand),
    qr: toDisplay(qr),
  };
}

/**
 * Where the QR cell lands on a card front as DeckFanCover displays it — % of
 * the trimmed 750x1050 card, i.e. of the fan's 5:7 `.card-box`.
 *
 * The shop hero's scan cue needs this: the sweep reads the code, so it has to
 * cover the code's cell and nothing else, and that cell moves between the
 * bottom of the left column (8/12 steps) and the end of the top row. Same grid
 * math the bake used, so the band and the printed code can't disagree.
 */
export function computeFrontQrCellRect(stepCount: number): Rect {
  const r = qrCellSpan(grid(stepCount), getCatalogLayoutPolicy(stepCount));
  return {
    x: ((BORDER + r.x - BLEED) / TRIM_W) * 100,
    y: ((BORDER + r.y - BLEED) / TRIM_H) * 100,
    w: (r.w / TRIM_W) * 100,
    h: (r.h / TRIM_H) * 100,
  };
}
