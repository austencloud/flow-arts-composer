/**
 * Sequence Builder
 *
 * The single entry point for all sequence generation. Orchestrates a 7-stage pipeline:
 *
 *   1. Parse letters from word
 *   2. Assemble constraints (domain hard + style from preset/text)
 *   3. Select start placement
 *   4. Allocate turns
 *   5. Beam search
 *   6. Post-process (orientation propagation, reversal detection, convert to SequenceStep)
 *   7. LOOP extension (if requested)
 *
 * Consumers provide an IVariationProvider for their platform (MCP or browser).
 * Everything else is handled internally.
 */

import type { IVariationProvider } from "../data/IVariationProvider.js";
import type {
  PictographData,
  ConstraintSet,
  ConstraintReport,
  ConstraintDetail,
  IConstraint,
  IVariationConstraint,
} from "../constraints/types.js";
import type {
  SequenceStep,
  Motion,
  Orientation,
} from "../../core/types/sequence-engine-types.js";
import {
  OrientationPropagator,
  OrientationCalculator as OrientationCalculatorImpl,
} from "../../core/orientation/OrientationPropagator.js";
import { LetterParser } from "../../core/letters/LetterParser.js";
import { LetterClassifier } from "../../core/letters/LetterClassifier.js";
import {
  allocateTurns,
  type TurnAllocation,
  type TurnAllocationOptions,
} from "../turns/TurnAllocator.js";
import {
  allocationSource,
  patternSource,
  type TurnLanes,
  type TurnSource,
} from "../turns/TurnSource.js";
import { materializeTurn } from "../turns/TurnMaterializer.js";
import type { HandRelationshipOptions } from "../constraints/style/hand-relationship-constraint.js";
import {
  describePropRelationship,
  type PropRelationshipOptions,
} from "../constraints/style/prop-relationship-constraint.js";
import {
  derivePartnerOrientation,
  reportPropRelationship,
  type PropDirection,
  type PropTiming,
} from "../prop-relationship.js";
import {
  resolveLeftSpinRule,
  type LeftSpinRule,
} from "../turns/left-spin-rule.js";
import {
  applyLayerPattern,
  enforceHandFlipParity,
} from "../turns/layer-targeting.js";
import {
  parsePattern,
  type LayerPattern,
} from "../../core/orientation/layer-signature.js";
import { BeamSearch, type BeamSearchResult } from "./BeamSearch.js";
import { Type6Constraint } from "../constraints/domain/Type6Constraint.js";
import { PlacementContinuityConstraint } from "../constraints/domain/PlacementContinuityConstraint.js";
import { ContinuityConstraint } from "../constraints/style/continuity-constraint.js";
import { ConstraintType } from "../constraints/constraint-types.js";
import { FloatConstraint } from "../constraints/domain/FloatConstraint.js";
import { PropTypeConstraint } from "../constraints/domain/PropTypeConstraint.js";
import { getPresetOptions } from "../constraints/presets/preset-constraints.js";
import { buildConstraintSet } from "../constraints/composition/build-constraint-set.js";
import { parseConstraintSet } from "../constraints/parsing/constraint-parser.js";
import type { ConstraintOptions } from "../constraints/composition/constraint-options.js";
import {
  LOOPType,
  Period,
  ROTATED_LOOP_TYPES,
  periodToNumber,
} from "../../loop/loop-types.js";
import type { LOOPSpec } from "../../loop/loop-spec.js";
import {
  LOOPComponent,
  allActiveComponents,
  getReflectionAxis,
  validateLOOPSpec,
} from "../../loop/loop-spec.js";
import { loopExecutorSelector } from "../../loop/execution/LOOPExecutorSelector.js";
import { getLOOPSpecExpansionMultiplier } from "../../loop/execution/spec-executor.js";
import { closeOrientationCycle } from "../../loop/execution/orientation-cycle.js";
import { findLetterByMotions } from "../../loop/LetterLookup.js";
import {
  hasRewoundStructure,
  loopDetectorClass,
} from "../../loop/detection/LOOPDetector.js";
import { reduceToMinimalLoop } from "../../loop/reduction/minimal-loop-reducer.js";
import {
  determineEndPlacementForSpec,
  loopEndPlacementSelector,
} from "../../loop/targeting/LOOPEndPlacementSelector.js";
import {
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
} from "../../loop/placement-maps/circular-placement-maps.js";
import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
  SWAPPED_PLACEMENT_MAP,
} from "../../loop/placement-maps/strict-loop-placement-maps.js";
import {
  PlacementReachabilityAnalyzer,
  type ReachabilityResult,
} from "../reachability/PlacementReachabilityAnalyzer.js";

/**
 * Decide whether this request deliberately needs a four-repetition
 * orientation cycle.
 *
 * An odd wheel-quarter total makes the orientation pattern itself take four
 * repetitions instead of closing after two. This shapes the candidate; the
 * orientation-cycle module still calculates and proves final closure.
 */
function shouldForcePeriod4OrientationCycle(
  loop: LoopOptions | undefined
): boolean {
  if (!loop) return false;
  const periodNum = periodToNumber(loop.period);
  if (periodNum !== 4) return false;
  return !ROTATED_LOOP_TYPES.has(loop.type);
}

/**
 * Can this seed length still carry the spec's overlay stages?
 *
 * An overlay stage partitions the expanded (pre-orientation-closure) sequence
 * into `period` equal blocks and flips the odd ones, so it throws outright when
 * the step count is not divisible by that period. The requested-length re-roll
 * below shrinks the seed by whatever expansion orientation closure turned out
 * to need, and it keeps the shrunken seed for every later attempt — so once it
 * lands on a seed too short for the overlay period, all forty attempts throw
 * ("Overlay inversion requires the step count (2) to be divisible by the
 * period (4)"). Reject such a seed here instead: orientation closure varies
 * with the seed, so re-rolling can still reach the requested length.
 *
 * No overlay stage in the spec means no constraint, so every pre-existing
 * request keeps its exact behavior.
 */
function seedSupportsOverlayStages(
  loopSpec: LOOPSpec | undefined,
  seedLength: number
): boolean {
  if (!loopSpec) return true;
  const components = allActiveComponents(loopSpec);
  const expandedLength = seedLength * getLOOPSpecExpansionMultiplier(loopSpec);
  for (const componentSpec of components.values()) {
    if (componentSpec.mode !== "overlay") continue;
    if (expandedLength % componentSpec.period !== 0) return false;
  }
  return true;
}

/**
 * What the request wants done to the layers, if anything.
 *
 * A named pattern takes precedence: the caller has said exactly which layers
 * they want and how many crossings that implies is their business. Otherwise a
 * four-repetition request becomes the weaker "each prop crosses an odd number
 * of times", which is what makes the orientations take two passes to come back
 * around without dictating where the crossings land.
 */
function resolveLayerShaping(options: BuildOptions):
  | {
      pattern?: LayerPattern;
      handFlipParity?: "odd" | "even";
      level?: number;
      maxTurnIntensity?: number;
    }
  | undefined {
  const { level, maxTurnIntensity } = options;

  if (options.targetLayerPattern) {
    const pattern =
      typeof options.targetLayerPattern === "string"
        ? parsePattern(options.targetLayerPattern)
        : options.targetLayerPattern;
    if (!pattern) {
      throw new Error(
        `Unreadable layer pattern "${String(options.targetLayerPattern)}" — ` +
          `expected a starting layer and one of . B R X per step, like "1:.XB."`
      );
    }
    return { pattern, level, maxTurnIntensity };
  }

  if (shouldForcePeriod4OrientationCycle(options.loop)) {
    return { handFlipParity: "odd", level, maxTurnIntensity };
  }

  return undefined;
}

function resolveTurnAllocationOptions(
  options: BuildOptions
): TurnAllocationOptions {
  const presetOptions = options.constraintPreset
    ? getPresetOptions(options.constraintPreset)
    : undefined;
  const constraints = {
    ...(presetOptions ?? {}),
    ...(options.constraintOptions ?? {}),
  };

  // A prop timing needs the phase kept beat to beat: equal turns on both
  // hands and no floats (a float drops the prop out of its spin).
  const propTiming = options.constraintOptions?.propRelationship?.timing;

  return {
    forcePeriod4OrientationCycle: shouldForcePeriod4OrientationCycle(
      options.loop
    ),
    ...(typeof constraints.turns === "number"
      ? { requiredTurns: constraints.turns }
      : {}),
    allowFloat:
      propTiming === undefined &&
      constraints.motionType !== "pro" &&
      constraints.motionType !== "anti",
    matchHands: options.matchHandTurns === true || propTiming !== undefined,
  };
}

/**
 * Start orientations for a timed prop relationship. The right hand's is the
 * caller's or the dataset's; the left is derived to sit at the requested
 * phase unless the caller pinned both. With only the left pinned the roles
 * swap: Together and Split are their own mirror and Quarter is a quarter
 * either way, so the same derivation serves.
 */
function resolveTimedStartOrientations(
  start: SequenceStep | undefined,
  overrides:
    | { leftStartOrientation?: string; rightStartOrientation?: string }
    | undefined,
  request: { direction: PropDirection; timing: PropTiming }
):
  | { leftStartOrientation?: string; rightStartOrientation?: string }
  | undefined {
  if (!start) return overrides;
  const left = overrides?.leftStartOrientation;
  const right = overrides?.rightStartOrientation;
  if (left && right) return overrides;
  if (!left) {
    const rightOrientation =
      right || start.motions.right.endOrientation || "in";
    const derived = derivePartnerOrientation(
      {
        orientation: rightOrientation,
        location: start.motions.right.endLocation,
      },
      start.motions.left.endLocation,
      request.direction,
      request.timing
    );
    return {
      leftStartOrientation: derived,
      rightStartOrientation: rightOrientation,
    };
  }
  const derived = derivePartnerOrientation(
    { orientation: left, location: start.motions.left.endLocation },
    start.motions.right.endLocation,
    request.direction,
    request.timing
  );
  return { leftStartOrientation: left, rightStartOrientation: derived };
}

