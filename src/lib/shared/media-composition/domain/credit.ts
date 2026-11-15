import {
  addOverlayItem,
  finiteOr,
  itemEnd,
  type EditContext,
  type NewOverlaySpec,
  type PostBox,
  type PostProject,
} from "@austencloud/video-editor/core";
import type { PostCreditItem } from "#lib/shared/post-studio-plugin/index.js";

/**
 * The ready-made credit: a small grey line ("made with") over the Flow Arts
 * Composer wordmark, centred in the clip's box. The wordmark is the brand
 * mark, so it is drawn here the one way it is drawn on the old end screens
 * (Fraunces 700 italic, 0.04 em apart, a 135 degree gradient from #6f8cff
 * to #c0a3ff) and never retyped per reel. The small line is the clip's own
 * text and may be empty.
 *
 * Sizes come from the old end screen on a 1080 frame: the line 32 px, the
 * wordmark 60 px, 14 px between them. The stack keeps those proportions and
 * grows to fill the box, as wide or as tall as the box allows.
 */

export const CREDIT_WORDMARK = "Flow Arts Composer";
export const CREDIT_DEFAULT_LEAD = "made with";
export const CREDIT_MAX_LEAD_LENGTH = 40;
/** How long a credit from the Add menu lasts. */
export const CREDIT_ITEM_SECONDS = 4;
/** The Add menu's box: a wide band under the middle of a 9:16 frame. */
export const CREDIT_DEFAULT_BOX: PostBox = {
  x: 0.15,
  y: 0.66,
  width: 0.7,
  height: 0.06,
};

/** The old screen's sizes, in pixels on a 1080 frame. */
export const CREDIT_WORDMARK_PX = 60;
export const CREDIT_LEAD_PX = 32;
export const CREDIT_GAP_PX = 14;
/** Letter spacing of the wordmark, as a share of its size. */
export const CREDIT_WORDMARK_TRACKING = 0.04;
export const CREDIT_LEAD_ALPHA = 0.62;
export const CREDIT_GRADIENT_FROM = "#6f8cff";
export const CREDIT_GRADIENT_TO = "#c0a3ff";
export const CREDIT_LEAD_FONT =
  '600 {px}px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

/** What a credit clip draws, for `credit-painter.ts`. */
export interface CreditPlan {
  itemId: string;
  /** The role its painted layer draws under. */
  role: string;
  start: number;
  end: number;
  /** The small line over the wordmark; empty draws the wordmark alone. */
  lead: string;
}

export function creditPlanOf(item: PostCreditItem, role: string): CreditPlan {
  return {
    itemId: item.id,
    role,
    start: item.start,
    end: itemEnd(item),
    lead: item.lead.trim(),
  };
}

/** The ink of one line at the nominal size: its width and its height. */
export interface CreditInk {
  width: number;
  /** From the top of the tallest letter to the baseline. */
  ascent: number;
  /** From the baseline to the bottom of the lowest letter. */
  descent: number;
}

/** Where the two lines draw in a rect, and at what scale of the nominal sizes. */
export interface CreditLayout {
  scale: number;
  /** Baselines, in the rect's pixels; `lead` is null with no small line. */
  leadBaseline: number | null;
  wordmarkBaseline: number;
  /** Left edge of the wordmark's ink, where its gradient starts. */
  wordmarkLeft: number;
  /** The wordmark's ink box, for the gradient. */
  wordmarkTop: number;
  wordmarkWidth: number;
  wordmarkHeight: number;
  centerX: number;
}

/**
 * Fits the stack into `rect`: the lines measured at their nominal sizes
 * (`lead` null when there is no small line), scaled down or up together so
 * the widest fits the width and the whole stack fits the height, then
 * centred both ways.
 */
export function creditLayout(
  rect: { x: number; y: number; width: number; height: number },
  wordmark: CreditInk,
  lead: CreditInk | null
): CreditLayout {
  const leadHeight = lead ? lead.ascent + lead.descent + CREDIT_GAP_PX : 0;
  const wordmarkHeight = wordmark.ascent + wordmark.descent;
  const height = leadHeight + wordmarkHeight;
  const width = Math.max(wordmark.width, lead?.width ?? 0);
  const scale =
    height > 0 && width > 0
      ? Math.max(0, Math.min(rect.width / width, rect.height / height))
      : 0;
  const top = rect.y + (rect.height - height * scale) / 2;
  const centerX = rect.x + rect.width / 2;
  const wordmarkTop = top + leadHeight * scale;
  return {
    scale,
    leadBaseline: lead ? top + lead.ascent * scale : null,
    wordmarkBaseline: wordmarkTop + wordmark.ascent * scale,
    wordmarkLeft: centerX - (wordmark.width * scale) / 2,
    wordmarkTop,
    wordmarkWidth: wordmark.width * scale,
    wordmarkHeight: wordmarkHeight * scale,
    centerX,
  };
}

/**
 * The 135 degree gradient's line over the wordmark's ink box: from its
 * top-left corner along the diagonal, ending where the bottom-right corner's
 * share reaches 1, as the old recipe's `((x - x0) + (y - top)) / (w + h)`.
 */
export function creditGradientLine(layout: CreditLayout): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const reach = (layout.wordmarkWidth + layout.wordmarkHeight) / 2;
  return {
    x0: layout.wordmarkLeft,
    y0: layout.wordmarkTop,
    x1: layout.wordmarkLeft + reach,
    y1: layout.wordmarkTop + reach,
  };
}

/** A new credit's start, small line and length. */
export interface CreditInit {
  at?: number;
  lead?: string;
  duration?: number;
}

/** A credit clip at `at` in the default box, for the Add menu and the CLI. */
export function creditOverlaySpec(init: CreditInit = {}): NewOverlaySpec {
  return {
    kind: "credit",
    at: Math.max(0, finiteOr(init.at ?? 0, 0)),
    duration: Math.max(
      0.1,
      finiteOr(init.duration ?? CREDIT_ITEM_SECONDS, CREDIT_ITEM_SECONDS)
    ),
    box: { ...CREDIT_DEFAULT_BOX },
    fill: false,
    lead: (init.lead ?? CREDIT_DEFAULT_LEAD).slice(0, CREDIT_MAX_LEAD_LENGTH),
  };
}

/** Adds the credit `creditOverlaySpec` describes. */
export function addCreditItem(
  project: PostProject,
  ctx: EditContext,
  init: CreditInit = {}
): { project: PostProject; itemId: string } | null {
  return addOverlayItem(project, creditOverlaySpec(init), ctx);
}
