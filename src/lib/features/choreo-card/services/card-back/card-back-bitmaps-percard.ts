/**
 * card-back-bitmaps-percard.ts
 *
 * Rasterizers for the card-back elements that VARY PER SEQUENCE and therefore
 * are NOT cached — each card has its own turn pattern, reversal pattern, step
 * count, loop row, and start placement. Each element is rendered to an ImageBitmap
 * (worker-transferable) and composited later.
 *
 * CANVAS-NATIVE: the turn glyph, reversal glyph, step count, and loop row are
 * drawn DIRECTLY to an OffscreenCanvas (shapes + text) — no DOM mount, no
 * screenshot. This removes the per-card mount+screenshot that dominated the
 * card-back render cost (~568ms/back, mounts the bulk of it). The visual specs
 * below are lifted pixel-for-pixel from the source components:
 *   - turn glyph    TurnPatternGlyph.svelte    bar chart of per-step turns
 *   - reversal glyph ReversalPatternGlyph.svelte dot-pair columns
 *   - step count    CardBackStepCount.svelte / CardBack `.corner-label`
 *   - loop row      CardBackLoopRow.svelte (icons stay CACHED-mount; row composed here)
 *   - start-placement pictograph — already canvas-native via Canvas2DDirectRenderer
 *     (`renderPicto`); left untouched.
 *
 * RENDER SCALE — single source of truth (matches card-back-bitmaps-constant.ts
 * and card-back-layout.ts):
 *   Card back renders at 1644×2244. 1cqi = 1644 / 100 = 16.44px. BUT every inner
 *   cqi resolves against the BORDER-FRAME content box, so each rasterizer takes a
 *   PerCardRenderCtx carrying the border-aware `cqi` + content-box width + the
 *   proof text colors the live card sets on `.back`. Box sizes (glyph 10×6cqi,
 *   step-count slot 20×9cqi, loop-row natural height) all derive from `ctx.cqi`.
 *
 * LOOP ROW — the icons (FontAwesome glyphs / SwapIcon / CheckerboardCircleIcon)
 * still need their SVG/font assets, so they are mount-rasterized via
 * `rasterizeLoopIconByKind` (sibling constant module) but CACHED per
 * kind+fa+color+cqi — there is NO per-card mount. The row itself (icon
 * placement + labels) is composed with direct canvas draws per card.
 *
 * PARITY is verified by the browser harness `/test/card-back-parity` (pixel-diff
 * + perf timing in summary.perf).
 */

import { rasterizeLoopIconByKind } from "./card-back-bitmaps-constant";
import {
  paintTurnGlyph,
  paintReversalGlyph,
  TURN_GLYPH_BOX_W_CQI,
  TURN_GLYPH_BOX_H_CQI,
  type TurnGlyphEntry,
} from "@tka/render-composition";
import type { DirectRenderOptions } from "#lib/shared/render/services/IDirectRenderer.js";
import type { RenderCanvas } from "#lib/shared/render/services/types.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// ── Render scale (matches card-back-bitmaps-constant.ts / card-back-layout.ts) ─
/** Card back render width in px (822 logical * scale 2). */
export const CARD_RENDER_WIDTH = 1644;
/** 1cqi in px at the card render width. */
const CQI = CARD_RENDER_WIDTH / 100; // 16.44

// Box sizes are derived per-call from the border-aware PerCardRenderCtx.cqi
// (glyph 10×6cqi, start-pos 12×12cqi, step-count slot 20×9cqi) — see each
// rasterizer. CQI / CARD_RENDER_WIDTH below back the DEFAULT_CTX fallback only.

/**
 * Border-frame-aware render context, supplied by the job builder so the per-card
 * elements render at the SAME cqi basis as the live card (border-frame content
 * box, not the full card width) and inherit `--card-text-muted` / `--card-text`
 * (which the live card sets on `.back`; mounted bare, glyphs/pictograph borders
 * otherwise fall back to near-white and vanish on the white proof background).
 */