// Both callers only ever pass a result that has already gone through
// withPropRelationshipReport, which always adds this detail, so the `?? 1`
// fallback below is unreachable; it exists only to satisfy the return type.
function propRelationshipScore(result: BuildResult): number {
  return (
    result.constraintReport.details.find(
      (d) => d.constraint === ConstraintType.PROP_RELATIONSHIP
    )?.score ?? 1
  );
}

/**
 * Replace the search's per-candidate PROP_RELATIONSHIP entry with the reading
 * of the finished sequence, LOOP extension included. Float beats are exempt.
 */
function withPropRelationshipReport(
  result: BuildResult,
  request: PropRelationshipOptions
): BuildResult {
  const report = reportPropRelationship(result.sequence, request);
  const judged = report.holding + report.offending;
  const score = judged === 0 ? 1 : report.holding / judged;
  const detail: ConstraintDetail = {
    constraint: ConstraintType.PROP_RELATIONSHIP,
    score,
    mode: "hard",
    description:
      `${describePropRelationship(request)}: ` +
      `${report.holding} of ${judged} beats hold` +
      (report.exempt > 0 ? `, ${report.exempt} float beats exempt` : "") +
      (report.firstOffendingIndex !== null
        ? `, first miss at step ${report.firstOffendingIndex}`
        : ""),
  };
  const details = [
    ...result.constraintReport.details.filter(
      (d) => d.constraint !== ConstraintType.PROP_RELATIONSHIP
    ),
    detail,
  ];
  return {
    ...result,
    constraintReport: {
      ...result.constraintReport,
      details,
      score: score === 1 ? result.constraintReport.score : 0,
      satisfied: result.constraintReport.satisfied && score === 1,
    },
  };
}

/**
 * The rule that decides a left dash or static spin, or undefined when turns
 * are independent and no prop relationship is active. Only the random
 * allocation path matches turns; a turnPattern keeps whatever lanes it was
 * given, but a prop relationship still fixes the spin.
 */
function resolveLeftSpinRuleFor(
  options: BuildOptions
): LeftSpinRule | undefined {
  return resolveLeftSpinRule({
    handRelationship: options.constraintOptions?.handRelationship,
    propRelationship: options.constraintOptions?.propRelationship,
    matchHandTurns: options.matchHandTurns === true && !options.turnPattern,
  });
}

// Public types

/**
 * Options for building a sequence.
 */
export interface BuildOptions {
  /** The word to spell (e.g. "BOOK", "AΣ-B"). Either word or length must be provided. */
  word?: string;

  /** Number of steps to generate (excluding start placement). Either word or length must be provided. */
  length?: number;

  /** Grid mode for placement lookups */
  gridMode: string; // "diamond" | "box" | "skewed"

  /** Difficulty level (1-3). Controls turn pool. */
  level: number;

  /** Named constraint preset (e.g. "smooth", "reversal") */
  constraintPreset?: string;

  /** Natural-language constraints (parsed into constraint set) */
  constraints?: string;

  /** Structured constraint composition (alternative to preset/NL) */
  constraintOptions?: ConstraintOptions;

  /** Force a specific start placement (e.g. "alpha1") */
  startPlacement?: string;

  /** Prop type filter passed to variation provider and PropTypeConstraint */
  propType?: string;

  /** Beam width for the search (default 10) */
  beamWidth?: number;

  /** Maximum turn intensity cap (0-3). Undefined = level default. */
  maxTurnIntensity?: number;

  /**
   * Give both hands the same turn value on every step (floats together). With
   * a `constraintOptions.handRelationship` active, a left dash or static that
   * gained turns also takes the spin the relationship implies from the right
   * hand. Random allocation only: a `turnPattern` keeps its own lanes.
   *
   * A `constraintOptions.propRelationship` fixes that spin on its own, match
   * turns or not.
   */
  matchHandTurns?: boolean;

  /**
   * Turns to use instead of rolling them at random, given as a repeating
   * period per prop. `{ left: [0, 1.5], right: [0.5] }` means left alternates no
   * turn and a turn and a half while right takes a half turn every step.
   *
   * The period is indexed modulo its own length, so it covers every step the
   * search produces, including the bridge steps inserted between letters that
   * have no direct transition. It is also visible to the constraint system
   * while letters are being chosen, which is why a zeroed step will not be
   * given a static letter that needs turns to be worth anything.
   */
  turnPattern?: TurnLanes;

  /**
   * Let static (Type 6) letters — α, β, γ — appear as ordinary steps.
   *
   * They are normally kept to starting placements. Both hands stay put, so
   * without turns the step is standing still, and a randomly chosen one is
   * almost never wanted. But prop rotation is the entire point of Type 6, so a
   * static step carrying turns is a real figure, and a turn pattern that calls
   * for one cannot be built without this.
   *
   * Defaults to on for a turn pattern, a layer target, or a hand-relationship
   * LOOP that excludes dashes and can carry turns. Those LOOPs may need a
   * stationary-hand step to reach the closing placement. Set it explicitly to
   * override either way. Even when on, a
   * static step still has to clear Type6Constraint, which refuses level 1
   * outright and refuses any step whose hands both sit at zero turns.
   */
  allowStaticSteps?: boolean;

  /**
   * Ask for a specific layer signature — which of the four radial/non-radial
   * combinations the props sit in, step by step. Give it either a pattern
   * object or its written form, `"1:.XB."`: a starting layer and one symbol per
   * step saying which props cross there (`.` neither, `B` left, `R` right, `X`
   * both).
   *
   * The pattern is independent of the word, so the same one laid over a
   * different word produces the same signature. Needs level 3 — half turns are
   * the only thing that moves a prop between radial and non-radial, and levels
   * 1 and 2 do not have them, which is why every level 1 and 2 sequence sits in
   * one layer from beginning to end.
   */
  targetLayerPattern?: LayerPattern | string;

  /** LOOP extension options. When present, the seed sequence is extended. */
  loop?: LoopOptions;

  /**
   * Force a specific end placement (e.g. "beta5"). The last step must end here.
   * @deprecated Pass `endPlacements` — the search has always modelled the goal
   * as a set, and one-of-many costs nothing extra.
   */
  endPlacement?: string;

  /**
   * Allowed end placements (e.g. ["beta5", "alpha3"]). The last step must end
   * at one of them. Empty or undefined = unconstrained.
   *
   * This is the same `Set<string>` the LOOP targeting path has always built
   * via getAllValidEndPlacements, and PlacementReachabilityAnalyzer already
   * takes the whole set — so N goals search exactly like one, and a wider set
   * is strictly MORE feasible than a single hard target.
   */
  endPlacements?: string[];

  /** Start placements to exclude from the random start pool. */
  blockedStartPlacements?: string[];

  /** Letters that must NOT appear in the generated sequence. */
  mustNotContainLetters?: string[];

  /** Letters that MUST appear at least once in the generated sequence. */
  mustContainLetters?: string[];

  /** Override the starting orientation for the left prop (e.g. "in", "out", "clock", "counter") */
  leftStartOrientation?: string;

  /** Override the starting orientation for the right prop (e.g. "in", "out", "clock", "counter") */
  rightStartOrientation?: string;
}

/**
 * LOOP extension configuration.
 */
export interface LoopOptions {
  /** LOOP transformation type */
  type: LOOPType;

  /** Period for rotational LOOPs (HALVED = 180 deg, QUARTERED = 90 deg) */
  period: Period;

  /** Whether to use targeted end-placement generation */
  useTargetedGeneration?: boolean;

  /** Compositional LOOPSpec. When present, preferred over type+period by new execution paths. */
  loopSpec?: LOOPSpec;

  /** Exact total step count requested by a length-based caller. */
  requestedTotalLength?: number;

  /**
   * Internal retry hint: preserve at least this many output passes per seed
   * when an earlier attempt proved that orientation closure needs them.
   */
  minimumExpansionMultiplier?: number;
}

/**
 * Result of building a sequence.
 */
export interface BuildResult {
  /** The generated sequence steps (index 0 = start placement) */
  sequence: SequenceStep[];

  /** The start placement step */
  startPlacement: SequenceStep;

  /** Indices of steps that are bridge letters */
  bridgeStepIndices: number[];

  /** Constraint satisfaction report */
  constraintReport: ConstraintReport;

  /** Search performance metrics */
  metrics: {
    statesExplored: number;
    beamPrunings: number;
  };

  /** Turn allocation used for the sequence */
  turnAllocation: TurnAllocation;

  /** LOOP extension metadata (present when loop options were provided) */
  loop?: {
    derivedWord: string;
    seedWord: string;
    components: string[];
    derivedStepIndices: number[];
    orientationCycleMultiplier: number;
  };
}

export class SequenceBuilder {
  private readonly letterParser = new LetterParser();
  private readonly letterClassifier = new LetterClassifier();

  constructor(private readonly variationProvider: IVariationProvider) {}

