/**
 * Beam Search
 *
 * Builds TKA sequences using beam search with constraint scoring.
 * Queries an IVariationProvider for pictograph data instead of receiving
 * raw arrays, and integrates orientation propagation at each step.
 *
 * Refactored from constrained-builder.ts into a class for cleaner composition
 * with SequenceBuilder.
 */

import type { IVariationProvider } from "../data/IVariationProvider.js";
import type {
  PictographData,
  ConstraintSet,
  ConstraintContext,
  SearchState,
  VariationScore,
  ConstraintReport,
} from "../constraints/types.js";
import type { TurnSource } from "../turns/TurnSource.js";
import { scoreAndRankVariations } from "./variation-scorer.js";
import {
  createInitialState,
  extendState,
  pruneBeam,
  getBestState,
  DEFAULT_BEAM_CONFIG,
  type BeamSearchConfig,
} from "./search-state.js";
import { generateConstraintReport } from "../constraints/reporting/report-generator.js";
import { scoreBridgeOptions } from "./bridge-scorer.js";
import { getLetterTransitionGraph } from "../../core/transition-graph/LetterTransitionGraph.js";
import { calculateEndOrientation } from "../../core/orientation/OrientationCalculator.js";
import type {
  Motion,
  Orientation,
} from "../../core/types/sequence-engine-types.js";
import { LetterClassifier } from "../../core/letters/LetterClassifier.js";
import type { ReachabilityResult } from "../reachability/PositionReachabilityAnalyzer.js";
import {
  relatedRotationDirection,
  type HandRelationshipOptions,
} from "../constraints/style/hand-relationship-constraint.js";

/**
 * PropContinuity mode for rotation direction resolution.
 */
export type PropContinuityMode =
  | "maximize"
  | "allow-reversals"
  | "force-reversals";

/**
 * directions. This makes static/dash motions that will get non-zero turns
 * visible to the constraint system on subsequent steps.
 *
 * Without this, the beam search sees statics as "noRotation" and can't
 * detect reversals that will appear after postProcess applies turns.
 */
function enrichWithTurns(
  variation: PictographData,
  stepIndex: number,
  turnSource: TurnSource | undefined,
  previousSteps: PictographData[],
  propContinuity: PropContinuityMode | undefined,
  matchedHandRelationship?: HandRelationshipOptions
): PictographData {
  if (!turnSource) return variation;

  const leftTurns = turnSource.at(stepIndex, "left");
  const rightTurns = turnSource.at(stepIndex, "right");

  // Right first: with matched turns and a hand relationship, a left dash or
  // static that gains turns takes the spin the relationship implies from the
  // right hand instead of its own continuity or coin flip.
  const enrichedRight = enrichMotionDirection(
    variation.rightMotion,
    rightTurns,
    previousSteps,
    "right",
    propContinuity
  );
  const enrichedLeft = enrichMotionDirection(
    variation.leftMotion,
    leftTurns,
    previousSteps,
    "left",
    propContinuity,
    matchedHandRelationship
      ? relatedRotationDirection(
          enrichedRight.rotationDirection as string | undefined,
          matchedHandRelationship
        )
      : undefined
  );

  if (
    enrichedLeft === variation.leftMotion &&
    enrichedRight === variation.rightMotion
  ) {
    return variation; // No changes needed
  }

  return {
    ...variation,
    leftMotion: enrichedLeft,
    rightMotion: enrichedRight,
  };
}

/**
 * For a single hand's motion: if it's noRotation and will get non-zero turns,
 * resolve the rotation direction now (same logic as resolveRotationDirection
 * in SequenceBuilder.postProcess).
 */