export interface PerCardRenderCtx {
  /** Border-frame content-box inline size in px (= card width − 2·borderPx). */
  containerWidth: number;
  /** 1cqi in px against the border-frame content box. */
  cqi: number;
  /** Proof/theme muted text color (CardBack sets this as --card-text-muted). */
  textMutedColor: string;
  /** Proof/theme text color (CardBack sets this as --card-text). */
  textColor: string;
}

/** Fallback context (full-width cqi, dark proof text) when none is supplied. */
const DEFAULT_CTX: PerCardRenderCtx = {
  containerWidth: CARD_RENDER_WIDTH,
  cqi: CQI,
  textMutedColor: "rgba(0, 0, 0, 0.55)",
  textColor: "#111111",
};

/**
 * Render-a-pictograph indirection (for the start placement). Defaults to the
 * shared Canvas2DDirectRenderer singleton, lazily initialized once. Injectable
 * so tests assert the call without running the real (asset-loading) renderer.
 */
type RenderPictoFn = (
  pictograph: unknown,
  options: DirectRenderOptions,
) => Promise<RenderCanvas>;

// Lazily build a Canvas2DDirectRenderer WITH the preparer injected. The renderer
// only draws props/arrows when it has a preparer (`ensurePrepared`); the shared
// singleton has none unless a global getter was wired, so construct our own with
// pictographPreparer to guarantee the staffs render. Lazy-imported because the
// preparer's dep chain crashes vitest on static import (tests inject a fake).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let directRenderer: any = null;
let directRendererReady: Promise<void> | null = null;
const defaultRenderPicto: RenderPictoFn = async (pictograph, options) => {
  if (!directRenderer) {
    const [{ Canvas2DDirectRenderer }, { pictographPreparer }] = await Promise.all([
      import("#lib/shared/render/services/canvas-2d-direct-renderer.js"),
      import("#lib/shared/pictograph/shared/services/pictograph-preparer.js"),
    ]);
    directRenderer = new Canvas2DDirectRenderer(pictographPreparer);
    directRendererReady = directRenderer.initialize();
  }
  await directRendererReady;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return directRenderer.renderPictograph(pictograph as any, options);
};

let renderPicto: RenderPictoFn = defaultRenderPicto;

/** Test-only: swap the underlying renderPictograph implementation. */
export function __setRenderPictoFnForTest(fn: RenderPictoFn | null): void {
  renderPicto = fn ?? defaultRenderPicto;
}

/** Trace a rounded-rect path (for the start-pos box clip + border). */
function roundRectPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Allocate an OffscreenCanvas + its 2d context (shared by the canvas-native glyphs). */
function makeCanvas(
  w: number,
  h: number,
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  return { canvas, ctx };
}

// ── Turn glyph (per-card) ──────────────────────────────────────────────────

/**
 * Rasterize the turn-pattern bar chart for `entries` into a glyph-box-sized
 * bitmap (10cqi × 6cqi), drawn DIRECTLY to an OffscreenCanvas (no DOM mount).
 *
 * Mirrors TurnPatternGlyph.svelte: each entry is a blue bar then a red bar,
 * bar widths/gaps/radius from the shared `layoutTurnGlyph` geometry (which
 * scales all horizontal dimensions down when a long pattern would overflow
 * the 10cqi box — heights never scale). Heights per `turnBarHeightCqi`.
 * Bars are bottom-aligned (`align-items:flex-end`) and the whole cluster is
 * centered horizontally in the box (the live `.turn-glyph` flex sits
 * bottom-center in CardBack's glyph slot).
 *
 * Float bars (45° hatch in the live CSS, `opacity:0.7`) are approximated here as
 * diagonal hatch lines over the bar at 0.7 alpha — a close visual match without
 * the CSS `repeating-linear-gradient`. (See report: hatched-bar approximation.)
 */
