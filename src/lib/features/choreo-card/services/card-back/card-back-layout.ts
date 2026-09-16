/**
 * card-back-layout.ts
 *
 * Pure function that converts the CSS `cqi`-based positions in CardBack.svelte
 * into pixel placement boxes { x, y, w, h } suitable for canvas drawImage() calls.
 *
 * Every numeric constant here is lifted DIRECTLY from CardBack.svelte <style>.
 * Do not approximate — if you change a value, update the source CSS too.
 *
 * Layout concerns documented inline where a CSS value cannot cleanly map to a
 * fixed box without assumptions (e.g. text-flow-driven heights).
 */

import type { CardBackData } from "../../components/card-back/card-back-data";
import type { Placement } from "./back-job";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";

export interface CardBackLayout {
  /**
   * .brand-slot: position absolute; top:3.2cqi; left:0; right:0; flex-column centered.
   * LAYOUT CONCERN: height is text-flow driven (main text + ornament + sub text + gaps).
   * Approximated as: font 4.4cqi (main) + 0.8cqi gap + ~2cqi ornament row + 0.8cqi gap +
   * 3.2cqi (sub) = ~11.2cqi. Canvas painters should treat this as a centered full-width
   * strip; exact inner heights depend on rendered font metrics.
   */
  brand: Placement;

  /**
   * .corner.top-left .glyph-box: width:10cqi; height:6cqi at top:3.2cqi left:3.2cqi
   */
  topLeftGlyph: Placement;

  /**
   * .corner.top-right .glyph-box: width:10cqi; height:6cqi at top:3.2cqi right:3.2cqi
   */
  topRightGlyph: Placement;

  /**
   * .mandala-anchor inside .content (inset:10cqi 3.2cqi 30cqi).
   * .mandala-anchor: width:72cqi; aspect-ratio:1 (= 72cqi × 72cqi).
   * Centered within .mandala-zone (inset:0 inside .content) via align-items/justify-content:center.
   */
  mandala: Placement;

  /**
   * .loop-row: bottom:28cqi; left:3cqi; right:3cqi; justify-content:center; gap:6cqi.
   * Each .loop-icon-cell: width:9cqi; height:9cqi.
   * items[] contains one box per active LOOPComponent (canonical display order).
   */
  loopRow: { items: Placement[] };

  /**
   * .level-badge-slot: bottom:18cqi; left:0; right:0; flex justify-content:center.
   * DifficultyBadge size="7cqi" — treated as a 7cqi × 7cqi square, centered.
   */
  levelBadge: Placement;

  /**
   * .corner.bottom-left .start-placement-picto: width:12cqi; height:12cqi at bottom:2cqi left:3.2cqi
   */
  startPos: Placement;

  /**
   * .corner.bottom-right .corner-label: font-size:9cqi; line-height:1.
   * LAYOUT CONCERN: width depends on digit count of stepCount (1–2+ digits).
   * Allocated as a 20cqi-wide right-aligned slot; painters should right-align text within it.
   * y = height - 2cqi - 9cqi (bottom:2cqi, element height = 9cqi for line-height:1 at 9cqi font).
   */
  stepCount: Placement;

  /**
   * .url-slot: bottom:2.8cqi; left:0; right:0; flex-column centered.
   * LAYOUT CONCERN: height is content-driven (ornament row + url text + year text + gaps).
   * Approximated as ~8cqi total: ornament(~1.6cqi) + gap(0.6cqi) + url-text(3cqi) +
   * gap(0.6cqi) + year(2.2cqi) = 8cqi. This box is a fallback; the job builder
   * anchors the url bitmap by its NATURAL height instead (see `anchors`).
   */
  url: Placement;

  /**
   * Border-frame content-box basis + per-slot anchor metadata. The brand/url
   * bitmaps are rendered at NATURAL (variable) height, so their fixed `brand`/
   * `url` boxes above can't be used as draw rects — the builder anchors them by
   * the bitmap's own height using these values:
   *   - brand: top-anchored at `brandTopCqi`*cqiEff, centered in [ox, ox+innerWidth]
   *   - url:   bottom-anchored at `urlBottomCqi`*cqiEff above (oy+innerHeight)
   */
  anchors: {
    /** Border-frame content-box origin x (px from card edge). */
    ox: number;
    /** Border-frame content-box origin y (px from card edge). */
    oy: number;
    /** Border-frame content-box inline size (px). */
    innerWidth: number;
    /** Border-frame content-box block size (px). */
    innerHeight: number;
    /** 1cqi in px against the border-frame content box. */
    cqiEff: number;
    /** .brand-slot top offset in cqi (3.2). */
    brandTopCqi: number;
    /** .url-slot bottom offset in cqi (2.8). */
    urlBottomCqi: number;
  };
}