function enrichMotionDirection(
  motion: PictographData["leftMotion"],
  turns: number | "fl" | undefined,
  previousSteps: PictographData[],
  hand: "left" | "right",
  propContinuity: PropContinuityMode | undefined,
  forcedDirection?: string
): PictographData["leftMotion"] {
  const hasTurns = turns !== undefined && turns !== 0 && turns !== "fl";
  // Runtime JSON may emit either "noRotation" (canonical) or legacy "no_rot".
  // Treat motion.rotationDirection as its wire string for the absence check.
  const motionDirWire = motion.rotationDirection as string | undefined;
  const isNoRot =
    !motionDirWire ||
    motionDirWire === "noRotation" ||
    motionDirWire === "no_rot";

  if (!hasTurns || !isNoRot) return motion;
  if (forcedDirection) {
    return {
      ...motion,
      rotationDirection: forcedDirection as Motion["rotationDirection"],
    };
  }

  // Find the last real direction from previous steps
  let prevDir: string | null = null;
  for (let i = previousSteps.length - 1; i >= 0; i--) {
    const m =
      hand === "left"
        ? previousSteps[i]!.leftMotion
        : previousSteps[i]!.rightMotion;
    const d = m.rotationDirection as string | undefined;
    if (d && d !== "noRotation" && d !== "no_rot") {
      prevDir = d;
      break;
    }
  }

  let resolvedDir: string;
  if (prevDir) {
    if (propContinuity === "force-reversals") {
      resolvedDir = prevDir === "cw" ? "ccw" : "cw";
    } else if (propContinuity === "maximize") {
      resolvedDir = prevDir;
    } else {
      resolvedDir = Math.random() < 0.5 ? "cw" : "ccw";
    }
  } else {
    resolvedDir = Math.random() < 0.5 ? "cw" : "ccw";
  }

  return {
    ...motion,
    rotationDirection: resolvedDir as Motion["rotationDirection"],
  };
}

/**
 * Result of the beam search.
 */
export interface BeamSearchResult {
  /** Whether a valid sequence was found */
  success: boolean;

  /** The sequence steps (including start position at index 0) */
  steps: PictographData[];

  /** Variation indices for each step */
  variationIndices: number[];

  /** Current end position of the sequence */
  endPosition: string;

  /** Constraint satisfaction report */
  constraintReport: ConstraintReport;

  /** Error message if not successful */
  error?: string;

  /** Number of search states explored */
  statesExplored: number;

  /** Number of beam prunings performed */
  beamPrunings: number;

  /** Indices of steps that are bridge letters (not user-requested) */
  bridgeStepIndices: number[];
}

/**
 * Beam search for constrained sequence generation.
 *
 * Accepts an IVariationProvider to query pictograph data on demand,
 * rather than receiving the full dataset upfront. This keeps memory
 * usage proportional to the search, not the entire alphabet.
 */
export class BeamSearch {
  private readonly letterClassifier = new LetterClassifier();

  /**
   * The turn source for the search currently running. Held here rather than
   * threaded through every call because bridge insertion is three frames deep
   * and would otherwise carry the parameter purely to hand it back. A fresh
   * BeamSearch is built for each search (see SequenceBuilder), so this is a
   * per-search value, not shared state.
   */
  private activeTurnSource: TurnSource | undefined;

  constructor(
    private readonly variationProvider: IVariationProvider,
    private readonly gridMode: string,
    private readonly options: {
      /** Which turns and orientations exist. Constraints that vary by level
       *  read this; without it every step looks like level 1. */
      level?: number;
      /** Offer static (Type 6) letters mid-sequence. Off by default: a static
       *  step the user did not ask for reads as standing still. */
      allowStaticSteps?: boolean;
      /** "Match turns" plus a hand relationship: the left hand's dash or
       *  static spin follows the right hand's. See enrichWithTurns. */
      matchedHandRelationship?: HandRelationshipOptions;
    } = {}
  ) {}

  /**
   * Builds the context a candidate is scored against.
   *
   * Every scoring site goes through here. The four positional facts are the
   * caller's; the level and the step's turns are the search's, and were
   * previously left off every one of the eight call sites — which silently
   * disabled every constraint that reads them.
   */
  private scoringContext(
    base: Pick<
      Omit<ConstraintContext, "candidate">,
      "stepIndex" | "totalSteps" | "previousSteps" | "letter"
    >
  ): Omit<ConstraintContext, "candidate"> {
    return {
      ...base,
      level: this.options.level,
      turnAllocation: this.turnsAt(base.stepIndex),
      gridMode: this.gridMode,
    };
  }