export async function rasterizeTurnGlyph(
  entries: TurnGlyphEntry[],
  ctx: PerCardRenderCtx = DEFAULT_CTX,
): Promise<ImageBitmap> {
  const cqi = ctx.cqi;
  const boxW = Math.round(TURN_GLYPH_BOX_W_CQI * cqi);
  const boxH = Math.round(TURN_GLYPH_BOX_H_CQI * cqi);
  const { canvas, ctx: ctx2d } = makeCanvas(boxW, boxH);

  paintTurnGlyph(ctx2d, entries, { x: 0, y: 0, width: boxW, height: boxH }, {}, cqi);

  return createImageBitmap(canvas);
}

// ── Reversal glyph (per-card) ──────────────────────────────────────────────

/**
 * Rasterize the reversal-pattern dot columns into a glyph-box-sized bitmap
 * (10cqi × 6cqi), drawn DIRECTLY to an OffscreenCanvas (no DOM mount).
 *
 * Mirrors ReversalPatternGlyph.svelte: one period (sliced 0..min(8,period)),
 * each symbol a column of two stacked dots (diameter 1.8cqi → r 0.9cqi, vertical
 * gap 0.3cqi), columns separated by 0.6cqi, the whole row centered both axes.
 * Symbol → dots: P = red+blue, R = red+empty, B = empty+blue, else empty+empty.
 * Empty dots use `ctx.textMutedColor` at 0.4 alpha (live `.dot.empty`).
 */
export async function rasterizeReversalGlyph(
  sequence: string,
  period: number,
  ctx: PerCardRenderCtx = DEFAULT_CTX,
): Promise<ImageBitmap> {
  const cqi = ctx.cqi;
  const boxW = Math.round(10 * cqi);
  const boxH = Math.round(6 * cqi);
  const { canvas, ctx: ctx2d } = makeCanvas(boxW, boxH);

  paintReversalGlyph(ctx2d, { sequence, period }, { x: 0, y: 0, width: boxW, height: boxH }, { muted: ctx.textMutedColor }, false, cqi);

  return createImageBitmap(canvas);
}

// ── Loop row (per-card) ────────────────────────────────────────────────────

/** One loop column: icon kind + fa class + color + label. */
export interface LoopRowCol {
  kind: "swap" | "checkerboard" | "fa";
  fa?: string;
  color: string;
  label: string;
  rotationDegrees?: number;
  iconScale?: number;
}

/**
 * Rasterize the entire loop-component row (icons + labels) as ONE centered
 * bitmap spanning the content-box width, COMPOSED directly to an OffscreenCanvas.
 *
 * The icon glyphs (FontAwesome / SwapIcon / CheckerboardCircleIcon) still need
 * their SVG/font assets so they are mount-rasterized — but via the CACHED
 * `rasterizeLoopIconByKind` (per kind+fa+color+cqi), so there's NO per-card
 * mount; the cache is warm after the first card. Only the row composition (icon
 * placement + label text) runs per card here.
 *
 * Layout mirrors CardBackLoopRow.svelte / CardBack `.loop-row`:
 *   - icon cell 9cqi square (icon drawn top, centered in the cell)
 *   - label font `500 2.2cqi "Segoe UI"`, uppercase, letter-spacing 0.06em,
 *     `ctx.textMutedColor`, centered under the icon with a 0.6cqi gap
 *   - column width = max(9cqi, label text width); columns separated by 6cqi
 *   - the whole row is centered in the content-box width (justify-content:center)
 *
 * Box = `containerWidth × rowHeight`, rowHeight = 9cqi + 0.6cqi + 2.2cqi label
 * line. The builder anchors the bitmap at the loop-row Y (bottom:28cqi) by its
 * own height.
 */
