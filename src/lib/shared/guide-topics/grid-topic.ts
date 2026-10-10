/**
 * The Grid's shared teaching content. The lesson, the Guide web page and the
 * print handbook read their explanations from here, so one edit reaches all
 * three. Every sentence is Austen's verbatim proof copy (verified_level1_*),
 * split into sentences where a view needs them one at a time. Interaction,
 * pacing and lesson prompts stay with each view.
 * Spec: docs/superpowers/specs/2026-10-10-guide-rethink-design.md
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

export const GRID_TOPIC_UNITS = {
  title: "verified_level1_the_grid",
  intro: "verified_level1_grid_intro",
  twoModes: "guide_topic_grid_two_modes",
  translates: "guide_topic_grid_translates",
  pointTypesLead: "guide_topic_grid_point_types_lead",
  centerPoint: "guide_topic_grid_center_point",
  handPoints: "guide_topic_grid_hand_points",
  outerPoints: "guide_topic_grid_outer_points",
  combination: "verified_level1_grid_combination",
  closing: "verified_level1_grid_closing",
  handsCaption: "verified_level1_grid_hands_caption",
  diamond: "verified_level1_diamond",
  box: "verified_level1_box",
  eightPoint: "verified_level1_eight_point_grid",
  diamondAria: "verified_level1_diamond_aria",
  boxAria: "verified_level1_box_aria",
  eightPointAria: "verified_level1_eight_point_aria",
} as const satisfies Record<string, TranslationKey>;

export type GridTopicUnit = keyof typeof GRID_TOPIC_UNITS;

export function gridTopicText(unit: GridTopicUnit): string {
  return t(GRID_TOPIC_UNITS[unit]);
}

type Point = { x: number; y: number };

export type GridCallout = {
  id: "center" | "hand" | "outer";
  /** The definition this callout names. */
  unit: Extract<GridTopicUnit, "centerPoint" | "handPoints" | "outerPoints">;
  /** Label words, from the print sheet's own callout runs. */
  label: readonly TranslationKey[];
  /** Grid point in GridSvg's 950-unit space (grid-coordinates.ts). */
  anchor: Point;
  lineEnd: Point;
  labelAt: Point;
  align: "start" | "end";
};

// Labels sit inside the 950-unit grid square, in the corners the diamond
// leaves empty, so the picture can use the figure's full width on a phone.
// Anchors are free points that the ALPHA3 hands do not cover: the center,
// the north hand point and the west outer point.
export const GRID_OVERVIEW_CALLOUTS: readonly GridCallout[] = [
  {
    id: "center",
    unit: "centerPoint",
    label: ["verified_level1_center", "verified_level1_point"],
    anchor: { x: 475, y: 475 },
    lineEnd: { x: 760, y: 820 },
    labelAt: { x: 905, y: 885 },
    align: "end",
  },
  {
    id: "hand",
    unit: "handPoints",
    label: ["verified_level1_hand", "verified_level1_points"],
    anchor: { x: 475, y: 331.9 },
    lineEnd: { x: 760, y: 140 },
    labelAt: { x: 905, y: 105 },
    align: "end",
  },
  {
    id: "outer",
    unit: "outerPoints",
    label: ["verified_level1_outer", "verified_level1_points"],
    anchor: { x: 175, y: 475 },
    lineEnd: { x: 150, y: 820 },
    labelAt: { x: 45, y: 885 },
    align: "start",
  },
];

export function calloutLabel(callout: GridCallout): string {
  return callout.label.map((key) => t(key)).join(" ");
}

/** Start the line a little off the point so it never covers the dot. */
export function calloutLineStart(callout: GridCallout, gap = 26): Point {
  const dx = callout.lineEnd.x - callout.anchor.x;
  const dy = callout.lineEnd.y - callout.anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: callout.anchor.x + (dx / length) * gap,
    y: callout.anchor.y + (dy / length) * gap,
  };
}