  /**
   * Build a sequence through the 7-stage pipeline.
   *
   * With a prop relationship the result also carries a post-build report:
   * the candidate-time constraint settles shift spins and the spin rule the
   * rest, so a miss here is a phase drift the search could not see. One more
   * roll usually lands; past that, the better of the two comes back with its
   * report so the caller can say the props fell short. With a timing and
   * both start orientations pinned by the caller the phase is already fixed
   * before the search runs, so the retry is skipped and the first attempt is
   * returned as-is.
   * @throws Error if neither word nor length is provided
   * @throws Error if beam search finds no valid path at all
   */
  build(options: BuildOptions): BuildResult {
    const propRelationship = options.constraintOptions?.propRelationship;
    if (!propRelationship) return this.buildOnce(options);

    const first = withPropRelationshipReport(
      this.buildOnce(options),
      propRelationship
    );
    if (propRelationshipScore(first) === 1) return first;

    // A timing pins the phase; with both start orientations also pinned by
    // the caller, that phase is fixed before the search even runs, so a
    // retry cannot change the verdict.
    if (
      propRelationship.timing !== undefined &&
      options.leftStartOrientation !== undefined &&
      options.rightStartOrientation !== undefined
    ) {
      return first;
    }

    let second: BuildResult;
    try {
      second = withPropRelationshipReport(
        this.buildOnce(options),
        propRelationship
      );
    } catch {
      // buildOnce is stateless and its RNG is unseeded Math.random, and the
      // first call already succeeded with identical options, so a second
      // throw here can only be a search dead end.
      return first;
    }
    if (
      second.constraintReport.satisfied !== first.constraintReport.satisfied
    ) {
      // A result whose other hard constraints failed must not beat a clean
      // one, even with a better raw prop score.
      return second.constraintReport.satisfied ? second : first;
    }
    return propRelationshipScore(second) > propRelationshipScore(first)
      ? second
      : first;
  }

  /**
   * One attempt of the pipeline; `build()` adds the prop report and retry.
   */
  private buildOnce(options: BuildOptions): BuildResult {
    if (!options.word && !options.length) {
      throw new Error("Either word or length must be provided");
    }

    if (!options.loop) {
      return options.word
        ? this.buildByWord(options as BuildOptions & { word: string })
        : this.buildByLength(options as BuildOptions & { length: number });
    }

    // Some random seeds are structurally degenerate: a requested swap can be
    // absorbed by hand symmetry, or a valid positional cycle can finish with
    // an open prop orientation. Those are not valid results for a LOOP request.
    // Validate the complete generated sequence at the public boundary and
    // reroll the seed instead of returning a weaker or non-closing pattern.
    const maxAttempts = 40;
    let workingOptions = options;
    let lastFailure = "no result";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = workingOptions.word
          ? this.buildByWord(workingOptions as BuildOptions & { word: string })
          : this.buildByLength(
              workingOptions as BuildOptions & { length: number }
            );

        const requestedTotalLength = workingOptions.loop?.requestedTotalLength;
        if (
          !workingOptions.word &&
          requestedTotalLength !== undefined &&
          result.sequence.length - 1 !== requestedTotalLength
        ) {
          const seedLength = workingOptions.length!;
          const actualLength = result.sequence.length - 1;
          const actualMultiplier = actualLength / seedLength;

          const nextSeedLength = requestedTotalLength / actualMultiplier;

          if (
            Number.isInteger(actualMultiplier) &&
            actualMultiplier >= 1 &&
            requestedTotalLength % actualMultiplier === 0 &&
            seedSupportsOverlayStages(
              workingOptions.loop?.loopSpec,
              nextSeedLength
            )
          ) {
            workingOptions = {
              ...options,
              length: nextSeedLength,
              loop: {
                ...options.loop!,
                minimumExpansionMultiplier: actualMultiplier,
              },
            };
            lastFailure =
              `orientation closure requires ${actualMultiplier} passes; ` +
              `regenerating a ${workingOptions.length}-step seed`;
            continue;
          }

          lastFailure =
            `requested ${requestedTotalLength} steps, but orientation closure ` +
            `requires a ${actualMultiplier}x seed expansion`;
          continue;
        }

        const validationFailure = this.getLOOPValidationFailure(
          result,
          workingOptions.loop!,
          workingOptions.constraintOptions?.handRelationship
        );
        if (!validationFailure) return result;
        lastFailure = validationFailure;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(
      `Unable to generate a valid ${options.loop.type} LOOP after ${maxAttempts} attempts ` +
        `(last failure: ${lastFailure})`
    );
  }

  private getLOOPValidationFailure(
    result: BuildResult,
    loop: LoopOptions,
    handRelationship?: HandRelationshipOptions
  ): string | undefined {
    const first = result.sequence[0];
    const last = result.sequence[result.sequence.length - 1];
    if (!first || !last) return "empty sequence";

    if (first.startPlacement !== last.endPlacement) {
      return `placement did not close (${first.startPlacement} -> ${last.endPlacement})`;
    }

    const openOrientations: string[] = [];
    for (const side of ["left", "right"] as const) {
      const startOrientation = first.motions[side].startOrientation;
      const endOrientation = last.motions[side].endOrientation;
      if (startOrientation !== endOrientation) {
        openOrientations.push(
          `${side} ${startOrientation} -> ${endOrientation}`
        );
      }
    }
    if (openOrientations.length > 0) {
      return `orientation did not close (${openOrientations.join(", ")})`;
    }

    // Overlay transforms intentionally create a blockwise relationship rather
    // than one uniform pair relation across the full sequence. The current
    // detector describes only uniform/compound expand stages, so it cannot
    // validate overlay identity without misclassifying a valid result.
    const activeComponents = loop.loopSpec
      ? allActiveComponents(loop.loopSpec)
      : undefined;
    if (
      activeComponents &&
      [...activeComponents.values()].some(
        (componentSpec) => componentSpec.mode === "overlay"
      )
    ) {
      return undefined;
    }

    const expectedRaw = loop.loopSpec
      ? new Set([...activeComponents!.keys()].map(String))
      : this.componentsFromLegacyType(loop.type);
    const expected = this.normalizeReflectionComponents(expectedRaw);

    if (expected.has("rewound")) {
      return hasRewoundStructure(result.sequence)
        ? undefined
        : "identity mismatch (expected rewound, detected non-rewound)";
    }

    // A constrained relationship can absorb a LOOP component or make the
    // transported reflection use different axes per hand. Verify the requested
    // construction, rather than requiring the detector's preferred label.
    if (handRelationship) {
      return this.matchesRequestedLOOP(result, loop)
        ? undefined
        : "identity mismatch (requested LOOP construction does not match the result)";
    }

    const detected = loopDetectorClass.detectLOOPType(result.sequence);
    const actualRaw = new Set<string>();
    for (const propSpec of [detected.spec?.left, detected.spec?.right]) {
      for (const component of propSpec?.components.keys() ?? []) {
        actualRaw.add(String(component));
      }
    }
    const actual = this.normalizeReflectionComponents(actualRaw);

    if (
      !detected.isCircular ||
      actual.size !== expected.size ||
      [...expected].some((component) => !actual.has(component))
    ) {
      const detectedLabel = detected.isCircular
        ? [...actual].sort().join("+") || "circular-without-transform"
        : "not-circular";
      return (
        `identity mismatch (expected ${[...expected].sort().join("+")}, ` +
        `detected ${detectedLabel})`
      );
    }

    const legacyType = String(loop.type);
    const expectedReflectionAxis = loop.loopSpec
      ? this.directReflectionAxisFromSpec(loop.loopSpec)
      : legacyType.includes("rotated")
        ? null
        : legacyType.includes("mirrored")
          ? DEFAULT_MIRRORED_AXIS
          : legacyType.includes("flipped")
            ? DEFAULT_FLIPPED_AXIS
            : null;
    if (
      expectedReflectionAxis !== null &&
      detected.reflectionAxis !== expectedReflectionAxis
    ) {
      return (
        `identity mismatch (expected ${expectedReflectionAxis} reflection, ` +
        `detected ${detected.reflectionAxis ?? "no reflection axis"})`
      );
    }

    return undefined;
  }

