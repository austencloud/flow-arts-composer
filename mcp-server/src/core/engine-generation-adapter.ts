/**
 * Engine Generation Adapter
 *
 * Bridges the MCP tool parameters to the shared sequence engine's SequenceBuilder.
 * Used for length-based generation and LOOP sequences — capabilities that the
 * legacy builder doesn't support.
 *
 * The legacy builder (sequence-builder-adapter.ts) remains for plain word-based
 * generation where it's proven and reliable.
 */

import {
  SequenceBuilder,
  type BuildOptions,
  type BuildResult,
  allocateTurns,
  buildConstraintSet,
  getPresetOptions,
  type ConstraintOptions,
} from "@tka/sequence-engine/generation";
import {
  LOOPType,
  Period,
  getLOOPSpecExpansionMultiplier,
  loopSpecFromLegacyRhythm,
  loopSpecWithReflectionAxis,
  type ReflectionAxis,
} from "@tka/sequence-engine/loop";
import { MCPVariationProvider } from "./MCPVariationProvider.js";
import type { PictographData } from "@tka/sequence-engine/generation";
import type {
  SequenceStep,
  SequenceResult,
} from "./sequence-builder-adapter.js";

// LOOP type string → enum mapping

const LOOP_TYPE_MAP: Record<string, LOOPType> = {
  rotated: LOOPType.ROTATED,
  mirrored: LOOPType.MIRRORED,
  flipped: LOOPType.FLIPPED,
  swapped: LOOPType.SWAPPED,
  inverted: LOOPType.INVERTED,
  swapped_inverted: LOOPType.SWAPPED_INVERTED,
  rotated_inverted: LOOPType.ROTATED_INVERTED,
  mirrored_swapped: LOOPType.MIRRORED_SWAPPED,
  mirrored_inverted: LOOPType.MIRRORED_INVERTED,
  rotated_swapped: LOOPType.ROTATED_SWAPPED,
  mirrored_rotated: LOOPType.MIRRORED_ROTATED,
  mirrored_inverted_rotated: LOOPType.MIRRORED_INVERTED_ROTATED,
  mirrored_swapped_inverted: LOOPType.MIRRORED_SWAPPED_INVERTED,
  rotated_swapped_inverted: LOOPType.ROTATED_SWAPPED_INVERTED,
  mirrored_rotated_swapped: LOOPType.MIRRORED_ROTATED_SWAPPED,
  mirrored_rotated_inverted_swapped: LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  strict_rewound: LOOPType.REWOUND,
  rewound: LOOPType.REWOUND,
};

// LOOP type → component names (for renderer metadata)

const LOOP_TYPE_COMPONENTS: Record<string, string[]> = {
  rotated: ["rotated"],
  mirrored: ["mirrored"],
  flipped: ["flipped"],
  swapped: ["swapped"],
  inverted: ["inverted"],
  swapped_inverted: ["swapped", "inverted"],
  rotated_inverted: ["rotated", "inverted"],
  mirrored_swapped: ["mirrored", "swapped"],
  mirrored_inverted: ["mirrored", "inverted"],
  rotated_swapped: ["rotated", "swapped"],
  mirrored_rotated: ["mirrored", "rotated"],
  mirrored_inverted_rotated: ["mirrored", "inverted", "rotated"],
  mirrored_swapped_inverted: ["mirrored", "swapped", "inverted"],
  rotated_swapped_inverted: ["rotated", "swapped", "inverted"],
  mirrored_rotated_swapped: ["mirrored", "rotated", "swapped"],
  mirrored_rotated_inverted_swapped: [
    "mirrored",
    "rotated",
    "inverted",
    "swapped",
  ],
  strict_rewound: ["rewound"],
  rewound: ["rewound"],
};

// Public interface