/** Canonical LOOPComponent display order — must match CardBack.svelte LOOP_DISPLAY_ORDER */
const LOOP_DISPLAY_ORDER: LOOPComponent[] = [
  LOOPComponent.ROTATED,
  LOOPComponent.MIRRORED,
  LOOPComponent.FLIPPED,
  LOOPComponent.SWAPPED,
  LOOPComponent.INVERTED,
  LOOPComponent.REWOUND,
];

/**
 * Convert the CardBack.svelte CSS layout into pixel placement boxes.
 *
 * CRITICAL — the border frame: in CardBack.svelte, `container-type: inline-size`
 * is on `.border-frame`, which wraps `.back` with `padding: borderWidth cqi`
 * (proof mode = 8.759cqi — wide border for back-to-back cut symmetry). So every
 * `cqi` inside the card resolves against the
 * border-frame CONTENT-box (≈93% of card width), and all element positions are
 * inset by the border padding. Computing cqi against the full card width
 * over-sizes everything ~7-8% and shifts it up. We therefore compute in the
 * inner (border-frame content-box) coordinate space and offset every box by the
 * border inset. Verified against the live DOM render: this brings mandala extent
 * + center to within ~1px of the old path.
 *
 * @param data    CardBackData for the sequence (used for loopComponents).
 * @param dims    Full card pixel size + the proof/theme `borderWidth` in cqi
 *                (from the card-back theme visuals; proof mode = 8.759).
 */
