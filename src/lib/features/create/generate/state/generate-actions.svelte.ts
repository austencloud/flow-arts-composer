/**
 * Generation Actions State - Reactive wrapper for generation orchestration
 *
 * Delegates complex generation logic to GenerationOrchestrator.
 * Manages reactive state and workbench animation updates.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import type { SequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
import { setPendingGenerationAnimation } from "$lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte";
import { clearArrowPositionCache } from "$lib/shared/pictograph/arrow/rendering/arrow-position-cache";
import { clearPropPositionCache } from "$lib/shared/pictograph/prop/prop-position-cache";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GenerationOptions } from "../shared/domain/models/generate-models";
import { GenerationMode } from "../shared/domain/models/generate-models";
import type { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import { captureGenerationErrorContext } from "$lib/shared/create/utils/generation-error-context";
import {
  levelToDifficulty,
  type UIGenerationConfig,
} from "../shared/utils/config-mapper";
import {
  getTemplateById,
  templateToPattern,
} from "$lib/features/create/shared/domain/templates/duration-templates";
import type { SpellModeState } from "./spell-mode-state.svelte";
import type { UndoMetadata } from "../../shared/services/undo-manager";
import type { UndoOperationType } from "../../shared/services/undo-manager";
import { UndoOperationType as UndoOp } from "../../shared/services/undo-manager";
import type { VariationExplorationOrchestrator } from "../../spell/services/variation-exploration-orchestrator";
import * as spellServiceLoaderModule from "$lib/features/create/spell/services/spell-service-loader";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { sequenceExtender } from "$lib/features/create/shared/services/sequence-extender";
import {
  LOOPType,
  Period,
  periodToNumber,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { loopViabilityService } from "$lib/features/create/generate/shared/services/loop-viability-service";
import {
  guestLoopGate,
  type GuestLoopLockKind,
} from "$lib/shared/create/services/loop-guest-gate";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  resolveAccessTier,
  getMaxSteps,
} from "$lib/shared/auth/domain/access-tier";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { AUTH_NUDGE_TEXTS } from "$lib/shared/auth/domain/auth-nudge-trigger";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
import { logSequenceAction } from "$lib/shared/analytics/services/posthog-activity-logger";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";

import { applyPattern as dpApplyPattern } from "$lib/features/create/shared/services/duration-pattern-manager";
import { getVariationExplorationOrchestrator } from "$lib/features/create/spell/get-variation-exploration-orchestrator";
import { getPropUnlockManager } from "$lib/shared/gamification/get-prop-unlock-manager";

export interface GenerationAnimationTarget {
  clear(): void;
  prepare(stepCount: number, isSequential: boolean): void;
}

// Letters with dash motions (Type 3, 4, and 5)
const DASH_LETTERS: Set<string> = new Set([
  "W-",
  "X-",
  "Y-",
  "Z-",
  "Σ-",
  "Δ-",
  "Θ-",
  "Ω-",
  "Φ",
  "Ψ",
  "Λ",
  "Φ-",
  "Ψ-",
  "Λ-",
]);

export function createGenerationActionsState(
  getSequenceState?: () => SequenceState | undefined,
  getIsSequential?: () => boolean,
  getConfig?: () => UIGenerationConfig | undefined,
  getSpellState?: () => SpellModeState | undefined,
  pushUndoSnapshot?: (type: UndoOperationType, metadata?: UndoMetadata) => void,
  onGuestLoopLocked?: (kind: GuestLoopLockKind) => void,
  getAnimationTarget?: () => GenerationAnimationTarget | null | undefined
) {
  let isGenerating = $state(false);
  let lastGeneratedSequence = $state<SequenceData | null>(null);
  let lastGeneratedConfig = $state<UIGenerationConfig | null>(null);
  let generationError = $state<string | null>(null);
  let orchestrationService: GenerationOrchestrator | null = null;

  async function onGenerateClicked(options: GenerationOptions) {
    if (isGenerating) return;

    isGenerating = true;
    generationError = null;
    let errorContext: Record<string, unknown> = {};

    try {
      errorContext = captureGenerationErrorContext(options, getConfig?.());
      // Pre-flight viability check. Rejects combos that the LOOP algebra
      // forbids (e.g. quartered mirrored), preventing silent period-2
      // downgrade. See docs/superpowers/specs/2026-04-19-loop-period-viability-design.md.
      if (options.loopType) {
        const period = periodToNumber(options.period);
        const viability = loopViabilityService.check({
          loopType: options.loopType,
          period,
          gridMode: options.gridMode,
        });
        if (!viability.viable) {
          const fullMessage = viability.suggestion
            ? `${viability.reason} ${viability.suggestion}`
            : (viability.reason ?? "LOOP configuration is not viable.");
          generationError = fullMessage;
          const errorService = getErrorHandler();
          errorService?.showUserError({
            message: "This LOOP combination isn't supported",
            technicalDetails: fullMessage,
            error: new Error(fullMessage),
            severity: "warning",
            context: {
              module: "create",
              tab: "generate",
              action: "generateSequence",
              additionalData: errorContext,
            },
          });
          isGenerating = false;
          return;
        }
      }

      // Guest LOOP safety net: the selector gates most configs up front, but a
      // locked config can still reach Generate — a signed-in session's loopType
      // persisted in localStorage outlives sign-out, and a guest can push a
      // rotated LOOP past their step cap by switching Period to Quartered.
      // Open the same contextual auth screen the selector uses instead of a
      // button-less toast or a raw engine error.
      if (options.loopType && options.mode === GenerationMode.CIRCULAR) {
        const guestTier = resolveAccessTier(
          authState.isAuthenticated,
          authState.isAnonymous,
          isPremiumOrAbove(authState.role)
        );
        if (guestTier === "guest") {
          const lock = guestLoopGate(
            options.loopType,
            options.loopSpecWire ?? null,
            getMaxSteps("guest")
          );
          if (lock.locked) {
            if (onGuestLoopLocked) {
              onGuestLoopLocked(lock.kind);
            } else {
              toast.info(lock.reason, 6000);
            }
            isGenerating = false;
            return;
          }
        }
      }

      if (!orchestrationService) {
        orchestrationService = generationOrchestrator;
      }

      let generatedSequence =
        await orchestrationService.generateSequence(options);

      // Apply duration rhythm template if configured
      const config = getConfig?.();
      if (config?.durationTemplateId) {
        const template = getTemplateById(config.durationTemplateId);
        if (template) {
          try {
            const pattern = templateToPattern(
              template,
              "system",
              generatedSequence.steps.length
            );
            const result = dpApplyPattern(pattern, generatedSequence);
            if (result.success && result.sequence) {
              generatedSequence = result.sequence;
            } else {
              console.warn(
                "Duration template application failed:",
                result.error
              );
            }
          } catch (err) {
            console.warn("Duration template application error:", err);
          }
        }
      }

      // Enforce tier step cap post-generation - handles words with bridge letters
      // that push the sequence beyond what the user's tier allows.
      const tier = resolveAccessTier(
        authState.isAuthenticated,
        authState.isAnonymous,
        isPremiumOrAbove(authState.role)
      );
      const maxSteps = getMaxSteps(tier);
      if (generatedSequence.steps.length > maxSteps) {
        generatedSequence = {
          ...generatedSequence,
          steps: generatedSequence.steps.slice(0, maxSteps),
        };
        // Truncation lost steps the user's word implied. Guests get a
        // free-account nudge for the full 64-step cap; signed-in users are
        // already at the 64 ceiling, so it's a neutral note with no upsell.
        if (tier === "guest") {
          // Centralized copy (auth-nudge-trigger.ts) - same wording as the
          // step-cap nudge shown elsewhere, not a local duplicate.
          toast.info(AUTH_NUDGE_TEXTS["step-cap-guest"], 5000);
        } else {
          toast.info("Capped to 64 steps.", 5000);
        }
      }

      // Snapshot current state before replacing so the user can undo back to it
      pushUndoSnapshot?.(UndoOp.GENERATE_SEQUENCE, {
        description: "Generate sequence",
      });

      lastGeneratedSequence = generatedSequence;
      const currentConfig = getConfig?.();
      lastGeneratedConfig = currentConfig ? { ...currentConfig } : null;
      await updateWorkbenchWithSequence(generatedSequence);
      void getPropUnlockManager().recordCreation("generate");

      // Log successful AI generation for analytics (non-critical)
      try {
        void logSequenceAction("generate", generatedSequence.id, {
          sequenceWord: generatedSequence.word,
          sequenceLength: generatedSequence.steps.length,
          generationType: options.mode,
        });
      } catch {
        // Silently fail - activity logging is non-critical
      }
    } catch (error) {
      generationError =
        error instanceof Error ? error.message : "Unknown generation error";

      // Show user-facing error with bug report option
      const errorService = getErrorHandler();
      if (errorService) {
        errorService.showUserError({
          message: "Sequence generation failed",
          technicalDetails: generationError,
          error: error instanceof Error ? error : new Error(generationError),
          severity: "error",
          context: {
            module: "create",
            tab: "generate",
            action: "generateSequence",
            additionalData: errorContext,
          },
        });
      }

      console.error("Generation failed:", error);
    } finally {
      isGenerating = false;
    }
  }

  // Lazy-resolved spell services - used only for word parsing (Greek aliases,
  // bridge-letter expansion, target-length padding). The actual sequence
  // generation goes through generationOrchestrator (same path as freeform + MCP).
  let spellOrchestrator: VariationExplorationOrchestrator | null = null;

  async function onSpellGenerate() {
    const spellState = getSpellState?.();
    if (!spellState?.inputWord.trim()) return;
    if (isGenerating) return;

    isGenerating = true;
    spellState.setGenerating(true);
    spellState.clearError();
    generationError = null;
    let errorContext: Record<string, unknown> = {};

    try {
      const config = getConfig?.();
      errorContext = captureGenerationErrorContext(
        { word: spellState.inputWord },
        config
      );
      // Lazy-resolve services
      if (!spellOrchestrator) {
        spellOrchestrator =
          getVariationExplorationOrchestrator() as VariationExplorationOrchestrator;
      }

      // Parse word with bridge letters
      const parseResult = await spellOrchestrator.parseWord(
        spellState.inputWord,
        {
          preferences: {
            constraintPreset: config?.constraintPreset ?? "smooth",
            handPathMode: config?.handPathMode ?? "mixed",
            motionTypeFilter: config?.motionTypeFilter ?? null,
            highContinuity: config?.constraintPreset === "smooth",
            makeCircular: false,
            selectedLOOPType: null,
            targetStepCount: null,
            maxReversals: null,
          },
        }
      );

      if (!parseResult.success || !parseResult.expandedLetters) {
        spellState.setError(parseResult.error || "Could not parse word");
        return;
      }

      let finalLetters = parseResult.expandedLetters;
      let finalLetterSources = parseResult.letterSources ?? [];

      // If user requested a longer sequence, append extra bridge letters at the end
      const spellTarget = config?.spellTargetLength;
      if (spellTarget !== null && spellTarget !== undefined && config) {
        const extraBridgesNeeded = Math.max(
          0,
          spellTarget - finalLetters.length
        );

        if (extraBridgesNeeded > 0) {
          const graph = await spellServiceLoaderModule.getTransitionGraph();
          const preferDash = config.motionTypeFilter === "prefer-dash";
          const avoidDash = config.motionTypeFilter === "no-dash";

          const extendedLetters = [...finalLetters];
          const extendedSources = [...finalLetterSources];

          for (let i = 0; i < extraBridgesNeeded; i++) {
            const lastLetter = extendedLetters[extendedLetters.length - 1];
            if (!lastLetter) break;

            const successors = graph.getValidSuccessors(lastLetter);
            if (successors.length === 0) break;

            let bridgeLetter: Letter;
            if (preferDash) {
              const dashOpts = successors.filter((b) => DASH_LETTERS.has(b));
              const pool = dashOpts.length > 0 ? dashOpts : successors;
              bridgeLetter = pool[Math.floor(Math.random() * pool.length)]!;
            } else if (avoidDash) {
              const nonDashOpts = successors.filter(
                (b) => !DASH_LETTERS.has(b)
              );
              const pool = nonDashOpts.length > 0 ? nonDashOpts : successors;
              bridgeLetter = pool[Math.floor(Math.random() * pool.length)]!;
            } else {
              bridgeLetter =
                successors[Math.floor(Math.random() * successors.length)]!;
            }

            extendedLetters.push(bridgeLetter);
            extendedSources.push({
              letter: bridgeLetter,
              isOriginal: false,
              stepIndex: extendedLetters.length,
            });
          }

          finalLetters = extendedLetters;
          finalLetterSources = extendedSources;
        }
      }

      spellState.setExpandedWord(finalLetters.join("") || spellState.inputWord);

      if (finalLetterSources.length > 0) {
        spellState.setLetterSources(finalLetterSources);
      }

      // ── Unified generation path ────────────────────────────────────────────
      // Spell and freeform both route through generationOrchestrator →
      // SequenceBuilder → BeamSearch. The engine parses letters, allocates
      // turns, resolves rotation directions for static/dash+turns steps,
      // applies LOOP extension, and runs orientation propagation - identical
      // to what MCP does. The spell-only pre-step is word parsing + target-
      // length bridge extension (finalLetters above); post-step is spellData
      // metadata attachment.
      const expandedWord = finalLetters.join("") || spellState.inputWord;
      const isLoop = !!config?.loopEnabled;

      const loopType =
        (config?.loopType as LOOPType) || LOOPType.STRICT_REWOUND;
      const period = (config?.period as Period) || Period.HALVED;

      // Generate the word sequence WITHOUT engine-level LOOP. Word-based
      // generation can't auto-append bridges to reach LOOP-compatible end
      // positions (the word's letters are fixed), so we take the two-step
      // approach: generate the word freeform, then extend with bridges if
      // LOOP is requested. This mirrors the MCP engine path for non-loop
      // and the old spell path's Path B for loop.
      const generationOptions: GenerationOptions = {
        mode: GenerationMode.FREEFORM,
        length: finalLetters.length, // Ignored when word is set, but required by the type
        word: expandedWord,
        gridMode: (config?.gridMode ?? "diamond") as GridMode,
        propType: PropType.STAFF,
        difficulty: levelToDifficulty(config?.level ?? 2),
        turnIntensity: config?.turnIntensity ?? 1.0,
        constraintPreset: config?.constraintPreset ?? "smooth",
        handPathMode: config?.handPathMode ?? "mixed",
        motionTypeFilter: config?.motionTypeFilter ?? null,
      };
      errorContext = {
        ...captureGenerationErrorContext(generationOptions),
        inputWord: errorContext.word,
        uiConfig: errorContext.uiConfig,
      };

      let generatedSequence =
        await generationOrchestrator.generateSequence(generationOptions);

      // If LOOP is requested, apply it post-hoc via the bridge-aware extender.
      // This path can add a single bridge letter to make the sequence land at
      // a LOOP-compatible end position when the word itself doesn't.
      if (isLoop) {
        generatedSequence = await applySpellLoopExtension(
          generatedSequence,
          loopType,
          period,
          finalLetterSources
        );
      }

      // Attach spell metadata so the UI can highlight bridge letters and
      // downstream persistence can round-trip the user's original word.
      let loopedSequence: SequenceData = {
        ...generatedSequence,
        name: spellState.inputWord,
        word: expandedWord,
        metadata: {
          ...generatedSequence.metadata,
          spellData: {
            expandedWord,
            letterSources: finalLetterSources,
          },
        },
      };

      // Apply duration rhythm template if configured
      if (config?.durationTemplateId) {
        const template = getTemplateById(config.durationTemplateId);
        if (template) {
          try {
            const pattern = templateToPattern(
              template,
              "system",
              loopedSequence.steps.length
            );
            const result = dpApplyPattern(pattern, loopedSequence);
            if (result.success && result.sequence) {
              Object.assign(loopedSequence, result.sequence);
            }
          } catch {
            // Duration application failed, use sequence as-is
          }
        }
      }

      // Enforce tier step cap post-generation - spell sequences with bridge letters
      // can exceed the user's allowed length.
      const spellTier = resolveAccessTier(
        authState.isAuthenticated,
        authState.isAnonymous,
        isPremiumOrAbove(authState.role)
      );
      const spellMaxSteps = getMaxSteps(spellTier);
      if (loopedSequence.steps.length > spellMaxSteps) {
        loopedSequence = {
          ...loopedSequence,
          steps: loopedSequence.steps.slice(0, spellMaxSteps),
        };
        // Truncation lost steps the spelled word implied. Guests get a
        // free-account nudge for the full 64-step cap; signed-in users are
        // already at the 64 ceiling, so it's a neutral note with no upsell.
        // Mirrors the identical block in onGenerateClicked above.
        if (spellTier === "guest") {
          // Centralized copy (auth-nudge-trigger.ts) - same wording as the
          // step-cap nudge shown elsewhere, not a local duplicate.
          toast.info(AUTH_NUDGE_TEXTS["step-cap-guest"], 5000);
        } else {
          toast.info("Capped to 64 steps.", 5000);
        }
      }

      // Snapshot current state before replacing so the user can undo back to it
      pushUndoSnapshot?.(UndoOp.SPELL_GENERATE, {
        description: `Spell generate: ${spellState.inputWord}`,
      });

      lastGeneratedSequence = loopedSequence;
      const currentConfig = getConfig?.();
      lastGeneratedConfig = currentConfig ? { ...currentConfig } : null;
      await updateWorkbenchWithSequence(loopedSequence);
      void getPropUnlockManager().recordCreation("generate");

      // Log successful AI generation for analytics (non-critical)
      try {
        void logSequenceAction("generate", loopedSequence.id, {
          sequenceWord: loopedSequence.word,
          sequenceLength: loopedSequence.steps.length,
          generationType: "spell",
        });
      } catch {
        // Silently fail - activity logging is non-critical
      }
    } catch (error) {
      generationError =
        error instanceof Error ? error.message : "Spell generation failed";
      spellState.setError(generationError);

      const errorService = getErrorHandler();
      if (errorService) {
        errorService.showUserError({
          message: "Spell generation failed",
          technicalDetails: generationError,
          error: error instanceof Error ? error : new Error(generationError),
          severity: "error",
          context: {
            module: "create",
            tab: "generate",
            action: "spellGenerate",
            additionalData: errorContext,
          },
        });
      }
    } finally {
      isGenerating = false;
      spellState?.setGenerating(false);
    }
  }

  /**
   * Apply LOOP extension to a spell-generated sequence.
   * 1. Try direct extension (sequence already ends at LOOP-compatible position)
   * 2. If not, find bridge letters and auto-insert the first viable option
   * 3. Update letterSources and spell metadata accordingly
   *
   * Required for word-based LOOP because the engine's buildByWord can't
   * auto-append bridge letters to reach LOOP-compatible end positions -
   * the word's letters are fixed.
   */
  async function applySpellLoopExtension(
    sequence: SequenceData,
    loopType: LOOPType,
    period: Period,
    letterSources?: Array<{
      letter: Letter;
      isOriginal: boolean;
      stepIndex: number;
    }>
  ): Promise<SequenceData> {
    try {
      // Path A: Try direct extension (sequence already ends at LOOP-compatible position)
      const analysis = sequenceExtender.analyzeSequence(sequence);
      if (analysis.canExtend) {
        try {
          const extended = await sequenceExtender.extendSequence(sequence, {
            loopType,
            period,
          });
          if (extended) {
            return updateLoopMetadata(extended, sequence, letterSources);
          }
        } catch {
          // Direct extension failed - fall through to bridge-finding
        }
      }

      // Path B: Not directly extendable - find a bridge letter to make it LOOP-compatible
      const circularizationOptions =
        await sequenceExtender.getCircularizationOptions(sequence);
      const extensionOptions =
        await sequenceExtender.getAllExtensionOptions(sequence);
      const allBridgeOptions = [...circularizationOptions, ...extensionOptions];

      if (allBridgeOptions.length === 0) {
        console.warn(
          "[SpellGenerate] No bridge options found for LOOP extension"
        );
        return sequence;
      }

      const expectedRotation = period === Period.QUARTERED ? "quarter" : "half";
      const compatibleBridges = allBridgeOptions.filter((opt) => {
        const hasLoopType = opt.availableLOOPs.some(
          (l) => l.loopType === loopType
        );
        if (!hasLoopType) return false;
        if (opt.rotationRelation) {
          return opt.rotationRelation === expectedRotation;
        }
        return true;
      });

      if (compatibleBridges.length === 0) {
        console.warn(
          "[SpellGenerate] No bridge options compatible with",
          loopType,
          period
        );
        return sequence;
      }

      const bestBridge = compatibleBridges[0]!;
      const bridgeLetter = bestBridge.bridgeLetters[0];
      if (!bridgeLetter) return sequence;

      const extended = await sequenceExtender.extendWithBridge(
        sequence,
        bridgeLetter,
        loopType,
        bestBridge.pictographData,
        period
      );

      if (!extended) return sequence;

      const updatedSources = [
        ...(letterSources ?? []),
        {
          letter: bridgeLetter,
          isOriginal: false,
          stepIndex: (sequence.steps?.length ?? 0) + 1,
        },
      ];

      return updateLoopMetadata(extended, sequence, updatedSources);
    } catch (error) {
      console.warn("[SpellGenerate] LOOP extension failed:", error);
      return sequence;
    }
  }

  function updateLoopMetadata(
    extended: SequenceData,
    original: SequenceData,
    letterSources?: Array<{
      letter: Letter;
      isOriginal: boolean;
      stepIndex: number;
    }>
  ): SequenceData {
    const originalStepCount = original.steps?.length ?? 0;
    const extendedSources =
      extended.steps?.map((step, index) => {
        if (index < originalStepCount && letterSources?.[index]) {
          return {
            letter: (step.letter || "") as Letter,
            isOriginal: letterSources[index]!.isOriginal,
            stepIndex: index + 1,
          };
        }
        return {
          letter: (step.letter || "") as Letter,
          isOriginal: false,
          stepIndex: index + 1,
        };
      }) ?? [];

    const extendedWord =
      extended.word ||
      extended.steps?.map((s) => s.letter || "").join("") ||
      "";

    return {
      ...extended,
      word: extendedWord,
      metadata: {
        ...extended.metadata,
        spellData: {
          originalWord: original.word || "",
          expandedWord: extendedWord,
          letterSources: extendedSources,
        },
      },
    };
  }

  async function updateWorkbenchWithSequence(sequence: SequenceData) {
    try {
      const sequenceState = getSequenceState?.();
      if (!sequenceState) return;

      const animationTarget = getAnimationTarget?.();
      const hasExistingSequence = sequenceState.getCurrentSteps().length > 0;

      // An occupied grid fades out first so the reveal always starts from an
      // empty stage — the wave reads as the new sequence arriving, not as the
      // old one being overwritten.
      if (hasExistingSequence) {
        if (animationTarget) {
          animationTarget.clear();
        } else {
          window.dispatchEvent(new CustomEvent("clear-sequence-animation"));
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Flush stale positions so incoming steps render at their correct
      // locations immediately rather than animating from the old sequence's spots.
      clearArrowPositionCache();
      clearPropPositionCache();

      const isSequential = getIsSequential?.() ?? false;

      if (animationTarget) {
        animationTarget.prepare(sequence.steps.length, isSequential);
      } else {
        // The module workbench may not be mounted yet on a first generation.
        setPendingGenerationAnimation(true);
        window.dispatchEvent(
          new CustomEvent("prepare-sequence-animation", {
            detail: {
              isSequential,
              stepCount: sequence.steps.length,
            },
          })
        );
      }

      // Small delay to ensure the prepare event is processed before updating sequence
      // This allows the StepGrid to set up animation state before receiving new steps
      await new Promise((resolve) => setTimeout(resolve, 10));

      sequenceState.setCurrentSequence(sequence);
    } catch (error) {
      throw new Error(
        `Workbench update failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  function clearError() {
    generationError = null;
  }

  function getGenerationSummary() {
    return {
      isGenerating,
      hasLastGenerated: lastGeneratedSequence !== null,
      lastGeneratedName: lastGeneratedSequence?.name || null,
      lastGeneratedSteps: lastGeneratedSequence?.steps.length || 0,
      hasError: generationError !== null,
      errorMessage: generationError,
    };
  }

  return {
    get isGenerating() {
      return isGenerating;
    },
    get lastGeneratedSequence() {
      return lastGeneratedSequence;
    },
    get lastGeneratedConfig() {
      return lastGeneratedConfig;
    },
    get generationError() {
      return generationError;
    },
    onGenerateClicked,
    onSpellGenerate,
    clearError,
    getGenerationSummary,
  };
}
