/**
 * TikaToolExecutor - Executes TKA AI tools
 *
 * Implements the core tool functions for letter explanations,
 * comparisons, term definitions, and visual examples.
 */

import type { PictographData } from "./tika-pictograph-loader";
import type { TikaPictographLoader } from "./tika-pictograph-loader";
import type { TikaSequenceValidator } from "./tika-sequence-validator";
import {
  TYPE_DEFINITIONS,
  PLACEMENT_DEFINITIONS,
  MOTION_TYPE_DEFINITIONS,
  LETTER_TO_TYPE,
  LETTER_TYPES,
} from "@tka/domain";
import type { TikaSequenceGenerator } from "./tika-sequence-generator";
import type {
  InlineGallery,
  InlinePictograph,
  InlineSequencePlayer,
  InlineStepGrid,
} from "../types";

export interface PictographExample {
  letter: string;
  variation: number;
  startPlacement: string;
  endPlacement: string;
  leftMotion?: string;
  rightMotion?: string;
}

export type MotionExampleHand = "left" | "right" | "both";
export type MotionExampleHandInput = MotionExampleHand | "blue" | "red";

function normalizeMotionExampleHand(
  hand: MotionExampleHandInput
): MotionExampleHand {
  return hand === "blue" ? "left" : hand === "red" ? "right" : hand;
}
export interface LetterExplanationResult {
  explanation: string;
  inlinePictograph: InlinePictograph;
  contextData: {
    type: "letter";
    letter: string;
    letterType: number;
    typeName: string;
    startPlacement: string;
    endPlacement: string;
    leftMotion: {
      motionType: string;
      startLoc: string;
      endLoc: string;
      propRotDir: string;
    };
    rightMotion: {
      motionType: string;
      startLoc: string;
      endLoc: string;
      propRotDir: string;
    };
  };
}
export interface ComparisonResult {
  explanation: string;
  inlineGallery: InlineGallery;
  contextData: {
    type: "comparison";
    letter1: string;
    letter2: string;
    letter1Data: {
      letter: string;
      type: number;
      typeName: string;
      leftMotion: string;
      rightMotion: string;
    };
    letter2Data: {
      letter: string;
      type: number;
      typeName: string;
      leftMotion: string;
      rightMotion: string;
    };
  };
}
export interface TypeListResult {
  explanation: string;
  inlineGallery: InlineGallery;
  contextData: {
    type: "typeList";
    typeNumber: number;
    typeName: string;
    description: string;
    exampleLetters: string[];
    allLetters: string[];
    motionPattern: {
      leftMotion: string;
      rightMotion: string;
    };
    rotationPattern?: unknown;
  };
}
export interface TermDefinitionResult {
  explanation: string;
  contextData?: {
    type: "termWithVisuals";
    term: string;
    definition: string;
    examples: PictographExample[];
  };
}
export interface PositionExamplesResult {
  explanation: string;
  vtgEquivalent?: string | null;
  inlineGalleries?: InlineGallery[];
}
export interface MotionExamplesResult {
  explanation: string;
  inlineGallery: InlineGallery;
}
export interface ToolExecutorSequenceResult {
  explanation: string;
  inlineSequencePlayer?: InlineSequencePlayer;
}
export interface StepGridResult {
  explanation: string;
  inlineStepGrid?: InlineStepGrid;
}

const POSITION_STATIC_LETTERS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
};

export class TikaToolExecutor {
  constructor(
    private pictographLoader: TikaPictographLoader,
    private sequenceGenerator: TikaSequenceGenerator,
    private sequenceValidator: TikaSequenceValidator
  ) {}