  private matchesRequestedLOOP(
    result: BuildResult,
    loop: LoopOptions
  ): boolean {
    const steps = result.sequence.slice(1);
    const multiplier = result.loop?.orientationCycleMultiplier;
    if (!multiplier || steps.length === 0) return false;
    const seedCount = Math.round(steps.length / multiplier);
    if (seedCount < 1) return false;

    // Closure can repeat the construction and minimization can shorten it.
    // Recover its original seed, then ask the same canonical executor to prove
    // every resulting motion against the returned cycle, including turns.
    const seed = [
      result.sequence[0]!,
      ...Array.from({ length: seedCount }, (_, i) => ({
        ...steps[i % steps.length]!,
        stepNumber: i + 1,
      })),
    ].map((step) => ({
      ...step,
      motions: {
        left: { ...step.motions.left },
        right: { ...step.motions.right },
      },
    }));
    const rebuilt = (
      loop.loopSpec
        ? loopExecutorSelector.executeSpec(seed, loop.loopSpec)
        : loopExecutorSelector
            .getExecutor(loop.type)
            .executeLOOP(seed, loop.period)
    ).slice(1);
    const count = Math.max(steps.length, rebuilt.length);
    if (
      rebuilt.length === 0 ||
      count % Math.min(steps.length, rebuilt.length) !== 0
    ) {
      return false;
    }
    const fields = [
      "startLocation",
      "endLocation",
      "motionType",
      "rotationDirection",
      "turns",
      "prefloatMotionType",
      "prefloatRotationDirection",
    ] as const;
    for (let i = 0; i < count; i++) {
      const actual = steps[i % steps.length]!;
      const expected = rebuilt[i % rebuilt.length]!;
      for (const side of ["left", "right"] as const) {
        if (
          fields.some(
            (field) =>
              actual.motions[side][field] !== expected.motions[side][field]
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }
  /**
   * The detector's axis is directly comparable to the declared axis only when
   * reflection is the location transform for that expansion. A sequential
   * ROTATED + reflection spec contains an already-expanded inner block; its
   * outer, path-transported wrapper is construction metadata rather than one
   * global absolute reflection of the original seed.
   */
  private directReflectionAxisFromSpec(loopSpec: LOOPSpec) {
    const components = allActiveComponents(loopSpec);
    if (components.has(LOOPComponent.ROTATED)) return null;

    for (const component of [LOOPComponent.MIRRORED, LOOPComponent.FLIPPED]) {
      const componentSpec = components.get(component);
      if (componentSpec) return getReflectionAxis(component, componentSpec);
    }
    return null;
  }

  private componentsFromLegacyType(loopType: LOOPType): Set<string> {
    const value = String(loopType);
    if (value.includes("rewound")) return new Set(["rewound"]);

    return new Set(
      ["rotated", "mirrored", "flipped", "swapped", "inverted"].filter(
        (component) => value.includes(component)
      )
    );
  }

  private normalizeReflectionComponents(
    components: ReadonlySet<string>
  ): Set<string> {
    const normalized = new Set(components);
    const hasReflection =
      normalized.has(String(LOOPComponent.MIRRORED)) ||
      normalized.has(String(LOOPComponent.FLIPPED));
    if (hasReflection) {
      normalized.delete(String(LOOPComponent.MIRRORED));
      normalized.delete(String(LOOPComponent.FLIPPED));
      normalized.add("reflection");
    }
    return normalized;
  }

  private buildByWord(options: BuildOptions & { word: string }): BuildResult {
    // Stage 1: Parse letters
    const letters = this.letterParser.parse(options.word);

    if (letters.length === 0) {
      throw new Error(`No letters parsed from word "${options.word}"`);
    }

    // Stage 2: Assemble constraints
    const constraintSet = this.assembleConstraints(options);

    // Stage 3: Allocate turns
    const turnSource: TurnSource = options.turnPattern
      ? patternSource(options.turnPattern)
      : allocationSource(
          allocateTurns(
            letters.length,
            options.level,
            options.maxTurnIntensity,
            resolveTurnAllocationOptions(options)
          )
        );

    // Stage 4: Beam search
    // When LOOP is requested, the last letter must end at a placement
    // compatible with the LOOP type. Retry with different random
    // variations if the first attempt doesn't land at a valid placement.
    const needsLoopTargeting =
      options.loop?.useTargetedGeneration &&
      options.loop.type !== LOOPType.REWOUND;

    // Constrain only the legacy rotate+swap degeneracy. Reflection axes do not
    // require fixed-point starts.
    let effectiveStartPlacement = options.startPlacement;
    if (needsLoopTargeting && options.loop) {
      const constrainedStart = this.constrainStartForLoopType(
        options.loop.type,
        effectiveStartPlacement,
        options.gridMode,
        options.constraintOptions?.handRelationship
      );
      if (constrainedStart) {
        effectiveStartPlacement = constrainedStart;
      }
    }

    // Build the ordered list of (start, requiredEnds) targets to search toward.
    //
    // The closure constraint is enforced by handing the beam search the set of
    // valid end placements for the FINAL letter (search() filters the last step
    // to those). That only works if we know the start placement, because the
    // valid ends are a function of (start, loopType). When the caller pins a
    // start we compute a single target. When the start is random for a LOOP we
    // must NOT let the beam draw blind and then reject the pair post-hoc — for
    // many words that draw is deterministic (same invalid pair every attempt),
    // so retrying can never fix it. Instead we enumerate every closure-
    // compatible start the first letter can occupy and steer the beam toward
    // each one's valid ends until a path closes.
    let searchTargets: Array<{
      start: string | undefined;
      requiredEnds: Set<string> | undefined;
    }>;
    if (needsLoopTargeting && options.loop && !effectiveStartPlacement) {
      searchTargets = this.enumerateLoopStartTargets(
        letters[0]!,
        options.loop,
        options.gridMode,
        options.blockedStartPlacements
      );
      if (searchTargets.length === 0) {
        throw new Error(
          `No closure-compatible start placement exists for a ${options.loop.type} LOOP spelling "${options.word}"`
        );
      }
    } else {
      let requiredEndPlacements: Set<string> | undefined;
      if (needsLoopTargeting && effectiveStartPlacement && options.loop) {
        requiredEndPlacements = this.getAllValidEndPlacements(
          options.loop.type,
          effectiveStartPlacement,
          options.loop.period,
          options.loop.loopSpec
        );
      }
      searchTargets = [
        { start: effectiveStartPlacement, requiredEnds: requiredEndPlacements },
      ];
    }

    // Word-based LOOP needs more retries because the word constrains which
    // placements are reachable. Each retry picks different random variations
    // (rotation-direction resolution + turn-driven enrichment) that may take a
    // different lane through the beam.
    const maxRetries = needsLoopTargeting ? 30 : 1;
    let searchResult: BeamSearchResult | undefined;
    let lastError: string | undefined;

    outer: for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const target of searchTargets) {
        const beamSearch = new BeamSearch(
          this.variationProvider,
          options.gridMode,
          {
            level: options.level,
            allowStaticSteps: this.resolveAllowStaticSteps(options),
            leftSpinRule: resolveLeftSpinRuleFor(options),
          }
        );
        const propContinuity = this.resolveEffectivePropContinuity(options);
        const result = beamSearch.search(
          letters,
          target.start,
          constraintSet,
          options.beamWidth ?? 10,
          target.requiredEnds,
          turnSource,
          propContinuity
        );

        if (result.success || result.steps.length > 0) {
          // Closure guard. search() filters the final letter's DIRECT
          // variations to requiredEnds, but a bridge inserted before the final
          // letter (tryBridges) places that letter without re-applying the
          // filter, so a bridged path can slip through ending off-target. Verify
          // the real end closes the LOOP; if not, this start can't close it —
          // move on to the next candidate rather than handing the LOOP executor
          // a pair it will reject downstream.
          if (target.requiredEnds && target.requiredEnds.size > 0) {
            const actualEnd =
              result.steps[result.steps.length - 1]?.endPlacement;
            if (!actualEnd || !target.requiredEnds.has(actualEnd)) {
              lastError = `Sequence for "${options.word}" could not close as a ${options.loop?.type} LOOP from ${target.start ?? "?"} (ended ${actualEnd ?? "?"})`;
              continue; // try the next start candidate
            }
          }
          searchResult = result;
          break outer;
        }
        lastError = result.error;
      }
    }

    if (
      !searchResult ||
      (!searchResult.success && searchResult.steps.length === 0)
    ) {
      throw new Error(
        lastError ?? `No valid sequence found for "${options.word}"`
      );
    }

    // Stage 5: Post-process (convert PictographData to SequenceStep)
    const propContinuity = this.resolveEffectivePropContinuity(options);
    const result = this.postProcess(
      searchResult,
      turnSource,
      letters,
      propContinuity,
      {
        leftStartOrientation: options.leftStartOrientation,
        rightStartOrientation: options.rightStartOrientation,
      },
      resolveLayerShaping(options),
      resolveLeftSpinRuleFor(options),
      options.constraintOptions?.propRelationship
    );

    // Stage 6: LOOP extension (if requested)
    if (options.loop) {
      return this.extendWithLOOP(result, options.loop, options.gridMode);
    }

    return result;
  }

  /**
   * constraint scoring. No bridges needed since every transition is direct.
   */
  /**
   * The caller's own end-placement goal, or undefined when they set none.
   *
   * Shared by both attempt loops in buildByLength. It used to be inlined in
   * each, and the second one — the "hard continuity killed the beam, demote to
   * soft and retry" fallback — only ever read the legacy single `endPlacement`.
   * With Props on Choppy, continuity is promoted to hard, the constrained pass
   * fails, and that fallback then regenerated with NO end constraint at all:
   * the user picked two allowed ends and got a sequence ending somewhere else
   * entirely, with no error. Keep this in one place so the two loops cannot
   * drift apart again.
   *
   * LOOP targeting owns the goal set when active, which is why the UI locks the
   * End Placement row while LOOP is on.
   */
  private userEndPlacements(
    options: BuildOptions,
    needsLoopTargeting: boolean | undefined
  ): Set<string> | undefined {
    if (needsLoopTargeting) return undefined;
    const ends = [
      ...(options.endPlacements ?? []),
      ...(options.endPlacement ? [options.endPlacement] : []),
    ];
    return ends.length > 0 ? new Set(ends) : undefined;
  }

  private buildByLength(
    options: BuildOptions & { length: number }
  ): BuildResult {
    const { length } = options;

    // Stage 2: Assemble constraints
    const constraintSet = this.assembleConstraints(options);

    // When the user wants smooth continuity, try promoting the constraint to
    // hard first (no reversals allowed). If the beam dies — which can happen
    // when all variations at a placement reverse the established rotation —
    // fall back to soft continuity so the search still produces a result.
    const effectivePropContinuity =
      this.resolveEffectivePropContinuity(options);
    let promotedContinuity = false;
    if (effectivePropContinuity === "maximize") {
      constraintSet.soft = constraintSet.soft.filter(
        (c) => c.type !== ConstraintType.CONTINUITY
      );
      constraintSet.hard.push(new ContinuityConstraint("enforce"));
      promotedContinuity = true;
    }

    // Stage 3: Allocate turns
    const turnSource: TurnSource = options.turnPattern
      ? patternSource(options.turnPattern)
      : allocationSource(
          allocateTurns(
            length,
            options.level,
            options.maxTurnIntensity,
            resolveTurnAllocationOptions(options)
          )
        );

    // Stage 4: Beam search by length
    // When generating a LOOP seed, the last step must end at a specific
    // placement determined by the LOOP type and start placement. Each LOOP
    // type has its own requirement (rotated = 180°/90° away, inverted =
    // same placement, mirrored = vertically mirrored, etc.).
    //
    // LOOPEndPlacementSelector handles all LOOP types correctly.
    // When no start placement is specified, the beam search picks a random
    // one — we retry up to 10 times if the path fails.
    const needsLoopTargeting =
      options.loop?.useTargetedGeneration &&
      options.loop.type !== LOOPType.REWOUND;

    // Reflection starts are handled by axis-specific seam targeting. The only
    // start override left here avoids the legacy rotate+swap alpha degeneracy.
    let effectiveStartPlacement = options.startPlacement;
    if (needsLoopTargeting && options.loop) {
      const constrainedStart = this.constrainStartForLoopType(
        options.loop.type,
        effectiveStartPlacement,
        options.gridMode,
        options.constraintOptions?.handRelationship
      );
      if (constrainedStart) {
        effectiveStartPlacement = constrainedStart;
      }
    }

    // Build search options for filtering
    const searchOptions = {
      blockedStartPlacements: options.blockedStartPlacements
        ? new Set(options.blockedStartPlacements)
        : undefined,
      mustNotContainLetters: options.mustNotContainLetters
        ? new Set(options.mustNotContainLetters)
        : undefined,
      mustContainLetters: options.mustContainLetters
        ? new Set(options.mustContainLetters)
        : undefined,
    };

    // Pre-filter variations by hard constraints for reachability analysis.
    // This only runs once (not per-retry) since hard constraints don't change.
    // Uses the same static-letter gate as BeamSearch, and must: reachability
    // decides which placements are worth visiting at each step, so excluding
    // static letters here would prune the paths to them before the beam ever
    // offered one.
    const allVariationsForReach = this.variationProvider.getAllVariations(
      options.gridMode
    );
    let reachabilityPool = this.resolveAllowStaticSteps(options)
      ? allVariationsForReach
      : allVariationsForReach.filter(
          (p) => !this.letterClassifier.isType6(p.letter)
        );
    if (
      options.mustNotContainLetters &&
      options.mustNotContainLetters.length > 0
    ) {
      const excluded = new Set(options.mustNotContainLetters);
      reachabilityPool = reachabilityPool.filter(
        (p) => !excluded.has(p.letter)
      );
    }
    const hardConstraintFiltered = this.filterByHardConstraints(
      reachabilityPool,
      constraintSet.hard
    );
    const eligibleStarts = new Set(
      hardConstraintFiltered.map((variation) => variation.startPlacement)
    );

    // A LOOP's target depends on its start. Search each start→end relation as
    // its own problem so backward reachability can keep soft preferences from
    // filling a global beam with attractive paths that cannot close.
    const lengthLoopTargets =
      needsLoopTargeting && !effectiveStartPlacement
        ? Object.entries(
            this.buildLoopPlacementMap(options.loop!, options.gridMode)
          )
            .filter(
              ([start]) =>
                eligibleStarts.has(start) &&
                !searchOptions.blockedStartPlacements?.has(start)
            )
            .map(([start, ends]) => ({
              start,
              requiredEnds: new Set(ends),
            }))
            .sort(() => Math.random() - 0.5)
        : undefined;

    // For freeform generation, a random start is part of the search space,
    // not a commitment. Skewed in particular has starts whose outgoing
    // variations can all be removed by a hard filter such as no-static.
    const maxRetries =
      lengthLoopTargets?.length ?? (effectiveStartPlacement ? 1 : 10);
    let searchResult: BeamSearchResult | undefined;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // For LOOP generation, compute the required end placement.
      // If startPlacement is specified, compute upfront. If not,
      // the beam search picks a random start — we compute end placement
      // from the actual start after the first step is selected.
      let requiredEndPlacements: Set<string> | undefined;
      let loopPlacementMap: Record<string, string[]> | undefined;
      const loopTarget = lengthLoopTargets?.[attempt];
      const attemptStartPlacement = loopTarget?.start ?? effectiveStartPlacement;

      if (loopTarget) {
        requiredEndPlacements = loopTarget.requiredEnds;
      } else if (needsLoopTargeting && attemptStartPlacement) {
        requiredEndPlacements = this.getAllValidEndPlacements(
          options.loop!.type,
          attemptStartPlacement,
          options.loop!.period,
          options.loop!.loopSpec
        );
      } else if (needsLoopTargeting) {
        // No start placement specified — build a placement map so the beam
        // search can compute the end placement from the actual random start.
        loopPlacementMap = this.buildLoopPlacementMap(
          options.loop!,
          options.gridMode
        );
      }

      requiredEndPlacements =
        this.userEndPlacements(options, needsLoopTargeting) ??
        requiredEndPlacements;

      // Backward reachability analysis: whenever we have a concrete goal,
      // pre-compute which placements can participate in a path to it. This is
      // required for soft preferences too: scoring must not prune every lane
      // that can still reach the seam.
      let reachability: ReachabilityResult | undefined;
      if (requiredEndPlacements && requiredEndPlacements.size > 0) {
        const analyzer = new PlacementReachabilityAnalyzer();
        reachability = analyzer.analyze(
          length,
          requiredEndPlacements,
          hardConstraintFiltered,
          searchOptions.blockedStartPlacements
        );

        if (!reachability.feasible) {
          throw new Error(
            `No valid ${length}-step path exists: step ${reachability.emptyStepIndex! + 1} ` +
              `has no reachable placements given the current constraints`
          );
        }
      }

      const beamSearch = new BeamSearch(
        this.variationProvider,
        options.gridMode,
        {
          level: options.level,
          allowStaticSteps: this.resolveAllowStaticSteps(options),
          leftSpinRule: resolveLeftSpinRuleFor(options),
        }
      );
      const propContinuity = this.resolveEffectivePropContinuity(options);
      const result = beamSearch.searchByLength(
        length,
        attemptStartPlacement,
        constraintSet,
        options.beamWidth ?? 10,
        requiredEndPlacements,
        loopPlacementMap,
        searchOptions,
        turnSource,
        propContinuity,
        reachability
      );

      if (result.success || result.steps.length > 0) {
        if (needsLoopTargeting) {
          const closureError = this.getLengthLoopClosureError(
            result,
            options.loop!.type,
            requiredEndPlacements,
            loopPlacementMap
          );
          if (closureError) {
            lastError = closureError;
            continue;
          }
        }

        // Validate mustContainLetters if specified
        if (
          searchOptions.mustContainLetters &&
          searchOptions.mustContainLetters.size > 0
        ) {
          const presentLetters = new Set(
            result.steps.slice(1).map((s) => s.letter)
          );
          const missing = [...searchOptions.mustContainLetters].filter(
            (l) => !presentLetters.has(l)
          );
          if (missing.length > 0) {
            lastError = `Required letters [${missing.join(", ")}] not present in generated sequence`;
            continue; // retry
          }
        }

        searchResult = result;
        break;
      }
      lastError = result.error;
    }

    // If hard continuity killed the beam, demote to soft and retry once.
    // Some placements only have variations that reverse the established rotation,
    // so enforcing continuity as a hard constraint is too strict.
    if (
      (!searchResult ||
        (!searchResult.success && searchResult.steps.length === 0)) &&
      promotedContinuity
    ) {
      constraintSet.hard = constraintSet.hard.filter(
        (c) => c.type !== ConstraintType.CONTINUITY
      );
      constraintSet.soft.push(new ContinuityConstraint("maximize"));

      // Recompute hard-constraint-filtered variations after removing continuity
      const demotedHardFiltered = this.filterByHardConstraints(
        reachabilityPool,
        constraintSet.hard
      );

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        let requiredEndPlacements: Set<string> | undefined;
        let loopPlacementMap: Record<string, string[]> | undefined;
        const loopTarget = lengthLoopTargets?.[attempt];
        const attemptStartPlacement =
          loopTarget?.start ?? effectiveStartPlacement;

        if (loopTarget) {
          requiredEndPlacements = loopTarget.requiredEnds;
        } else if (needsLoopTargeting && attemptStartPlacement) {
          requiredEndPlacements = this.getAllValidEndPlacements(
            options.loop!.type,
            attemptStartPlacement,
            options.loop!.period,
            options.loop!.loopSpec
          );
        } else if (needsLoopTargeting) {
          loopPlacementMap = this.buildLoopPlacementMap(
            options.loop!,
            options.gridMode
          );
        }

        requiredEndPlacements =
          this.userEndPlacements(options, needsLoopTargeting) ??
          requiredEndPlacements;

        // Recompute reachability with the demoted constraint set
        let reachabilityRetry: ReachabilityResult | undefined;
        if (requiredEndPlacements && requiredEndPlacements.size > 0) {
          const analyzer = new PlacementReachabilityAnalyzer();
          reachabilityRetry = analyzer.analyze(
            length,
            requiredEndPlacements,
            demotedHardFiltered,
            searchOptions.blockedStartPlacements
          );

          if (!reachabilityRetry.feasible) {
            throw new Error(
              `No valid ${length}-step path exists: step ${reachabilityRetry.emptyStepIndex! + 1} ` +
                `has no reachable placements given the current constraints`
            );
          }
        }

        const beamSearch = new BeamSearch(
          this.variationProvider,
          options.gridMode,
          {
            level: options.level,
            allowStaticSteps: this.resolveAllowStaticSteps(options),
            leftSpinRule: resolveLeftSpinRuleFor(options),
          }
        );
        const propContinuity = this.resolveEffectivePropContinuity(options);
        const result = beamSearch.searchByLength(
          length,
          attemptStartPlacement,
          constraintSet,
          options.beamWidth ?? 10,
          requiredEndPlacements,
          loopPlacementMap,
          searchOptions,
          turnSource,
          propContinuity,
          reachabilityRetry
        );

        if (result.success || result.steps.length > 0) {
          if (needsLoopTargeting) {
            const closureError = this.getLengthLoopClosureError(
              result,
              options.loop!.type,
              requiredEndPlacements,
              loopPlacementMap
            );
            if (closureError) {
              lastError = closureError;
              continue;
            }
          }

          if (
            searchOptions.mustContainLetters &&
            searchOptions.mustContainLetters.size > 0
          ) {
            const presentLetters = new Set(
              result.steps.slice(1).map((s) => s.letter)
            );
            const missing = [...searchOptions.mustContainLetters].filter(
              (l) => !presentLetters.has(l)
            );
            if (missing.length > 0) {
              lastError = `Required letters [${missing.join(", ")}] not present in generated sequence`;
              continue;
            }
          }
          searchResult = result;
          break;
        }
        lastError = result.error;
      }
    }

    if (
      !searchResult ||
      (!searchResult.success && searchResult.steps.length === 0)
    ) {
      throw new Error(
        lastError ?? "No valid sequence found for length-based generation"
      );
    }

    // Stage 5: Post-process
    const letters = searchResult.steps.slice(1).map((s) => s.letter);
    const propContinuity = this.resolveEffectivePropContinuity(options);
    const result = this.postProcess(
      searchResult,
      turnSource,
      letters,
      propContinuity,
      {
        leftStartOrientation: options.leftStartOrientation,
        rightStartOrientation: options.rightStartOrientation,
      },
      resolveLayerShaping(options),
      resolveLeftSpinRuleFor(options),
      options.constraintOptions?.propRelationship
    );

    // Stage 6: LOOP extension (if requested)
    if (options.loop) {
      return this.extendWithLOOP(result, options.loop, options.gridMode);
    }

    return result;
  }

