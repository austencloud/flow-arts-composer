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
  ensureDataLoadedAsync,
  saveAndOpenImage,
  generateRandomWord,
} from "../shared/server-context.js";
import {
  buildSequenceFromLetters,
  parseWordToLetters,
  mcpStepsToEngineSteps,
  type SequenceResult,
  type BridgeSelections,
} from "../core/sequence-builder-adapter.js";
import {
  renderSequenceToImage,
  LOOPComponent,
} from "../core/sequence-renderer.js";
import { generateViaEngine } from "../core/engine-generation-adapter.js";
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
  type ConstraintSet,
  type PictographData,
} from "@tka/sequence-engine/generation";
import {
  detectLOOPFromSteps,
  type LOOPComponentId,
} from "@tka/sequence-engine/loop";

/**
 * Convert detected LOOP component IDs to renderer enum values.
 */
function convertLOOPComponentsToEnum(
  components: LOOPComponentId[]
): LOOPComponent[] {
  return components.map((c) => {
    switch (c) {
      case "rotated":
        return LOOPComponent.ROTATED;
      case "mirrored":
        return LOOPComponent.MIRRORED;
      case "flipped":
        return LOOPComponent.FLIPPED;
      case "swapped":
        return LOOPComponent.SWAPPED;
      case "inverted":
        return LOOPComponent.INVERTED;
      case "rewound":
        return LOOPComponent.REWOUND;
      default:
        return LOOPComponent.ROTATED;
    }
  });
}

