/**
 * LOOP (Circular Sequence) Tools
 *
 * Tools for generating LOOP sequences: validate_loop_options,
 * generate_loop_sequence, generate_loop_image
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COMPOSER_CARD_EXPORT_PROFILE_V1 } from "@tka/render-composition";
import {
  ensureDataLoaded,
  saveAndOpenImage,
} from "../shared/server-context.js";
import {
  buildSequenceFromLetters,
  parseWordToLetters,
} from "../core/sequence-builder.js";
import { renderSequenceToImage } from "../core/sequence-renderer.js";
import { simplifyRepeatedWord } from "../core/word-simplifier.js";
import { allocateTurns } from "../core/turn-allocator.js";
import { recalculateOrientationsWithOverrides } from "../core/orientation-propagation.js";
import {
  LOOPType,
  Period,
  LOOP_TYPE_LABELS,
  ALL_LOOP_TYPES,
  getLOOPOptionsForPositionPair,
  executeLOOP,
  findBridgeLettersForLoop,
  isLOOPValidForPositionPair,
  detectLOOPFromSteps,
  isSequenceCircular,
  loopTypeSchema,
  periodSchema,
  loopComponentsSchema,
  decomposeLoopType,
  componentStringToEnum,
} from "../core/loop/index.js";

const primaryPropColorsSchema = z.object({
  left: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
  right: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
});

const orientationEnum = z.enum([
  "in",
  "out",
  "clock",
  "counter",
  "clockIn",
  "clockOut",
  "counterIn",
  "counterOut",
]);

/**
 * requested LOOP type, automatically find and add a bridge letter to make it compatible.
 *
 * Returns the (possibly extended) word and updated letters array.
 */
function autoBridgeForLoop(
  originalWord: string,
  letters: string[],
  startPosition: string,
  endPosition: string,
  loopType: LOOPType,
  period: Period,
  allPictographs: Array<{
    letter: string;
    startPosition: string;
    endPosition: string;
  }>
): { word: string; letters: string[]; bridgeAdded: string | null } {
  // Check if already compatible
  const positionPair = `${startPosition},${endPosition}`;
  if (isLOOPValidForPositionPair(loopType, positionPair, period)) {
    return { word: originalWord, letters, bridgeAdded: null };
  }

  // Find bridge letters that would make it compatible
  const bridgeOptions = findBridgeLettersForLoop(
    startPosition,
    endPosition,
    loopType,
    period,
    allPictographs
  );

  if (bridgeOptions.length === 0) {
    // No single-letter bridge found - return as-is (will fail later with proper error)
    return { word: originalWord, letters, bridgeAdded: null };
  }

  // Pick the first bridge option (could be smarter about this later)
  const bridgeLetter = bridgeOptions[0]!;
  const newWord = originalWord + bridgeLetter;
  const newLetters = [...letters, bridgeLetter];

  return { word: newWord, letters: newLetters, bridgeAdded: bridgeLetter };
}