  getLetterExplanation(
    letter: string,
    variation: number = 0,
    gridMode: "diamond" | "box" = "diamond"
  ): LetterExplanationResult | string {
    this.pictographLoader.ensureLoaded();

    const variations =
      gridMode === "box"
        ? this.pictographLoader.getLetterVariationsByMode(letter, "box")
        : this.pictographLoader.getLetterVariations(letter);
    if (variations.length === 0) {
      return `Letter "${letter}" not found in the TKA alphabet.`;
    }

    const typeInfo = LETTER_TO_TYPE[letter];
    const typeNum = typeInfo?.typeNumber ?? 0;
    const letterTypes = this.pictographLoader.getLetterTypes();
    const fullTypeInfo = letterTypes[typeInfo?.type ?? ""];
    const varData = variations[Math.min(variation, variations.length - 1)];

    if (!varData) {
      return `Letter "${letter}" variation data not available.`;
    }

    const leftRot =
      varData.leftMotion.rotationDirection !== "noRotation"
        ? ` (${varData.leftMotion.rotationDirection})`
        : "";
    const rightRot =
      varData.rightMotion.rotationDirection !== "noRotation"
        ? ` (${varData.rightMotion.rotationDirection})`
        : "";

    const explanation = `**${letter}** is a Type ${typeNum} (${
      fullTypeInfo?.name || typeInfo?.name
    }) letter. Left hand ${varData.leftMotion.motionType}${leftRot}, right hand ${
      varData.rightMotion.motionType
    }${rightRot}. Moves from ${varData.startPlacement} to ${varData.endPlacement}.`;

    return {
      explanation,
      inlinePictograph: {
        type: "inline-pictograph",
        letter,
        variation,
        gridMode,
      },
      contextData: {
        type: "letter",
        letter,
        letterType: typeNum || 1,
        typeName: fullTypeInfo?.name || typeInfo?.name || "Unknown",
        startPlacement: varData.startPlacement,
        endPlacement: varData.endPlacement,
        leftMotion: {
          motionType: varData.leftMotion.motionType,
          startLoc: varData.leftMotion.startLocation,
          endLoc: varData.leftMotion.endLocation,
          propRotDir: varData.leftMotion.rotationDirection,
        },
        rightMotion: {
          motionType: varData.rightMotion.motionType,
          startLoc: varData.rightMotion.startLocation,
          endLoc: varData.rightMotion.endLocation,
          propRotDir: varData.rightMotion.rotationDirection,
        },
      },
    };
  }

  getTermDefinition(term: string): TermDefinitionResult | string {
    this.pictographLoader.ensureLoaded();

    const normalizedTerm = term.toLowerCase().trim();
    const glossary = this.pictographLoader.getGlossary();
    const entry = glossary[normalizedTerm];

    if (!entry) {
      const possibleMatches = Object.keys(glossary)
        .filter(
          (key) => key.includes(normalizedTerm) || normalizedTerm.includes(key)
        )
        .slice(0, 5);

      return `Term "${term}" not found.${
        possibleMatches.length > 0
          ? ` Did you mean: ${possibleMatches.join(", ")}?`
          : ""
      }`;
    }

    const explanation = `# ${term.charAt(0).toUpperCase() + term.slice(1)}

**Definition:** ${entry.definition}

**Examples:**
${entry.examples.map((e) => `- ${e}`).join("\n")}

**Related terms:** ${entry.relatedTerms.join(", ")}

**Category:** ${entry.category}`;

    // Check if this term has visual examples available
    let visualExamples: PictographExample[] = [];

    if (this.isPositionTerm(normalizedTerm)) {
      visualExamples = this.getPositionExamples(normalizedTerm, 3);
    } else if (this.isMotionTerm(normalizedTerm)) {
      visualExamples = this.getMotionExamples(normalizedTerm);
    }

    if (visualExamples.length > 0) {
      return {
        explanation,
        contextData: {
          type: "termWithVisuals",
          term: normalizedTerm,
          definition: entry.definition,
          examples: visualExamples,
        },
      };
    }

    return explanation;
  }

  compareLetters(letter1: string, letter2: string): ComparisonResult | string {
    this.pictographLoader.ensureLoaded();

    const var1 = this.pictographLoader.getLetterVariations(letter1);
    const var2 = this.pictographLoader.getLetterVariations(letter2);

    if (var1.length === 0) return `Letter "${letter1}" not found.`;
    if (var2.length === 0) return `Letter "${letter2}" not found.`;

    const type1 = LETTER_TO_TYPE[letter1];
    const type2 = LETTER_TO_TYPE[letter2];
    const typeNum1 = type1?.typeNumber ?? 0;
    const typeNum2 = type2?.typeNumber ?? 0;
    const rep1 = var1[0];
    const rep2 = var2[0];

    if (!rep1 || !rep2) {
      return `Cannot compare - missing variation data for one or both letters.`;
    }

    const typeDef1 = TYPE_DEFINITIONS[typeNum1];
    const typeDef2 = TYPE_DEFINITIONS[typeNum2];

    let explanation = `**${letter1}** (Type ${typeNum1} - ${
      typeDef1?.name || "?"
    }): left ${rep1.leftMotion.motionType}, right ${rep1.rightMotion.motionType}.
**${letter2}** (Type ${typeNum2} - ${typeDef2?.name || "?"}): left ${
      rep2.leftMotion.motionType
    }, right ${rep2.rightMotion.motionType}.`;

    if (typeNum1 !== typeNum2) {
      explanation += ` Key difference: ${typeDef1?.description || ""} vs ${
        typeDef2?.description || ""
      }.`;
    }

    return {
      explanation,
      inlineGallery: {
        type: "inline-gallery",
        items: [
          { letter: letter1, label: `Type ${typeNum1}` },
          { letter: letter2, label: `Type ${typeNum2}` },
        ],
        layout: "row",
        caption: `${letter1} vs ${letter2}`,
      },
      contextData: {
        type: "comparison",
        letter1,
        letter2,
        letter1Data: {
          letter: letter1,
          type: typeNum1,
          typeName: typeDef1?.name || "Unknown",
          leftMotion: rep1.leftMotion.motionType,
          rightMotion: rep1.rightMotion.motionType,
        },
        letter2Data: {
          letter: letter2,
          type: typeNum2,
          typeName: typeDef2?.name || "Unknown",
          leftMotion: rep2.leftMotion.motionType,
          rightMotion: rep2.rightMotion.motionType,
        },
      },
    };
  }

