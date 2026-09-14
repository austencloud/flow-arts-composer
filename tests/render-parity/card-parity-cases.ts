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
  ];
}
