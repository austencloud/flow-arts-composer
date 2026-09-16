import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import type { CardParityCase } from "./card-parity-cases";

/**
 * A profile case is a real product preset, not a parity fixture. The layout
 * values are copied from the selectors that own them so the review page shows
 * the card a user actually gets. `tests/unit/card-profile-cases.test.ts` fails
 * when a selector stops agreeing with these copies.
 */
export interface CardProfileCase extends CardParityCase {
  description: string;
}

/** Portrait sequence-viewer panel measured in the reported Auto layout case. */
export const VIEWER_PORTRAIT = { containerWidth: 630, containerHeight: 885 };
/** Wide desktop viewer panel. */
export const VIEWER_LANDSCAPE = { containerWidth: 1400, containerHeight: 700 };

function sequenceOf(stepCount: number) {
  const sequence = structuredClone(demo);
  sequence.steps = sequence.steps.slice(0, stepCount);
  sequence.word = sequence.steps.map((step) => step.letter).join("");
  return sequence;
}

export function cardProfileCases(): CardProfileCase[] {
  const four = sequenceOf(4);
  const eight = sequenceOf(8);
  return [
    {
      name: "export-composer-default-4",
      description:
        "The canonical Composer image export. Start position in the top row, layout-table columns, no difficulty badge. A plain MCP call without options must match this.",
      sequence: four,
      options: {},
    },
    {
      name: "export-flexible-column-4",
      description:
        "Flexible export with Start explicitly moved to the left column. Same profile as the default export; only the Start placement setting differs.",
      sequence: four,
      options: { startPlacementLayout: "column" },
    },
    {
      name: "viewer-auto-portrait-4",
      description:
        "What the sequence viewer Auto layout chooses for four steps in a portrait panel (630 by 885 px): two columns with Start in the top row. Auto follows the panel, so this is one snapshot, not a fixed preset.",
      sequence: four,
      options: { columnCount: 2, startPlacementLayout: "row" },
    },
    {
      name: "viewer-auto-landscape-4",
      description:
        "The same four steps when the viewer panel is wide (1400 by 700 px): Auto switches to a Start column with three total columns.",
      sequence: four,
      options: { columnCount: 3, startPlacementLayout: "column" },
    },
    {
      name: "print-poker-4",
      description:
        "Physical poker card (822 by 1122 px including bleed) for four steps. The print layout selector puts Start in the top row with two total columns; the second top-row cell is the QR slot, left empty here because the review renders no QR payload. The difficulty badge is always on for print.",
      sequence: four,
      options: {
        exportProfile: "print",
        columnCount: 2,
        startPlacementLayout: "row",
        showMandala: false,
      },
    },
    {
      name: "print-poker-8",
      description:
        "Physical poker card for eight steps. The print layout selector uses a Start column with three total columns (a 3 by 4 grid); the bottom of the Start column is the QR slot.",
      sequence: eight,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPlacementLayout: "column",
        showMandala: false,
      },
    },
  ];
}
