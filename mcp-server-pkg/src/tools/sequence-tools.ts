/**
 * Sequence Generation Tools
 *
 * Primary tools:
 * - generate_sequence: Generate and open in viewer (default choice)
 * - get_sequence_data: Get data only, no image (for Claude analysis)
 *
 * Utility tools:
 * - parse_constraints: Debug constraint parsing
 * - analyze_word_feasibility: Check if constraints are achievable for a word
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
  generateChainableSequence,
  type SequenceResult,
  type BridgeSelections,
} from "../core/sequence-builder.js";
import { renderSequenceToImage } from "../core/sequence-renderer.js";
import { allocateTurns } from "../core/turn-allocator.js";
import { simplifyRepeatedWord } from "../core/word-simplifier.js";
import { recalculateOrientationsWithOverrides } from "../core/orientation-propagation.js";
import {
  LOOPType,
  Period,
  detectLOOPFromSteps,
  executeLOOP,
  isLOOPValidForPlacementPair,
  loopTypeSchema,
  periodSchema,
  loopComponentsSchema,
  decomposeLoopType,
  componentStringToEnum,
  autoBridgeForLoop,
  LOOPComponent,
  type LOOPComponentId,
} from "../core/loop/index.js";
import {
  parseConstraintSet,
  parseConstraints,
  emptyConstraintSet,
  getPresetConstraintSet,
  buildConstrainedSequence,
  listPresets,
  getTransitionMatrix,
  analyzeWordFeasibility,
  suggestAlternatives,
  explainConstraintImpossibility,
  type PresetName,
  type ConstraintSet,
} from "../core/constraints/index.js";
import type { PictographData } from "../types/pictograph.js";

function buildSequenceWithConstraints(
  letters: string[],
  allPictographs: PictographData[],
  constraintSet: ConstraintSet,
  maxAttempts: number,
  parsedBridgeSelections?: BridgeSelections
): { result: SequenceResult | null; error?: string } {
  const useConstrainedBuilder =
    constraintSet.hard.length > 0 || constraintSet.soft.length > 0;

  if (useConstrainedBuilder) {
    const constrainedResult = buildConstrainedSequence({
      letters,
      allPictographs,
      constraintSet,
      beamConfig: { maxBacktracks: maxAttempts },
    });

    if (!constrainedResult.success && !constrainedResult.steps.length) {
      return { result: null, error: constrainedResult.error };
    }

    // Create a Set from bridgeStepIndices for O(1) lookup
    const bridgeIndicesSet = new Set(constrainedResult.bridgeStepIndices ?? []);

    return {
      result: {
        word: constrainedResult.word,
        steps: constrainedResult.steps.map((step, i) => ({
          letter: step.letter,
          variation: constrainedResult.variationIndices[i] ?? 0,
          startPlacement: step.startPlacement,
          endPlacement: step.endPlacement,
          leftMotion: step.leftMotion,
          rightMotion: step.rightMotion,
          stepNumber: i,
          isBridge: bridgeIndicesSet.has(i),
        })),
        startPlacement: constrainedResult.startPlacement,
        endPlacement: constrainedResult.endPlacement,
        isValid: true,
        bridgeStepIndices: constrainedResult.bridgeStepIndices,
      },
    };
  }

  // Legacy builder for unconstrained generation
  const result = buildSequenceFromLetters(
    letters,
    allPictographs,
    maxAttempts,
    parsedBridgeSelections
  );
  return { result };
}

/**
 * Parse constraints from preset or natural language string.
 */
function resolveConstraintSet(
  constraintPreset?: string,
  constraints?: string
): ConstraintSet {
  if (constraintPreset) {
    const presetConstraints = getPresetConstraintSet(
      constraintPreset as PresetName
    );
    if (presetConstraints) return presetConstraints;
  } else if (constraints) {
    const parsed = parseConstraintSet(constraints);
    return parsed.constraintSet;
  }
  return emptyConstraintSet();
}

function convertLOOPComponentsToEnum(
  components: LOOPComponentId[]
): LOOPComponent[] {
  return components.map(componentStringToEnum);
}

