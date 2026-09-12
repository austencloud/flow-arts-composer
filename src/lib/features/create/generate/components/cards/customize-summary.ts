/**
 * customize-summary.ts — the single source of truth for what the collapsed
 * Customize card says about itself.
 *
 * The card used to run its own default detection and its own (much shorter)
 * summary, so several live constraints — style values, end position, most
 * custom position sets, the legacy exact start position, persisted letter
 * constraints — collapsed to the bare word "Custom" or were missed entirely.
 * Both questions are answered here from one pass, and `isDefault` is derived
 * from `facts.length` so the badge can never drift away from what's displayed.
 *
 * The style baseline is injected, not assumed. The production Generate panel
 * starts from GENERATE_DEFAULT_CONFIG, but the public Composer demo
 * deliberately opens on Hands `smooth` + Dashes `no-dash`. Without a baseline
 * seam the enhanced card would loudly claim an untouched visitor made two
 * changes.
 */

import {
  GridMode,
  type GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import {
  detectPresetFromBlocked,
  getAllowedPositions,
  StartPositionPreset,
} from "../../shared/domain/start-position-presets";
import {
  DEFAULT_GENERATION_STYLE,
  type GenerationMotionTypeFilter,
  type GenerationStyleAxis,
  type GenerationStylePolicy,
} from "$lib/shared/create/domain/generation-style";
import {
  DEFAULT_HAND_RELATIONSHIP,
  describeHandRelationship,
  type HandRelationship,
} from "$lib/shared/create/domain/hand-relationship";

export type StyleAxisValue = GenerationStyleAxis;
export type DashFilter = GenerationMotionTypeFilter;

/**
 * Compact orientation abbreviations. Exported so the expanded overlay's
 * section header reads the same words as the collapsed card instead of
 * keeping its own copy.
 */
export const ORIENTATION_SHORT: Record<string, string> = {
  [Orientation.IN]: "In",
  [Orientation.CLOCK]: "CW",
  [Orientation.OUT]: "Out",
  [Orientation.COUNTER]: "CCW",
};

/** Labels mirror GenerationStylePanel's option lists — one vocabulary, two surfaces. */
const STYLE_AXIS_LABELS: Record<StyleAxisValue, string> = {
  smooth: "Smooth",
  mixed: "Mixed",
  choppy: "Choppy",
};

const DASH_LABELS: Record<"no-dash" | "mixed" | "prefer-dash", string> = {
  "no-dash": "Low",
  mixed: "Mixed",
  "prefer-dash": "High",
};

/** The three style axes a surface can start from. */
export type CustomizeStyleBaseline = GenerationStylePolicy;

/** What a first-run Generate panel starts on. */
export const PRODUCTION_STYLE_BASELINE: CustomizeStyleBaseline =
  DEFAULT_GENERATION_STYLE;

export interface CustomizeSummaryInput {
  constraintPreset: StyleAxisValue;
  handPathMode: StyleAxisValue;
  motionTypeFilter: DashFilter;
  /** Free by default; absent means Free. */
  handRelationship?: HandRelationship;
  handRelationshipInverted?: boolean;
  /** Off by default; absent means off. */
  matchHandTurns?: boolean;
  startEndOptions?: StartEndOptions | null;
  gridMode?: GridMode;
}

export interface CustomizeSummary {
  /** True only when nothing differs from the baseline. Derived from `facts`. */
  isDefault: boolean;
  /** Every non-default fact, uncapped and in overlay order. */
  facts: string[];
  /** The complete list as one string, for the button's accessible name. */
  accessibleSummary: string;
}

/** How many rows the collapsed card can show before it starts counting. */
export const MAX_SUMMARY_ROWS = 3;

/** Shared position precedence — matches PositionSection's display rule. */
function positionLabel(position: PictographData | null | undefined): string {
  if (!position) return "?";
  return position.startPosition || position.letter || "?";
}

function dashKey(filter: DashFilter): "no-dash" | "mixed" | "prefer-dash" {
  return filter === "no-dash" || filter === "prefer-dash" ? filter : "mixed";
}

/**
 * Build the full fact list for a Customize state.
 *
 * Fact order follows the expanded overlay top to bottom: style, hand
 * relationship, start/end positions, orientation, letter constraints.
 */
export function buildCustomizeSummary(
  input: CustomizeSummaryInput,
  baseline: CustomizeStyleBaseline = PRODUCTION_STYLE_BASELINE
): CustomizeSummary {
  const facts: string[] = [];
  const push = (fact: string) => {
    if (!facts.includes(fact)) facts.push(fact);
  };

  if (input.constraintPreset !== baseline.constraintPreset) {
    push(`Props: ${STYLE_AXIS_LABELS[input.constraintPreset]}`);
  }
  if (input.handPathMode !== baseline.handPathMode) {
    push(`Hands: ${STYLE_AXIS_LABELS[input.handPathMode]}`);
  }
  if (dashKey(input.motionTypeFilter) !== dashKey(baseline.motionTypeFilter)) {
    push(`Dashes: ${DASH_LABELS[dashKey(input.motionTypeFilter)]}`);
  }

  // The relationship has no per-surface baseline: Free is the untouched value
  // everywhere. "Hands:" is taken by the hand-path axis above, hence
  // "Relationship:".
  const relationship = input.handRelationship ?? DEFAULT_HAND_RELATIONSHIP;
  if (relationship !== DEFAULT_HAND_RELATIONSHIP) {
    push(
      `Relationship: ${describeHandRelationship(relationship, input.handRelationshipInverted ?? false)}`
    );
  }
  if (input.matchHandTurns) {
    push("Turns: Matched");
  }

  const options = input.startEndOptions;
  if (options) {
    const gridMode = input.gridMode ?? GridMode.DIAMOND;

    // ─── Allowed start positions ───
    const blocked: GridPosition[] = options.blockedStartPositions ?? [];
    if (blocked.length > 0) {
      const preset = detectPresetFromBlocked(blocked, gridMode);
      if (preset === StartPositionPreset.CLASSIC) {
        push("Classic 3");
      } else {
        const allowed = getAllowedPositions(blocked, gridMode);
        // A restricted set is a real constraint at every size — reporting only
        // the single-position case is what let "4 of 16 allowed" read as
        // "Custom" with nothing behind it.
        push(
          allowed.length === 1
            ? `Start: ${allowed[0]}`
            : `${allowed.length} pos`
        );
      }
    }

    // ─── Legacy exact start position ───
    // Deprecated but still persisted, and generate-actions still feeds it to
    // the engine. A card that ignores it can call a constrained state Default.
    if (options.startPosition) {
      push(`Start: ${positionLabel(options.startPosition)}`);
    }

    // ─── End positions ───
    // Multi-select, so the card names one or counts many, the same way the
    // start-position facts do. The legacy single endPosition is still read for
    // any caller that has not migrated.
    const ends = options.endPositions ?? [];
    if (ends.length === 1) {
      push(`End: ${ends[0]}`);
    } else if (ends.length > 1) {
      push(`End: ${ends.length} positions`);
    } else if (options.endPosition) {
      push(`End: ${positionLabel(options.endPosition)}`);
    }

    // ─── Start orientation ───
    const leftOri = options.leftStartOrientation ?? Orientation.IN;
    const rightOri = options.rightStartOrientation ?? Orientation.IN;
    if (leftOri !== Orientation.IN || rightOri !== Orientation.IN) {
      push(
        `Ori: ${ORIENTATION_SHORT[leftOri] ?? leftOri}/${ORIENTATION_SHORT[rightOri] ?? rightOri}`
      );
    }

    // ─── Letter constraints ───
    // Same +N / -N grammar the start/end state summary already uses, with the
    // noun the card needs because it has no surrounding context.
    const required = options.mustContainLetters?.length ?? 0;
    const excluded = options.mustNotContainLetters?.length ?? 0;
    if (required > 0 || excluded > 0) {
      const parts: string[] = [];
      if (required > 0) parts.push(`+${required}`);
      if (excluded > 0) parts.push(`-${excluded}`);
      push(`Letters: ${parts.join(" ")}`);
    }
  }

  return {
    isDefault: facts.length === 0,
    facts,
    accessibleSummary: facts.length === 0 ? "Default" : facts.join(", "),
  };
}

/**
 * Trim the fact list to what the card can physically show, spending the last
 * row on the remainder count. The uncapped list still reaches screen readers
 * through `accessibleSummary`.
 *
 * At a one-row budget the count rides along with the first fact instead of
 * replacing it — a lone "+6 more" would be exactly the uninformative label
 * this card exists to get rid of.
 */
export function capSummaryFacts(
  facts: string[],
  maxRows: number = MAX_SUMMARY_ROWS
): string[] {
  if (maxRows <= 0 || facts.length === 0) return [];
  if (facts.length <= maxRows) return [...facts];
  if (maxRows === 1) return [`${facts[0]} +${facts.length - 1}`];
  const shown = facts.slice(0, maxRows - 1);
  return [...shown, `+${facts.length - shown.length} more`];
}

/**
 * How many summary rows a card of this height can show without clipping.
 *
 * Measured, not guessed: the card's header, padding and margins eat roughly
 * 36px, and a row costs its font size times 1.35 leading. At 375x667 the card
 * is 64px tall and the summary band is 28px — room for exactly one row.
 */
export function summaryRowBudget(cardHeight: number): number {
  if (cardHeight >= 92) return MAX_SUMMARY_ROWS;
  if (cardHeight >= 74) return 2;
  return 1;
}