export function computeCardBackLayout(
  data: CardBackData,
  dims: { width: number; height: number; borderWidthCqi: number },
): CardBackLayout {
  // The border-frame padding insets `.back` and shrinks the cqi basis.
  // borderPx: border-frame's own padding (its cqi resolves against ~card width).
  const borderPx = dims.borderWidthCqi * (dims.width / 100);
  const ox = borderPx;          // .back content-box origin x (from card edge)
  const oy = borderPx;          // .back content-box origin y
  const width = dims.width - 2 * borderPx;    // .back content-box inline size
  const height = dims.height - 2 * borderPx;  // .back content-box block size
  const cqi = width / 100;      // cqi resolves against border-frame content-box

  // .brand-slot { top: 3.2cqi; left: 0; right: 0; }
  // Height approximated — see JSDoc concern above.
  const brandTop = 3.2 * cqi;
  const brandHeight = 11.2 * cqi; // approximation: see LAYOUT CONCERN in JSDoc
  const brand: Placement = {
    x: 0,
    y: brandTop,
    w: width,
    h: brandHeight,
  };

  // .corner.top-left { top: 3.2cqi; left: 3.2cqi; }
  // .glyph-box { width: 10cqi; height: 6cqi; }
  const topLeftGlyph: Placement = {
    x: 3.2 * cqi,
    y: 3.2 * cqi,
    w: 10 * cqi,
    h: 6 * cqi,
  };

  // .corner.top-right { top: 3.2cqi; right: 3.2cqi; }
  // .glyph-box { width: 10cqi; height: 6cqi; }
  // x = width - right_offset - element_width = width - 3.2cqi - 10cqi
  const topRightGlyph: Placement = {
    x: width - 3.2 * cqi - 10 * cqi,
    y: 3.2 * cqi,
    w: 10 * cqi,
    h: 6 * cqi,
  };

  // .content { position: absolute; inset: 10cqi 3.2cqi 30cqi; }
  //   → top:10cqi, right:3.2cqi, bottom:30cqi, left:3.2cqi
  const contentLeft = 3.2 * cqi;
  const contentTop = 10 * cqi;
  const contentWidth = width - 3.2 * cqi - 3.2 * cqi;  // left + right
  const contentHeight = height - 10 * cqi - 30 * cqi;   // top + bottom
  const contentCenterX = contentLeft + contentWidth / 2;
  const contentCenterY = contentTop + contentHeight / 2;

  // .mandala-zone { inset: 0 } inside .content — same dimensions as .content.
  // .mandala-anchor { width: 72cqi; aspect-ratio: 1 } — centered in mandala-zone.
  const mandalaSize = 72 * cqi;
  const mandala: Placement = {
    x: contentCenterX - mandalaSize / 2,
    y: contentCenterY - mandalaSize / 2,
    w: mandalaSize,
    h: mandalaSize,
  };

  // .loop-row { position:absolute; bottom:28cqi; left:3cqi; right:3cqi;
  //             justify-content:center; gap:6cqi; }
  // .loop-icon-cell { width: 9cqi; height: 9cqi; }
  //
  // Active components = LOOP_DISPLAY_ORDER filtered to those in data.loopComponents.
  const activeComponents = LOOP_DISPLAY_ORDER.filter(c =>
    data.loopComponents.has(c)
  );
  const n = activeComponents.length;

  const iconSize = 9 * cqi;
  const iconGap = 6 * cqi;
  const loopRowY = height - 28 * cqi - iconSize;

  // Usable width for centering: left:3cqi, right:3cqi
  const loopRowUsableLeft = 3 * cqi;
  const loopRowUsableWidth = width - 3 * cqi - 3 * cqi;

  const totalRowWidth = n > 0 ? n * iconSize + (n - 1) * iconGap : 0;
  const firstItemX = loopRowUsableLeft + (loopRowUsableWidth - totalRowWidth) / 2;

  const loopItems: Placement[] = activeComponents.map((_, i) => ({
    x: firstItemX + i * (iconSize + iconGap),
    y: loopRowY,
    w: iconSize,
    h: iconSize,
  }));

  // .level-badge-slot { position:absolute; bottom:18cqi; left:0; right:0;
  //                     justify-content:center; }
  // DifficultyBadge size="7cqi" — 7cqi × 7cqi square centered horizontally.
  const badgeSize = 7 * cqi;
  const levelBadge: Placement = {
    x: width / 2 - badgeSize / 2,
    y: height - 18 * cqi - badgeSize,
    w: badgeSize,
    h: badgeSize,
  };

  // .corner.bottom-left { bottom: 2cqi; left: 3.2cqi; }
  // .start-placement-picto { width: 12cqi !important; height: 12cqi !important; }
  const startPosSize = 12 * cqi;
  const startPos: Placement = {
    x: 3.2 * cqi,
    y: height - 2 * cqi - startPosSize,
    w: startPosSize,
    h: startPosSize,
  };

  // .corner.bottom-right { bottom: 2cqi; right: 3.2cqi; }
  // .corner-label { font-size: 9cqi; line-height: 1; }
  // Width is digit-count dependent — allocated as 20cqi right-aligned slot.
  // See LAYOUT CONCERN in JSDoc.
  const stepCountH = 9 * cqi;  // line-height:1 at font-size:9cqi
  const stepCountW = 20 * cqi; // allocated slot width; painter right-aligns text
  const stepCount: Placement = {
    x: width - 3.2 * cqi - stepCountW,
    y: height - 2 * cqi - stepCountH,
    w: stepCountW,
    h: stepCountH,
  };

  // .url-slot { position:absolute; bottom:2.8cqi; left:0; right:0; flex-column centered; }
  // Height approximated — see LAYOUT CONCERN in JSDoc.
  const urlHeight = 8 * cqi; // ornament(~1.6) + gap(0.6) + url(3.0) + gap(0.6) + year(2.2)
  const url: Placement = {
    x: 0,
    y: height - 2.8 * cqi - urlHeight,
    w: width,
    h: urlHeight,
  };

  // Offset every box from inner (.back content-box) space into full-card space.
  const off = (p: Placement): Placement => ({ x: p.x + ox, y: p.y + oy, w: p.w, h: p.h });

  return {
    brand: off(brand),
    topLeftGlyph: off(topLeftGlyph),
    topRightGlyph: off(topRightGlyph),
    mandala: off(mandala),
    loopRow: { items: loopItems.map(off) },
    levelBadge: off(levelBadge),
    startPos: off(startPos),
    stepCount: off(stepCount),
    url: off(url),
    anchors: {
      ox,
      oy,
      innerWidth: width,
      innerHeight: height,
      cqiEff: cqi,
      brandTopCqi: 3.2,
      urlBottomCqi: 2.8,
    },
  };
}