  listLettersByType(type: number): TypeListResult | string {
    this.pictographLoader.ensureLoaded();

    const canonicalDef = TYPE_DEFINITIONS[type];
    if (!canonicalDef) {
      return `Invalid type ${type}. Valid types are 1-6.`;
    }

    const typeKey = type.toString();
    const letterTypes = this.pictographLoader.getLetterTypes();
    const typeInfo = letterTypes[typeKey];

    const letters: string[] = canonicalDef.letters
      .split(", ")
      .flatMap((l: string) =>
        l.includes("through")
          ? (LETTER_TYPES[typeKey]?.letters as string[]) || []
          : [l.trim()]
      );
    const exampleLetters: string[] = (typeInfo?.letters as string[]) || letters;

    const explanation = `**Type ${type} (${canonicalDef.name})**: ${canonicalDef.description}. Left hand ${canonicalDef.motionPattern.left}, right hand ${canonicalDef.motionPattern.right}.`;

    let galleryItems: Array<{
      letter: string;
      variation?: number;
      label?: string;
    }> = [];

    if (type === 1 && canonicalDef.rotationPattern) {
      for (const group of canonicalDef.rotationPattern.groups) {
        const groupLetters = group.letters.split("");
        const patterns = group.pattern.split(", ");
        for (let i = 0; i < groupLetters.length; i++) {
          galleryItems.push({
            letter: groupLetters[i] || "",
            label: patterns[i],
          });
        }
      }
    } else {
      galleryItems = exampleLetters.map((letter: string) => ({ letter }));
    }

    return {
      explanation,
      inlineGallery: {
        type: "inline-gallery",
        items: galleryItems,
        layout: "grid",
        caption:
          type === 1
            ? "Pattern of three: pro, anti, hybrid"
            : `All Type ${type} letters`,
      },
      contextData: {
        type: "typeList",
        typeNumber: type,
        typeName: canonicalDef.name,
        description: canonicalDef.description,
        exampleLetters,
        allLetters: exampleLetters,
        motionPattern: {
          leftMotion: canonicalDef.motionPattern.left,
          rightMotion: canonicalDef.motionPattern.right,
        },
        ...(canonicalDef.rotationPattern && {
          rotationPattern: canonicalDef.rotationPattern,
        }),
      },
    };
  }