export function registerSequenceTools(server: McpServer): void {
  server.tool(
    "parse_constraints",
    "Parse a natural language constraint string without generating a sequence. Useful for understanding how constraints will be interpreted.",
    {
      constraints: z
        .string()
        .describe(
          'Natural language constraints to parse, e.g., "maximize flow with the left hand clockwise"'
        ),
    },
    async ({ constraints }) => {
      const result = parseConstraints(constraints);

      const output = {
        recognized: result.constraints.map((c) => ({
          type: c.type,
          mode: c.mode,
          description: c.description,
        })),
        unrecognized: result.unrecognized,
        confidence: Math.round(result.confidence * 100) / 100,
        normalized: result.normalized,
        warnings: result.warnings,
      };

      // Also list available presets
      const presets = listPresets();

      return {
        content: [
          {
            type: "text" as const,
            text: `## Parsed Constraints\n\n${JSON.stringify(output, null, 2)}\n\n## Available Presets\n\n${presets.map((p) => `- **${p.name}**: ${p.description}`).join("\n")}`,
          },
        ],
      };
    }
  );

  server.tool(
    "analyze_word_feasibility",
    "Analyze whether specific constraints are achievable for a word BEFORE attempting generation. Returns detailed feasibility report including which transitions block certain constraints and suggests alternatives.",
    {
      word: z
        .string()
        .describe('The word to analyze, e.g., "DICKWIPE" or "ABC"'),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode to analyze"),
    },
    async ({ word, gridMode = "diamond" }) => {
      const allPictographs = ensureDataLoaded(gridMode);
      const letters = parseWordToLetters(word.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot analyze: no valid letters in "${word}"`,
            },
          ],
          isError: true,
        };
      }

      if (letters.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Single-letter words have no transitions to analyze. All constraints are trivially satisfiable.`,
            },
          ],
        };
      }

      const matrix = getTransitionMatrix(allPictographs, gridMode);

      // Analyze the word
      const feasibility = analyzeWordFeasibility(word, letters, matrix);

      // Build response
      const sections: string[] = [];

      sections.push(`## Word Feasibility Analysis: "${word}"\n`);
      sections.push(`Letters: ${letters.join(" → ")}`);
      sections.push(`Total transitions: ${letters.length - 1}\n`);

      // Constraint feasibility summary
      sections.push(`### Constraint Feasibility\n`);
      sections.push(`| Constraint | Achievable | Details |`);
      sections.push(`|------------|------------|---------|`);

      // No handpath reversals
      const noHandStatus = feasibility.canAvoidAllHandReversals
        ? "✅ Yes"
        : "❌ No";
      const noHandDetails = feasibility.canAvoidAllHandReversals
        ? "All transitions can maintain continuous hand paths"
        : `${feasibility.handReversalBlockers.length} blocking transition(s)`;
      sections.push(
        `| No handpath reversals | ${noHandStatus} | ${noHandDetails} |`
      );

      // No prop reversals
      const noPropStatus = feasibility.canAvoidAllPropReversals
        ? "✅ Yes"
        : "❌ No";
      const noPropDetails = feasibility.canAvoidAllPropReversals
        ? "All transitions can maintain consistent prop spin"
        : `${feasibility.propReversalBlockers.length} blocking transition(s)`;
      sections.push(
        `| No prop reversals | ${noPropStatus} | ${noPropDetails} |`
      );

      // Hand reversal every beat
      const everyHandStatus = feasibility.canHaveHandReversalEveryBeat
        ? "✅ Yes"
        : "❌ No";
      const everyHandDetails = feasibility.canHaveHandReversalEveryBeat
        ? "All transitions can produce a hand reversal"
        : `${feasibility.noHandReversalPossible.length} transition(s) are always continuous`;
      sections.push(
        `| Hand reversal every beat | ${everyHandStatus} | ${everyHandDetails} |`
      );

      // Reversal range
      sections.push(`\n### Reversal Range\n`);
      sections.push(
        `- **Handpath reversals:** ${feasibility.minHandReversals} (minimum) to ${feasibility.maxHandReversals} (maximum) out of ${letters.length - 1} transitions`
      );
      sections.push(
        `- **Prop reversals:** ${feasibility.minPropReversals} (minimum) to ${feasibility.maxPropReversals} (maximum) out of ${letters.length - 1} transitions`
      );

      // Blocking transitions
      if (feasibility.handReversalBlockers.length > 0) {
        sections.push(`\n### Transitions That ALWAYS Require Hand Reversal\n`);
        sections.push(
          feasibility.handReversalBlockers.map((t) => `- ${t}`).join("\n")
        );
        const explanation = explainConstraintImpossibility(
          feasibility,
          "no-hand-reversals"
        );
        if (explanation) {
          sections.push(`\n*${explanation}*`);
        }
      }

      if (feasibility.propReversalBlockers.length > 0) {
        sections.push(`\n### Transitions That ALWAYS Require Prop Reversal\n`);
        sections.push(
          feasibility.propReversalBlockers.map((t) => `- ${t}`).join("\n")
        );
      }

      if (
        feasibility.noHandReversalPossible.length > 0 &&
        !feasibility.canHaveHandReversalEveryBeat
      ) {
        sections.push(
          `\n### Transitions That Can NEVER Produce Hand Reversal\n`
        );
        sections.push(
          feasibility.noHandReversalPossible.map((t) => `- ${t}`).join("\n")
        );
        const explanation = explainConstraintImpossibility(
          feasibility,
          "hand-reversal-every-beat"
        );
        if (explanation) {
          sections.push(`\n*${explanation}*`);
        }
      }

      // Suggestions
      const suggestions = suggestAlternatives(feasibility);
      if (suggestions.length > 0) {
        sections.push(`\n### Suggestions\n`);
        sections.push(suggestions.map((s) => `💡 ${s}`).join("\n\n"));
      }

      // Recommended presets
      sections.push(`\n### Recommended Presets for This Word\n`);
      if (
        feasibility.canAvoidAllHandReversals &&
        feasibility.canAvoidAllPropReversals
      ) {
        sections.push(
          `- **smooth** - Maximize overall flow (both hand and prop continuity achievable)`
        );
      } else if (feasibility.canAvoidAllHandReversals) {
        sections.push(
          `- **smooth-hands** - Maximize hand path continuity (achievable for this word)`
        );
      } else if (feasibility.canAvoidAllPropReversals) {
        sections.push(
          `- **smooth-props** - Maximize prop spin continuity (achievable for this word)`
        );
      } else {
        sections.push(
          `- **smooth** - Will minimize reversals even though zero isn't achievable`
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  server.tool(
    "get_sequence_data",
    "Get sequence data without rendering an image. Use when Claude needs to analyze step data, check placements, or verify generation before showing to user. For showing sequences to users, use generate_sequence instead.",
    {
      word: z.string().describe('The sequence word, e.g., "ABC" or "DEFGH"'),
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
      bridgeSelections: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          'Map of bridge transition index to preferred bridge option index. E.g., {"0": 1} uses the 2nd bridge option for the first bridge needed.'
        ),
      constraints: z
        .string()
        .optional()
        .describe(
          'Natural language constraints, e.g., "maximize continuity, all pro motions", "smooth flow with the left hand clockwise"'
        ),
      constraintPreset: z
        .enum([
          "smooth",
          "smooth-hands",
          "smooth-props",
          "reversal",
          "isolation",
          "antispin",
          "pro-cw",
          "anti-ccw",
          "no-dash",
          "maximize-dash",
          "maximum-chaos",
        ])
        .optional()
        .describe(
          "Predefined constraint preset: smooth (maximize continuity), reversal (break every beat), isolation (all pro), antispin (all anti), pro-cw, anti-ccw, no-dash, maximize-dash (prefer Type 4/5 letters), maximum-chaos, smooth-hands (hand path continuity), smooth-props (prop spin continuity)"
        ),
      compact: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Compact output - summary only without full step data (saves ~2000+ tokens for long sequences)"
        ),
    },
    async ({
      word,
      gridMode = "diamond",
      maxAttempts = 500,
      bridgeSelections,
      constraints,
      constraintPreset,
      compact = false,
    }) => {
      const allPictographs = ensureDataLoaded(gridMode);

      const letters = parseWordToLetters(word.toUpperCase());

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

      let constraintSet = emptyConstraintSet();
      let parseResult: ReturnType<typeof parseConstraints> | undefined;

      if (constraintPreset) {
        const presetConstraints = getPresetConstraintSet(
          constraintPreset as PresetName
        );
        if (presetConstraints) {
          constraintSet = presetConstraints;
        }
      } else if (constraints) {
        const parsed = parseConstraintSet(constraints);
        constraintSet = parsed.constraintSet;
        parseResult = parsed.parseResult;
      }

      const useConstrainedBuilder =
        constraintSet.hard.length > 0 || constraintSet.soft.length > 0;

      if (useConstrainedBuilder) {
        let feasibilityWarnings: string[] = [];
        if (letters.length >= 2) {
          const matrix = getTransitionMatrix(allPictographs, gridMode);
          const feasibility = analyzeWordFeasibility(word, letters, matrix);

          // Check if user requested constraints that can't be fully satisfied
          const hasReversalConstraint = constraintSet.soft.some(
            (c) => c.type === "reversal"
          );
          const hasHandPathEveryConstraint = constraintSet.soft.some(
            (c) => c.type === "handPath" && c.description.includes("every")
          );
          const hasContinuityConstraint = constraintSet.soft.some(
            (c) => c.type === "continuity"
          );
          const hasHandPathContinuityConstraint = constraintSet.soft.some(
            (c) => c.type === "handPath" && c.description.includes("continuous")
          );

          // Warning for reversal preset if prop reversal every beat is impossible
          if (
            hasReversalConstraint &&
            !feasibility.canHavePropReversalEveryBeat
          ) {
            feasibilityWarnings.push(
              `Prop reversal every beat is not achievable for "${word}". ` +
                `Maximum: ${feasibility.maxPropReversals}/${letters.length - 1} transitions.`
            );
          }

          // Warning for hand path reversal every beat
          if (
            hasHandPathEveryConstraint &&
            !feasibility.canHaveHandReversalEveryBeat
          ) {
            feasibilityWarnings.push(
              `Hand path reversal every beat is not achievable for "${word}". ` +
                `Maximum: ${feasibility.maxHandReversals}/${letters.length - 1} transitions.`
            );
          }

          // Warning for smooth if no prop reversals is impossible
          if (
            hasContinuityConstraint &&
            !feasibility.canAvoidAllPropReversals
          ) {
            feasibilityWarnings.push(
              `Zero prop reversals is not achievable for "${word}". ` +
                `Minimum: ${feasibility.minPropReversals} unavoidable reversal(s).`
            );
          }

          // Warning for smooth-hands if no handpath reversals is impossible
          if (
            hasHandPathContinuityConstraint &&
            !feasibility.canAvoidAllHandReversals
          ) {
            feasibilityWarnings.push(
              `Zero hand path reversals is not achievable for "${word}". ` +
                `Minimum: ${feasibility.minHandReversals} unavoidable reversal(s).`
            );
          }
        }

        const result = buildConstrainedSequence({
          letters,
          allPictographs,
          constraintSet,
          beamConfig: {
            maxBacktracks: maxAttempts,
          },
        });

        if (!result.success && !result.steps.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to generate constrained sequence for "${word}": ${result.error}`,
              },
            ],
            isError: true,
          };
        }

        const response: Record<string, unknown> = {
          word: result.word,
          steps: result.steps.map((step, i) => ({
            ...step,
            variation: result.variationIndices[i] ?? 0,
            stepNumber: i,
          })),
          startPlacement: result.startPlacement,
          endPlacement: result.endPlacement,
          stepCount: result.steps.length - 1,
          constraintReport: {
            score: result.constraintReport.score,
            satisfied: result.constraintReport.satisfied,
            details: result.constraintReport.details.map((d) => ({
              constraint: d.constraint,
              score: d.score,
              description: d.description,
              mode: d.mode,
            })),
          },
        };

        if (parseResult) {
          (
            response.constraintReport as Record<string, unknown>
          ).parseConfidence = parseResult.confidence;
          if (parseResult.unrecognized.length > 0) {
            (
              response.constraintReport as Record<string, unknown>
            ).unrecognized = parseResult.unrecognized;
          }
          if (parseResult.warnings.length > 0) {
            (response.constraintReport as Record<string, unknown>).warnings =
              parseResult.warnings;
          }
        }

        if (feasibilityWarnings.length > 0) {
          (
            response.constraintReport as Record<string, unknown>
          ).feasibilityWarnings = feasibilityWarnings;
        }

        if (result.bridges && result.bridges.length > 0) {
          response.bridges = result.bridges.map((b) => ({
            transitionIndex: b.transitionIndex,
            fromLetter: b.fromLetter,
            toLetter: b.toLetter,
            availableOptions: b.availableOptions,
            selectedBridge: b.selectedBridge,
            selectedIndex: b.selectedIndex,
            constraintScored: b.constraintScored,
          }));
        }

        if (compact) {
          const score = result.constraintReport.score;
          const satisfiedConstraints =
            result.constraintReport.details
              .filter((d) => d.score >= 0.8) // Consider 80%+ as satisfied
              .map((d) => d.constraint)
              .join(", ") || "none";
          const bridgeCount = result.bridges?.length || 0;
          return {
            content: [
              {
                type: "text" as const,
                text: `${result.word}: ${result.steps.length} beats | ${result.startPlacement}→${result.endPlacement} | Score: ${score.toFixed(2)} | Satisfied: ${satisfiedConstraints}${bridgeCount > 0 ? ` | Bridges: ${bridgeCount}` : ""}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      const parsedBridgeSelections: BridgeSelections | undefined =
        bridgeSelections
          ? Object.fromEntries(
              Object.entries(bridgeSelections).map(([k, v]) => [
                parseInt(k, 10),
                v,
              ])
            )
          : undefined;

      const result = buildSequenceFromLetters(
        letters,
        allPictographs,
        maxAttempts,
        parsedBridgeSelections
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

      // Compact mode - summary only
      if (compact) {
        const bridgeCount = result.bridges?.length || 0;
        return {
          content: [
            {
              type: "text" as const,
              text: `${result.word}: ${result.steps.length} beats | ${result.startPlacement}→${result.endPlacement}${bridgeCount > 0 ? ` | Bridges: ${bridgeCount}` : ""}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                word: result.word,
                steps: result.steps,
                startPlacement: result.startPlacement,
                endPlacement: result.endPlacement,
                stepCount: result.steps.length - 1,
                bridges: result.bridges,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "generate_sequence",
    "Generate a TKA sequence. If no word or length given, defaults to Austen's preferred config: rotated LOOP, quartered period (16 beats), 4 random letters, level 2, turn intensity 1, smooth constraints. Supports all 15 LOOP types. Returns image inline.",
    {
      word: z
        .string()
        .optional()
        .describe(
          'The sequence word, e.g., "ABC". Optional if length is provided.'
        ),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode: diamond (default), box, or skewed"),
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
        .describe("Show beat numbers overlaid on each pictograph"),
      showWord: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showWord)
        .describe("Show word header at the top"),
      displayWord: z
        .string()
        .optional()
        .describe(
          "Override the word shown in the header. Use when generating extra letters (e.g., word='CAKEQ' but displayWord='CAKE' shows 'CAKE' in header while generating all 5 letters)"
        ),
      darkMode: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode)
        .describe("Use dark background"),
      exportProfile: z
        .enum(["composer", "print"])
        .optional()
        .describe("Card export profile"),
      columnCount: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Requested card grid column count"),
      primaryPropColors: z
        .object({
          left: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
          right: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
        })
        .optional()
        .describe(
          'Custom left/right hand colors as hex values, e.g. { left: "#00e5ff", right: "#ff2ea6" }. Applied consistently to props, arrows, turn labels, reversal dots, and mandalas.'
        ),
      leftPropType: z
        .string()
        .nullable()
        .optional()
        .describe("Left-hand prop type; defaults to staff when omitted"),
      rightPropType: z
        .string()
        .nullable()
        .optional()
        .describe("Right-hand prop type; defaults to staff when omitted"),
      fanAppearance: z
        .object({
          build: z.enum([
            "pictograph",
            "fire",
            "flat-grip",
            "lotus",
            "day",
            "moon",
          ]),
          frameColor: z.enum(["black", "white"]),
          cover: z.enum(["bare", "covered"]),
        })
        .optional()
        .describe("Physical build for either fan or bigfan hand"),
      maxAttempts: z
        .number()
        .optional()
        .default(500)
        .describe(
          "Maximum generation attempts (default 500 handles complex words)"
        ),
      showDifficulty: z
        .boolean()
        .optional()
        .describe("Show difficulty level badge in header"),
      userName: z
        .string()
        .optional()
        .describe("Username to show in footer (bottom-left)"),
      notes: z
        .string()
        .optional()
        .describe("Notes to show in footer (bottom-center)"),
      birthday: z
        .string()
        .optional()
        .describe(
          "Birthday/creation date in ISO format (bottom-right), e.g., '2024-01-15'"
        ),
      bridgeSelections: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          "Map of bridge transition index to preferred bridge option index."
        ),
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .default(2)
        .describe(
          "Difficulty level: 1=beginner (0 turns only), 2=intermediate (0-3 whole turns), 3=advanced (0-3 plus halves and float)"
        ),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .default(1)
        .describe("Maximum turn intensity (0-3). Default 1."),
      loopComponents: loopComponentsSchema,
      constraints: z
        .string()
        .optional()
        .describe(
          'Natural language constraints, e.g., "maximize continuity, all pro motions"'
        ),
      constraintPreset: z
        .enum([
          "smooth",
          "smooth-hands",
          "smooth-props",
          "reversal",
          "isolation",
          "antispin",
          "pro-cw",
          "anti-ccw",
          "no-dash",
          "maximize-dash",
          "maximum-chaos",
        ])
        .optional()
        .describe("Predefined constraint preset"),
      showReversals: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showReversals)
        .describe(
          "Show reversal indicators (colored dots on left edge when prop direction changes from previous step). Defaults to true."
        ),
      loopType: loopTypeSchema
        .optional()
        .describe(
          "LOOP transformation to apply. When set, the seed word is generated first, then the LOOP transformation doubles/quadruples it into a circular sequence."
        ),
      period: periodSchema
        .optional()
        .default("quartered")
        .describe(
          "LOOP period: quartered (4x, default) or halved (2x). Only used when loopType is set."
        ),
      leftStartOrientation: z
        .enum([
          "in",
          "out",
          "clock",
          "counter",
          "clockIn",
          "clockOut",
          "counterIn",
          "counterOut",
        ])
        .optional()
        .describe(
          'Override starting orientation for the left prop (default: "in")'
        ),
      rightStartOrientation: z
        .enum([
          "in",
          "out",
          "clock",
          "counter",
          "clockIn",
          "clockOut",
          "counterIn",
          "counterOut",
        ])
        .optional()
        .describe(
          'Override starting orientation for the right prop (default: "in")'
        ),
      length: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe(
          "Generate a random word of this length instead of specifying a word. Ignored if word is provided."
        ),
    },
    async (input) => {
      const {
        word,
        gridMode = "diamond",
        layout = COMPOSER_CARD_EXPORT_PROFILE_V1.layout,
        cellSize = COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize,
        showStepNumbers = COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
        showWord = COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
        displayWord,
        darkMode = COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode,
        exportProfile,
        columnCount,
        primaryPropColors,
        leftPropType,
        rightPropType,
        fanAppearance,
        maxAttempts = 500,
        showDifficulty,
        userName,
        notes,
        birthday,
        bridgeSelections,
        level = 2,
        turnIntensity = 1,
        loopComponents,
        constraints,
        showReversals = COMPOSER_CARD_EXPORT_PROFILE_V1.showReversals,
        period = "quartered",
        leftStartOrientation,
        rightStartOrientation,
        length,
      } = input;

      let effectiveLoopType = input.loopType;
      let effectiveConstraintPreset = input.constraintPreset;

      let resolvedWord = word;
      const nothingSpecified = !word && !length;
      if (!resolvedWord && length) {
        const chainedLetters = generateChainableSequence(length);
        resolvedWord = chainedLetters.join("");
      }
      if (!resolvedWord) {
        const chainedLetters = generateChainableSequence(4);
        resolvedWord = chainedLetters.join("");
      }

      if (nothingSpecified && !effectiveLoopType) {
        effectiveLoopType = "rotated";
      }
      if (nothingSpecified && !effectiveConstraintPreset && !constraints) {
        effectiveConstraintPreset = "smooth";
      }

      // Tagline guardrail — only fires when user explicitly provided a named word (not random)
      const isCreativeWordRequest =
        !!word &&
        !nothingSpecified &&
        !effectiveLoopType &&
        !loopComponents &&
        !effectiveConstraintPreset &&
        !constraints;
      if (isCreativeWordRequest && !notes) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `BLOCKED: No tagline (notes) provided for "${resolvedWord}".`,
                ``,
                `You MUST present 4 tagline options to the user BEFORE generating.`,
                ``,
                `Workflow:`,
                `1. Read humor profile: mcp-server/src/core/humor-profile.json`,
                `2. Present 4 tagline options spanning different humor lenses`,
                `3. Wait for user to pick one (or provide their own)`,
                `4. Call generate_sequence again with notes="<chosen tagline>"`,
                ``,
                `If the user explicitly said "no tagline" or "skip tagline", pass notes="none".`,
              ].join("\n"),
            },
          ],
          isError: true,
        };
      }

      const allPictographs = ensureDataLoaded(gridMode);
      let letters = parseWordToLetters(resolvedWord.toUpperCase());

      if (letters.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Cannot generate sequence: no valid letters in "${resolvedWord}"`,
            },
          ],
          isError: true,
        };
      }

      if (effectiveLoopType) {
        const loopTypeValue = effectiveLoopType as LOOPType;
        const slice = period as Period;

        let loopResult;
        let bridgeAdded: string | null = null;
        let baseResult;

        // Phase 1: try without bridging — exhaust all retries first
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          baseResult = buildSequenceFromLetters(
            letters,
            allPictographs,
            attempt === 0 ? maxAttempts : 1
          );
          if (!baseResult.isValid) continue;

          const pp = `${baseResult.startPlacement},${baseResult.endPlacement}`;
          if (!isLOOPValidForPlacementPair(loopTypeValue, pp, slice)) continue;

          loopResult = executeLOOP(
            baseResult.steps,
            baseResult.word,
            loopTypeValue,
            slice,
            allPictographs
          );
          if (loopResult.success) break;
        }

        // Phase 2: bridge only as last resort
        if (!loopResult || !loopResult.success) {
          loopResult = undefined;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            baseResult = buildSequenceFromLetters(
              letters,
              allPictographs,
              attempt === 0 ? maxAttempts : 1
            );
            if (!baseResult.isValid) continue;

            const bridgeResult = autoBridgeForLoop(
              baseResult.word,
              letters,
              baseResult.startPlacement,
              baseResult.endPlacement,
              loopTypeValue,
              slice,
              allPictographs
            );

            if (!bridgeResult.bridgeAdded) continue;

            const finalResult = buildSequenceFromLetters(
              bridgeResult.letters,
              allPictographs,
              1
            );
            if (!finalResult.isValid) continue;

            const pp = `${finalResult.startPlacement},${finalResult.endPlacement}`;
            if (!isLOOPValidForPlacementPair(loopTypeValue, pp, slice)) continue;

            loopResult = executeLOOP(
              finalResult.steps,
              finalResult.word,
              loopTypeValue,
              slice,
              allPictographs
            );
            if (loopResult.success) {
              baseResult = finalResult;
              bridgeAdded = bridgeResult.bridgeAdded;
              break;
            }
          }
        }

        if (!loopResult || !loopResult.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to generate ${effectiveLoopType} LOOP: no compatible placement found after ${maxAttempts} attempts`,
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

        try {
          const birthdayDate = birthday ? new Date(birthday) : undefined;
          const effectiveComponents =
            loopComponents ?? decomposeLoopType(effectiveLoopType);
          const parsedComponents = effectiveComponents.map(
            componentStringToEnum
          );
          const stepCount = loopResult.steps.length - 1;
          const turnAllocation = allocateTurns(stepCount, level, turnIntensity);
          const headerWord = simplifyRepeatedWord(loopResult.loopWord);

          const pngBuffer = await renderSequenceToImage(
            loopResult.steps,
            headerWord,
            {
              layout,
              cellSize,
              showStepNumbers,
              showWord,
              darkMode,
              exportProfile,
              columnCount,
              padding: COMPOSER_CARD_EXPORT_PROFILE_V1.padding,
              showDifficulty:
                showDifficulty ??
                (exportProfile === "print" ||
                  COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty),
              showFooter: Boolean(notes && notes !== "none"),
              startPlacementLayout:
                COMPOSER_CARD_EXPORT_PROFILE_V1.startPlacementLayout,
              userName,
              notes,
              birthday: birthdayDate,
              level,
              turnAllocation,
              loopComponents: parsedComponents,
              derivedBeatIndices: loopResult.derivedBeatIndices,
              seedWord: loopResult.seedWord,
              displayWord: headerWord,
              rotationPeriod: parsedComponents.includes(LOOPComponent.ROTATED)
                ? (period as "halved" | "quartered")
                : undefined,
              inversionPeriod: parsedComponents.includes(LOOPComponent.INVERTED)
                ? (period as "halved" | "quartered")
                : undefined,
              showReversals,
              leftPropType,
              rightPropType,
              fanAppearance,
              primaryPropColors,
            }
          );

          const tempPath = saveAndOpenImage(pngBuffer, `loop-${resolvedWord}`);
          const bridgeNote = bridgeAdded
            ? `\nBridge added: ${bridgeAdded}`
            : "";

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
                text: `${effectiveLoopType} LOOP "${headerWord}"\n${stepCount} beats, ${period} period\nSeed: ${loopResult.seedWord} → Full: ${loopResult.loopWord}${bridgeNote}`,
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to render LOOP image: ${msg}`,
              },
            ],
            isError: true,
          };
        }
      }

      const parsedBridgeSelections: BridgeSelections | undefined =
        bridgeSelections
          ? Object.fromEntries(
              Object.entries(bridgeSelections).map(([k, v]) => [
                parseInt(k, 10),
                v,
              ])
            )
          : undefined;

      const constraintSet = resolveConstraintSet(
        effectiveConstraintPreset,
        constraints
      );

      let feasibilityWarnings: string[] = [];
      const hasConstraints =
        constraintSet.hard.length > 0 || constraintSet.soft.length > 0;

      if (hasConstraints && letters.length >= 2) {
        const matrix = getTransitionMatrix(allPictographs, gridMode);
        const feasibility = analyzeWordFeasibility(
          resolvedWord,
          letters,
          matrix
        );

        const hasContinuityConstraint = constraintSet.soft.some(
          (c) => c.type === "continuity"
        );
        const hasHandPathContinuityConstraint = constraintSet.soft.some(
          (c) => c.type === "handPath" && c.description.includes("continuous")
        );
        const hasReversalConstraint = constraintSet.soft.some(
          (c) => c.type === "reversal"
        );

        if (hasContinuityConstraint && !feasibility.canAvoidAllPropReversals) {
          feasibilityWarnings.push(
            `Prop continuity limited: min ${feasibility.minPropReversals} reversal(s) unavoidable`
          );
        }
        if (
          hasHandPathContinuityConstraint &&
          !feasibility.canAvoidAllHandReversals
        ) {
          feasibilityWarnings.push(
            `Hand continuity limited: min ${feasibility.minHandReversals} reversal(s) unavoidable`
          );
        }
        if (
          hasReversalConstraint &&
          !feasibility.canHavePropReversalEveryBeat
        ) {
          feasibilityWarnings.push(
            `Max reversals: ${feasibility.maxPropReversals}/${letters.length - 1} beats`
          );
        }
      }

      const { result, error } = buildSequenceWithConstraints(
        letters,
        allPictographs,
        constraintSet,
        maxAttempts,
        parsedBridgeSelections
      );

      if (!result || !result.isValid) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate sequence for "${resolvedWord}": ${error || result?.error || "unknown error"}`,
            },
          ],
          isError: true,
        };
      }

      if (leftStartOrientation || rightStartOrientation) {
        result.steps = recalculateOrientationsWithOverrides(
          result.steps,
          leftStartOrientation,
          rightStartOrientation
        );
      }

      try {
        const birthdayDate = birthday ? new Date(birthday) : undefined;
        const stepCount = result.steps.length - 1;
        const turnAllocation = allocateTurns(stepCount, level, turnIntensity);

        let finalLoopComponents: LOOPComponent[] | undefined;
        let loopDetectionInfo = "";

        if (loopComponents && loopComponents.length > 0) {
          finalLoopComponents = loopComponents.map(componentStringToEnum);
          loopDetectionInfo = `LOOP: ${loopComponents.join(", ")}`;
        } else {
          const loopDetection = detectLOOPFromSteps(result.steps);
          if (loopDetection.isCircular && loopDetection.components.length > 0) {
            finalLoopComponents = convertLOOPComponentsToEnum(
              loopDetection.components
            );
            loopDetectionInfo = `LOOP detected: ${loopDetection.components.join(" + ")}`;
          } else if (loopDetection.isCircular) {
            loopDetectionInfo = "Circular (freeform)";
          }
        }

        const pngBuffer = await renderSequenceToImage(
          result.steps,
          result.word,
          {
            layout,
            cellSize,
            showStepNumbers,
            showWord,
            darkMode,
            exportProfile,
            columnCount,
            padding: COMPOSER_CARD_EXPORT_PROFILE_V1.padding,
            showDifficulty:
              showDifficulty ??
              (exportProfile === "print" ||
                COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty),
            showFooter: Boolean(notes && notes !== "none"),
            startPlacementLayout:
              COMPOSER_CARD_EXPORT_PROFILE_V1.startPlacementLayout,
            userName,
            notes,
            birthday: birthdayDate,
            level,
            turnAllocation,
            loopComponents: finalLoopComponents,
            showReversals,
            displayWord: displayWord?.toUpperCase(),
            rotationPeriod: finalLoopComponents?.includes(LOOPComponent.ROTATED)
              ? (period as "halved" | "quartered")
              : undefined,
            inversionPeriod: finalLoopComponents?.includes(
              LOOPComponent.INVERTED
            )
              ? (period as "halved" | "quartered")
              : undefined,
            primaryPropColors,
            leftPropType,
            rightPropType,
            fanAppearance,
          }
        );

        const tempPath = saveAndOpenImage(
          pngBuffer,
          `seq-${displayWord ?? resolvedWord}`
        );

        const loopLine = loopDetectionInfo ? `\n${loopDetectionInfo}` : "";
        const warningsLine =
          feasibilityWarnings.length > 0
            ? `\nConstraint notes: ${feasibilityWarnings.join("; ")}`
            : "";

        const headerWord = displayWord ?? resolvedWord;
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
              text: `"${headerWord}" — ${result.steps.length - 1} beats, ${layout} layout${loopLine}${warningsLine}`,
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
              text: `Failed to render sequence image: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