export function registerSequenceTools(server: McpServer): void {
  // Tool: parse_constraints
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

  // Tool: analyze_word_feasibility
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
      const allPictographs = await ensureDataLoadedAsync(gridMode);
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

      const matrix = getTransitionMatrix(allPictographs as any, gridMode);

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

      // Hand reversal every step
      const everyHandStatus = feasibility.canHaveHandReversalEveryStep
        ? "✅ Yes"
        : "❌ No";
      const everyHandDetails = feasibility.canHaveHandReversalEveryStep
        ? "All transitions can produce a hand reversal"
        : `${feasibility.noHandReversalPossible.length} transition(s) are always continuous`;
      sections.push(
        `| Hand reversal every step | ${everyHandStatus} | ${everyHandDetails} |`
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
        !feasibility.canHaveHandReversalEveryStep
      ) {
        sections.push(
          `\n### Transitions That Can NEVER Produce Hand Reversal\n`
        );
        sections.push(
          feasibility.noHandReversalPossible.map((t) => `- ${t}`).join("\n")
        );
        const explanation = explainConstraintImpossibility(
          feasibility,
          "hand-reversal-every-step"
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

  // Tool: get_sequence_data
  server.tool(
    "get_sequence_data",
    "Get sequence data without rendering an image. Use when Claude needs to analyze step data, check positions, or verify generation before showing to user. For showing sequences to users, use generate_sequence instead.",
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
          "no-dash",
          "no-static",
          "maximize-dash",
          "maximum-chaos",
        ])
        .optional()
        .describe(
          "Predefined constraint preset: smooth, smooth-hands, smooth-props, reversal, isolation, antispin, no-dash, no-static, maximize-dash, or maximum-chaos"
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
      const allPictographs = await ensureDataLoadedAsync(gridMode);

      // Parse word to individual letters
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

      // Determine which constraint set to use
      let constraintSet = emptyConstraintSet();
      let parseResult: ReturnType<typeof parseConstraints> | undefined;

      if (constraintPreset) {
        const presetConstraints = getPresetConstraintSet(constraintPreset);
        if (presetConstraints) {
          constraintSet = presetConstraints;
        }
      } else if (constraints) {
        // Parse natural language constraints
        const parsed = parseConstraintSet(constraints);
        constraintSet = parsed.constraintSet;
        parseResult = parsed.parseResult;
      }

      // Check if we should use constrained or legacy builder
      const useConstrainedBuilder =
        constraintSet.hard.length > 0 || constraintSet.soft.length > 0;

      if (useConstrainedBuilder) {
        // Run feasibility analysis to generate warnings
        let feasibilityWarnings: string[] = [];
        if (letters.length >= 2) {
          const matrix = getTransitionMatrix(allPictographs as any, gridMode);
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

          // Warning for reversal preset if prop reversal every step is impossible
          if (
            hasReversalConstraint &&
            !feasibility.canHavePropReversalEveryStep
          ) {
            feasibilityWarnings.push(
              `Prop reversal every step is not achievable for "${word}". ` +
                `Maximum: ${feasibility.maxPropReversals}/${letters.length - 1} transitions.`
            );
          }

          // Warning for hand path reversal every step
          if (
            hasHandPathEveryConstraint &&
            !feasibility.canHaveHandReversalEveryStep
          ) {
            feasibilityWarnings.push(
              `Hand path reversal every step is not achievable for "${word}". ` +
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

        // Use the new constrained builder with beam search
        const result = buildConstrainedSequence({
          letters,
          allPictographs: allPictographs as any,
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

        // Build response with constraint report
        const response: Record<string, unknown> = {
          word: result.word,
          steps: result.steps.map((step, i) => ({
            ...step,
            variation: result.variationIndices[i] ?? 0,
            stepNumber: i,
          })),
          startPosition: result.startPosition,
          endPosition: result.endPosition,
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

        // Include parse info if constraints were parsed from text
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

        // Include feasibility warnings if constraints can't be fully satisfied
        if (feasibilityWarnings.length > 0) {
          (
            response.constraintReport as Record<string, unknown>
          ).feasibilityWarnings = feasibilityWarnings;
        }

        // Include bridge information if bridges were used
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

        // Compact mode - summary only
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
                text: `${result.word}: ${result.steps.length} steps | ${result.startPosition}→${result.endPosition} | Score: ${score.toFixed(2)} | Satisfied: ${satisfiedConstraints}${bridgeCount > 0 ? ` | Bridges: ${bridgeCount}` : ""}`,
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

      // Fall back to legacy builder for unconstrained generation
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
        allPictographs as any,
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
              text: `${result.word}: ${result.steps.length} steps | ${result.startPosition}→${result.endPosition}${bridgeCount > 0 ? ` | Bridges: ${bridgeCount}` : ""}`,
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
                startPosition: result.startPosition,
                endPosition: result.endPosition,
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

  // Tool: generate_sequence (primary tool for sequence generation)
  //
  // Supports two code paths:
  // 1. Legacy builder: plain word-based generation (proven, no regressions)
  // 2. Engine builder: length-based, LOOP, 3-axis constraints, start position targeting
  //
  // Routing: loopType present OR (length without word) → engine path. Otherwise → legacy.
  const ALL_LOOP_TYPES = [
    "rotated",
    "mirrored",
    "flipped",
    "swapped",
    "inverted",
    "swapped_inverted",
    "rotated_inverted",
    "mirrored_swapped",
    "mirrored_inverted",
    "rotated_swapped",
    "mirrored_rotated",
    "mirrored_inverted_rotated",
    "mirrored_swapped_inverted",
    "mirrored_rotated_swapped",
    "rotated_swapped_inverted",
    "mirrored_rotated_inverted_swapped",
    "strict_rewound",
    "rewound",
  ] as const;

  server.tool(
    "generate_sequence",
    "Generate a TKA sequence and open it in the system image viewer. This is the PRIMARY tool for sequence generation - use it by default. Supports word-based, length-based, and LOOP generation with full constraint control. Returns minimal text confirmation (~50 tokens).",
    {
      // Content params
      word: z
        .string()
        .optional()
        .describe(
          'The sequence word, e.g., "ABC". Provide word OR length (word wins if both given).'
        ),
      length: z
        .number()
        .min(1)
        .max(256)
        .optional()
        .describe(
          "Number of steps for freeform generation (no word needed). For LOOP sequences, this is the TOTAL output length."
        ),

      // LOOP params
      loopType: z
        .enum(ALL_LOOP_TYPES)
        .optional()
        .describe(
          "LOOP type for circular generation. Triggers engine builder with beam search and targeted end positions."
        ),
      period: z
        .enum(["halved", "quartered"])
        .optional()
        .default("halved")
        .describe(
          'Slice size for LOOP rotation: "halved" (180°, default) or "quartered" (90°). Only meaningful with loopType.'
        ),
      reflectionAxis: z
        .enum([
          "north-south",
          "east-west",
          "northeast-southwest",
          "northwest-southeast",
        ])
        .optional()
        .describe(
          "Axis for mirrored or flipped LOOP generation. Grid mode does not limit the axis."
        ),

      // Constraint params
      constraintPreset: z
        .enum([
          "smooth",
          "smooth-hands",
          "smooth-props",
          "reversal",
          "isolation",
          "antispin",
          "no-dash",
          "no-static",
          "maximize-dash",
          "maximum-chaos",
        ])
        .optional()
        .describe("Predefined constraint preset"),
      constraints: z
        .string()
        .optional()
        .describe(
          'Natural language constraints, e.g., "maximize continuity, all pro motions"'
        ),
      handPathMode: z
        .enum(["smooth", "mixed", "choppy"])
        .optional()
        .describe(
          'Hand path continuity axis: "smooth" = continuous, "mixed" = allow reversals, "choppy" = force reversals'
        ),
      motionTypeFilter: z
        .enum(["no-dash", "prefer-dash"])
        .optional()
        .describe("Motion family filter: exclude or prefer dash motions"),

      // Position targeting
      startPosition: z
        .string()
        .optional()
        .describe(
          'Force a specific start position, e.g., "alpha1", "beta3", "gamma5"'
        ),
      endPosition: z
        .string()
        .optional()
        .describe(
          'Force a specific end position for the last step, e.g., "beta5"'
        ),
      blockedStartPositions: z
        .array(z.string())
        .optional()
        .describe(
          'Start positions to exclude from random selection, e.g., ["alpha1", "gamma5"]'
        ),

      // Letter constraints
      mustContainLetters: z
        .array(z.string())
        .optional()
        .describe(
          'Letters that MUST appear at least once in the sequence, e.g., ["A", "B"]'
        ),
      mustNotContainLetters: z
        .array(z.string())
        .optional()
        .describe(
          'Letters that must NOT appear in the sequence, e.g., ["D", "J"]'
        ),

      // Generation control
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .default("diamond")
        .describe("Grid mode: diamond (default), box, or skewed"),
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .default(1)
        .describe(
          "Difficulty level: 1=beginner (0 turns only), 2=intermediate (0-3 whole turns), 3=advanced (0-3 plus halves and float)"
        ),
      propType: z
        .string()
        .optional()
        .describe('Prop used for both hands, e.g. "fan", "staff", or "club"'),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Maximum turn intensity (0-3)."),
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
          "Map of bridge transition index to preferred bridge option index."
        ),

      // Orientation overrides
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

      // Display params
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
        .describe("Show step numbers overlaid on each pictograph"),
      showWord: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showWord)
        .describe("Show word header at the top"),
      displayWord: z
        .string()
        .optional()
        .describe("Override the word shown in the header"),
      darkMode: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode)
        .describe("Use dark background"),
      primaryPropColors: z
        .object({
          left: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
          right: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
        })
        .optional()
        .describe(
          'Custom left/right hand colors as hex values, e.g. { left: "#00e5ff", right: "#ff2ea6" }. Applied consistently to props, arrows, turn labels, reversal dots, and mandalas.'
        ),
      showDifficulty: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty)
        .describe("Show difficulty level badge in header"),
      showReversals: z
        .boolean()
        .optional()
        .default(COMPOSER_CARD_EXPORT_PROFILE_V1.showReversals)
        .describe("Show reversal indicators"),
      loopComponents: z
        .array(
          z.enum([
            "rotated",
            "mirrored",
            "flipped",
            "swapped",
            "inverted",
            "rewound",
          ])
        )
        .optional()
        .describe(
          "Explicit LOOP components for rendering metadata. Auto-derived from loopType if not provided."
        ),

      // Footer params
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
    },
    async ({
      word,
      length,
      loopType,
      period = "halved",
      reflectionAxis,
      constraintPreset,
      constraints,
      handPathMode,
      motionTypeFilter,
      startPosition,
      endPosition,
      blockedStartPositions,
      mustContainLetters,
      mustNotContainLetters,
      gridMode = "diamond",
      level = 1,
      propType,
      turnIntensity,
      maxAttempts = 500,
      bridgeSelections,
      leftStartOrientation,
      rightStartOrientation,
      layout = COMPOSER_CARD_EXPORT_PROFILE_V1.layout,
      cellSize = COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize,
      showStepNumbers = COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
      showWord = COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
      displayWord,
      darkMode = COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode,
      primaryPropColors,
      showDifficulty = COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty,
      showReversals = COMPOSER_CARD_EXPORT_PROFILE_V1.showReversals,
      loopComponents,
      userName,
      notes,
      birthday,
    }) => {
      // Validation: must have word or length
      if (!word && !length) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Must provide either 'word' or 'length' parameter.",
            },
          ],
          isError: true,
        };
      }

      // GUARDRAIL: Require tagline only for named-word sequences (creative intent).
      // Skip tagline enforcement for: length-based, loop, mustContainLetters, or constraint-driven generation.
      const isCreativeWordRequest =
        !!word && !length && !loopType && !mustContainLetters;
      if (isCreativeWordRequest && !notes) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `BLOCKED: No tagline (notes) provided for "${word}".`,
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

      const allPictographs = await ensureDataLoadedAsync(gridMode);

      // All generation goes through the unified SequenceBuilder (7-stage pipeline
      // with beam search, turn allocation, and orientation-aware prop continuity).
      let result: SequenceResult;
      let engineLoopComponents: string[] | undefined;
      let engineSeedWord: string | undefined;
      let engineDerivedStepIndices: number[] | undefined;

      try {
        const engineResult = generateViaEngine(
          {
            word: word?.toUpperCase(),
            length,
            gridMode,
            level,
            propType,
            turnIntensity,
            constraintPreset,
            constraints,
            handPathMode,
            motionTypeFilter,
            startPosition,
            endPosition,
            blockedStartPositions,
            mustNotContainLetters,
            mustContainLetters,
            loopType,
            period,
            reflectionAxis,
            leftStartOrientation,
            rightStartOrientation,
          },
          allPictographs as any
        );

        result = engineResult.result;
        engineLoopComponents = engineResult.loopComponents;
        engineSeedWord = engineResult.seedWord;
        engineDerivedStepIndices = engineResult.derivedStepIndices;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate sequence: ${msg}`,
            },
          ],
          isError: true,
        };
      }

      // Render the sequence image
      try {
        const birthdayDate = birthday ? new Date(birthday) : undefined;
        const stepCount = result.steps.length - 1;

        // Determine LOOP components for rendering: explicit > engine-derived > auto-detect
        let finalLoopComponents: LOOPComponent[] | undefined;
        let loopDetectionInfo = "";
        const detectedLoop = detectLOOPFromSteps(
          mcpStepsToEngineSteps(result.steps) as any
        );

        if (loopComponents && loopComponents.length > 0) {
          finalLoopComponents = loopComponents.map((c) => {
            switch (c) {
              case "rotated":
                return LOOPComponent.ROTATED;
              case "mirrored":
                return LOOPComponent.MIRRORED;
              case "flipped":
                return LOOPComponent.FLIPPED;
              case "swapped":
                return LOOPComponent.SWAPPED;
              case "inverted":
                return LOOPComponent.INVERTED;
              case "rewound":
                return LOOPComponent.REWOUND;
              default:
                return LOOPComponent.ROTATED;
            }
          });
          loopDetectionInfo =
            `LOOP: ${loopComponents.join(", ")}` +
            (reflectionAxis ? `; reflection axis: ${reflectionAxis}` : "");
        } else if (engineLoopComponents && engineLoopComponents.length > 0) {
          finalLoopComponents = convertLOOPComponentsToEnum(
            engineLoopComponents as LOOPComponentId[]
          );
          const normalizeReflection = (component: string) =>
            component === "mirrored" || component === "flipped"
              ? "reflection"
              : component;
          const requested = [...engineLoopComponents]
            .map(normalizeReflection)
            .sort();
          const detected = [...detectedLoop.components]
            .map(String)
            .map(normalizeReflection)
            .sort();
          const verified =
            detectedLoop.isCircular &&
            requested.length === detected.length &&
            requested.every(
              (component, index) => component === detected[index]
            );
          loopDetectionInfo = verified
            ? `LOOP verified: ${requested.join(", ")}${
                detectedLoop.reflectionAxis
                  ? `; reflection axis: ${detectedLoop.reflectionAxis}`
                  : ""
              }`
            : `LOOP requested: ${requested.join(", ")}; detected: ${
                detectedLoop.isCircular
                  ? detected.join(", ") || "circular without a named transform"
                  : "not circular"
              }`;
        } else {
          // Auto-detect from steps (for legacy path)
          if (detectedLoop.isCircular && detectedLoop.components.length > 0) {
            finalLoopComponents = convertLOOPComponentsToEnum(
              detectedLoop.components
            );
            loopDetectionInfo =
              `LOOP detected: ${detectedLoop.components.join(" + ")}` +
              (detectedLoop.reflectionAxis
                ? `; reflection axis: ${detectedLoop.reflectionAxis}`
                : "");
          } else if (detectedLoop.isCircular) {
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
            padding: COMPOSER_CARD_EXPORT_PROFILE_V1.padding,
            showDifficulty,
            showFooter: Boolean(notes && notes !== "none"),
            startPositionLayout:
              COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
            userName,
            notes,
            birthday: birthdayDate,
            level,
            loopComponents: finalLoopComponents,
            period: finalLoopComponents?.length
              ? period === "quartered"
                ? 4
                : 2
              : undefined,
            showReversals,
            seedWord: displayWord?.toUpperCase() ?? engineSeedWord,
            derivedStepIndices: engineDerivedStepIndices,
            leftPropType: propType,
            rightPropType: propType,
            primaryPropColors,
          }
        );

        const headerWord = displayWord ?? result.word ?? word ?? "sequence";
        const tempPath = saveAndOpenImage(pngBuffer, `seq-${headerWord}`);

        const loopLine = loopDetectionInfo ? `\n${loopDetectionInfo}` : "";

        // Include compact step data so Claude can inspect the sequence
        // without needing a separate tool call or image reading.
        const stepSummary = result.steps.map((s, i) => {
          const b = s.leftMotion;
          const r = s.rightMotion;
          return {
            step: i,
            letter: s.letter,
            pos: `${s.startPosition}→${s.endPosition}`,
            left: {
              type: b.motionType,
              dir: b.rotationDirection,
              turns: b.turns,
              loc: `${b.startLocation}→${b.endLocation}`,
              ori: `${b.startOrientation}→${b.endOrientation}`,
            },
            right: {
              type: r.motionType,
              dir: r.rotationDirection,
              turns: r.turns,
              loc: `${r.startLocation}→${r.endLocation}`,
              ori: `${r.startOrientation}→${r.endOrientation}`,
            },
            ...(s.leftReversal ? { leftRev: true } : {}),
            ...(s.rightReversal ? { rightRev: true } : {}),
          };
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Opened sequence "${headerWord}" in system viewer.\n${stepCount} steps, ${layout} layout, ${cellSize}px cells${loopLine}\nFile: ${tempPath}`,
            },
            {
              type: "text" as const,
              text: JSON.stringify(stepSummary, null, 2),
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
