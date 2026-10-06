import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import type { GridJoinSpec } from "@tka/render-core";
import type { SequenceRenderOptions } from "../../mcp-server-pkg/src/core/sequence-renderer";

export interface CardParityCase {
  name: string;
  sequence: typeof demo;
  options: Partial<SequenceRenderOptions>;
}

export function cardParityCases(): CardParityCase[] {
  const sequence = structuredClone(demo);
  sequence.steps = sequence.steps.slice(0, 4);
  sequence.word = sequence.steps.map((step) => step.letter).join("");
  const eightSteps = structuredClone(demo);
  eightSteps.steps = eightSteps.steps.slice(0, 8);
  eightSteps.word = eightSteps.steps.map((step) => step.letter).join("");
  return [
    {
      name: "loop-metadata",
      sequence,
      options: {
        showDifficulty: true,
        loopComponents: ["mirrored", "inverted", "swapped"],
        reflectionAxis: "northeast-southwest",
        inversionPeriod: "quartered",
        overlayComponents: ["swapped"],
      },
    },
    {
      name: "composer-light",
      sequence,
      options: { showDifficulty: true, showMandala: true },
    },
    {
      name: "composer-dark",
      sequence,
      options: { showDifficulty: true, showMandala: true, darkMode: true },
    },
    {
      name: "custom-colors",
      sequence,
      options: {
        showDifficulty: true,
        primaryPropColors: { left: "#00e5ff", right: "#ff2ea6" },
      },
    },
    {
      name: "print-indicators",
      sequence,
      options: {
        exportProfile: "print",
        columnCount: 2,
        startPlacementLayout: "row",
        showDifficulty: true,
        loopComponents: ["rotated"],
        rotationPeriod: "quartered",
        showMandala: true,
      },
    },
    {
      name: "print-default-badge",
      sequence,
      options: {
        exportProfile: "print",
        columnCount: 2,
        startPlacementLayout: "row",
      },
    },
    {
      name: "repeated-word",
      sequence: structuredClone(demo),
      options: { showDifficulty: true },
    },
    {
      name: "mixed-fan-staff",
      sequence,
      options: {
        leftPropType: "fan",
        rightPropType: "staff",
        fanAppearance: { build: "lotus", frameColor: "white", cover: "bare" },
        showDifficulty: true,
      },
    },
    {
      name: "footer",
      sequence,
      options: { showFooter: true, notes: "Parity fixture" },
    },
    {
      name: "duration-badges",
      sequence: withDurations(sequence, [2, 1.5, 1, 0.5]),
      options: { showDifficulty: true, showMandala: true },
    },
    {
      name: "duration-badges-dark",
      sequence: withDurations(sequence, [3, 1, 2.25, 1]),
      options: { showDifficulty: true, showMandala: true, darkMode: true },
    },
    {
      name: "print-accent-tint",
      sequence,
      options: {
        exportProfile: "print",
        columnCount: 2,
        startPlacementLayout: "row",
        accentColor: "#2f6fed",
        accentTintOpacity: 0.12,
      },
    },
    {
      name: "print-footer",
      sequence: eightSteps,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPlacementLayout: "column",
        showFooter: true,
        notes: "Accent footer",
      },
    },
    {
      name: "print-accent-default-alpha",
      sequence: eightSteps,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPlacementLayout: "column",
        accentColor: "#d13a2e",
        showFooter: true,
        notes: "Accent footer",
      },
    },
    {
      name: "qr-code-row",
      sequence,
      options: { showMandala: true, qrUrl: DEMO_SHORT_CODE_URL_4 },
    },
    {
      name: "qr-code-row-dark",
      sequence,
      options: {
        showMandala: true,
        qrUrl: DEMO_SHORT_CODE_URL_4,
        darkMode: true,
      },
    },
    {
      name: "print-qr-column",
      sequence: eightSteps,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPlacementLayout: "column",
        showMandala: true,
        qrUrl: DEMO_SEQUENCE_LINK_8,
      },
    },
    {
      name: "joined-grids",
      sequence,
      options: {
        showDifficulty: true,
        showMandala: true,
        conjoined: JOIN_EAST,
      },
    },
    {
      name: "joined-cell-overrides-dark",
      // Start on one grid, step 2 joined south two steps apart, the rest
      // following the sequence's join.
      sequence: withCellJoins(sequence, null, [
        undefined,
        { toward: "s", steps: 2 },
      ]),
      options: {
        showDifficulty: true,
        showMandala: true,
        darkMode: true,
        conjoined: JOIN_EAST,
      },
    },
    {
      name: "print-joined-grids",
      sequence: eightSteps,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPlacementLayout: "column",
        conjoined: JOIN_EAST,
      },
    },
  ];
}

/** The join the 2D animation draws: red's grid one hand-point step east. */
const JOIN_EAST: GridJoinSpec = { toward: "e", steps: 1 };

// This published record includes the exact four-step choreography. The eight-
// step fixture stays self-contained until an equivalent short code exists.
export const DEMO_SHORT_CODE_URL_4 = "HTTPS://TKA.RUN/0WHS";
export const DEMO_SEQUENCE_LINK_8 =
  "https://tkaflowarts.com/sequence/d1%3ARYyxDcAgDARXwm3WYAIUfUFjFxYyBcPnHRdUr9Odfs7eTyCw2-PmthtJ7U3CWHKUQ8LAoKshua0klsIycMsAndB5vfyfNVUmsRSWyvID";

function withDurations(
  sequence: typeof demo,
  durations: number[]
): typeof demo {
  const copy = structuredClone(sequence);
  copy.steps = copy.steps.map((step, index) => ({
    ...step,
    duration: durations[index] ?? 1,
  }));
  return copy;
}

/** Per-cell joins: `undefined` follows the sequence, `null` keeps one grid. */
function withCellJoins(
  sequence: typeof demo,
  start: GridJoinSpec | null | undefined,
  steps: Array<GridJoinSpec | null | undefined>
): typeof demo {
  const copy = structuredClone(sequence);
  if (start !== undefined) {
    Object.assign(copy.startPlacement, { conjoined: start });
  }
  copy.steps = copy.steps.map((step, index) =>
    steps[index] === undefined ? step : { ...step, conjoined: steps[index] }
  );
  return copy;
}