  /**
   * What this step turns, as the constraint system counts it.
   *
   * A float is a rotation like any other, so it counts as turning even though
   * it has no number. Undefined means the source ran out — a bridge step past
   * the end of a fixed allocation — which reads as no turns, because nothing
   * asked that step to turn.
   */
  private turnsAt(stepIndex: number): { left: number; right: number } {
    const asCount = (t: number | "fl" | undefined): number => {
      if (t === "fl") return 1;
      return t ?? 0;
    };
    return {
      left: asCount(this.activeTurnSource?.at(stepIndex, "left")),
      right: asCount(this.activeTurnSource?.at(stepIndex, "right")),
    };
  }

  search(
    letters: string[],
    startPosition: string | undefined,
    constraintSet: ConstraintSet,
    beamWidth?: number,
    requiredEndPositions?: Set<string>,
    turnSource?: TurnSource,
    propContinuity?: PropContinuityMode
  ): BeamSearchResult {
    const config: BeamSearchConfig = {
      ...DEFAULT_BEAM_CONFIG,
      beamWidth: beamWidth ?? DEFAULT_BEAM_CONFIG.beamWidth,
    };
    this.activeTurnSource = turnSource;

    if (letters.length === 0) {
      return this.failResult("No letters provided", 0, 0);
    }

    const firstLetter = letters[0]!;

    // Step 1: Find first letter variations
    const firstLetterVariations = startPosition
      ? this.variationProvider.getVariations(
          firstLetter,
          startPosition,
          this.gridMode
        )
      : this.getAllVariationsForLetter(firstLetter);

    if (firstLetterVariations.length === 0) {
      return this.failResult(
        `No variations found for letter "${firstLetter}"`,
        0,
        0
      );
    }

    // Step 2: Score first letter variations
    const firstLetterScores = scoreAndRankVariations(
      firstLetterVariations,
      this.scoringContext({
        stepIndex: 0,
        totalSteps: letters.length,
        previousSteps: [],
        letter: firstLetter,
      }),
      constraintSet
    );

    // Initialize beam with top-scored first variations
    let beam: SearchState[] = [];
    let statesExplored = 0;
    let beamPrunings = 0;

    for (const scored of firstLetterScores.slice(0, config.beamWidth)) {
      if (!scored.hardConstraintsSatisfied) continue;

      const startPictograph = this.findStartPosition(
        scored.variation.startPosition,
        scored.variation
      );
      if (startPictograph) {
        const initialState = createInitialState(
          startPictograph.variation,
          startPictograph.index
        );
        // Enrich the first step's static/dash motions with their allocated
        // turns so the constraint system sees real rotation directions.
        const enriched = enrichWithTurns(
          scored.variation,
          0,
          turnSource,
          initialState.steps,
          propContinuity,
          this.options.matchedHandRelationship
        );
        const state = extendState(initialState, enriched, scored);
        beam.push(state);
        statesExplored++;
      }
    }

    if (beam.length === 0) {
      return this.failResult(
        "No valid starting configurations found",
        statesExplored,
        beamPrunings
      );
    }

    // Get transition graph for bridge finding
    const transitionGraph = getLetterTransitionGraph();

    // Step 3: Beam search through remaining letters
    for (let i = 1; i < letters.length; i++) {
      const letter = letters[i]!;
      const nextBeam: SearchState[] = [];

      for (const state of beam) {
        // Find variations at current end position
        let validVariations = this.variationProvider.getVariations(
          letter,
          state.currentEndPosition,
          this.gridMode
        );

        // On the final letter, if LOOP requires specific end positions,
        // only keep variations that land there.
        const isFinalLetter = i === letters.length - 1;
        if (
          isFinalLetter &&
          requiredEndPositions &&
          requiredEndPositions.size > 0
        ) {
          validVariations = validVariations.filter((p) =>
            requiredEndPositions.has(p.endPosition)
          );
        }

        if (validVariations.length === 0) {
          // No direct path — try bridge letters
          const previousLetter = state.steps[state.steps.length - 1]?.letter;
          if (!previousLetter) continue;

          const bridgeResult = this.tryBridges(
            state,
            previousLetter,
            letter,
            i,
            letters.length,
            constraintSet,
            config,
            transitionGraph
          );

          statesExplored += bridgeResult.statesExplored;
          nextBeam.push(...bridgeResult.newStates);
        } else {
          // Direct path — score and extend
          const scores = scoreAndRankVariations(
            validVariations,
            this.scoringContext({
              stepIndex: i,
              totalSteps: letters.length,
              previousSteps: state.steps,
              letter,
            }),
            constraintSet
          );

          for (const scored of scores.slice(0, config.beamWidth)) {
            if (!scored.hardConstraintsSatisfied) continue;
            // Enrich static/dash motions with their allocated turns so
            // subsequent steps see real rotation directions, not noRotation.
            const enriched = enrichWithTurns(
              scored.variation,
              i,
              turnSource,
              state.steps,
              propContinuity,
          this.options.matchedHandRelationship
            );
            nextBeam.push(extendState(state, enriched, scored));
            statesExplored++;
          }
        }
      }

      // Prune beam
      beam = pruneBeam(nextBeam, config.beamWidth);
      if (nextBeam.length > config.beamWidth) {
        beamPrunings++;
      }

      if (beam.length === 0) {
        return this.failResult(
          `No valid path found after letter "${letter}" (position ${i + 1})`,
          statesExplored,
          beamPrunings
        );
      }
    }

    // Step 4: Select best final state
    const bestState = getBestState(beam, config.minAcceptableScore);

    if (!bestState) {
      if (config.allowPartial && beam.length > 0) {
        const partial = beam.sort(
          (a, b) => b.cumulativeScore - a.cumulativeScore
        )[0];
        if (partial) {
          return this.buildResult(
            partial,
            constraintSet,
            statesExplored,
            beamPrunings,
            true
          );
        }
      }

      return this.failResult(
        `No sequence met minimum score threshold (${config.minAcceptableScore})`,
        statesExplored,
        beamPrunings
      );
    }

    return this.buildResult(
      bestState,
      constraintSet,
      statesExplored,
      beamPrunings,
      false
    );
  }