export interface EngineGenerationParams {
  /** Word to spell (mutually exclusive routing with length, but word wins if both present) */
  word?: string;
  /** Number of steps for freeform generation */
  length?: number;
  /** Grid mode */
  gridMode: string;
  /** Prop used for generation and rendering */
  propType?: string;
  /** Difficulty level 1-3 */
  level: number;
  /** Maximum turn intensity 0-3 */
  turnIntensity?: number;
  /** Named constraint preset (smooth, reversal, etc.) */
  constraintPreset?: string;
  /** Natural language constraints */
  constraints?: string;
  /** Hand path continuity axis */
  handPathMode?: "smooth" | "mixed" | "choppy";
  /** Motion family filter */
  motionTypeFilter?: "no-dash" | "prefer-dash";
  /** Force start placement */
  startPlacement?: string;
  /** Force end placement (last step must end here) */
  endPlacement?: string;
  /** Start placements to exclude from random start pool */
  blockedStartPlacements?: string[];
  /** Letters that must NOT appear in the sequence */
  mustNotContainLetters?: string[];
  /** Letters that MUST appear at least once */
  mustContainLetters?: string[];
  /** LOOP type string (triggers LOOP extension) */
  loopType?: string;
  /** Slice size for LOOP rotation */
  period?: "halved" | "quartered";
  /** Reflection axis, independent of grid mode */
  reflectionAxis?: ReflectionAxis;
  /** Beam search width */
  beamWidth?: number;
  /** Override starting orientation for the left prop (e.g. "in", "out", "clock", "counter") */
  leftStartOrientation?: string;
  /** Override starting orientation for the right prop (e.g. "in", "out", "clock", "counter") */
  rightStartOrientation?: string;
}

export interface EngineGenerationResult {
  result: SequenceResult;
  loopComponents?: string[];
  seedWord?: string;
  derivedWord?: string;
  derivedStepIndices?: number[];
}

/**
 * Generate a sequence through the shared engine's SequenceBuilder.
 *
 * Handles length-based generation, LOOP extension, the 3-axis constraint
 * system, and start placement targeting — everything the legacy builder can't do.
 */