export async function rasterizeLoopRow(
  cols: LoopRowCol[],
  ctx: PerCardRenderCtx = DEFAULT_CTX,
  theme?: string,
): Promise<ImageBitmap> {
  const cqi = ctx.cqi;
  const iconCell = 9 * cqi;
  const iconLabelGap = 0.6 * cqi;
  const colGap = 6 * cqi;
  const labelFontPx = 2.2 * cqi;
  const labelLetterSpacing = 0.06 * labelFontPx; // 0.06em
  const labelFont = `500 ${labelFontPx}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  const rowHeight = Math.ceil(iconCell + iconLabelGap + labelFontPx);
  const boxW = Math.round(ctx.containerWidth);

  // Resolve all icon bitmaps (cached → no per-card mount) up front.
  const icons = await Promise.all(
    cols.map((col) => rasterizeLoopIconByKind(col.kind, col.fa ?? "", col.color, theme)),
  );

  const { canvas, ctx: ctx2d } = makeCanvas(boxW, rowHeight);
  ctx2d.font = labelFont;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "alphabetic";

  // Per-column width = max(icon cell, laid-out label width). The label width
  // includes letter-spacing (0.06em between glyphs) since the live label sets it.
  const labels = cols.map((c) => c.label.toUpperCase());
  const labelWidths = labels.map((t) => measureSpacedText(ctx2d, t, labelLetterSpacing));
  const colWidths = labelWidths.map((lw) => Math.max(iconCell, lw));
  const totalW = colWidths.reduce((s, w) => s + w, 0) + Math.max(0, cols.length - 1) * colGap;

  let x = (boxW - totalW) / 2; // justify-content:center
  for (let i = 0; i < cols.length; i++) {
    const colW = colWidths[i]!;
    const colCx = x + colW / 2;
    // Icon: drawn at native bitmap size, centered horizontally, top-aligned.
    const icon = icons[i]!;
    const iconW = icon.width;
    const iconH = icon.height;
    const rotationDegrees = cols[i]!.rotationDegrees ?? 0;
    const iconScale = cols[i]!.iconScale ?? 1;
    if (rotationDegrees !== 0 || iconScale !== 1) {
      ctx2d.save();
      ctx2d.translate(colCx, iconCell / 2);
      ctx2d.rotate((rotationDegrees * Math.PI) / 180);
      ctx2d.scale(iconScale, iconScale);
      ctx2d.drawImage(icon, -iconW / 2, -iconH / 2, iconW, iconH);
      ctx2d.restore();
    } else {
      ctx2d.drawImage(icon, colCx - iconW / 2, (iconCell - iconH) / 2, iconW, iconH);
    }
    // Label: centered under the icon cell, alphabetic baseline ~font size below
    // the gap (close to the live line box top + ascent).
    ctx2d.fillStyle = ctx.textMutedColor;
    drawSpacedText(ctx2d, labels[i]!, colCx, iconCell + iconLabelGap + labelFontPx, labelLetterSpacing);
    x += colW + colGap;
  }

  return createImageBitmap(canvas);
}

/** Total width of `text` rendered with per-glyph `letterSpacing` (px). */
function measureSpacedText(
  ctx2d: OffscreenCanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
): number {
  if (text.length === 0) return 0;
  let w = 0;
  for (const ch of text) w += ctx2d.measureText(ch).width + letterSpacing;
  return w - letterSpacing; // no trailing spacing
}

/** Draw `text` center-anchored at `cx` with per-glyph `letterSpacing` (px). */
function drawSpacedText(
  ctx2d: OffscreenCanvasRenderingContext2D,
  text: string,
  cx: number,
  baselineY: number,
  letterSpacing: number,
): void {
  const total = measureSpacedText(ctx2d, text, letterSpacing);
  const prevAlign = ctx2d.textAlign;
  ctx2d.textAlign = "left";
  let x = cx - total / 2;
  for (const ch of text) {
    ctx2d.fillText(ch, x, baselineY);
    x += ctx2d.measureText(ch).width + letterSpacing;
  }
  ctx2d.textAlign = prevAlign;
}

// ── Step count (per-card) ──────────────────────────────────────────────────

/**
 * Rasterize the big step-count number into its right-aligned slot bitmap
 * (20cqi × 9cqi), drawn DIRECTLY to an OffscreenCanvas (no DOM mount).
 *
 * Mirrors CardBack `.corner-label`: font `700 9cqi "Segoe UI"`, color
 * `ctx.textMutedColor`, line-height 1, the number anchored to the box's right
 * edge and bottom (the live `.corner.bottom-right` flex right+bottom-aligns it).
 *
 * The live `.corner-label` carries a `drop-shadow(0 0.5cqi 1cqi rgba(0,0,0,.08))`
 * — at 8% alpha it is barely perceptible, so it is dropped here. (See report:
 * step drop-shadow omission.)
 */
export async function rasterizeStepCount(
  count: number,
  ctx: PerCardRenderCtx = DEFAULT_CTX,
): Promise<ImageBitmap> {
  const cqi = ctx.cqi;
  const boxW = Math.round(20 * cqi);
  const boxH = Math.round(9 * cqi);
  const { canvas, ctx: ctx2d } = makeCanvas(boxW, boxH);

  const fontPx = 9 * cqi;
  ctx2d.font = `700 ${fontPx}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  ctx2d.fillStyle = ctx.textMutedColor;
  ctx2d.textAlign = "right";
  ctx2d.textBaseline = "alphabetic";
  // line-height:1: the glyph baseline sits one font-descent ABOVE the line-box
  // bottom (= slot bottom). Putting the alphabetic baseline at boxH draws the
  // digit ~a descent too low; lift it by the real font descent so the bottom of
  // the digit lands at the slot bottom like the live `.corner-label`.
  const m = ctx2d.measureText(String(count));
  const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || fontPx * 0.21;
  ctx2d.fillText(String(count), boxW, boxH - descent);

  return createImageBitmap(canvas);
}

