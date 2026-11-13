/**
 * Justified rows for the Browse grids.
 *
 * Card shape follows length, and not in order: a 4-step card is narrow, an
 * 8-step card is wide, a 12-step card is narrow again. A fixed column count
 * therefore draws an 8-step card at half its neighbours' height with an empty
 * block under it. Justified rows fix that: every card in a row is drawn at one
 * height and keeps its own shape, and the row fills the width exactly.
 *
 * Everything here is worked out from data (each card's aspect, known from its
 * step count and start placement before any art loads), never by measuring.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculateGalleryAspectRatio } from "#lib/shared/render/services/layout-calculator.js";
import { galleryStepCount } from "#lib/shared/browse/services/gallery-render-input.js";

export interface JustifiedRow {
  /** Index of the row's first card in the input list. */
  start: number;
  /** How many cards the row holds. */
  count: number;
  /** The height every card in the row is drawn at, in px. */
  height: number;
  /** True when the row's cards fill the width exactly (gaps included). The
   * list's final row is false when its cards fit at the target height: it
   * keeps that height and sits left, never stretched. */
  filled: boolean;
}

export interface JustifiedRowOptions {
  /** Width the row may fill, in px. */
  width: number;
  /** Space between two cards, in px. */
  gap: number;
  /** The height a row aims for; the zoom step sets it. */
  targetHeight: number;
  /** A row is never stretched above this multiple of the target. */
  maxStretch?: number;
}

/** Sub-pixel slack so a row of cards that fits to the pixel is not pushed out
 * by float error (a row of 4-step cards at today's column width). */
const FIT_EPSILON = 0.5;

/** A card with no usable shape is laid out as a square rather than breaking
 * the row maths. */
const FALLBACK_ASPECT = 1;

/**
 * The target row height for a zoom step: the height a card of `aspect`
 * (the 4-step shape) has when `columns` of them fill `width`. A row of those
 * cards then packs to exactly `columns`, as the fixed grid did.
 */
export function justifiedTargetHeight(
  width: number,
  columns: number,
  gap: number,
  aspect: number
): number {
  const cols = Math.max(1, Math.floor(columns));
  const shape =
    aspect > 0 && Number.isFinite(aspect) ? aspect : FALLBACK_ASPECT;
  const cardWidth = Math.max(0, (width - (cols - 1) * gap) / cols);
  return cardWidth / shape;
}

/**
 * Packs cards of the given aspects (width / height) into justified rows.
 *
 * Cards go into a row until the next one would push it past the width at the
 * target height. The row then takes whichever card count, that one or one
 * more, scales nearest the target, never above `maxStretch` times it, and is
 * scaled to fill the width. When the cards left over fit at the target, that
 * final row keeps the target height and sits left, never stretched. A card too
 * wide to fit alone at the target shrinks to the width.
 */
export function packJustifiedRows(
  aspects: readonly number[],
  { width, gap, targetHeight, maxStretch = 1.3 }: JustifiedRowOptions
): JustifiedRow[] {
  const rows: JustifiedRow[] = [];
  const total = aspects.length;
  if (total === 0) return rows;

  const shape = (i: number) => {
    const a = aspects[i];
    return a !== undefined && a > 0 && Number.isFinite(a) ? a : FALLBACK_ASPECT;
  };

  // No room to lay out yet: one card per row at the target keeps the count of
  // rows honest until a real width arrives.
  if (!(width > 0) || !(targetHeight > 0)) {
    for (let i = 0; i < total; i++) {
      rows.push({
        start: i,
        count: 1,
        height: Math.max(0, targetHeight),
        filled: false,
      });
    }
    return rows;
  }

  const T = targetHeight;
  let start = 0;
  while (start < total) {
    // Grow the row while the next card still fits at the target height.
    let count = 0;
    let sum = 0;
    while (
      start + count < total &&
      (sum + shape(start + count)) * T + count * gap <= width + FIT_EPSILON
    ) {
      sum += shape(start + count);
      count += 1;
    }

    // Not even one card fits at the target: it shrinks to the width.
    if (count === 0) {
      rows.push({
        start,
        count: 1,
        height: width / shape(start),
        filled: true,
      });
      start += 1;
      continue;
    }

    // Everything left fits: the final row keeps the target and sits left.
    if (start + count === total) {
      rows.push({ start, count, height: T, filled: false });
      break;
    }

    // Two choices: these cards stretched up to fill the width, or one more
    // card squeezed in and the row shrunk to fit.
    const fitHeight = (width - (count - 1) * gap) / sum;
    const nextSum = sum + shape(start + count);
    const overHeight = (width - count * gap) / nextSum;
    const takeFit =
      fitHeight <= maxStretch * T && fitHeight - T <= T - overHeight;

    if (takeFit) {
      rows.push({ start, count, height: fitHeight, filled: true });
      start += count;
    } else {
      rows.push({ start, count: count + 1, height: overHeight, filled: true });
      start += count + 1;
    }
  }
  return rows;
}

/** The width a card of `aspect` takes at `height`. */
export function justifiedCardWidth(aspect: number, height: number): number {
  const shape =
    aspect > 0 && Number.isFinite(aspect) ? aspect : FALLBACK_ASPECT;
  return shape * height;
}

/**
 * The CSS flex value for one card. A filled row grows and shrinks each card in
 * proportion to its shape, so if the real width differs a little from the one
 * the rows were packed for, the cards still share one height and fill it. A
 * final row that sits left only shrinks, the same way, if it must.
 */
export function justifiedCellFlex(
  aspect: number,
  height: number,
  filled: boolean
): string {
  const shape =
    aspect > 0 && Number.isFinite(aspect) ? aspect : FALLBACK_ASPECT;
  const basis = `${(shape * height).toFixed(3)}px`;
  return filled ? `${shape} 1 ${basis}` : `0 1 ${basis}`;
}

/**
 * A gallery card's aspect (width / height), from data alone: the same step
 * count and per-length start placement the card itself draws with
 * (PropAwareThumbnail).
 */
export function galleryCardAspect(
  sequence: SequenceData,
  layoutForStepCount: (stepCount: number) => "row" | "column"
): number {
  return galleryAspectForSteps(galleryStepCount(sequence), layoutForStepCount);
}

/** The aspect a gallery card of `stepCount` steps draws with. */
export function galleryAspectForSteps(
  stepCount: number,
  layoutForStepCount: (stepCount: number) => "row" | "column"
): number {
  return calculateGalleryAspectRatio(stepCount, layoutForStepCount(stepCount));
}