  /**
   * Verify the real seed seam before handing it to a LOOP executor.
   *
   * BeamSearch enforces this relation while expanding candidates. This guard
   * keeps partial-result and future search paths from silently bypassing it.
   */
  private getLengthLoopClosureError(
    result: BeamSearchResult,
    loopType: LOOPType,
    requiredEndPlacements?: Set<string>,
    loopPlacementMap?: Record<string, string[]>
  ): string | undefined {
    const startPlacement = result.steps[0]?.startPlacement;
    const endPlacement = result.steps[result.steps.length - 1]?.endPlacement;
    const validEnds =
      requiredEndPlacements && requiredEndPlacements.size > 0
        ? [...requiredEndPlacements]
        : startPlacement
          ? loopPlacementMap?.[startPlacement]
          : undefined;

    if (
      !startPlacement ||
      !endPlacement ||
      !validEnds ||
      validEnds.length === 0
    ) {
      return `No valid seed seam exists for a ${loopType} LOOP from ${startPlacement ?? "?"}`;
    }

    if (!validEnds.includes(endPlacement)) {
      return (
        `Seed for ${loopType} LOOP from ${startPlacement} ended at ${endPlacement}; ` +
        `expected one of [${validEnds.join(", ")}]`
      );
    }

    return undefined;
  }