  showPositionExamples(position: string): PositionExamplesResult | string {
    const positionDef =
      PLACEMENT_DEFINITIONS[
        position.toLowerCase() as keyof typeof PLACEMENT_DEFINITIONS
      ];
    if (!positionDef) {
      return `Position "${position}" not recognized. Valid positions: alpha, beta, gamma, zeta, eta`;
    }

    const { diamond, box } = this.getPositionExamplesByMode(position);
    const staticLetter = POSITION_STATIC_LETTERS[position.toLowerCase()];

    if (!staticLetter || (diamond.length === 0 && box.length === 0)) {
      return {
        explanation: `**${positionDef.name}:** ${positionDef.description}

This is an advanced position you'll learn later. For now, focus on the basics: alpha, beta, and gamma.`,
      };
    }

    const vtgContext: Record<string, string> = {
      alpha: `If you've learned [VTG (Vulcan Tech Gospel)](https://linktr.ee/vulcantechgospel), alpha corresponds to "split-same" - hands apart, spinning the same direction.`,
      beta: `If you've learned [VTG (Vulcan Tech Gospel)](https://linktr.ee/vulcantechgospel), beta corresponds to "together-same" - hands together, spinning the same direction.`,
      gamma: `Gamma creates an L-shape between your hands. In VTG, this corresponds to "quarter time." ([Learn more about VTG](https://linktr.ee/vulcantechgospel))`,
    };

    const vtgMapping = vtgContext[position.toLowerCase()] || null;

    const renderContext = {
      propType: "hand",
      purpose: "position-teaching" as const,
    };

    const positionExplanations: Record<string, string> = {
      alpha: `## Alpha

**Alpha** is one of the three basic positions in The Kinetic Alphabet.

In TKA, **position** describes where your two hands are relative to each other on the grid:

- **Alpha** - hands at opposite points (across from each other)
- **Beta** - hands at the same point (together)
- **Gamma** - hands form a right angle (L-shape)

**Alpha** means your hands are at **opposite grid points**. In the pictographs below, notice how the left and right hands are always directly across from each other, no matter which way the grid is oriented.`,

      beta: `## Beta

**Beta** is one of the three basic positions in The Kinetic Alphabet.

In TKA, **position** describes where your two hands are relative to each other on the grid:

- **Alpha** - hands at opposite points (across from each other)
- **Beta** - hands at the same point (together)
- **Gamma** - hands form a right angle (L-shape)

**Beta** means your hands are at the **same grid point**. In the pictographs below, notice how the left and right hands overlap at one location.`,

      gamma: `## Gamma

**Gamma** is one of the three basic positions in The Kinetic Alphabet.

In TKA, **position** describes where your two hands are relative to each other on the grid:

- **Alpha** - hands at opposite points (across from each other)
- **Beta** - hands at the same point (together)
- **Gamma** - hands form a right angle (L-shape)

**Gamma** means your hands form a **right angle** on the grid. In the pictographs below, notice how the hands are neither opposite nor together - they're 90° apart, like an L-shape.`,
    };

    const explanation =
      positionExplanations[position.toLowerCase()] ||
      `**${positionDef.name}:** ${positionDef.description}`;

    return {
      explanation,
      vtgEquivalent: vtgMapping,
      inlineGalleries: [
        {
          type: "inline-gallery" as const,
          items: diamond.map((ex) => ({
            letter: ex.letter,
            variation: ex.variation,
            label: ex.startPlacement,
          })),
          layout: "row" as const,
          gridMode: "diamond" as const,
          caption: `Diamond mode (cardinal locations)`,
          renderContext,
        },
        {
          type: "inline-gallery" as const,
          items: box.map((ex) => ({
            letter: ex.letter,
            variation: ex.variation,
            label: ex.startPlacement,
          })),
          layout: "row" as const,
          gridMode: "box" as const,
          caption: `Box mode (intercardinal locations)`,
          renderContext,
        },
      ],
    };
  }

  showMotionExamples(
    motionType: string,
    handInput: MotionExampleHandInput = "both"
  ): MotionExamplesResult | string {
    const motionDef = MOTION_TYPE_DEFINITIONS[motionType.toLowerCase()];
    if (!motionDef) {
      return `Motion type "${motionType}" not recognized. Valid types: shift, dash, static`;
    }

    const examples = this.getMotionExamples(motionType, handInput);

    return {
      explanation: `**${motionDef.name}:** ${motionDef.description}`,
      inlineGallery: {
        type: "inline-gallery" as const,
        items: examples.map((ex) => ({
          letter: ex.letter,
          variation: ex.variation,
        })),
        layout: "row" as const,
        caption: `Examples of ${motionType} motion`,
      },
    };
  }

