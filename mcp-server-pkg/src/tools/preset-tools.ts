/**
 * User Preset Tools
 *
 * Tools for managing user sequence presets: list_user_presets, save_user_preset,
 * delete_user_preset, get_user_preset, generate_with_preset, seed_default_presets
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COMPOSER_CARD_EXPORT_PROFILE_V1 } from "@tka/render-composition";
import {
  ensureDataLoaded,
  saveAndOpenImage,
} from "../shared/server-context.js";
import type { GridMode } from "../types/pictograph.js";
import {
  buildSequenceFromLetters,
  parseWordToLetters,
  generateChainableSequence,
  type SequenceStep,
} from "../core/sequence-builder.js";
import { renderSequenceToImage } from "../core/sequence-renderer.js";
import { allocateTurns } from "../core/turn-allocator.js";
import {
  parseConstraintSet,
  emptyConstraintSet,
  getPresetConstraintSet,
  buildConstrainedSequence,
  type PresetName,
} from "../core/constraints/index.js";
import {
  LOOPType,
  Period,
  executeLOOP,
  loopTypeSchema,
  periodSchema,
  loopComponentsSchema,
  decomposeLoopType,
  componentStringToEnum,
  autoBridgeForLoop,
  isLOOPValidForPositionPair,
  LOOPComponent,
} from "../core/loop/index.js";

const primaryPropColorsSchema = z.object({
  left: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
  right: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),
});
import {
  createPreset,
  updatePreset,
  deletePreset,
  getPreset,
  listPresets as listUserPresets,
  formatPresetSummary,
  seedDefaultPresets,
  PresetValidationError,
  PresetNotFoundError,
  type CreatePresetInput,
} from "../core/user-presets/index.js";

export function registerPresetTools(server: McpServer): void {
  // Tool: list_user_presets
  server.tool(
    "list_user_presets",
    "List all saved user sequence presets with their configurations.",
    {},
    async () => {
      const presets = listUserPresets();

      if (presets.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No presets saved yet. Use save_user_preset to create one.",
            },
          ],
        };
      }

      const summaries = presets.map(
        (p, i) => `${i + 1}. ${formatPresetSummary(p)}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `## Saved Presets (${presets.length})\n\n${summaries.join("\n\n")}`,
          },
        ],
      };
    }
  );

  // Tool: save_user_preset
  server.tool(
    "save_user_preset",
    "Create or update a user sequence preset. Presets remember generation settings across sessions.",
    {
      name: z.string().describe("Preset name (e.g., 'Comfy 16')"),
      description: z.string().optional().describe("Description of the preset"),
      icon: z.string().optional().describe("Emoji icon for the preset"),
      loopType: loopTypeSchema.optional(),
      period: periodSchema.optional().describe("LOOP period"),
      loopComponents: loopComponentsSchema,
      wordLength: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Default word length"),
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .describe("Difficulty level (1-3)"),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Turn intensity (0-3)"),
      constraintPreset: z
        .string()
        .optional()
        .describe("Constraint preset name (smooth, reversal, etc.)"),
      constraints: z
        .string()
        .optional()
        .describe("Natural language constraints"),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .describe("Grid mode"),
      darkMode: z.boolean().optional().describe("Use dark background"),
      cellSize: z
        .number()
        .min(50)
        .max(500)
        .optional()
        .describe("Image cell size in pixels"),
      layout: z.enum(["grid", "strip"]).optional().describe("Image layout"),
      update: z
        .boolean()
        .optional()
        .describe("If true, update existing preset with same name"),
    },
    async (input) => {
      try {
        // Check if updating existing preset
        if (input.update) {
          const existing = listUserPresets().find(
            (p) => p.name.toLowerCase() === input.name.toLowerCase()
          );
          if (existing) {
            const updated = updatePreset(
              existing.id,
              input as CreatePresetInput
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Updated preset: ${formatPresetSummary(updated)}`,
                },
              ],
            };
          }
        }

        // Create new preset
        const preset = createPreset(input as CreatePresetInput);

        return {
          content: [
            {
              type: "text" as const,
              text: `Created preset: ${formatPresetSummary(preset)}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof PresetValidationError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: delete_user_preset
  server.tool(
    "delete_user_preset",
    "Delete a saved user preset by name or ID.",
    {
      preset: z.string().describe("Preset name or ID to delete"),
    },
    async ({ preset }) => {
      try {
        const existing = getPreset(preset);
        deletePreset(preset);

        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted preset: ${existing.name}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof PresetNotFoundError
            ? `Preset not found: ${preset}`
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: get_user_preset
  server.tool(
    "get_user_preset",
    "Get full details of a saved user preset.",
    {
      preset: z.string().describe("Preset name or ID"),
    },
    async ({ preset }) => {
      try {
        const p = getPreset(preset);

        const details = {
          id: p.id,
          name: p.name,
          description: p.description,
          icon: p.icon,
          config: p.config,
          createdAt: new Date(p.createdAt).toISOString(),
          updatedAt: new Date(p.updatedAt).toISOString(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `## ${p.icon || ""} ${p.name}\n\n${p.description || ""}\n\n**Configuration:**\n\`\`\`json\n${JSON.stringify(details.config, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof PresetNotFoundError
            ? `Preset not found: ${preset}`
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: generate_with_preset
  server.tool(
    "generate_with_preset",
    "Generate a sequence using a saved preset. Word is optional - if omitted, generates a random word of appropriate length.",
    {
      preset: z.string().describe("Preset name or ID"),
      word: z
        .string()
        .optional()
        .describe("Word to generate (optional - random if omitted)"),
      level: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .describe("Override: difficulty level"),
      turnIntensity: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Override: turn intensity"),
      gridMode: z
        .enum(["diamond", "box", "skewed"])
        .optional()
        .describe("Override: grid mode"),
      darkMode: z.boolean().optional().describe("Override: dark mode"),
      exportProfile: z.enum(["composer", "print"]).optional(),
      columnCount: z.number().int().min(1).optional(),
      showDifficulty: z.boolean().optional(),
      leftPropType: z.string().nullable().optional(),
      rightPropType: z.string().nullable().optional(),
      fanAppearance: z
        .object({
          build: z
            .enum(["pictograph", "fire", "flat-grip", "lotus", "day", "moon"])
            .optional(),
          frameColor: z.enum(["black", "white"]).optional(),
          cover: z.enum(["bare", "covered"]).optional(),
        })
        .nullable()
        .optional(),
      primaryPropColors: primaryPropColorsSchema
        .optional()
        .describe(
          "Override left/right colors for every hand-colored card mark"
        ),
      includeImage: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Include base64 image in response (default: false, image opens in system viewer instead). Set true only if Claude needs to analyze the image."
        ),
    },
    async (input) => {
      try {
        const p = getPreset(input.preset);
        const config = p.config;

        // Determine word - track if user specified it (affects bridge behavior)
        const userSpecifiedWord = !!input.word;
        let word = input.word?.toUpperCase() || "";
        let letters: string[] = [];

        if (!userSpecifiedWord) {
          const targetLength = config.wordLength || 4;
          letters = generateChainableSequence(targetLength);
          word = letters.join("");
        } else {
          letters = parseWordToLetters(word);
        }

        if (letters.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No valid letters in word: ${word}`,
              },
            ],
            isError: true,
          };
        }

        // Merge config with overrides
        const level = input.level ?? config.level ?? 1;
        const turnIntensity = input.turnIntensity ?? config.turnIntensity ?? 0;
        const gridMode = (input.gridMode ??
          config.gridMode ??
          "diamond") as GridMode;
        const darkMode =
          input.darkMode ??
          config.darkMode ??
          COMPOSER_CARD_EXPORT_PROFILE_V1.darkMode;
        const cellSize =
          config.cellSize ?? COMPOSER_CARD_EXPORT_PROFILE_V1.cellSize;
        const layout = config.layout ?? COMPOSER_CARD_EXPORT_PROFILE_V1.layout;

        // Load pictograph data
        const allPictographs = ensureDataLoaded(gridMode);

        // Build sequence - use LOOP-aware builder if a LOOP type is specified
        let steps: SequenceStep[] = [];
        let sequenceWord = word;

        // Track LOOP sequence info for debugging
        let loopDebugWord = "";
        let loopDebugStart = "";
        let loopDebugEnd = "";

        if (config.loopType) {
          const loopTypeValue = config.loopType as LOOPType;
          const slice = config.period as Period;
          const maxAttempts = 500;
          let loopResult;
          let baseResult;

          // Phase 1: try without bridging
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (attempt > 0 && !userSpecifiedWord) {
              const targetLength = config.wordLength || 4;
              letters = generateChainableSequence(targetLength);
              word = letters.join("");
            }

            baseResult = buildSequenceFromLetters(
              letters,
              allPictographs,
              attempt === 0 ? 100 : 1
            );
            if (!baseResult.isValid) continue;

            const pp = `${baseResult.startPosition},${baseResult.endPosition}`;
            if (!isLOOPValidForPositionPair(loopTypeValue, pp, slice)) continue;

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
              if (attempt > 0 && !userSpecifiedWord) {
                const targetLength = config.wordLength || 4;
                letters = generateChainableSequence(targetLength);
                word = letters.join("");
              }

              baseResult = buildSequenceFromLetters(
                letters,
                allPictographs,
                attempt === 0 ? 100 : 1
              );
              if (!baseResult.isValid) continue;

              const bridgeResult = autoBridgeForLoop(
                baseResult.word,
                letters,
                baseResult.startPosition,
                baseResult.endPosition,
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

              const pp = `${finalResult.startPosition},${finalResult.endPosition}`;
              if (!isLOOPValidForPositionPair(loopTypeValue, pp, slice))
                continue;

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
          }

          if (!loopResult || !loopResult.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to generate ${config.loopType} LOOP after ${maxAttempts} attempts`,
                },
              ],
              isError: true,
            };
          }

          steps = loopResult.steps;
          sequenceWord = loopResult.loopWord;
          loopDebugWord = loopResult.seedWord;
          loopDebugStart = baseResult!.startPosition;
          loopDebugEnd = baseResult!.endPosition;

          // Render directly and return — skip the second executeLOOP call below
          const effectiveComponents = config.loopComponents
            ? config.loopComponents.map(componentStringToEnum)
            : decomposeLoopType(config.loopType).map(componentStringToEnum);
          const stepCount = loopResult.steps.length - 1;
          const turnAllocation = allocateTurns(stepCount, level as 1 | 2 | 3);

          const pngBuffer = await renderSequenceToImage(
            loopResult.steps,
            loopResult.loopWord,
            {
              layout,
              cellSize,
              showStepNumbers: COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
              showWord: COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
              darkMode,
              turnAllocation,
              loopComponents: effectiveComponents,
              period: config.period === "quartered" ? 4 : 2,
              derivedBeatIndices: loopResult.derivedBeatIndices,
              seedWord: loopResult.seedWord,
              showFooter: COMPOSER_CARD_EXPORT_PROFILE_V1.showFooter,
              startPositionLayout:
                COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
              level: level as 1 | 2 | 3,
              exportProfile: input.exportProfile,
              columnCount: input.columnCount,
              showDifficulty:
                input.showDifficulty ?? input.exportProfile === "print",
              leftPropType: input.leftPropType,
              rightPropType: input.rightPropType,
              fanAppearance: input.fanAppearance,
              primaryPropColors: input.primaryPropColors,
            }
          );

          saveAndOpenImage(pngBuffer, loopResult.loopWord);

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
                text: `${config.loopType} LOOP from preset "${p.name}" — ${loopResult.loopWord}, ${stepCount} beats`,
              },
            ],
          };
        } else if (config.constraintPreset || config.constraints) {
          // Constraint-based building (no LOOP)
          let constraintSet = emptyConstraintSet();
          if (config.constraintPreset) {
            const preset = getPresetConstraintSet(
              config.constraintPreset as PresetName
            );
            if (preset) {
              constraintSet = preset;
            }
          } else if (config.constraints) {
            const parsed = parseConstraintSet(config.constraints);
            if (parsed.constraintSet) {
              constraintSet = parsed.constraintSet;
            }
          }

          const constrained = buildConstrainedSequence({
            letters,
            allPictographs,
            constraintSet,
          });

          if (!constrained.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to generate sequence: ${constrained.error}`,
                },
              ],
              isError: true,
            };
          }

          // Convert PictographData[] to SequenceStep[]
          steps = constrained.steps.map((picto, index) => ({
            letter: picto.letter,
            variation: constrained.variationIndices[index] || 0,
            startPosition: picto.startPosition,
            endPosition: picto.endPosition,
            leftMotion: picto.leftMotion,
            rightMotion: picto.rightMotion,
            stepNumber: index,
          }));
          sequenceWord = constrained.word;
        } else {
          // Simple sequence building (no LOOP, no constraints)
          const result = buildSequenceFromLetters(letters, allPictographs, 100);
          if (!result.isValid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to generate sequence: ${result.error}`,
                },
              ],
              isError: true,
            };
          }
          steps = result.steps;
          sequenceWord = result.word;
        }

        // Non-LOOP sequence
        const stepCount = steps.length - 1;
        const turnAllocation = allocateTurns(stepCount, level as 1 | 2 | 3);

        const pngBuffer = await renderSequenceToImage(steps, sequenceWord, {
          layout,
          cellSize,
          showStepNumbers: COMPOSER_CARD_EXPORT_PROFILE_V1.showStepNumbers,
          showWord: COMPOSER_CARD_EXPORT_PROFILE_V1.showWord,
          darkMode,
          turnAllocation,
          showFooter: COMPOSER_CARD_EXPORT_PROFILE_V1.showFooter,
          startPositionLayout:
            COMPOSER_CARD_EXPORT_PROFILE_V1.startPositionLayout,
          level: level as 1 | 2 | 3,
          exportProfile: input.exportProfile,
          columnCount: input.columnCount,
          showDifficulty:
            input.showDifficulty ?? input.exportProfile === "print",
          leftPropType: input.leftPropType,
          rightPropType: input.rightPropType,
          fanAppearance: input.fanAppearance,
          primaryPropColors: input.primaryPropColors,
        });

        saveAndOpenImage(pngBuffer, sequenceWord);

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
              text: `Preset "${p.name}" — ${sequenceWord}, ${steps.length} beats, level ${level}`,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof PresetNotFoundError
            ? `Preset not found: ${input.preset}`
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool: seed_default_presets
  server.tool(
    "seed_default_presets",
    "Seed default presets (Comfy 16, Mirrored/Inverted, Rewound/Inverted). Only adds presets that don't already exist.",
    {},
    async () => {
      const result = seedDefaultPresets();

      const lines: string[] = [];

      if (result.added.length > 0) {
        lines.push(`Added: ${result.added.join(", ")}`);
      }

      if (result.skipped.length > 0) {
        lines.push(`Skipped (already exist): ${result.skipped.join(", ")}`);
      }

      if (lines.length === 0) {
        lines.push("No presets to seed.");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );
}