  /**
   *
   * Instead of placing specific letters, discovers available letters at each
   * position and picks the best one according to constraint scoring. No bridges
   * are needed since every transition is a direct step from the current position.
   */
  searchByLength(
    length: number,
    startPosition: string | undefined,
    constraintSet: ConstraintSet,
    beamWidth?: number,
    requiredEndPositions?: Set<string>,
    loopPositionMap?: Record<string, string[]>,
    options?: {
      blockedStartPositions?: Set<string>;
      mustNotContainLetters?: Set<string>;
      mustContainLetters?: Set<string>;
    },
    turnSource?: TurnSource,
    propContinuity?: PropContinuityMode,
    reachability?: ReachabilityResult
  ): BeamSearchResult {
    const config: BeamSearchConfig = {
      ...DEFAULT_BEAM_CONFIG,
      beamWidth: beamWidth ?? DEFAULT_BEAM_CONFIG.beamWidth,
    };
    this.activeTurnSource = turnSource;

    if (length <= 0) {
      return this.failResult("Length must be greater than 0", 0, 0);
    }

    // Step 1: Build the candidate pool that seeds the first step.
    //
    // Static (Type 6) letters are normally held out. Both hands stay put, so
    // without turns the step reads as standing still, and a randomly chosen
    // one is almost never what was wanted. When the caller has set an explicit
    // turn pattern, though, a static step is the carrier of the figure — prop
    // rotation is the whole point of Type 6 — so the pool keeps them and
    // Type6Constraint decides step by step, which is what it was written for.
    const allVariations = this.variationProvider.getAllVariations(
      this.gridMode
    );
    let candidatePool = this.options.allowStaticSteps
      ? allVariations
      : allVariations.filter((p) => !this.letterClassifier.isType6(p.letter));

    // Apply letter exclusion filter (mustNotContainLetters)
    if (
      options?.mustNotContainLetters &&
      options.mustNotContainLetters.size > 0
    ) {
      const excluded = options.mustNotContainLetters;
      candidatePool = candidatePool.filter((p) => !excluded.has(p.letter));
    }

    // blockedStartPositions only constrains which position the FIRST step
    // can start from. It must NOT filter the shared candidate pool — steps
    // 2+ need variations at every position the sequence may travel to.
    // If we filtered the pool globally, step 2 would find zero candidates
    // whenever step 1 transitioned to a position that was "blocked."
    let firstStepCandidates: PictographData[];
    if (startPosition) {
      firstStepCandidates = candidatePool.filter(
        (p) => p.startPosition === startPosition
      );
    } else if (
      options?.blockedStartPositions &&
      options.blockedStartPositions.size > 0
    ) {
      const blocked = options.blockedStartPositions;
      firstStepCandidates = candidatePool.filter(
        (p) => !blocked.has(p.startPosition)
      );
    } else {
      firstStepCandidates = candidatePool;
    }

    const reachableStarts = reachability?.reachableAt[0];
    if (reachableStarts) {
      firstStepCandidates = firstStepCandidates.filter((p) =>
        reachableStarts.has(p.startPosition)
      );
    }

    // A LOOP position map is a start→end relation, not merely a source of
    // optional end hints. Remove starts that have no valid relation before
    // scoring so an invalid top-ranked start cannot make the map disappear.
    if (
      (!requiredEndPositions || requiredEndPositions.size === 0) &&
      loopPositionMap
    ) {
      firstStepCandidates = firstStepCandidates.filter((p) => {
        const validEnds = loopPositionMap[p.startPosition];
        return validEnds !== undefined && validEnds.length > 0;
      });
    }

    if (length === 1 && requiredEndPositions && requiredEndPositions.size > 0) {
      const endSet = requiredEndPositions;
      firstStepCandidates = firstStepCandidates.filter((p) =>
        endSet.has(p.endPosition)
      );
    } else if (length === 1 && loopPositionMap) {
      // A single-step state never enters the expansion loop below, so enforce
      // its start-specific endpoint directly on the first variation.
      firstStepCandidates = firstStepCandidates.filter((p) => {
        const validEnds = loopPositionMap[p.startPosition];
        return validEnds?.includes(p.endPosition) ?? false;
      });
    }

    if (firstStepCandidates.length === 0) {
      return this.failResult("No variations available for first step", 0, 0);
    }

    // Step 2: Score first step candidates
    const firstScores = scoreAndRankVariations(
      firstStepCandidates,
      this.scoringContext({
        stepIndex: 0,
        totalSteps: length,
        previousSteps: [],
        letter: firstStepCandidates[0]!.letter,
      }),
      constraintSet
    );

    // Initialize beam with top-scored first variations
    let beam: SearchState[] = [];
    let statesExplored = 0;
    let beamPrunings = 0;

    for (const scored of firstScores.slice(0, config.beamWidth)) {
      if (!scored.hardConstraintsSatisfied) continue;

      const startPictograph = this.findStartPosition(
        scored.variation.startPosition,
        scored.variation
      );
      if (startPictograph) {
        const initialState = createInitialState(
          startPictograph.variation,
          startPictograph.index
        );
        const enriched = enrichWithTurns(
          scored.variation,
          0,
          turnSource,
          initialState.steps,
          propContinuity,
          this.options.matchedHandRelationship
        );
        const state = extendState(initialState, enriched, scored);
        beam.push(state);
        statesExplored++;
      }
    }

    if (beam.length === 0) {
      return this.failResult(
        "No valid starting configurations found for length-based generation",
        statesExplored,
        beamPrunings
      );
    }

    // When seed length is 1, the main loop below doesn't run (i starts at 1,
    // length is 1). The end-position filter inside the loop never fires, so we
    // must enforce it here. Without this, single-step seeds for quartered LOOPs
    // can end at any position, causing the executor to reject the sequence.
    if (length === 1 && requiredEndPositions && requiredEndPositions.size > 0) {
      beam = beam.filter((s) => requiredEndPositions.has(s.currentEndPosition));

      if (beam.length === 0) {
        return this.failResult(
          `No first-step variation ends at required positions [${Array.from(requiredEndPositions).join(", ")}] for single-step seed`,
          statesExplored,
          beamPrunings
        );
      }
    }

    // Step 3: Beam search for remaining steps
    for (let i = 1; i < length; i++) {
      const nextBeam: SearchState[] = [];

      for (const state of beam) {
        // Find all non-Type6 variations at the current end position
        let candidates = candidatePool.filter(
          (p) => p.startPosition === state.currentEndPosition
        );

        // Reachability-guided filtering: if we pre-computed which positions
        // are viable at each step, filter candidates so their endPosition
        // lands in the reachable set for the NEXT step. This prevents the
        // beam from wasting lanes on paths that dead-end at a future step.
        //
        // On the final step, filter to the LOOP-required end positions
        // directly (the reachability backward pass already encodes this,
        // but we keep the explicit check as a fallback for when reachability
        // wasn't computed).
        const isFinalStep = i === length - 1;
        if (reachability && !isFinalStep) {
          const nextReachable = reachability.reachableAt[i + 1];
          if (nextReachable) {
            candidates = candidates.filter((p) =>
              nextReachable.has(p.endPosition)
            );
          }
        } else if (isFinalStep) {
          if (requiredEndPositions && requiredEndPositions.size > 0) {
            candidates = candidates.filter((p) =>
              requiredEndPositions.has(p.endPosition)
            );
          } else if (loopPositionMap) {
            const sequenceStart = state.steps[0]?.startPosition;
            const validEnds = sequenceStart
              ? loopPositionMap[sequenceStart]
              : undefined;
            if (!validEnds || validEnds.length === 0) continue;
            candidates = candidates.filter((p) =>
              validEnds.includes(p.endPosition)
            );
          }
        }

        if (candidates.length === 0) continue;

        // Score all candidates at this position
        const scores = scoreAndRankVariations(
          candidates,
          this.scoringContext({
            stepIndex: i,
            totalSteps: length,
            previousSteps: state.steps,
            letter: candidates[0]!.letter,
          }),
          constraintSet
        );

        for (const scored of scores.slice(0, config.beamWidth)) {
          if (!scored.hardConstraintsSatisfied) continue;
          const enriched = enrichWithTurns(
            scored.variation,
            i,
            turnSource,
            state.steps,
            propContinuity,
          this.options.matchedHandRelationship
          );
          nextBeam.push(extendState(state, enriched, scored));
          statesExplored++;
        }
      }

      // Prune beam
      beam = pruneBeam(nextBeam, config.beamWidth);
      if (nextBeam.length > config.beamWidth) {
        beamPrunings++;
      }

      if (beam.length === 0) {
        return this.failResult(
          `No valid path found at step ${i + 1} of ${length}`,
          statesExplored,
          beamPrunings
        );
      }
    }

    // Step 4: Select best final state
    const bestState = getBestState(beam, config.minAcceptableScore);

    if (!bestState) {
      if (config.allowPartial && beam.length > 0) {
        const partial = beam.sort(
          (a, b) => b.cumulativeScore - a.cumulativeScore
        )[0];
        if (partial) {
          return this.buildResult(
            partial,
            constraintSet,
            statesExplored,
            beamPrunings,
            true
          );
        }
      }

      return this.failResult(
        `No sequence met minimum score threshold (${config.minAcceptableScore})`,
        statesExplored,
        beamPrunings
      );
    }

    return this.buildResult(
      bestState,
      constraintSet,
      statesExplored,
      beamPrunings,
      false
    );
  }

