import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
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
        columnCount: 3,
        startPositionLayout: "column",
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
        columnCount: 3,
        startPositionLayout: "column",
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
        columnCount: 3,
        startPositionLayout: "column",
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
        startPositionLayout: "column",
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
        startPositionLayout: "column",
        accentColor: "#d13a2e",
        showFooter: true,
        notes: "Accent footer",
      },
    },
    {
      name: "qr-code-row",
      sequence,
      options: { showMandala: true, qrUrl: QR_URL },
    },
    {
      name: "qr-code-row-dark",
      sequence,
      options: { showMandala: true, qrUrl: QR_URL, darkMode: true },
    },
    {
      name: "print-qr-column",
      sequence: eightSteps,
      options: {
        exportProfile: "print",
        columnCount: 3,
        startPositionLayout: "column",
        showMandala: true,
        qrUrl: QR_URL,
      },
    },
  ];
}

/** A published player link; the Composer prints the same code after publish. */
export const QR_URL = "https://tka.run/PARITY";

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