  async explainSequence(
    word: string
  ): Promise<ToolExecutorSequenceResult | string> {
    try {
      const letters = this.sequenceValidator.parseWordToLetters(
        word.toUpperCase()
      );

      if (letters.length === 0) {
        return `Cannot generate sequence: no valid letters in "${word}"`;
      }

      for (const letter of letters) {
        if (!this.sequenceValidator.isValidLetter(letter)) {
          return `Invalid letter "${letter}" in sequence. Use valid TKA letters (A-V, W-Z, Greek letters, or dash variants).`;
        }
      }

      const stepCount = letters.length;
      const normalizedWord = letters.join("");
      const explanation = `Here's **"${normalizedWord}"** as a ${stepCount}-beat animated sequence.`;

      return {
        explanation,
        inlineSequencePlayer: {
          type: "inline-sequence-player",
          word: normalizedWord,
          showControls: true,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error processing sequence: ${errorMessage}`;
    }
  }

  async showSequenceSteps(word: string): Promise<StepGridResult | string> {
    try {
      const letters = this.sequenceValidator.parseWordToLetters(
        word.toUpperCase()
      );

      if (letters.length === 0) {
        return `Cannot generate sequence: no valid letters in "${word}"`;
      }

      for (const letter of letters) {
        if (!this.sequenceValidator.isValidLetter(letter)) {
          return `Invalid letter "${letter}" in sequence. Use valid TKA letters (A-V, W-Z, Greek letters, or dash variants).`;
        }
      }

      const result = await this.sequenceGenerator.generateSequence(
        letters,
        100
      );

      if (!result.isValid || result.steps.length === 0) {
        return `Failed to generate sequence "${word}": ${
          result.error || "Unknown error"
        }`;
      }

      const stepGridItems = result.steps.map((step) => ({
        stepNumber: step.stepNumber,
        letter: step.letter,
        variation: step.variation,
        label: step.stepNumber === 0 ? "Start" : `Step ${step.stepNumber}`,
        startPlacement: step.startPlacement,
        endPlacement: step.endPlacement,
      }));

      const normalizedWord = letters.join("");
      const explanation = `Here's **"${normalizedWord}"** broken down into ${stepGridItems.length} beats:`;

      return {
        explanation,
        inlineStepGrid: {
          type: "inline-step-grid",
          word: normalizedWord,
          steps: stepGridItems,
          caption: `${letters.length}-beat sequence`,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error generating step grid: ${errorMessage}`;
    }
  }

  getPositionExamplesByMode(position: string): {
    diamond: PictographExample[];
    box: PictographExample[];
  } {
    this.pictographLoader.ensureLoaded();

    const normalizedPosition = position.toLowerCase().trim();
    const staticLetter = POSITION_STATIC_LETTERS[normalizedPosition];

    if (!staticLetter) {
      return { diamond: [], box: [] };
    }

    const diamondVariations = this.pictographLoader.getLetterVariationsByMode(
      staticLetter,
      "diamond"
    );
    const diamond: PictographExample[] = diamondVariations
      .map((v, i) => ({
        letter: staticLetter,
        variation: i,
        startPlacement: v.startPlacement,
        endPlacement: v.endPlacement,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.startPlacement.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.startPlacement.replace(/\D/g, "")) || 0;
        return numA - numB;
      });

    const boxVariations = this.pictographLoader.getLetterVariationsByMode(
      staticLetter,
      "box"
    );
    const box: PictographExample[] = boxVariations
      .map((v, i) => ({
        letter: staticLetter,
        variation: i,
        startPlacement: v.startPlacement,
        endPlacement: v.endPlacement,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.startPlacement.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.startPlacement.replace(/\D/g, "")) || 0;
        return numA - numB;
      });

    return { diamond, box };
  }

  getMotionExamples(
    motionType: string,
    handInput: MotionExampleHandInput = "both"
  ): PictographExample[] {
    this.pictographLoader.ensureLoaded();

    const normalizedMotion = motionType.toLowerCase().trim();
    const hand = normalizeMotionExampleHand(handInput);
    const allPictographs = this.pictographLoader.getAllPictographs();

    let matches: PictographData[] = [];

    if (hand === "left" || hand === "both") {
      matches = allPictographs.filter(
        (p) => p.leftMotion.motionType.toLowerCase() === normalizedMotion
      );
    }

    if (hand === "right" || hand === "both") {
      const rightMatches = allPictographs.filter(
        (p) => p.rightMotion.motionType.toLowerCase() === normalizedMotion
      );
      matches = hand === "both" ? [...matches, ...rightMatches] : rightMatches;
    }

    const examples: PictographExample[] = [];
    const seenLetters = new Set<string>();

    for (const match of matches) {
      if (examples.length >= 4) break;
      if (seenLetters.has(match.letter)) continue;

      examples.push({
        letter: match.letter,
        variation: 0,
        startPlacement: match.startPlacement,
        endPlacement: match.endPlacement,
        leftMotion: match.leftMotion.motionType,
        rightMotion: match.rightMotion.motionType,
      });
      seenLetters.add(match.letter);
    }

    return examples;
  }

  private isPositionTerm(term: string): boolean {
    const normalized = term.toLowerCase().trim();
    return Object.keys(PLACEMENT_DEFINITIONS).includes(normalized);
  }

  private isMotionTerm(term: string): boolean {
    const normalized = term.toLowerCase().trim();
    return Object.keys(MOTION_TYPE_DEFINITIONS).includes(normalized);
  }

  private getPositionExamples(
    position: string,
    count: number = 3
  ): PictographExample[] {
    const { diamond } = this.getPositionExamplesByMode(position);
    return diamond.slice(0, count);
  }
}