  private tryBridges(
    state: SearchState,
    fromLetter: string,
    toLetter: string,
    stepIndex: number,
    totalLetters: number,
    constraintSet: ConstraintSet,
    config: BeamSearchConfig,
    transitionGraph: ReturnType<typeof getLetterTransitionGraph>
  ): { newStates: SearchState[]; statesExplored: number } {
    const newStates: SearchState[] = [];
    let statesExplored = 0;

    // Try single-letter bridges first (can be scored for constraint optimization)
    let bridgeOptions = transitionGraph.findAllBridgeOptions(
      fromLetter,
      toLetter
    );

    if (bridgeOptions.length > 0) {
      // Single-letter bridge: try all options in score order
      const allPictographs = this.variationProvider.getAllVariations(
        this.gridMode
      );
      const scoredBridges = scoreBridgeOptions(
        bridgeOptions,
        constraintSet,
        allPictographs
      );

      for (const bridgeOption of scoredBridges) {
        if (!bridgeOption) continue;

        const bridgeVariations = this.variationProvider.getVariations(
          bridgeOption.letter,
          state.currentEndPosition,
          this.gridMode
        );
        if (bridgeVariations.length === 0) continue;

        const bridgeScores = scoreAndRankVariations(
          bridgeVariations,
          this.scoringContext({
            stepIndex,
            totalSteps: totalLetters + 1,
            previousSteps: state.steps,
            letter: bridgeOption.letter,
          }),
          constraintSet
        );

        const bestBridgeScore = bridgeScores[0];
        if (!bestBridgeScore || !bestBridgeScore.hardConstraintsSatisfied)
          continue;

        const stateWithBridge = extendState(
          state,
          bestBridgeScore.variation,
          bestBridgeScore,
          true
        );
        statesExplored++;

        // Find target letter from bridge's end position
        const targetVariations = this.variationProvider.getVariations(
          toLetter,
          stateWithBridge.currentEndPosition,
          this.gridMode
        );
        if (targetVariations.length === 0) continue;

        const scores = scoreAndRankVariations(
          targetVariations,
          this.scoringContext({
            stepIndex: stepIndex + 1,
            totalSteps: totalLetters + 1,
            previousSteps: stateWithBridge.steps,
            letter: toLetter,
          }),
          constraintSet
        );

        let bridgeSucceeded = false;
        for (const scored of scores.slice(0, config.beamWidth)) {
          if (!scored.hardConstraintsSatisfied) continue;
          newStates.push(
            extendState(stateWithBridge, scored.variation, scored)
          );
          statesExplored++;
          bridgeSucceeded = true;
        }

        // First working bridge is likely best (sorted by score)
        if (bridgeSucceeded) break;
      }
    } else {
      // No single-letter bridge — fall back to BFS multi-letter path
      const multiBridgePath = transitionGraph.findBridgeLetters(
        fromLetter,
        toLetter
      );
      if (multiBridgePath.length === 0) {
        return { newStates, statesExplored };
      }

      let currentState = state;
      let bridgeSuccess = true;

      for (const bridgeLetter of multiBridgePath) {
        const bridgeVariations = this.variationProvider.getVariations(
          bridgeLetter,
          currentState.currentEndPosition,
          this.gridMode
        );
        if (bridgeVariations.length === 0) {
          bridgeSuccess = false;
          break;
        }

        const bridgeScores = scoreAndRankVariations(
          bridgeVariations,
          this.scoringContext({
            stepIndex,
            totalSteps: totalLetters + multiBridgePath.length,
            previousSteps: currentState.steps,
            letter: bridgeLetter,
          }),
          constraintSet
        );

        const bestBridgeScore = bridgeScores[0];
        if (!bestBridgeScore || !bestBridgeScore.hardConstraintsSatisfied) {
          bridgeSuccess = false;
          break;
        }

        currentState = extendState(
          currentState,
          bestBridgeScore.variation,
          bestBridgeScore,
          true
        );
        statesExplored++;
      }

      if (!bridgeSuccess) {
        return { newStates, statesExplored };
      }

      // Find target letter from final bridge's end position
      const targetVariations = this.variationProvider.getVariations(
        toLetter,
        currentState.currentEndPosition,
        this.gridMode
      );
      if (targetVariations.length === 0) {
        return { newStates, statesExplored };
      }

      const scores = scoreAndRankVariations(
        targetVariations,
        this.scoringContext({
          stepIndex: stepIndex + multiBridgePath.length,
          totalSteps: totalLetters + multiBridgePath.length,
          previousSteps: currentState.steps,
          letter: toLetter,
        }),
        constraintSet
      );

      for (const scored of scores.slice(0, config.beamWidth)) {
        if (!scored.hardConstraintsSatisfied) continue;
        newStates.push(extendState(currentState, scored.variation, scored));
        statesExplored++;
      }
    }

    return { newStates, statesExplored };
  }