export function generateViaEngine(
  params: EngineGenerationParams,
  allPictographs: PictographData[]
): EngineGenerationResult {
  const provider = new MCPVariationProvider(allPictographs, params.gridMode);
  const builder = new SequenceBuilder(provider);

  const buildOptions = assembleBuildOptions(params);
  const buildResult = builder.build(buildOptions);

  if (params.loopType && params.length && !params.word) {
    const actualLength = buildResult.sequence.length - 1;
    if (actualLength !== params.length) {
      throw new Error(
        `LOOP generation returned ${actualLength} steps; requested ${params.length}`
      );
    }
  }

  const sequenceResult = convertToSequenceResult(buildResult, params);
  const loopComponents = params.loopType
    ? LOOP_TYPE_COMPONENTS[params.loopType]
    : undefined;

  return {
    result: sequenceResult,
    loopComponents,
    seedWord: buildResult.loop?.seedWord,
    derivedWord: buildResult.loop?.derivedWord,
    derivedStepIndices: buildResult.loop?.derivedStepIndices,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: map MCP params → engine BuildOptions
// ─────────────────────────────────────────────────────────────────────────────

function assembleBuildOptions(params: EngineGenerationParams): BuildOptions {
  const options: BuildOptions = {
    gridMode: params.gridMode,
    level: params.level,
    propType: params.propType,
    startPlacement: params.startPlacement,
    endPlacement: params.endPlacement,
    maxTurnIntensity: params.turnIntensity,
    beamWidth: params.beamWidth,
    blockedStartPlacements: params.blockedStartPlacements,
    mustNotContainLetters: params.mustNotContainLetters,
    mustContainLetters: params.mustContainLetters,
    leftStartOrientation: params.leftStartOrientation,
    rightStartOrientation: params.rightStartOrientation,
  };

  // Word or length (one is required, caller validates)
  if (params.word) {
    options.word = params.word;
  }

  // For LOOP generation, the user specifies total length. The seed is a fraction.
  if (params.loopType) {
    const totalLength = params.length ?? (params.word ? undefined : 8);
    const period =
      params.period === "quartered" ? Period.QUARTERED : Period.HALVED;

    const engineLoopType = LOOP_TYPE_MAP[params.loopType];
    if (!engineLoopType) {
      throw new Error(`Unknown LOOP type: "${params.loopType}"`);
    }

    const periodNum = period === Period.QUARTERED ? 4 : 2;
    const baseLoopSpec = loopSpecFromLegacyRhythm(engineLoopType, periodNum);
    const hasReflection =
      String(engineLoopType).includes("mirrored") ||
      String(engineLoopType).includes("flipped");
    if (params.reflectionAxis && !hasReflection) {
      throw new Error(
        "reflectionAxis requires a mirrored or flipped LOOP type"
      );
    }
    const loopSpec = params.reflectionAxis
      ? loopSpecWithReflectionAxis(baseLoopSpec, params.reflectionAxis)
      : baseLoopSpec;
    const expansionMultiplier = getLOOPSpecExpansionMultiplier(loopSpec);

    if (totalLength && !params.word) {
      if (totalLength % expansionMultiplier !== 0) {
        throw new Error(
          `Requested LOOP length ${totalLength} must be divisible by its ` +
            `${expansionMultiplier}x expansion multiplier`
        );
      }
      options.length = totalLength / expansionMultiplier;
    }

    options.loop = {
      type: engineLoopType,
      period,
      useTargetedGeneration: true,
      loopSpec,
      ...(!params.word && totalLength !== undefined
        ? { requestedTotalLength: totalLength }
        : {}),
    };
  } else if (params.length && !params.word) {
    // Freeform (no LOOP): length is the total step count directly
    options.length = params.length;
  }

  // Constraint assembly: layer preset + 3-axis params
  options.constraintOptions = assembleConstraintOptions(params);

  return options;
}

/**
 * Build ConstraintOptions from the MCP's 3-axis system + preset.
 *
 * The preset provides a base, and the 3-axis params override specific dimensions.
 * This mirrors how the app's GenerationOrchestrator.mapConstraints() works.
 */
export function assembleConstraintOptions(
  params: EngineGenerationParams
): ConstraintOptions {
  // Start with preset options if provided
  let options: ConstraintOptions = {};

  if (params.constraintPreset) {
    const presetOptions = getPresetOptions(params.constraintPreset);
    if (presetOptions) {
      options = { ...presetOptions };
    }
  }

  // The 3-axis system maps directly to ConstraintOptions fields.
  // These override whatever the preset set (user's explicit choices win).

  // Axis 1: constraintPreset controls propContinuity (already handled by preset)
  // But if the user specifies constraintPreset as one of the app's 3-axis values
  // (smooth/mixed/choppy), map those to propContinuity directly.
  if (params.constraintPreset === "smooth" && !options.propContinuity) {
    options.propContinuity = "maximize";
  } else if (params.constraintPreset === "mixed") {
    options.propContinuity = "allow-reversals";
  } else if (params.constraintPreset === "choppy") {
    options.propContinuity = "force-reversals";
  }

  // Axis 2: handPathMode
  if (params.handPathMode === "smooth") {
    options.handPathContinuity = "maximize";
  } else if (params.handPathMode === "choppy") {
    options.handPathContinuity = "force-reversals";
  } else if (params.handPathMode === "mixed") {
    options.handPathContinuity = "allow-reversals";
  }

  // Axis 3: motionTypeFilter
  // no-dash = hard exclude; prefer-dash = soft maximize so non-dash letters
  // (connectors, closure steps) remain available when needed. The previous
  // `include: ["dash"]` mapping was a hard filter that excluded all shift
  // and static motions, which broke generation as soon as bridges or
  // closure forced a non-dash pick.
  if (params.motionTypeFilter === "no-dash") {
    const include = options.motionFamily?.include?.filter(
      (family) => family !== "dash"
    );
    const exclude = new Set(options.motionFamily?.exclude ?? []);
    exclude.add("dash");
    options.motionFamily = {
      ...(include && include.length > 0 ? { include } : {}),
      exclude: [...exclude],
    };
  } else if (params.motionTypeFilter === "prefer-dash") {
    const exclude = options.motionFamily?.exclude?.filter(
      (family) => family !== "dash"
    );
    options.motionFamily = {
      ...(options.motionFamily?.include
        ? { include: options.motionFamily.include }
        : {}),
      ...(exclude && exclude.length > 0 ? { exclude } : {}),
    };
    options.dashPreference = "maximize";
  }

  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: convert engine BuildResult → MCP SequenceResult
// ─────────────────────────────────────────────────────────────────────────────

export function convertToSequenceResult(
  buildResult: BuildResult,
  params: EngineGenerationParams
): SequenceResult {
  const steps: SequenceStep[] = buildResult.sequence.map((step, i) => ({
    letter: (step.letter ?? "") as string,
    variation: 0,
    startPlacement: (step.startPlacement ?? "") as string,
    endPlacement: (step.endPlacement ?? "") as string,
    leftMotion: {
      ...step.motions.left,
      hand: "left",
    } as SequenceStep["leftMotion"],
    rightMotion: {
      ...step.motions.right,
      hand: "right",
    } as SequenceStep["rightMotion"],
    stepNumber: step.stepNumber ?? i,
    isBridge: step.isBridge ?? false,
  }));

  // Derive word from non-bridge, non-start-placement letters
  const word = steps
    .slice(1)
    .filter((s) => !s.isBridge)
    .map((s) => s.letter)
    .join("");

  const lastStep = steps[steps.length - 1];

  return {
    word: params.word?.toUpperCase() ?? word,
    steps,
    startPlacement: steps[0]?.startPlacement ?? "",
    endPlacement: lastStep?.endPlacement ?? "",
    isValid: true,
    bridgeStepIndices: buildResult.bridgeStepIndices,
  };
}