export function registerLoopTools(server: McpServer): void {
  // Tool: validate_loop_options
  server.tool(
    "validate_loop_options",
    "Given a sequence's start/end positions, return which LOOP types are valid. LOOPs are circular sequence patterns that transform the first half/quarter of a sequence to create a complete circular motion.",
    {
      startPosition: z
        .string()
        .describe(
          "Start position of the sequence (e.g., alpha1, beta3, gamma5)"
        ),
      endPosition: z
        .string()
        .describe(
          "End position of the sequence (e.g., alpha5, beta7, gamma13)"
        ),
      period: periodSchema
        .optional()
        .default("halved")
        .describe("LOOP period: halved (2x, default) or quartered (4x)"),
    },
    async ({ startPosition, endPosition, period = "halved" }) => {
      const slice = period as Period;
      const result = getLOOPOptionsForPositionPair(
        startPosition,
        endPosition,
        slice
      );

      const output = {
        startPosition,
        endPosition,
        period,
        available: result.available.map((opt) => ({
          loopType: opt.loopType,
          name: opt.name,
          description: opt.description,
        })),
        unavailable: result.unavailable.map((opt) => ({
          loopType: opt.loopType,
          name: opt.name,
          reason: opt.reason || "Position pair not valid for this LOOP type",
        })),
        supportedTypes: ALL_LOOP_TYPES.map((t) => ({
          loopType: t,
          name: LOOP_TYPE_LABELS[t],
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }
  );

  // Tool: detect_loop_pattern
  server.tool(
    "detect_loop_pattern",
    "Analyze a sequence to detect if it's circular and identify LOOP transformation patterns (rotated, mirrored, swapped, inverted). Useful for understanding what kind of LOOP a word produces.",
    {
      word: z
        .string()
        .describe('The sequence word to analyze, e.g., "DJII" or "AABB"'),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode: diamond (default), box, or skewed"),
      maxAttempts: z
        .number()
        .optional()
        .default(500)
        .describe("Maximum generation attempts"),
    },
    async ({ word, gridMode = "diamond", maxAttempts = 500 }) => {
      const allPictographs = ensureDataLoaded(gridMode);
      const letters = parseWordToLetters(word.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No valid letters in "${word}". Use list_available_letters to see valid letters.`,
            },
          ],
          isError: true,
        };
      }

      const result = buildSequenceFromLetters(
        letters,
        allPictographs,
        maxAttempts
      );

      if (!result.isValid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate sequence for "${word}": ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      const detection = detectLOOPFromSteps(result.steps);
      const circular = isSequenceCircular(result.steps);

      const output = {
        word: result.word,
        isCircular: circular,
        startPosition: result.startPosition,
        endPosition: result.endPosition,
        stepCount: result.steps.length - 1,
        detection: {
          components: detection.components,
          isFreeform: detection.isFreeform,
          rotationDirection: detection.rotationDirection,
          description: detection.description,
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }
  );

  // Tool: generate_loop_sequence
  server.tool(
    "generate_loop_sequence",
    "Generate a complete LOOP sequence from a word + LOOP type. Returns the circular sequence data with all transformed steps as JSON. For visual output, use generate_loop_image or view_loop_sequence instead.",
    {
      word: z.string().describe('The sequence word, e.g., "CAKE"'),
      loopType: loopTypeSchema.describe("LOOP type to apply"),
      period: periodSchema
        .optional()
        .default("halved")
        .describe("LOOP period: halved (2x, default) or quartered (4x)"),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode: diamond (default), box, or skewed"),
      maxAttempts: z
        .number()
        .optional()
        .default(500)
        .describe(
          "Maximum generation attempts (default 500 handles complex words)"
        ),
      leftStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the left prop (default: "in")'
        ),
      rightStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the right prop (default: "in")'
        ),
    },
    async ({
      word,
      loopType,
      period = "halved",
      gridMode = "diamond",
      maxAttempts = 500,
      leftStartOrientation,
      rightStartOrientation,
    }) => {
      const allPictographs = ensureDataLoaded(gridMode);

      // Parse word to individual letters
      let letters = parseWordToLetters(word.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot generate sequence: no valid letters in "${word}"`,
            },
          ],
          isError: true,
        };
      }

      // Build the base sequence first
      let baseResult = buildSequenceFromLetters(
        letters,
        allPictographs,
        maxAttempts
      );

      if (!baseResult.isValid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate base sequence for "${word}": ${baseResult.error}`,
            },
          ],
          isError: true,
        };
      }

      const loopTypeValue = loopType as LOOPType;
      const slice = period as Period;

      // Retry loop: keep generating until we get a LOOP-compatible sequence
      // The bridge letter is determined by the end position, but rebuilding may land on a different position
      let loopResult;
      let bridgeAdded: string | null = null;

      for (let loopAttempt = 0; loopAttempt < maxAttempts; loopAttempt++) {
        // Regenerate base sequence each attempt (randomness may produce different end positions)
        if (loopAttempt > 0) {
          baseResult = buildSequenceFromLetters(letters, allPictographs, 1);
          if (!baseResult.isValid) continue;
        }

        // Check if this base result is LOOP-compatible or can be bridged
        const bridgeResult = autoBridgeForLoop(
          baseResult.word,
          letters,
          baseResult.startPosition,
          baseResult.endPosition,
          loopTypeValue,
          slice,
          allPictographs
        );

        let finalLetters = letters;
        let finalResult = baseResult;

        if (bridgeResult.bridgeAdded) {
          finalLetters = bridgeResult.letters;
          finalResult = buildSequenceFromLetters(
            finalLetters,
            allPictographs,
            1
          );

          if (!finalResult.isValid) continue;

          const positionPair = `${finalResult.startPosition},${finalResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
          bridgeAdded = bridgeResult.bridgeAdded;
        } else {
          const positionPair = `${baseResult.startPosition},${baseResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
        }

        loopResult = executeLOOP(
          finalResult.steps,
          finalResult.word,
          loopTypeValue,
          slice,
          allPictographs
        );

        if (loopResult.success) {
          baseResult = finalResult;
          break;
        }
      }

      if (!loopResult || !loopResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate LOOP sequence: Could not find compatible position after ${maxAttempts} attempts`,
            },
          ],
          isError: true,
        };
      }

      if (leftStartOrientation || rightStartOrientation) {
        loopResult.steps = recalculateOrientationsWithOverrides(
          loopResult.steps,
          leftStartOrientation,
          rightStartOrientation
        );
      }

      const output = {
        word: loopResult.word,
        loopWord: loopResult.loopWord,
        seedWord: loopResult.seedWord,
        derivedWord: loopResult.derivedWord,
        loopType: loopResult.loopType,
        period: loopResult.period,
        isCircular: loopResult.isCircular,
        stepCount: loopResult.steps.length - 1,
        startPosition: baseResult.startPosition,
        endPosition:
          loopResult.steps[loopResult.steps.length - 1]?.endPosition || "",
        derivedBeatIndices: loopResult.derivedBeatIndices,
        steps: loopResult.steps.map((step, i) => ({
          stepNumber: i,
          letter: step.letter,
          isDerived: loopResult.derivedBeatIndices.includes(i),
          startPosition: step.startPosition,
          endPosition: step.endPosition,
          leftMotion: {
            startLocation: step.leftMotion.startLocation,
            endLocation: step.leftMotion.endLocation,
            motionType: step.leftMotion.motionType,
            rotationDirection: step.leftMotion.rotationDirection,
          },
          rightMotion: {
            startLocation: step.rightMotion.startLocation,
            endLocation: step.rightMotion.endLocation,
            motionType: step.rightMotion.motionType,
            rotationDirection: step.rightMotion.rotationDirection,
          },
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    }
  );

  // Tool: generate_loop_image
  server.tool(
    "generate_loop_image",
    "Generate a choreo card image for a LOOP sequence. Displays the complete circular sequence as a composite image.",
    {
      word: z.string().describe('The sequence word, e.g., "CAKE"'),
      loopType: loopTypeSchema.describe("LOOP type to apply"),
      period: periodSchema.optional().default("halved").describe("LOOP period"),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode"),
      layout: z
        .enum(["grid", "strip"])
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.layout)
        .describe("Layout: grid (square) or strip (single row)"),
      cellSize: z
        .number()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize)
        .describe("Size of each pictograph cell in pixels"),
      showStepNumbers: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers)
        .describe("Show beat numbers"),
      showWord: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showWord)
        .describe("Show word header"),
      darkMode: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode)
        .describe("Use dark background"),
      primaryPropColors: primaryPropColorsSchema
        .optional()
        .describe("Custom left/right colors for every hand-colored card mark"),
      maxAttempts: z
        .number()
        .optional()
        .default(500)
        .describe(
          "Maximum generation attempts (default 500 handles complex words)"
        ),
      loopComponents: loopComponentsSchema,
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe(
          "Difficulty level: 1=beginner (0 turns only), 2=intermediate (0-3 whole turns), 3=advanced (0-3 plus halves and float)"
        ),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe(
          "Maximum turn intensity (0-3). Each motion gets a random turn value from 0 up to this max. Defaults to 0 for level 1, 3 for level 2-3."
        ),
      userName: z.string().optional().describe("Username for footer"),
      notes: z.string().optional().describe("Notes for footer"),
      birthday: z
        .string()
        .optional()
        .describe("Birthday/creation date in ISO format"),
      leftStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the left prop (default: "in")'
        ),
      rightStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the right prop (default: "in")'
        ),
    },
    async ({
      word,
      loopType,
      period = "halved",
      gridMode = "diamond",
      layout = COMPOSER_CARD_EXPORT_PROFILE_V1.layout,
      cellSize = COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize,
      showStepNumbers = COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
      showWord = COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
      darkMode = COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode,
      primaryPropColors,
      maxAttempts = 500,
      loopComponents,
      level = 1,
      turnIntensity,
      userName,
      notes,
      birthday,
      leftStartOrientation,
      rightStartOrientation,
    }) => {
      const allPictographs = ensureDataLoaded(gridMode);

      // Parse word to individual letters
      let letters = parseWordToLetters(word.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot generate sequence: no valid letters in "${word}"`,
            },
          ],
          isError: true,
        };
      }

      // Build the base sequence
      let baseResult = buildSequenceFromLetters(
        letters,
        allPictographs,
        maxAttempts
      );

      if (!baseResult.isValid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate base sequence for "${word}": ${baseResult.error}`,
            },
          ],
          isError: true,
        };
      }

      const loopTypeValue = loopType as LOOPType;
      const slice = period as Period;

      let loopResult;
      let bridgeAddedFinal: string | null = null;

      for (let loopAttempt = 0; loopAttempt < maxAttempts; loopAttempt++) {
        if (loopAttempt > 0) {
          baseResult = buildSequenceFromLetters(letters, allPictographs, 1);
          if (!baseResult.isValid) continue;
        }

        const bridgeResult = autoBridgeForLoop(
          baseResult.word,
          letters,
          baseResult.startPosition,
          baseResult.endPosition,
          loopTypeValue,
          slice,
          allPictographs
        );

        let finalLetters = letters;
        let finalResult = baseResult;

        if (bridgeResult.bridgeAdded) {
          finalLetters = bridgeResult.letters;
          finalResult = buildSequenceFromLetters(
            finalLetters,
            allPictographs,
            1
          );

          if (!finalResult.isValid) continue;

          const positionPair = `${finalResult.startPosition},${finalResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
          bridgeAddedFinal = bridgeResult.bridgeAdded;
        } else {
          const positionPair = `${baseResult.startPosition},${baseResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
        }

        loopResult = executeLOOP(
          finalResult.steps,
          finalResult.word,
          loopTypeValue,
          slice,
          allPictographs
        );

        if (loopResult.success) {
          baseResult = finalResult;
          break;
        }
      }

      if (!loopResult || !loopResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate LOOP sequence: Could not find compatible position after ${maxAttempts} attempts`,
            },
          ],
          isError: true,
        };
      }

      // Apply orientation overrides if specified
      if (leftStartOrientation || rightStartOrientation) {
        loopResult.steps = recalculateOrientationsWithOverrides(
          loopResult.steps,
          leftStartOrientation,
          rightStartOrientation
        );
      }

      try {
        // Parse birthday string to Date if provided
        const birthdayDate = birthday ? new Date(birthday) : undefined;

        const effectiveLoopComponents =
          loopComponents ?? decomposeLoopType(loopType);
        const parsedLoopComponents = effectiveLoopComponents.map(
          componentStringToEnum
        );

        // Allocate turns for each step
        const stepCount = loopResult.steps.length - 1;
        const turnAllocation = allocateTurns(stepCount, level, turnIntensity);

        // Render composite image
        // Pass derivedBeatIndices so the renderer can dim the transformed beats
        // Simplify word label if it's a repetition (e.g., "ABCABC" → "ABC")
        const displayWord = simplifyRepeatedWord(loopResult.loopWord);
        const pngBuffer = await renderSequenceToImage(
          loopResult.steps,
          displayWord,
          {
            layout,
            cellSize,
            showStepNumbers,
            showWord,
            darkMode,
            padding: COMPOSER_CARD_EXPORT_PROFILE_V1.padding,
            showDifficulty: COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty,
            showFooter: Boolean(notes && notes !== "none"),
            startPositionLayout:
              COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
            userName,
            notes,
            birthday: birthdayDate,
            level,
            turnAllocation,
            loopComponents: parsedLoopComponents,
            derivedBeatIndices: loopResult.derivedBeatIndices,
            seedWord: loopResult.seedWord,
            primaryPropColors,
          }
        );

        // AUTO-OPEN: Save to temp and open immediately
        saveAndOpenImage(pngBuffer, `loop-${word}`);

        // Convert to base64
        const base64 = pngBuffer.toString("base64");

        return {
          content: [
            {
              type: "text" as const,
              text: `## LOOP Sequence: ${loopResult.loopWord}\n\n**Original word:** ${word}\n**LOOP type:** ${loopType}\n**Period:** ${period}\n**Beats:** ${stepCount}`,
            },
            {
              type: "image" as const,
              data: base64,
              mimeType: "image/png",
              _meta: {
                rendererProfile: COMPOSER_CARD_EXPORT_PROFILE_V1.version,
              },
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to render LOOP image: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: view_loop_sequence
  // Opens the LOOP sequence in system viewer without returning image data (saves tokens)
  server.tool(
    "view_loop_sequence",
    "Generate a LOOP sequence choreo card and open it in the system image viewer. Returns only confirmation text - NO image data returned. Use this when the USER needs to see the LOOP sequence but Claude doesn't need to analyze it. Saves ~30-100k tokens compared to generate_loop_image.",
    {
      word: z.string().describe('The sequence word, e.g., "CAKE"'),
      loopType: loopTypeSchema.describe("LOOP type to apply"),
      period: periodSchema.optional().default("halved").describe("LOOP period"),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode"),
      layout: z
        .enum(["grid", "strip"])
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.layout)
        .describe("Layout: grid (square) or strip (single row)"),
      cellSize: z
        .number()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize)
        .describe("Size of each pictograph cell in pixels"),
      showStepNumbers: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers)
        .describe("Show beat numbers"),
      showWord: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showWord)
        .describe("Show word header"),
      darkMode: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode)
        .describe("Use dark background"),
      primaryPropColors: primaryPropColorsSchema
        .optional()
        .describe("Custom left/right colors for every hand-colored card mark"),
      maxAttempts: z
        .number()
        .optional()
        .default(500)
        .describe(
          "Maximum generation attempts (default 500 handles complex words)"
        ),
      loopComponents: loopComponentsSchema,
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe(
          "Difficulty level: 1=beginner (0 turns only), 2=intermediate (0-3 whole turns), 3=advanced (0-3 plus halves and float)"
        ),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe(
          "Maximum turn intensity (0-3). Each motion gets a random turn value from 0 up to this max. Defaults to 0 for level 1, 3 for level 2-3."
        ),
      userName: z.string().optional().describe("Username for footer"),
      notes: z.string().optional().describe("Notes for footer"),
      birthday: z
        .string()
        .optional()
        .describe("Birthday/creation date in ISO format"),
      leftStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the left prop (default: "in")'
        ),
      rightStartOrientation: orientationEnum
        .optional()
        .describe(
          'Override starting orientation for the right prop (default: "in")'
        ),
    },
    async ({
      word,
      loopType,
      period = "halved",
      gridMode = "diamond",
      layout = COMPOSER_CARD_EXPORT_PROFILE_V1.layout,
      cellSize = COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize,
      showStepNumbers = COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
      showWord = COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
      darkMode = COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode,
      primaryPropColors,
      maxAttempts = 500,
      loopComponents,
      level = 1,
      turnIntensity,
      userName,
      notes,
      birthday,
      leftStartOrientation,
      rightStartOrientation,
    }) => {
      const allPictographs = ensureDataLoaded(gridMode);

      // Parse word to individual letters
      let letters = parseWordToLetters(word.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot generate sequence: no valid letters in "${word}"`,
            },
          ],
          isError: true,
        };
      }

      // Build the base sequence
      let baseResult = buildSequenceFromLetters(
        letters,
        allPictographs,
        maxAttempts
      );

      if (!baseResult.isValid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate base sequence for "${word}": ${baseResult.error}`,
            },
          ],
          isError: true,
        };
      }

      const loopTypeValue = loopType as LOOPType;
      const slice = period as Period;

      let loopResult;
      let bridgeAdded: string | null = null;

      for (let loopAttempt = 0; loopAttempt < maxAttempts; loopAttempt++) {
        if (loopAttempt > 0) {
          baseResult = buildSequenceFromLetters(letters, allPictographs, 1);
          if (!baseResult.isValid) continue;
        }

        const bridgeResult = autoBridgeForLoop(
          baseResult.word,
          letters,
          baseResult.startPosition,
          baseResult.endPosition,
          loopTypeValue,
          slice,
          allPictographs
        );

        let finalLetters = letters;
        let finalResult = baseResult;

        if (bridgeResult.bridgeAdded) {
          finalLetters = bridgeResult.letters;
          finalResult = buildSequenceFromLetters(
            finalLetters,
            allPictographs,
            1
          );

          if (!finalResult.isValid) continue;

          const positionPair = `${finalResult.startPosition},${finalResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
          bridgeAdded = bridgeResult.bridgeAdded;
        } else {
          const positionPair = `${baseResult.startPosition},${baseResult.endPosition}`;
          if (!isLOOPValidForPositionPair(loopTypeValue, positionPair, slice)) {
            continue;
          }
        }

        loopResult = executeLOOP(
          finalResult.steps,
          finalResult.word,
          loopTypeValue,
          slice,
          allPictographs
        );

        if (loopResult.success) {
          baseResult = finalResult;
          break;
        }
      }

      if (!loopResult || !loopResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate LOOP sequence: Could not find compatible position after ${maxAttempts} attempts`,
            },
          ],
          isError: true,
        };
      }

      // Apply orientation overrides if specified
      if (leftStartOrientation || rightStartOrientation) {
        loopResult.steps = recalculateOrientationsWithOverrides(
          loopResult.steps,
          leftStartOrientation,
          rightStartOrientation
        );
      }

      try {
        // Parse birthday string to Date if provided
        const birthdayDate = birthday ? new Date(birthday) : undefined;

        const effectiveLoopComponents =
          loopComponents ?? decomposeLoopType(loopType);
        const parsedLoopComponents = effectiveLoopComponents.map(
          componentStringToEnum
        );

        // Allocate turns for each step
        const stepCount = loopResult.steps.length - 1;
        const turnAllocation = allocateTurns(stepCount, level, turnIntensity);

        // Render composite image with derivedBeatIndices for proper dimming
        // Simplify word label if it's a repetition (e.g., "ABCABC" → "ABC")
        const displayWord = simplifyRepeatedWord(loopResult.loopWord);
        const pngBuffer = await renderSequenceToImage(
          loopResult.steps,
          displayWord,
          {
            layout,
            cellSize,
            showStepNumbers,
            showWord,
            darkMode,
            padding: COMPOSER_CARD_EXPORT_PROFILE_V1.padding,
            showDifficulty: COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty,
            showFooter: Boolean(notes && notes !== "none"),
            startPositionLayout:
              COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
            userName,
            notes,
            birthday: birthdayDate,
            level,
            turnAllocation,
            loopComponents: parsedLoopComponents,
            derivedBeatIndices: loopResult.derivedBeatIndices,
            seedWord: loopResult.seedWord,
            primaryPropColors,
          }
        );

        saveAndOpenImage(pngBuffer, `loop-${word}`);

        const bridgeNote = bridgeAdded ? `\nBridge added: ${bridgeAdded}` : "";
        return {
          content: [
            {
              type: "image" as const,
              data: pngBuffer.toString("base64"),
              mimeType: "image/png",
              _meta: {
                rendererProfile: COMPOSER_CARD_EXPORT_PROFILE_V1.version,
              },
            },
            {
              type: "text" as const,
              text: `${loopType} LOOP "${loopResult.loopWord}" — ${stepCount} beats\nSeed: ${loopResult.seedWord}${bridgeNote}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to render LOOP image: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
