import type { SequenceEntry } from "$lib/shared/loop-labeler/domain/sequence-models";
import type {
  ILOOPDetector,
  LOOPDetectionResult,
  ModularPattern,
} from "./ILOOPDetector";
import type { TransformationIntervals } from "../domain/models/label-models";
import type { StepComparisonOrchestrator } from "./comparison/step-comparison-orchestrator";
import type { PolyrhythmicLOOPResult } from "./polyrhythmic-detector";
import type {
  InternalStepPair,
  ExtractedStep,
} from "../domain/models/internal-step-models";
import type { ComponentId } from "../domain/constants/loop-components";
import {
  LOOPComponent,
  type DetectedComponent,
  type LOOPDomain,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { detectOrientationPass } from "./loop-orientation-detector";
import { detectUniformPattern } from "./detection";

function componentIdToLOOPComponent(id: ComponentId): LOOPComponent | null {
  switch (id) {
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
      return null;
  }
}

function componentsToDetailed(ids: ComponentId[]): DetectedComponent[] {
  const out: DetectedComponent[] = [];
  for (const id of ids) {
    const component = componentIdToLOOPComponent(id);
    if (component !== null) {
      out.push({ component, domain: "location" });
    }
  }
  return out;
}

function periodFromIntervals(
  intervals: TransformationIntervals,
  isCircular: boolean
): number {
  if (!isCircular) return 1;
  const values = Object.values(intervals).filter(
    (v): v is number => typeof v === "number"
  );
  if (values.length === 0) return 1;
  return Math.max(...values);
}

function mergeComponents(
  locationComponents: DetectedComponent[],
  orientationComponents: DetectedComponent[]
): DetectedComponent[] {
  const byComponent = new Map<LOOPComponent, LOOPDomain>();
  for (const entry of locationComponents) {
    byComponent.set(entry.component, "location");
  }
  for (const entry of orientationComponents) {
    const existing = byComponent.get(entry.component);
    if (existing === "location") {
      byComponent.set(entry.component, "both");
    } else if (!existing) {
      byComponent.set(entry.component, "orientation");
    }
  }
  const out: DetectedComponent[] = [];
  for (const [component, domain] of byComponent) {
    out.push({ component, domain });
  }
  return out;
}

/** Structural interface for polyrhythmic detection dependency */
interface PolyrhythmicService {
  detectPolyrhythmic(rawSequence: Record<string, unknown>[]): PolyrhythmicLOOPResult;
}

/** Structural interface for layered path detection dependency */
interface LayeredPathService {
  detectLayeredPath(rawSequence: Record<string, unknown>[]): LayeredPathResult;
}

export class LOOPDetector implements ILOOPDetector {
  constructor(
    private comparisonOrchestrator: StepComparisonOrchestrator,
    private analysisService: TransformationAnalyzer,
    private polyrhythmicService?: PolyrhythmicService,
    private layeredPathService?: LayeredPathService
  ) {}

  isCircular(sequence: SequenceEntry): boolean {
    const steps = sequence.fullMetadata?.sequence?.filter(
      (b) => typeof b.beat === "number" && b.beat >= 1
    );
    if (!steps || steps.length < 2) return false;

    const startPlacement = sequence.fullMetadata?.sequence?.find(
      (b) => b.beat === 0
    );
    const lastStep = steps[steps.length - 1];
    if (!startPlacement || !lastStep) return false;

    const startPos =
      startPlacement.endPos || startPlacement.sequenceStartPlacement;
    const endPos = lastStep.endPos;
    return startPos === endPos;
  }

  detectLOOP(sequence: SequenceEntry): LOOPDetectionResult {
    const result = this.detectLocationPass(sequence);
    return this.augmentWithOrientation(result, sequence);
  }

  private augmentWithOrientation(
    result: LOOPDetectionResult,
    sequence: SequenceEntry
  ): LOOPDetectionResult {
    // Orientation LOOPs only make sense once the location pass found a real,
    // repeatable loop structure (circular AND not the odd-length / irregular
    // "freeform" fallback). detectOrientationPass emits ROTATED from nothing
    // more than the net start->end orientation delta, so on a freeform or
    // non-circular sequence it manufactures a phantom LOOP — e.g. a 5-beat
    // sequence that merely returns to its start position would light up the
    // header LOOP glyph even though it is not a loop. Gate it.
    if (!result.isCircular || result.isFreeform) {
      return result;
    }
    const orientation = detectOrientationPass(sequence);
    const mergedDetailed = mergeComponents(
      result.componentsDetailed,
      orientation.components
    );
    const period = Math.max(result.period, orientation.period);
    return {
      ...result,
      period,
      componentsDetailed: mergedDetailed,
    };
  }

  private detectLocationPass(sequence: SequenceEntry): LOOPDetectionResult {
    const circular = this.isCircular(sequence);
    const steps = this.comparisonOrchestrator.extractBeats(sequence);

    const rawSequence = (sequence.fullMetadata?.sequence || []) as Record<
      string,
      unknown
    >[];
    const polyrhythmic: PolyrhythmicLOOPResult =
      this.polyrhythmicService?.detectPolyrhythmic(rawSequence) ?? {
        isPolyrhythmic: false,
        polyrhythm: null,
        periods: [],
        motionPeriod: null,
        spatialPeriod: null,
        description: "Polyrhythmic detection not available",
        confidence: 0,
      };
    const layeredPath: LayeredPathResult =
      this.layeredPathService?.detectLayeredPath(rawSequence) ?? {
        isLayeredPath: false,
        leftCycle: null,
        rightCycle: null,
        rhythmType: null,
        polyrhythmRatio: null,
        zoneCoverage: null,
        description: "Layered path detection not available",
        confidence: 0,
      };

    if (!circular || steps.length < 2) {
      return this.buildEmptyResult(circular, polyrhythmic, layeredPath);
    }

    if (steps.length % 2 !== 0) {
      return this.buildFreeformResult(polyrhythmic, layeredPath);
    }

    const candidates = detectUniformPattern(steps, this.comparisonOrchestrator);

    const hasRepeated = candidates.some(
      c => c.components.includes("repeated") && !c.components.includes("rewound")
    );
    const effectiveCandidates = hasRepeated
      ? candidates.filter(c => c.components.includes("rewound"))
      : candidates;

    const uniformCandidates = effectiveCandidates.filter(
      c => !c.components.includes("rewound")
    );
    const rewoundCandidate = effectiveCandidates.find(
      c => c.components.includes("rewound")
    );
    if (uniformCandidates.length > 0) {
      const primary = uniformCandidates[0]!;
      const allComponents = [...primary.components];
      if (rewoundCandidate) {
        allComponents.push("rewound");
      }

      let rotationDirection: "cw" | "ccw" | null = null;
      if (steps.length >= 4 && steps.length % 4 === 0) {
        rotationDirection =
          this.comparisonOrchestrator.detectRotationDirection(steps);
      }

      const intervals = primary.transformationIntervals || {};

      const halvedStepPairs =
        this.comparisonOrchestrator.generateHalvedBeatPairs(steps);
      this.analysisService.reprioritizeBeatPairs(halvedStepPairs);
      const halvedGroups =
        this.analysisService.groupStepPairsByPattern(halvedStepPairs);

      let displayPairs = toPublicStepPairs(halvedStepPairs);
      let displayGroups = halvedGroups;

      if (steps.length >= 4 && steps.length % 4 === 0) {
        const quarteredStepPairs =
          this.comparisonOrchestrator.generateQuarteredBeatPairs(steps);
        this.analysisService.reprioritizeBeatPairs(quarteredStepPairs);
        displayPairs = toPublicStepPairs(quarteredStepPairs);
        displayGroups =
          this.analysisService.groupStepPairsByPattern(quarteredStepPairs);

        // Uniform unanimity only detected halved (period 2). Quartered is
        // strictly more specific (every quartered is also halved). If quarter
        // motions are structurally consistent, upgrade to quartered.
        const currentPeriod = periodFromIntervals(intervals, true);
        if (currentPeriod < 4) {
          const qLen = Math.floor(steps.length / 4);
          const motionsConsistent = this.quarteredMotionsConsistent(steps, qLen);
          if (qLen > 0 && motionsConsistent) {
            // Try modular quartered detection first
            const modularResult = this.detectModularQuarteredPattern(
              quarteredStepPairs,
              rotationDirection,
              polyrhythmic,
              layeredPath
            );
            if (modularResult) {
              this.enrichWithHalvedPrimitives(modularResult, halvedStepPairs);
              return modularResult;
            }
            // Modular detector may reject uniform quartered patterns.
            // Upgrade intervals directly — quarteredMotionsConsistent
            // already confirmed the quartered structure.
            if (intervals.rotation) intervals.rotation = 4;
            if (intervals.swap) intervals.swap = 4;
            if (intervals.mirror) intervals.mirror = 4;
            if (intervals.flip) intervals.flip = 4;
            if (intervals.invert) intervals.invert = 4;
          }
        }
      }

      // Nested rotation recovery. A halved outer transform (mirror / invert /
      // swap) can wrap an INNER rotating cycle that completes fully within
      // each half — e.g. mirrored_inverted_rotated: quarters rotate 180°
      // inside the half, then the whole half mirrors+inverts at the seam.
      // Index-wise half/quarter pair comparisons can't see that rotation
      // (across the seam the rotation composes with the outer transform, so
      // no unanimous "rotated" target exists at either interval). If the
      // first half closes back to the loop's start, it is itself a circular
      // loop — detect it independently and merge its rotation. Rotation is
      // always the innermost layer (no grid position is a rotation fixed
      // point), so ROTATED is the only component recovered this way.
      if (!allComponents.includes("rotated")) {
        const nested = this.detectNestedRotation(steps);
        if (nested) {
          allComponents.push("rotated");
          intervals.rotation = nested.interval;
          if (!rotationDirection) rotationDirection = nested.direction;
        }
      }

      const finalPeriod = periodFromIntervals(intervals, true);

      return {
        loopType: primary.loopType,
        components: allComponents,
        transformationIntervals: intervals,
        rotationDirection: primary.rotationDirection || rotationDirection,
        candidateDesignations: candidates,
        stepPairs: displayPairs,
        stepPairGroups: displayGroups,
        isCircular: true,
        isFreeform: false,
        isModular: false,
        layeredPath,
        isLayeredPath: layeredPath.isLayeredPath,
        polyrhythmic,
        isPolyrhythmic: polyrhythmic.isPolyrhythmic,
        isAxisAlternating: false,
        period: periodFromIntervals(intervals, true),
        componentsDetailed: componentsToDetailed(allComponents as ComponentId[]),
      };
    }

    // Pure rewound: checkRewound matched but no uniform index-wise relation
    // exists (time reversal never produces one). This used to fall through to
    // the fallback result, silently dropping the rewound candidate — a
    // 16-step rewound loop whose reverse relation held on every beat pair
    // was reported as freeform (2026-07-05 loop-detection audit, confirmed
    // against production-generated fixtures).
    if (rewoundCandidate) {
      const rewoundPairs =
        this.comparisonOrchestrator.generateHalvedBeatPairs(steps);
      this.analysisService.reprioritizeBeatPairs(rewoundPairs);
      return {
        loopType: "rewound",
        components: ["rewound"],
        transformationIntervals: {},
        rotationDirection: null,
        candidateDesignations: [rewoundCandidate],
        stepPairs: toPublicStepPairs(rewoundPairs),
        stepPairGroups: this.analysisService.groupStepPairsByPattern(rewoundPairs),
        isCircular: true,
        isFreeform: false,
        isModular: false,
        layeredPath,
        isLayeredPath: layeredPath.isLayeredPath,
        polyrhythmic,
        isPolyrhythmic: polyrhythmic.isPolyrhythmic,
        isAxisAlternating: false,
        period: 2,
        componentsDetailed: componentsToDetailed(["rewound"]),
      };
    }

    const halvedStepPairs =
      this.comparisonOrchestrator.generateHalvedBeatPairs(steps);
    this.analysisService.reprioritizeBeatPairs(halvedStepPairs);
    const halvedStepPairGroups =
      this.analysisService.groupStepPairsByPattern(halvedStepPairs);

    let rotationDirection: "cw" | "ccw" | null = null;
    if (steps.length >= 4 && steps.length % 4 === 0) {
      rotationDirection =
        this.comparisonOrchestrator.detectRotationDirection(steps);
    }

    if (steps.length >= 4 && steps.length % 4 === 0) {
      const quarteredStepPairs =
        this.comparisonOrchestrator.generateQuarteredBeatPairs(steps);
      this.analysisService.reprioritizeBeatPairs(quarteredStepPairs);

      const qLen = Math.floor(steps.length / 4);
      if (qLen > 0 && this.quarteredMotionsConsistent(steps, qLen)) {
        const modularResult = this.detectModularQuarteredPattern(
          quarteredStepPairs,
          rotationDirection,
          polyrhythmic,
          layeredPath
        );
        if (modularResult) {
          this.enrichWithHalvedPrimitives(modularResult, halvedStepPairs);
          return modularResult;
        }
      }
    }

    return this.buildFallbackResult(
      halvedStepPairs,
      halvedStepPairGroups,
      polyrhythmic,
      layeredPath
    );
  }

  private buildFallbackResult(
    halvedStepPairs: InternalStepPair[],
    halvedStepPairGroups: Record<string, number[]>,
    polyrhythmic: PolyrhythmicLOOPResult,
    layeredPath: LayeredPathResult
  ): LOOPDetectionResult {
    const patternGroups = Object.keys(halvedStepPairGroups);
    const hasUnknown = patternGroups.some((p) => p === "UNKNOWN");
    const recognizedPatterns = patternGroups.filter((p) => p !== "UNKNOWN");

    const isModular = !hasUnknown && recognizedPatterns.length > 1;
    const isFreeform = hasUnknown || recognizedPatterns.length === 0;

    const axisAlternating = isModular
      ? this.analysisService.detectAxisAlternatingPattern(
          halvedStepPairs,
          halvedStepPairGroups
        )
      : null;

    return {
      loopType: null,
      components: [],
      transformationIntervals: {},
      rotationDirection: null,
      candidateDesignations: [],
      stepPairs: toPublicStepPairs(halvedStepPairs),
      stepPairGroups: halvedStepPairGroups,
      isCircular: true,
      isFreeform,
      isModular,
      layeredPath,
      isLayeredPath: layeredPath.isLayeredPath,
      polyrhythmic,
      isPolyrhythmic: polyrhythmic.isPolyrhythmic,
      isAxisAlternating: axisAlternating !== null,
      axisAlternatingPattern: axisAlternating
        ? {
            isAxisAlternating: true,
            transformationFamily: axisAlternating.transformationFamily,
            metaPatternType: axisAlternating.metaPatternType,
            patternSequence: axisAlternating.patternSequence,
            description: axisAlternating.description,
          }
        : undefined,
      period: 1,
      componentsDetailed: [],
    };
  }

  private buildEmptyResult(
    isCircular: boolean,
    polyrhythmic: PolyrhythmicLOOPResult,
    layeredPath: LayeredPathResult
  ): LOOPDetectionResult {
    return {
      loopType: null,
      components: [],
      transformationIntervals: {},
      rotationDirection: null,
      candidateDesignations: [],
      stepPairs: [],
      stepPairGroups: {},
      isCircular,
      isFreeform: false,
      isModular: false,
      layeredPath,
      isLayeredPath: layeredPath.isLayeredPath,
      polyrhythmic,
      isPolyrhythmic: polyrhythmic.isPolyrhythmic,
      isAxisAlternating: false,
      period: 1,
      componentsDetailed: [],
    };
  }

  private buildFreeformResult(
    polyrhythmic: PolyrhythmicLOOPResult,
    layeredPath: LayeredPathResult
  ): LOOPDetectionResult {
    return {
      loopType: null,
      components: [],
      transformationIntervals: {},
      rotationDirection: null,
      candidateDesignations: [],
      stepPairs: [],
      stepPairGroups: {},
      isCircular: true,
      isFreeform: true,
      isModular: false,
      layeredPath,
      isLayeredPath: layeredPath.isLayeredPath,
      polyrhythmic,
      isPolyrhythmic: polyrhythmic.isPolyrhythmic,
      isAxisAlternating: false,
      period: 1,
      componentsDetailed: [],
    };
  }

  private detectModularQuarteredPattern(
    quarteredStepPairs: InternalStepPair[],
    rotationDirection: "cw" | "ccw" | null,
    polyrhythmic: PolyrhythmicLOOPResult,
    layeredPath: LayeredPathResult
  ): LOOPDetectionResult | null {
    const unknownCount = quarteredStepPairs.filter((pair) => {
      const primary = pair.detectedTransformations[0]?.toUpperCase() || "";
      return primary === "UNKNOWN" || primary === "";
    }).length;

    const unknownRate = unknownCount / quarteredStepPairs.length;
    if (unknownRate >= 0.5) {
      return null;
    }

    const detectedPrimaries = quarteredStepPairs.map(
      (pair) => pair.detectedTransformations[0]?.toUpperCase() || "UNKNOWN"
    );
    const uniqueDetected = new Set(detectedPrimaries);
    if (uniqueDetected.size === 1 && !uniqueDetected.has("UNKNOWN")) {
      return null;
    }

    const modularAnalysis = this.analysisService.detectModularPattern(
      quarteredStepPairs,
      4
    );

    if (!modularAnalysis?.isModular) {
      return null;
    }

    const modularPattern: ModularPattern = {
      isModular: true,
      baseTransformation: modularAnalysis.baseTransformation,
      swapRhythm: modularAnalysis.swapRhythm,
      swappedPositions: modularAnalysis.swappedPositions,
      description: modularAnalysis.description,
    };

    const components: ComponentId[] = [];
    if (modularAnalysis.baseTransformation) {
      const baseComponents = deriveComponentsFromPattern(
        modularAnalysis.baseTransformation
      );
      components.push(...baseComponents);
    }
    if (
      modularAnalysis.swappedPositions.length > 0 &&
      !components.includes("swapped")
    ) {
      components.push("swapped");
    }
    if (
      modularAnalysis.columnBehaviors.some((c) => c.isInverted) &&
      !components.includes("inverted")
    ) {
      components.push("inverted");
    }
    if (
      modularAnalysis.columnBehaviors.some((c) => c.isMirrored) &&
      !components.includes("mirrored")
    ) {
      components.push("mirrored");
    }
    if (
      modularAnalysis.columnBehaviors.some((c) => c.isFlipped) &&
      !components.includes("flipped")
    ) {
      components.push("flipped");
    }

    const intervals: TransformationIntervals = {};
    if (components.includes("rotated")) intervals.rotation = 4;
    if (components.includes("swapped")) {
      intervals.swap = 4;
    }
    if (components.includes("inverted")) intervals.invert = 4;
    if (components.includes("mirrored")) intervals.mirror = 4;
    if (components.includes("flipped")) intervals.flip = 4;

    const rotDir =
      rotationDirection === "ccw"
        ? "_ccw"
        : rotationDirection === "cw"
          ? "_cw"
          : "";
    const loopType =
      modularAnalysis.swapRhythm !== "uniform"
        ? `modular_rotated_90${rotDir}_swap_${modularAnalysis.swapRhythm}`
        : `modular_rotated_90${rotDir}`;

    const binarySwapPattern = modularAnalysis.columnBehaviors
      .map((c) => (c.isSwapped ? "1" : "0"))
      .join("");

    const candidateLabel =
      modularAnalysis.swappedPositions.length > 0
        ? `MODULAR: Rotated 90° ${rotationDirection?.toUpperCase() || ""} + SWAPPED (${binarySwapPattern})`
        : `MODULAR: Rotated 90° ${rotationDirection?.toUpperCase() || ""}`;

    const quarteredGroups =
      this.analysisService.groupStepPairsByPattern(quarteredStepPairs);

    return {
      loopType,
      components,
      transformationIntervals: intervals,
      rotationDirection,
      candidateDesignations: [
        {
          components,
          loopType,
          transformationIntervals: intervals,
          label: candidateLabel,
          description: modularAnalysis.description,
          rotationDirection,
          confirmed: false,
          denied: false,
        },
      ],
      stepPairs: toPublicStepPairs(quarteredStepPairs),
      stepPairGroups: quarteredGroups,
      isCircular: true,
      isFreeform: false,
      isModular: true,
      layeredPath,
      isLayeredPath: layeredPath.isLayeredPath,
      polyrhythmic,
      isPolyrhythmic: polyrhythmic.isPolyrhythmic,
      isAxisAlternating: false,
      modularPattern,
      period: periodFromIntervals(intervals, true),
      componentsDetailed: componentsToDetailed(components),
    };
  }

  /**
   * Detect an inner rotating cycle nested inside a halved outer transform.
   *
   * Applies only when the first half CLOSES (ends back at the loop's start
   * position) — then the half is itself a circular loop and the same uniform
   * pattern detection can run on it in isolation. Returns the rotation's
   * full-loop interval: an inner halved rotation (180° at the half's own
   * midpoint) is a quarter of the full loop (4); an inner quartered rotation
   * is an eighth (8).
   */
  private detectNestedRotation(
    steps: ExtractedStep[]
  ): { interval: 4 | 8; direction: "cw" | "ccw" | null } | null {
    const half = Math.floor(steps.length / 2);
    if (half < 4 || half % 2 !== 0) return null;

    const loopStart = steps[0]?.startPos;
    const halfSteps = steps.slice(0, half);
    const halfEnd = halfSteps[half - 1]?.endPos;
    if (!loopStart || !halfEnd || halfEnd !== loopStart) return null;

    const candidates = detectUniformPattern(
      halfSteps,
      this.comparisonOrchestrator
    );
    const rotated = candidates.find(
      (c) =>
        c.components.includes("rotated") && !c.components.includes("rewound")
    );
    if (!rotated) return null;

    const innerInterval = rotated.transformationIntervals?.rotation ?? 2;
    return {
      interval: innerInterval >= 4 ? 8 : 4,
      direction: rotated.rotationDirection ?? null,
    };
  }

  private quarteredMotionsConsistent(
    steps: ExtractedStep[],
    quarterLength: number
  ): boolean {
    for (let offset = 0; offset < quarterLength; offset++) {
      let firstInverted: boolean | null = null;
      for (let q = 0; q < 4; q++) {
        const i = q * quarterLength + offset;
        const j = ((q + 1) % 4) * quarterLength + offset;
        const s1 = steps[i];
        const s2 = steps[j];
        if (!s1 || !s2) continue;
        const inverted =
          s1.left.motionType !== s2.left.motionType ||
          s1.right.motionType !== s2.right.motionType;
        if (firstInverted === null) {
          firstInverted = inverted;
        } else if (inverted !== firstInverted) {
          return false;
        }
      }
    }
    return true;
  }

  private enrichWithHalvedPrimitives(
    result: LOOPDetectionResult,
    halvedStepPairs: InternalStepPair[]
  ): void {
    if (halvedStepPairs.length === 0) return;

    const halvedPrimitives = ["inverted", "mirrored", "flipped", "swapped"] as const;
    for (const primitive of halvedPrimitives) {
      if (result.components.includes(primitive as ComponentId)) continue;
      const allHave = halvedStepPairs.every((pair) =>
        pair.rawTransformations.some((t) => t.includes(primitive))
      );
      if (allHave) {
        result.components.push(primitive as ComponentId);
        result.componentsDetailed.push({
          component: componentIdToLOOPComponent(primitive as ComponentId)!,
          domain: "location",
        });
        if (result.transformationIntervals) {
          if (primitive === "inverted") result.transformationIntervals.invert = 2;
          if (primitive === "mirrored") result.transformationIntervals.mirror = 2;
          if (primitive === "flipped") result.transformationIntervals.flip = 2;
          if (primitive === "swapped") result.transformationIntervals.swap = 2;
        }
      }
    }
  }
}

import { stepComparisonOrchestrator } from "./comparison/step-comparison-orchestrator";
import { transformationAnalyzer } from "./transformation-analyzer";
import { toPublicStepPairs, deriveComponentsFromPattern } from "./candidate-formatter";
import * as polyrhythmicDetectorModule from "./polyrhythmic-detector";
import * as layeredPathDetectorModule from "./layered-path-detector";
import type { LayeredPathResult } from "./types";
import type { TransformationAnalyzer } from "./transformation-analyzer";

export const loopDetector = new LOOPDetector(
  stepComparisonOrchestrator,
  transformationAnalyzer,
  polyrhythmicDetectorModule,
  layeredPathDetectorModule
);