  /**
   *
   * Domain constraints are always-on hard constraints that enforce TKA physics.
   * Style constraints come from presets or natural language parsing.
   */
  private assembleConstraints(options: BuildOptions): ConstraintSet {
    // Always-on domain hard constraints
    const hard: IConstraint[] = [
      new Type6Constraint(),
      new PlacementContinuityConstraint(),
      new FloatConstraint(),
    ];

    if (options.propType) {
      hard.push(new PropTypeConstraint());
    }

    let soft: IConstraint[] = [];

    // Style constraints — all three paths resolve through buildConstraintSet
    let styleSet: ConstraintSet | undefined;

    if (options.constraintOptions) {
      styleSet = buildConstraintSet(options.constraintOptions);
    } else if (options.constraintPreset) {
      const presetOptions = getPresetOptions(options.constraintPreset);
      if (presetOptions) {
        styleSet = buildConstraintSet(presetOptions);
      }
    } else if (options.constraints) {
      // NL parsing still goes through legacy path for now
      const { constraintSet: parsedSet } = parseConstraintSet(
        options.constraints
      );
      styleSet = parsedSet;
    }

    if (styleSet) {
      hard.push(...styleSet.hard);
      soft.push(...styleSet.soft);
    }

    // Preserve weights from style constraints if present
    const weights = styleSet?.weights;
    return { hard, soft, weights };
  }

  /**
   * was used (constraintOptions, preset, or NL constraints). Without this,
   * preset-derived propContinuity was lost and postProcess defaulted to
   * random rotation direction assignment — producing prop reversals even
   * when the user selected "smooth".
   */
  /**
   * Whether static letters may be used as ordinary steps.
   *
   * A no-dash unison LOOP cannot rotate a two-step seed by a quarter turn
   * using shifts alone. A static step with prop turns supplies the missing
   * path without breaking the requested hand relationship. Undirected
   * generation keeps its moving-hand default; an explicit value always wins.
   */
  private resolveAllowStaticSteps(options: BuildOptions): boolean {
    const motionFamily =
      options.constraintOptions?.motionFamily ??
      (options.constraintPreset
        ? getPresetOptions(options.constraintPreset)?.motionFamily
        : undefined);
    const constrainedLoopWithTurns =
      options.loop &&
      options.constraintOptions?.handRelationship &&
      motionFamily?.exclude?.includes("dash") &&
      options.level > 1 &&
      options.maxTurnIntensity !== 0;
    return (
      options.allowStaticSteps ??
      Boolean(
        options.turnPattern ||
        options.targetLayerPattern ||
        constrainedLoopWithTurns
      )
    );
  }

  private resolveEffectivePropContinuity(
    options: BuildOptions
  ): "maximize" | "allow-reversals" | "force-reversals" | undefined {
    // Direct constraintOptions take highest priority
    if (options.constraintOptions?.propContinuity) {
      return options.constraintOptions.propContinuity;
    }

    // Named preset — look up the preset's propContinuity
    if (options.constraintPreset) {
      const presetOptions = getPresetOptions(options.constraintPreset);
      if (presetOptions?.propContinuity) {
        return presetOptions.propContinuity;
      }
    }

    return undefined;
  }