  private getAllVariationsForLetter(letter: string): PictographData[] {
    return this.variationProvider
      .getAllVariations(this.gridMode)
      .filter((p) => p.letter === letter);
  }

  private findStartPosition(
    position: string,
    firstVariation: PictographData
  ): { variation: PictographData; index: number } | null {
    const allVariations = this.variationProvider.getAllVariations(
      this.gridMode
    );
    const validStarts = allVariations.filter(
      (p) =>
        this.letterClassifier.isType6(p.letter) &&
        p.startPosition === position &&
        p.endPosition === position
    );

    if (validStarts.length === 0) {
      const startLetter = this.staticLetterForPosition(position);
      if (!startLetter) return null;
      return {
        variation: {
          letter: startLetter,
          startPosition: position,
          endPosition: position,
          timing: "together",
          direction: "same",
          leftMotion: {
            ...firstVariation.leftMotion,
            endLocation: firstVariation.leftMotion.startLocation,
            motionType: "static",
            rotationDirection: "noRotation",
            endOrientation: firstVariation.leftMotion.startOrientation,
            turns: 0,
          },
          rightMotion: {
            ...firstVariation.rightMotion,
            endLocation: firstVariation.rightMotion.startLocation,
            motionType: "static",
            rotationDirection: "noRotation",
            endOrientation: firstVariation.rightMotion.startOrientation,
            turns: 0,
          },
        },
        index: -1,
      };
    }

    const index = Math.floor(Math.random() * validStarts.length);
    const variation = validStarts[index];
    if (!variation) return null;

    return { variation, index };
  }

