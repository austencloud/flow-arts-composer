/**
 * Single source for The Grid page (manifest id "the-grid"). Prose is lifted
 * VERBATIM from _pages/TheGridPage.svelte (Austen's words - never AI-written).
 * The two-hand diagram is the same ALPHA3 pictograph that page builds. The web
 * reference compares Diamond, Box, and the combined grid through one canonical
 * GridSvg-backed explorer. The measured _pages component remains the print/book
 * owner. See the reflow spec + no-ghostwriting rule.
 */
import type { GuideBlock } from "../guide-content-blocks";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { THE_GRID_ALPHA3 } from "../the-grid-pictograph";

export const theGridContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "The Grid" },
  {
    kind: "prose",
    html: "The Kinetic Alphabet is based on a 4-point grid.",
  },
  {
    kind: "prose",
    html:
      "There are two 4-point grids: box mode and diamond mode.<br>" +
      "<strong>This guide is written in diamond, but everything translates to box.</strong><br><br>" +
      "On this grid, there are three types of points:",
    flowArea: "grid-overview",
  },
  ...(THE_GRID_ALPHA3
    ? [
        {
          kind: "pictograph",
          data: THE_GRID_ALPHA3,
          render: { propType: PropType.HAND, showTKA: false },
          caption: "Two hands on the diamond grid: blue at west, red at east.",
          flowArea: "grid-hands",
        } as GuideBlock,
      ]
    : []),
  {
    kind: "prose",
    html:
      "The <strong>center point</strong> is the hub that<br>everything revolves around.<br><br>" +
      "The four <strong>hand points</strong> are halfway<br>between the center point and the<br>outer points.<br><br>" +
      "The <strong>outer points</strong> depict the outer<br>edges of the grid.",
    flowArea: "grid-points",
  },
  {
    kind: "prose",
    html: "Together, diamond and box form an 8-point grid:",
    flowArea: "grid-combination",
  },
  {
    kind: "gridExplorer",
    modes: [
      {
        mode: "diamond",
        label: "Diamond",
        ariaLabel: "Diamond grid: four points at north, east, south, and west",
      },
      {
        mode: "box",
        label: "Box",
        ariaLabel: "Box grid: four points on the diagonals",
      },
      {
        mode: "merged",
        label: "8-point grid",
        ariaLabel: "8-point grid: diamond and box combined",
      },
    ],
    initialMode: "diamond",
    flowArea: "grid-explorer",
  },
  {
    kind: "prose",
    html: "We’ll use diamond mode to learn each concept.",
    flowArea: "grid-closing",
  },
];