  /**
   * Stage 5: Convert beam search PictographData into SequenceStep format
   * with step indices, turn allocation, and bridge flags.
   */
  private postProcess(
    searchResult: BeamSearchResult,
    turnSource: TurnSource,
    letters: string[],
    propContinuity?: "maximize" | "allow-reversals" | "force-reversals",
    orientationOverrides?: {
      leftStartOrientation?: string;
      rightStartOrientation?: string;
    },
    layerShaping?: {
      /** Put the sequence in these layers, step by step. */
      pattern?: LayerPattern;
      /** Or just settle how many times each prop crosses, and leave where to it. */
      handFlipParity?: "odd" | "even";
      /** Keeps the rewritten turns inside the values this level actually has. */
      level?: number;
      maxTurnIntensity?: number;
    },
    leftSpinRule?: LeftSpinRule,
    propRelationship?: PropRelationshipOptions
  ): BuildResult {
    const bridgeIndices = new Set(searchResult.bridgeStepIndices);
    const sequence: SequenceStep[] = [];

    for (let i = 0; i < searchResult.steps.length; i++) {
      const pd = searchResult.steps[i]!;
      const isBridge = bridgeIndices.has(i);

      // Step index: start placement = 0, first letter = 1, etc.
      // Bridge letters share the step index of the letter they precede.

      // Apply turn allocation. Index 0 = start placement (no turns),
      // letter steps are 1-indexed in the turn allocation arrays.
      const stepTurnIndex = i > 0 ? i - 1 : -1;
      // The source owns the bounds question. A random allocation still runs out
      // past its length, exactly as before; a pattern answers at every index,
      // which is what lets it cover the bridge steps the search inserted.
      const leftTurns =
        stepTurnIndex >= 0 ? turnSource.at(stepTurnIndex, "left") : undefined;
      const rightTurns =
        stepTurnIndex >= 0 ? turnSource.at(stepTurnIndex, "right") : undefined;

      // Get the previous step's rotation directions for continuity
      const prevStep =
        sequence.length > 0 ? sequence[sequence.length - 1] : undefined;
      const prevLeftRot = prevStep?.motions.left.rotationDirection;
      const prevRightRot = prevStep?.motions.right.rotationDirection;

      // Right first: a left dash or static that gains turns takes the spin
      // the rule implies from the right hand (a prop relationship, or match
      // turns plus a hand relationship) instead of its own continuity or
      // coin flip.
      const rightTurn = materializeTurn(pd.rightMotion, rightTurns, {
        previousRotation: prevRightRot,
        propContinuity,
      });
      const leftTurn = materializeTurn(pd.leftMotion, leftTurns, {
        previousRotation: prevLeftRot,
        propContinuity,
        forcedRotationDirection: leftSpinRule
          ? leftSpinRule(rightTurn.rotationDirection)
          : undefined,
      });

      // PictographData from the variation provider carries string-typed
      // motion fields (loaded from JSON). Cast at the boundary into the
      // unified Motion/Step enums — the JSON is trusted.
      const leftMotion = {
        motionType: leftTurn.motionType as Motion["motionType"],
        startLocation: pd.leftMotion.startLocation as Motion["startLocation"],
        endLocation: pd.leftMotion.endLocation as Motion["endLocation"],
        rotationDirection:
          leftTurn.rotationDirection as Motion["rotationDirection"],
        startOrientation: pd.leftMotion
          .startOrientation as Motion["startOrientation"],
        endOrientation: pd.leftMotion
          .endOrientation as Motion["endOrientation"],
        turns: leftTurn.turns as Motion["turns"],
        plane: "wall" as Motion["plane"],
        ...(leftTurn.prefloatMotionType && {
          prefloatMotionType:
            leftTurn.prefloatMotionType as Motion["motionType"],
          prefloatRotationDirection:
            leftTurn.prefloatRotationDirection as Motion["rotationDirection"],
        }),
      };
      const rightMotion = {
        motionType: rightTurn.motionType as Motion["motionType"],
        startLocation: pd.rightMotion.startLocation as Motion["startLocation"],
        endLocation: pd.rightMotion.endLocation as Motion["endLocation"],
        rotationDirection:
          rightTurn.rotationDirection as Motion["rotationDirection"],
        startOrientation: pd.rightMotion
          .startOrientation as Motion["startOrientation"],
        endOrientation: pd.rightMotion
          .endOrientation as Motion["endOrientation"],
        turns: rightTurn.turns as Motion["turns"],
        plane: "wall" as Motion["plane"],
        ...(rightTurn.prefloatMotionType && {
          prefloatMotionType:
            rightTurn.prefloatMotionType as Motion["motionType"],
          prefloatRotationDirection:
            rightTurn.prefloatRotationDirection as Motion["rotationDirection"],
        }),
      };
      sequence.push({
        id: `step-${i}-${pd.letter}`,
        letter: pd.letter as SequenceStep["letter"],
        startPlacement: pd.startPlacement as SequenceStep["startPlacement"],
        endPlacement: pd.endPlacement as SequenceStep["endPlacement"],
        motions: { left: leftMotion, right: rightMotion },
        stepNumber: i,
        duration: 1,
        isBridge,
      });
    }

    // Shape the layers before orientations are worked out, because the layers
    // ARE the orientations read coarsely and both come from the same turns.
    //
    // This has to happen here rather than back at turn allocation: allocation
    // runs before the beam search picks variations, so at that point nobody
    // knows whether a step's "fl" will become a real float (which crosses) or
    // fall back to zero turns (which does not). By now every motion is decided,
    // so the crossing count is exact.
    let shaped = sequence;
    if (layerShaping?.pattern) {
      shaped = applyLayerPattern(shaped, layerShaping.pattern, {
        level: layerShaping.level,
        maxTurnIntensity: layerShaping.maxTurnIntensity,
      }).steps;
    } else if (layerShaping?.handFlipParity) {
      shaped = enforceHandFlipParity(shaped, layerShaping.handFlipParity, {
        level: layerShaping.level,
        maxTurnIntensity: layerShaping.maxTurnIntensity,
      }).steps;
    }

    // With a prop timing the start orientations carry the phase and equal
    // turns keep it, so a missing side is derived from the given one. A pair
    // the caller pinned is theirs; the post-build report says whether it held.
    const startOrientations = propRelationship?.timing
      ? resolveTimedStartOrientations(shaped[0], orientationOverrides, {
          direction: propRelationship.direction,
          timing: propRelationship.timing,
        })
      : orientationOverrides;

    // Propagate orientations through the sequence. The CSV data has
    // orientations for 0-turn variations. After applying non-zero turns,
    // the end orientations must be recalculated: each step's start
    // orientation = previous step's end orientation, and end orientation
    // is derived from motion type + turns + rotation direction.
    const propagator = new OrientationPropagator(
      new OrientationCalculatorImpl()
    );
    const leftStartOrientation = (startOrientations?.leftStartOrientation ||
      shaped[0]?.motions.left.endOrientation ||
      "in") as Orientation;
    let propagated = propagator.propagateForColor(
      shaped,
      "left",
      leftStartOrientation
    );
    const rightStartOrientation = (startOrientations?.rightStartOrientation ||
      shaped[0]?.motions.right.endOrientation ||
      "in") as Orientation;
    propagated = propagator.propagateForColor(
      propagated,
      "right",
      rightStartOrientation
    );

    // Update step 0 (start placement) orientations when overrides are provided.
    // The propagator starts at i=1, so step 0 retains its original CSV orientations.
    // The start placement is a static hold, so start and end orientation are the same.
    if (startOrientations && propagated[0]) {
      const sp = propagated[0];
      if (startOrientations.leftStartOrientation) {
        const leftOri =
          startOrientations.leftStartOrientation as Motion["startOrientation"];
        propagated[0] = {
          ...sp,
          motions: {
            left: {
              ...sp.motions.left,
              startOrientation: leftOri,
              endOrientation: leftOri,
            },
            right: sp.motions.right,
          },
        };
      }
      if (startOrientations.rightStartOrientation) {
        const rightOri =
          startOrientations.rightStartOrientation as Motion["startOrientation"];
        const sp2 = propagated[0]!;
        propagated[0] = {
          ...sp2,
          motions: {
            left: sp2.motions.left,
            right: {
              ...sp2.motions.right,
              startOrientation: rightOri,
              endOrientation: rightOri,
            },
          },
        };
      }
    }

    const startPlacement = propagated[0]!;

    // Report what was actually used rather than what was allocated up front, so
    // the numbers here cover the bridge steps too. Step 0 is the start placement
    // and carries no turns, hence the offset.
    const turnAllocation: TurnAllocation = {
      left: propagated.slice(1).map((_, i) => turnSource.at(i, "left") ?? 0),
      right: propagated.slice(1).map((_, i) => turnSource.at(i, "right") ?? 0),
    };

    return {
      sequence: propagated,
      startPlacement,
      bridgeStepIndices: searchResult.bridgeStepIndices,
      constraintReport: searchResult.constraintReport,
      metrics: {
        statesExplored: searchResult.statesExplored,
        beamPrunings: searchResult.beamPrunings,
      },
      turnAllocation,
    };
  }

  /**
   *
   * The LOOP executors operate on SequenceStep[] directly (via ILOOPExecutor).
   * We select the executor for the requested LOOPType, pass the seed sequence
   * through, then build metadata about what was derived.
   *
   * The executors mutate the input array (shift/unshift the start placement),
   * so we pass a copy to keep the original result intact if needed.
   */
  private extendWithLOOP(
    result: BuildResult,
    loopOptions: LoopOptions,
    gridMode: string
  ): BuildResult {
    // Compositional path: options.loop.loopSpec (declared on LoopOptions,
    // populated today by the MCP adapter via loopSpecFromLegacy for every
    // request) is preferred over type+period execution when present. The
    // legacy type+period is still required alongside it — seam targeting
    // (LOOPEndPlacementSelector, constrainStartForLoopType) reads
    // loopOptions.type/period directly and is unaffected by this branch.
    const loopSpec = loopOptions.loopSpec;
    if (loopSpec) {
      const errors = validateLOOPSpec(loopSpec);
      if (errors.length > 0) {
        throw new Error(
          `Invalid LOOPSpec: ${errors.map((e) => `${e.rule}: ${e.message}`).join("; ")}`
        );
      }
    }

    // Build the seed word from non-start-placement, non-bridge letters
    const seedWord = result.sequence
      .slice(1)
      .filter((s) => !s.isBridge)
      .map((s) => s.letter)
      .join("");

    // Copy the sequence so the executor's mutations don't affect the original
    const inputSteps = result.sequence.map((s) => ({ ...s }));

    // Execute the LOOP transformation. Both paths return the complete
    // circular sequence (start placement + seed steps + derived steps).
    const structurallyExtendedSteps = loopSpec
      ? loopExecutorSelector.executeSpec(inputSteps, loopSpec)
      : loopExecutorSelector
          .getExecutor(loopOptions.type)
          .executeLOOP(inputSteps, loopOptions.period);

    const orientationClosure = closeOrientationCycle(
      structurallyExtendedSteps,
      {
        seedStepCount: Math.max(1, result.sequence.length - 1),
        minimumExpansionMultiplier: loopOptions.minimumExpansionMultiplier,
      }
    );
    const extendedSteps = orientationClosure.steps;

    // The executors carry the SOURCE step's letter onto each derived step
    // (they spread `...sourceStep`). For rewound — and any executor whose
    // transform changes the motion configuration — the reversed motions map to
    // a DIFFERENT letter (e.g. reversing E's motions yields K), so the copied
    // letter is wrong. Re-derive each derived step's letter from its own
    // resulting motions against the pictograph data. This mirrors the app-side
    // SequenceExtender, which already re-derives letters after LOOP execution.
    //
    // The spec path re-derives EVERY letter step, not just steps beyond the
    // original seed: an overlay stage (e.g. inverted, mode "overlay") applies
    // in place over the FULLY EXPANDED sequence, partitioned into `period`
    // equal blocks — which can flip steps that fall within what would
    // otherwise be the "seed" range whenever the overlay's period doesn't
    // line up with the seed length. Re-deriving an unchanged step's letter
    // from its own (unchanged) motions is a no-op, so this is safe for the
    // legacy path's steps too, but we keep the legacy path's original bounds
    // untouched (zero-drift guarantee) and only widen the range on the spec
    // path where the overlay stage genuinely can reach into it.
    const seedStepCountForLetters = result.sequence.length;
    const letterRederiveStart = loopSpec ? 1 : seedStepCountForLetters;
    const allPictographs = this.variationProvider.getAllVariations(gridMode);
    for (let i = letterRederiveStart; i < extendedSteps.length; i++) {
      const step = extendedSteps[i]!;
      const derivedLetter = findLetterByMotions(
        step.motions.left,
        step.motions.right,
        allPictographs
      );
      if (!derivedLetter) {
        throw new Error(
          `LOOP produced a motion pair with no ${gridMode} letter at step ${i}`
        );
      }
      if (derivedLetter !== step.letter) {
        extendedSteps[i] = {
          ...step,
          letter: derivedLetter as SequenceStep["letter"],
        };
      }
    }

    // A transformed result can collapse into a literal copy of a shorter LOOP.
    // Reduce it here, before exact-length validation, so the builder discards
    // that candidate and generates a different seed instead of returning fewer
    // steps than the caller requested.
    const minimal = reduceToMinimalLoop(extendedSteps);
    const completedSteps = minimal.steps;

    // Figure out which steps are derived (everything after the original seed).
    // The original sequence had result.sequence.length steps (including start placement).
    // The seed steps occupy indices 1 through (result.sequence.length - 1).
    // Derived steps start at index result.sequence.length.
    const seedStepCount = result.sequence.length;
    const derivedStepIndices: number[] = [];
    const derivedLetters: string[] = [];

    for (let i = seedStepCount; i < completedSteps.length; i++) {
      derivedStepIndices.push(i);
      derivedLetters.push(completedSteps[i]!.letter ?? "");
    }

    const derivedWord = derivedLetters.join("");

    // The orientation cycle multiplier tells the renderer how many times the
    // orientation pattern repeats. For the legacy type+period path it's a
    // direct function of the period (halved = 2, quartered = 4). For the
    // spec path, per-component periods with independent expand/overlay modes
    // make that formula unreliable (e.g. a fuseable component sharing
    // ROTATED's period is absorbed into ROTATED's implicit rotation rather
    // than multiplying again — see executeSymmetricSpec's fuseableAtSamePeriod
    // branch) — so derive it empirically from the actual expansion the
    // spec-executor just produced, which is correct by construction and
    // never drifts from whatever grouping/overlay rules spec-executor uses.
    const orientationCycleMultiplier =
      (completedSteps.length - 1) / Math.max(1, seedStepCount - 1);

    // Build the component labels (seed + derived segments)
    const components = [seedWord];
    if (derivedWord) {
      components.push(derivedWord);
    }

    return {
      ...result,
      sequence: completedSteps,
      startPlacement: completedSteps[0]!,
      loop: {
        seedWord,
        derivedWord,
        components,
        derivedStepIndices,
        orientationCycleMultiplier,
      },
    };
  }