  private staticLetterForPosition(position: string): string | null {
    if (position.startsWith("alpha")) return "α";
    if (position.startsWith("beta")) return "β";
    if (position.startsWith("gamma")) return "γ";
    if (position.startsWith("zeta")) return "ζ";
    if (position.startsWith("eta")) return "η";
    if (position.startsWith("tau")) return "τ";
    if (position.startsWith("terra")) return "⊕";
    return null;
  }

  /**
   * Each step's start orientation = previous step's end orientation.
   */
  private propagateOrientations(steps: PictographData[]): PictographData[] {
    if (steps.length === 0) return steps;

    const result: PictographData[] = [];
    const startPosition = steps[0];
    if (!startPosition) return steps;

    let leftOrientation = (startPosition.leftMotion.endOrientation ||
      "in") as Orientation;
    let rightOrientation = (startPosition.rightMotion.endOrientation ||
      "in") as Orientation;

    result.push(startPosition);

    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;

      const leftEndOrientation = calculateEndOrientation({
        motionType: step.leftMotion.motionType,
        turns: 0,
        rotationDirection: step.leftMotion.rotationDirection || "cw",
        startLocation: step.leftMotion.startLocation,
        endLocation: step.leftMotion.endLocation,
        startOrientation: leftOrientation,
      });

      const rightEndOrientation = calculateEndOrientation({
        motionType: step.rightMotion.motionType,
        turns: 0,
        rotationDirection: step.rightMotion.rotationDirection || "cw",
        startLocation: step.rightMotion.startLocation,
        endLocation: step.rightMotion.endLocation,
        startOrientation: rightOrientation,
      });

      result.push({
        ...step,
        leftMotion: {
          ...step.leftMotion,
          startOrientation: leftOrientation,
          endOrientation: leftEndOrientation,
        },
        rightMotion: {
          ...step.rightMotion,
          startOrientation: rightOrientation,
          endOrientation: rightEndOrientation,
        },
      });

      leftOrientation = leftEndOrientation;
      rightOrientation = rightEndOrientation;
    }

    return result;
  }

  private buildResult(
    state: SearchState,
    constraintSet: ConstraintSet,
    statesExplored: number,
    beamPrunings: number,
    isPartial: boolean
  ): BeamSearchResult {
    const report = generateConstraintReport(state, constraintSet);
    const stepsWithOrientations = this.propagateOrientations(state.steps);

    const bridgeStepIndices = state.bridgeStepIndices
      ? Array.from(state.bridgeStepIndices).sort((a, b) => a - b)
      : [];

    return {
      success: !isPartial && report.satisfied,
      steps: stepsWithOrientations,
      variationIndices: state.stepScores.map((s) => s.variationIndex),
      endPosition: state.currentEndPosition,
      constraintReport: report,
      statesExplored,
      beamPrunings,
      bridgeStepIndices,
      error: isPartial ? "Partial result (minimum score not met)" : undefined,
    };
  }

  private failResult(
    error: string,
    statesExplored: number,
    beamPrunings: number
  ): BeamSearchResult {
    return {
      success: false,
      steps: [],
      variationIndices: [],
      endPosition: "",
      constraintReport: { score: 0, satisfied: false, details: [] },
      error,
      statesExplored,
      beamPrunings,
      bridgeStepIndices: [],
    };
  }
}