// ── Start-placement pictograph (per-card) ───────────────────────────────────

/**
 * Rasterize the mini start-placement pictograph into a 12cqi × 12cqi bitmap.
 *
 * Renders the pictograph via Canvas2DDirectRenderer (DOM-free, reliable) at the
 * 1.3× zoom StartPlacementPictograph applies (`.picto-zoom { scale(1.3) }`),
 * composited into the box with the rounded border + overflow-clip, matching
 * CardBack's `.start-placement-picto` (border 0.3cqi `--card-text-muted`, radius 1cqi).
 * Visibility mirrors StartPlacementPictograph's PictographRenderer props.
 *
 * @param pictographData The start placement data (SequenceData.startPlacement).
 * @param darkMode Theme dark-mode flag (CardBack passes `isDarkTheme`).
 */
export async function rasterizeStartPlacementPictograph(
  pictographData: unknown,
  darkMode: boolean,
  ctx: PerCardRenderCtx = DEFAULT_CTX,
  leftPropType?: PropType,
  rightPropType?: PropType,
  primaryPropColors?: { left: string; right: string } | null,
): Promise<ImageBitmap> {
  const box = Math.round(12 * ctx.cqi);
  const borderW = Math.max(1, Math.round(0.3 * ctx.cqi));
  const radius = 1 * ctx.cqi;
  const pictoSize = Math.round(box * 1.3); // .picto-zoom scale(1.3)

  const picto = await renderPicto(pictographData, {
    size: pictoSize,
    visibility: {
      darkMode,
      showTKA: false,
      showTnD: false,
      showElemental: false,
      showPlacements: false,
      showReversals: false,
      showNonRadialPoints: false,
      handPointVisibility: "all",
      // Draw the deck's prop, not the renderer's staff default.
      leftPropType,
      rightPropType,
      primaryPropColors,
    },
  });

  const out = new OffscreenCanvas(box, box);
  const octx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const inset = borderW / 2;
  // Clip to the rounded box (overflow:hidden) and draw the 1.3× pictograph
  // centered so the zoom overflows + clips at the edges, like the live card.
  octx.save();
  roundRectPath(octx, inset, inset, box - borderW, box - borderW, radius);
  octx.clip();
  octx.drawImage(
    picto as unknown as CanvasImageSource,
    (box - pictoSize) / 2,
    (box - pictoSize) / 2,
    pictoSize,
    pictoSize,
  );
  octx.restore();
  // Border on the edge.
  octx.lineWidth = borderW;
  octx.strokeStyle = ctx.textMutedColor;
  roundRectPath(octx, inset, inset, box - borderW, box - borderW, radius);
  octx.stroke();

  return createImageBitmap(out);
}
