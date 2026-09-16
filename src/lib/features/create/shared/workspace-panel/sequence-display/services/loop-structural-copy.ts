import type { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { explainLOOP } from "$lib/features/choreo-card/services/loop-explainer";

export interface StructuralCopyPart {
  text: string;
  bold: boolean;
}

export interface StructuralCopy {
  lead: string;
  parts: StructuralCopyPart[];
}

const COMPONENT_VERB: Record<string, string> = {
  rotated: "rotates placements on the grid",
  mirrored: "mirrors east and west",
  flipped: "flips north and south",
  swapped: "swaps blue and red",
  inverted: "swaps pro and anti",
  rewound: "plays the steps in reverse order",
};

function cycleText(cycleCount: number): string {
  if (cycleCount === 1) return "One pass and you're back where you started.";
  return `Play it ${cycleCount} times and you're back where you started.`;
}

function structureText(
  stepCount: number,
  word: string,
  period: number
): string {
  const half = stepCount / 2;
  if (period === 4) {
    return `${stepCount} steps. ${word} repeats four times. `;
  }
  return `${stepCount} steps. ${word} repeats twice: steps 1–${half} and ${half + 1}–${stepCount} use the same letters. `;
}

function singleComponentCopy(
  component: LOOPComponent,
  stepCount: number,
  word: string,
  period: number,
  cc: number
): StructuralCopy {
  const structure = structureText(stepCount, word, period);

  if (period === 4) {
    return quarteredSingleCopy(component, structure, cc);
  }

  switch (component) {
    case "rotated":
      return {
        lead: structure,
        parts: [
          { text: "The placements rotate", bold: true },
          {
            text: ": where the first half places your hands, the second half continues around the grid. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "mirrored":
      return {
        lead: structure,
        parts: [
          { text: "Same letters, but every placement ", bold: false },
          { text: "flips left-to-right", bold: true },
          {
            text: ". The second half is the mirror image of the first. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "flipped":
      return {
        lead: structure,
        parts: [
          { text: "Same letters, but every placement ", bold: false },
          { text: "flips top-to-bottom", bold: true },
          {
            text: ". The second half inverts the vertical axis. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "swapped":
      return {
        lead: structure,
        parts: [
          { text: "Same placements, same motions, but ", bold: false },
          { text: "blue and red trade roles", bold: true },
          {
            text: ". What one hand did in the first half, the other does in the second. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "inverted":
      return {
        lead: structure,
        parts: [
          { text: "Same placements, but ", bold: false },
          { text: "pro motions become anti and vice versa", bold: true },
          {
            text: ". The rotation direction reverses while the path stays the same. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "rewound":
      return {
        lead: structure,
        parts: [
          { text: "The second half ", bold: false },
          { text: "plays the first in reverse", bold: true },
          {
            text: ". A temporal mirror that loops back to start.",
            bold: false,
          },
        ],
      };
    default:
      return {
        lead: structure,
        parts: [{ text: cycleText(cc), bold: false }],
      };
  }
}

function quarteredSingleCopy(
  component: LOOPComponent,
  structure: string,
  cc: number
): StructuralCopy {
  switch (component) {
    case "rotated":
      return {
        lead: structure,
        parts: [
          { text: "Each pass ", bold: false },
          { text: "rotates placements 90° further", bold: true },
          { text: " around the grid. ", bold: false },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "mirrored":
      return {
        lead: structure,
        parts: [
          { text: "Placements ", bold: false },
          { text: "mirror every two passes", bold: true },
          {
            text: "; orientations take all four to complete their cycle. ",
            bold: false,
          },
          { text: cycleText(cc), bold: false },
        ],
      };
    case "swapped":
      return {
        lead: structure,
        parts: [
          { text: "Left and right ", bold: false },
          { text: "exchange roles every other pass", bold: true },
          { text: ". ", bold: false },
          { text: cycleText(cc), bold: false },
        ],
      };
    default:
      return {
        lead: structure,
        parts: [{ text: cycleText(cc), bold: false }],
      };
  }
}

function multiComponentCopy(
  components: LOOPComponent[],
  stepCount: number,
  word: string,
  period: number,
  cc: number
): StructuralCopy {
  const structure = structureText(stepCount, word, period);
  const verbs = components.map((c) => COMPONENT_VERB[c]).filter(Boolean);

  const verbText = verbs.join(" and ");
  const subject = period === 4 ? "Each pass " : "The second half ";

  return {
    lead: structure,
    parts: [
      { text: subject, bold: false },
      { text: verbText, bold: true },
      { text: ". ", bold: false },
      { text: cycleText(cc), bold: false },
    ],
  };
}

function extractRepeatingUnit(word: string, period: number): string {
  if (period <= 1 || word.length < period) return word;
  const unitLen = Math.floor(word.length / period);
  if (unitLen === 0) return word;
  const unit = word.slice(0, unitLen);
  for (let i = 1; i < period; i++) {
    if (word.slice(i * unitLen, (i + 1) * unitLen) !== unit) return word;
  }
  return unit;
}

export function generateLoopStructuralCopy(
  sequence: SequenceData,
  activeComponents: Set<LOOPComponent>,
  period: number
): StructuralCopy {
  const stepCount = sequence.steps?.length ?? 0;
  const fullWord = sequence.word || `${stepCount}-step sequence`;
  const word = extractRepeatingUnit(fullWord, period);
  const cc = sequence.orientationCycleCount ?? period;
  const components = [...activeComponents];

  if (stepCount === 0 || components.length === 0) {
    return {
      lead: "This sequence loops ",
      parts: [{ text: "back to its starting placement.", bold: false }],
    };
  }

  const modular = explainLOOP(sequence, activeComponents);
  if (modular.type === "modular" && modular.seeds.length > 1) {
    return {
      lead: `${stepCount} steps. `,
      parts: [{ text: modular.summary, bold: false }],
    };
  }

  if (components.length === 1) {
    return singleComponentCopy(components[0]!, stepCount, word, period, cc);
  }

  return multiComponentCopy(components, stepCount, word, period, cc);
}