  /**
   * Avoid starts where rotate+swap collapses into the per-hand identity.
   */
  private constrainStartForLoopType(
    loopType: LOOPType,
    currentStartPlacement?: string,
    gridMode?: string,
    handRelationship?: HandRelationshipOptions
  ): string | undefined {
    // The hard relationship already determines eligible starts. Pinning beta
    // here can exclude every valid start and cannot remove that symmetry.
    if (handRelationship) return undefined;
    // Grid modes occupy disjoint grid points: diamond uses the cardinal
    // (odd-index) placements (beta1/3/5/7…), box uses the intercardinal
    // (even-index) ones (beta2/4/6/8…). A start pinned here MUST exist in the
    // active grid mode — otherwise the beam search has zero variations there
    // and the reachability pass dies at step 1 ("no reachable placements").
    const isBox = (gridMode ?? "").toLowerCase() === "box";

    // Swap+rotate combos degenerate from alpha starts (rotate and swap cancel
    // per-hand); beta is the reliable non-degenerate start (halved 25/25). Pin
    // a random beta unless the caller already chose a non-alpha start. Quarter
    // turns for these combos are gated off in the UI (no quartered combo
    // produces a genuine loop — only pure rotation does), so the halved path is
    // the only one reached here and it is always feasible from beta.
    if (
      loopType === LOOPType.ROTATED_SWAPPED ||
      loopType === LOOPType.ROTATED_SWAPPED_INVERTED
    ) {
      if (currentStartPlacement && !currentStartPlacement.startsWith("alpha")) {
        return undefined; // beta or gamma — keep
      }
      // Only the betas that exist in this grid mode (odd for diamond, even for
      // box). Picking from all 8 pinned a nonexistent parity ~50% of the time.
      const betaPlacements = isBox
        ? ["beta2", "beta4", "beta6", "beta8"]
        : ["beta1", "beta3", "beta5", "beta7"];
      return betaPlacements[Math.floor(Math.random() * betaPlacements.length)];
    }

    return undefined;
  }

  /**
   * Returns only variations that pass all hard constraint checks — the set of
   * transitions the beam search could actually use.
   */
  private filterByHardConstraints(
    variations: PictographData[],
    hardConstraints: IConstraint[]
  ): PictographData[] {
    if (hardConstraints.length === 0) return variations;

    return variations.filter((v) =>
      hardConstraints.every((c) => {
        const asVariation = c as IVariationConstraint;
        if (typeof asVariation.couldSatisfy === "function") {
          return asVariation.couldSatisfy(v);
        }
        // Constraints without couldSatisfy (e.g. PlacementContinuityConstraint)
        // can't pre-filter individual variations — assume they pass.
        return true;
      })
    );
  }

  /**
   * For quartered rotated LOOPs, returns both CW and CCW targets.
   * For other types, returns the single valid end placement.
   */
  private getAllValidEndPlacements(
    loopType: LOOPType,
    startPlacement: string,
    period: Period,
    loopSpec?: LOOPSpec
  ): Set<string> {
    const placements = new Set<string>();

    // Swap+rotate combos are only non-degenerate from beta starts (see
    // LOOPEndPlacementSelector.determineEndPlacement) — enforce it here too
    // because the quartered fast path below bypasses the selector.
    if (
      (loopType === LOOPType.ROTATED_SWAPPED ||
        loopType === LOOPType.ROTATED_SWAPPED_INVERTED) &&
      startPlacement.startsWith("alpha") &&
      !loopSpec
    ) {
      return placements;
    }

    // For rotated LOOP types with quartered slice, both CW and CCW are valid.
    // Swap+rotate combos need the composed seam: end = swap(rotate90(start)).
    // (For beta the swap is positionally invisible, so this matches rotate-only;
    // it matters for gamma starts.)
    if (period === Period.QUARTERED && ROTATED_LOOP_TYPES.has(loopType)) {
      const isSwapRotate =
        loopType === LOOPType.ROTATED_SWAPPED ||
        loopType === LOOPType.ROTATED_SWAPPED_INVERTED;
      const cw = QUARTER_PLACEMENT_MAP_CW[startPlacement];
      const ccw = QUARTER_PLACEMENT_MAP_CCW[startPlacement];
      const cwEnd = isSwapRotate && cw ? SWAPPED_PLACEMENT_MAP[cw] : cw;
      const ccwEnd = isSwapRotate && ccw ? SWAPPED_PLACEMENT_MAP[ccw] : ccw;
      if (cwEnd) placements.add(cwEnd);
      if (ccwEnd) placements.add(ccwEnd);
    } else if (loopSpec) {
      const endPos = determineEndPlacementForSpec(loopSpec, startPlacement);
      if (endPos) placements.add(endPos);
    } else {
      // For all other types, delegate to the standard selector
      const endPos = loopEndPlacementSelector.determineEndPlacement(
        loopType,
        startPlacement,
        period
      );
      if (endPos) placements.add(endPos);
    }

    return placements;
  }

  /**
   * Enumerate the closure-compatible start placements the first letter can
   * occupy for a random-start LOOP, each paired with its valid end placements.
   *
   * A start is a candidate only when (a) the first letter has a variation that
   * begins there in this grid mode, (b) it is not blocked, and (c) the LOOP
   * type yields at least one valid end from it (degenerate starts — e.g.
   * rotated+swapped from alpha — return an empty end set and are skipped). The
   * list is shuffled so repeated calls vary the chosen start rather than always
   * drawing the same one.
   */
  private enumerateLoopStartTargets(
    firstLetter: string,
    loop: LoopOptions,
    gridMode: string,
    blockedStartPlacements?: string[]
  ): Array<{ start: string; requiredEnds: Set<string> }> {
    const blocked = new Set(blockedStartPlacements ?? []);
    const firstVariations = this.variationProvider
      .getAllVariations(gridMode)
      .filter((p) => p.letter === firstLetter);
    const starts = [...new Set(firstVariations.map((p) => p.startPlacement))];

    const targets: Array<{ start: string; requiredEnds: Set<string> }> = [];
    for (const start of starts) {
      if (blocked.has(start)) continue;
      const requiredEnds = this.getAllValidEndPlacements(
        loop.type,
        start,
        loop.period,
        loop.loopSpec
      );
      if (requiredEnds.size > 0) {
        targets.push({ start, requiredEnds });
      }
    }

    // Fisher-Yates shuffle for start-placement variety across calls.
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = targets[i]!;
      targets[i] = targets[j]!;
      targets[j] = tmp;
    }

    return targets;
  }

  /**
   * Maps each possible start placement to ALL its valid end placements
   * for the given LOOP type. For quartered rotated LOOPs, each start
   * maps to both CW and CCW targets.
   */
  private buildLoopPlacementMap(
    loopOptions: LoopOptions,
    gridMode: string
  ): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    const placements = [
      ...new Set(
        this.variationProvider
          .getAllVariations(gridMode)
          .flatMap((variation) => [
            variation.startPlacement,
            variation.endPlacement,
          ])
      ),
    ];
    for (const pos of placements) {
      const endPlacements = this.getAllValidEndPlacements(
        loopOptions.type,
        pos,
        loopOptions.period,
        loopOptions.loopSpec
      );
      if (endPlacements.size > 0) {
        map[pos] = Array.from(endPlacements);
      }
    }
    return map;
  }
}
