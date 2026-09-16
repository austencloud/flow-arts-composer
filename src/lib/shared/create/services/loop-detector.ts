/**
 * LOOP Detection Service Implementation
 *
 * Analyzes sequences to detect their Linked Orbital Offset Pattern (LOOP) type.
 * This is the reverse of LOOP generation - given a sequence, determine what
 * LOOP type (if any) it follows.
 *
 * CONSOLIDATED (2026-07-05, loop-detection audit): this class used to carry a
 * near-identical fork of the engine's component detection, which shared the
 * engine's aliasing bug family (swap read as invert on the motion-type axis,
 * swap+invert cancelling to nothing, no flipped/rewound paths, single-point
 * rotation false positives). Detection now delegates to the canonical
 * pair-relation detector in @tka/sequence-engine — one algebra, one place to
 * fix. See packages/sequence-engine/src/loop/detection/pair-relation.ts and
 * docs/superpowers/handoffs/2026-07-03-loop-detection-audit-handoff.md.
 *
 * What stays app-side:
 *  - the circularity gate (isSeamlesslyLoopable: placement AND orientation
 *    closure — stricter than the engine's placement check, deliberately, so
 *    hydration only stamps loopType on seamless loops), and
 *  - the invisible-placeholder guard (both-required Step shape: a placeholder
 *    hand must not contribute locations to detection).
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepLike } from "$lib/shared/foundation/domain/models/step-like";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type {
  ILOOPDetector,
  LOOPDetectionResult,
  CompoundPattern,
} from "$lib/shared/create/services/ILOOPDetector";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { loopDetectorClass } from "@tka/sequence-engine/loop";

/** Minimal engine-step shape the canonical detector reads. */
interface EngineStepInput {
  id: string;
  stepNumber: number;
  duration: number;
  letter: string | null;
  startPlacement: string;
  endPlacement: string;
  motions: {
    left: EngineMotionInput;
    right: EngineMotionInput;
  };
}

interface EngineMotionInput {
  motionType: string;
  startLocation: string;
  endLocation: string;
  rotationDirection: string;
}

export class LOOPDetector implements ILOOPDetector {
  /**
   * Analyze a sequence and detect its LOOP type via the canonical engine
   * detector.
   */
  detectLOOPType(sequence: SequenceData): LOOPDetectionResult {
    // Step 1: App-level circularity gate — placement AND orientation closure.
    const isCircular = this.isCircular(sequence);

    if (!isCircular) {
      return {
        isCircular: false,
        loopType: null,
        period: null,
        confidence: "accidental",
      };
    }

    const steps = sequence.steps;

    // Too short to be a LOOP
    if (!steps || steps.length < 2) {
      return {
        isCircular: true,
        loopType: null,
        period: null,
        confidence: "accidental",
      };
    }

    // Step 2: Delegate component detection to the canonical engine detector.
    const engineSteps = this.toEngineSteps(steps);
    const rich = loopDetectorClass.detectLOOPType(engineSteps as never);

    // Step 3: Map the engine result onto the app contract. LOOPType, Period,
    // and LOOPComponent are string enums with identical values on both sides
    // (the app re-exports the engine's LOOPComponent).
    const compoundPattern: CompoundPattern | undefined = rich.compoundPattern
      ? {
          isCompound: true,
          quarteredTransformations:
            rich.compoundPattern.quarteredTransformations.map(String),
          halvedTransformations:
            rich.compoundPattern.halvedTransformations.map(String),
          description: rich.compoundPattern.description,
        }
      : undefined;

    return {
      isCircular: true,
      loopType: (rich.loopType as string as LOOPType) ?? null,
      period: (rich.period as string as Period) ?? null,
      confidence: rich.confidence,
      compoundPattern,
    };
  }

  /**
   * Batch detect LOOP types for multiple sequences
   */
  async batchDetect(sequences: SequenceData[]): Promise<LOOPDetectionResult[]> {
    const results: LOOPDetectionResult[] = [];
    const CHUNK_SIZE = 50;

    for (let i = 0; i < sequences.length; i += CHUNK_SIZE) {
      const chunk = sequences.slice(i, i + CHUNK_SIZE);
      const chunkResults = chunk.map((seq) => this.detectLOOPType(seq));
      results.push(...chunkResults);

      // Yield to event loop between chunks
      if (i + CHUNK_SIZE < sequences.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return results;
  }

  /**
   * Quick check if a sequence is circular — placement AND orientation closure.
   */
  isCircular(sequence: SequenceData): boolean {
    return isSeamlesslyLoopable(sequence);
  }

  /**
   * Convert app steps to the engine's step shape: a stepNumber-0 start marker
   * followed by the letter steps. Invisible placeholder hands contribute empty
   * locations so no location hypothesis can match on them (the presence-as-
   * signal guard the fork used to implement with per-check branches).
   */
  private toEngineSteps(steps: readonly StepLike[]): EngineStepInput[] {
    const letterSteps: EngineStepInput[] = steps.map((s, i) => ({
      id: `step-${i + 1}`,
      stepNumber: i + 1,
      duration: 1,
      letter: (s.letter as string | null) ?? null,
      startPlacement: String(s.startPlacement ?? ""),
      endPlacement: String(s.endPlacement ?? ""),
      motions: {
        left: this.toEngineMotion(s, HandSide.LEFT),
        right: this.toEngineMotion(s, HandSide.RIGHT),
      },
    }));

    const first = letterSteps[0];
    const startMarker: EngineStepInput = {
      id: "step-0",
      stepNumber: 0,
      duration: 1,
      letter: null,
      startPlacement: first?.startPlacement ?? "",
      endPlacement: first?.startPlacement ?? "",
      motions: {
        left: { motionType: "static", startLocation: "", endLocation: "", rotationDirection: "noRotation" },
        right: { motionType: "static", startLocation: "", endLocation: "", rotationDirection: "noRotation" },
      },
    };

    return [startMarker, ...letterSteps];
  }

  private toEngineMotion(step: StepLike, color: HandSide): EngineMotionInput {
    const motion = step.motions?.[color];
    if (!isVisibleMotion(motion)) {
      return { motionType: "", startLocation: "", endLocation: "", rotationDirection: "" };
    }
    return {
      motionType: String(motion.motionType ?? ""),
      startLocation: String(motion.startLocation ?? ""),
      endLocation: String(motion.endLocation ?? ""),
      rotationDirection: String(motion.rotationDirection ?? ""),
    };
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const loopDetector = new LOOPDetector();
