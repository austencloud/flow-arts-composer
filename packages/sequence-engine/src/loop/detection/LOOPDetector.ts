/**
 * LOOP Detector for Sequence Engine
 *
 * Analyzes sequence steps to identify LOOP transformation patterns
 * (rotated, mirrored, swapped, inverted, flipped, rewound).
 *
 * Merged from:
 * - Engine's original simplified detection (functional API for MCP)
 * - App's richer class-based detection (quartered rotation, compound patterns,
 *   LOOPType resolution, interval-based detection)
 *
 * The functional API (detectLOOPFromSteps, isSequenceCircular) is preserved
 * for backward compatibility. The class-based LOOPDetector adds quartered
 * rotation detection, compound pattern analysis, and LOOPType mapping.
 */

import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import { gridPlacementDeriver } from "../../core/placements/GridPlacementDeriver.js";
import {
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
} from "../placement-maps/circular-placement-maps.js";
import { LOOPType, Period } from "../loop-types.js";
import {
  LOOPComponent,
  type LOOPSpec,
  type PropLOOPSpec,
  type ComponentSpec,
} from "../loop-spec.js";
import type { ReflectionAxis } from "../placement-maps/strict-loop-placement-maps.js";
import {
  uniformHalvedRelation,
  uniformRelationAtInterval,
  detectRewoundPattern,
  detectsInnerRotation,
  type PairMotions,
  type PairComponentId,
  type RotationAngle,
} from "./pair-relation.js";

export { LOOPComponent };

export type LOOPComponentId =
  | "rotated"
  | "mirrored"
  | "flipped"
  | "swapped"
  | "inverted"
  | "rewound";

export interface LOOPDetectionResult {
  isCircular: boolean;
  components: LOOPComponentId[];
  isFreeform: boolean;
  rotationDirection: "cw" | "ccw" | null;
  reflectionAxis: ReflectionAxis | null;
  description: string;
}

/**
 * Compound pattern where different transformations occur at different intervals.
 */
export interface CompoundPattern {
  isCompound: true;
  quarteredTransformations: LOOPComponent[];
  halvedTransformations: LOOPComponent[];
  description: string;
}

/**
 * Confidence level for detection.
 * - strict: known LOOP type matched via components
 * - probable: components detected but combination not implemented
 * - accidental: circular but no LOOP pattern detected
 */
export type DetectionConfidence = "strict" | "probable" | "accidental";

/**
 * Rich detection result from the class-based detector.
 */
export interface RichLOOPDetectionResult {
  isCircular: boolean;
  spec: LOOPSpec | null;
  loopType: LOOPType | null;
  period: Period | null;
  reflectionAxis: ReflectionAxis | null;
  confidence: DetectionConfidence;
  compoundPattern?: CompoundPattern;
}

/**
 * Derive a backward-compatible LOOPType from detected components.
 * Returns null if the combination has no corresponding LOOPType.
 */
function deriveLoopTypeFromComponents(
  components: Set<LOOPComponent>
): LOOPType | null {
  if (components.size === 0) return null;
  const has = (c: LOOPComponent) => components.has(c);
  const size = components.size;

  if (size === 1) {
    if (has(LOOPComponent.ROTATED)) return LOOPType.ROTATED;
    if (has(LOOPComponent.MIRRORED)) return LOOPType.MIRRORED;
    if (has(LOOPComponent.FLIPPED)) return LOOPType.FLIPPED;
    if (has(LOOPComponent.SWAPPED)) return LOOPType.SWAPPED;
    if (has(LOOPComponent.INVERTED)) return LOOPType.INVERTED;
    if (has(LOOPComponent.REWOUND)) return LOOPType.REWOUND;
  }
  if (size === 2) {
    if (has(LOOPComponent.SWAPPED) && has(LOOPComponent.INVERTED))
      return LOOPType.SWAPPED_INVERTED;
    if (has(LOOPComponent.ROTATED) && has(LOOPComponent.INVERTED))
      return LOOPType.ROTATED_INVERTED;
    if (has(LOOPComponent.MIRRORED) && has(LOOPComponent.SWAPPED))
      return LOOPType.MIRRORED_SWAPPED;
    if (has(LOOPComponent.MIRRORED) && has(LOOPComponent.INVERTED))
      return LOOPType.MIRRORED_INVERTED;
    if (has(LOOPComponent.ROTATED) && has(LOOPComponent.SWAPPED))
      return LOOPType.ROTATED_SWAPPED;
    if (has(LOOPComponent.MIRRORED) && has(LOOPComponent.ROTATED))
      return LOOPType.MIRRORED_ROTATED;
  }
  if (size === 3) {
    if (
      has(LOOPComponent.MIRRORED) &&
      has(LOOPComponent.INVERTED) &&
      has(LOOPComponent.ROTATED)
    )
      return LOOPType.MIRRORED_INVERTED_ROTATED;
    if (
      has(LOOPComponent.MIRRORED) &&
      has(LOOPComponent.ROTATED) &&
      has(LOOPComponent.SWAPPED)
    )
      return LOOPType.MIRRORED_ROTATED_SWAPPED;
    if (
      has(LOOPComponent.MIRRORED) &&
      has(LOOPComponent.SWAPPED) &&
      has(LOOPComponent.INVERTED)
    )
      return LOOPType.MIRRORED_SWAPPED_INVERTED;
    if (
      has(LOOPComponent.ROTATED) &&
      has(LOOPComponent.SWAPPED) &&
      has(LOOPComponent.INVERTED)
    )
      return LOOPType.ROTATED_SWAPPED_INVERTED;
  }
  if (size === 4) {
    if (
      has(LOOPComponent.MIRRORED) &&
      has(LOOPComponent.ROTATED) &&
      has(LOOPComponent.INVERTED) &&
      has(LOOPComponent.SWAPPED)
    )
      return LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED;
  }
  return null;
}

export function isSequenceCircular(steps: SequenceStep[]): boolean {
  if (steps.length < 2) return false;

  const startPlacementStep = steps.find(
    (s) => (s.stepNumber ?? s.stepNumber) === 0
  );
  const lastStep = steps[steps.length - 1];

  if (!startPlacementStep || !lastStep) return false;

  return startPlacementStep.startPlacement === lastStep.endPlacement;
}

export function detectLOOPFromSteps(
  steps: SequenceStep[]
): LOOPDetectionResult {
  const circular = isSequenceCircular(steps);

  if (!circular) {
    return {
      isCircular: false,
      components: [],
      isFreeform: false,
      rotationDirection: null,
      reflectionAxis: null,
      description: "Not a circular sequence",
    };
  }

  // Get letter steps only (exclude step 0 start placement)
  const letterSteps = reduceRepeatedMotionSkeleton(
    steps.filter((s) => (s.stepNumber ?? s.stepNumber) > 0)
  );

  if (letterSteps.length < 2) {
    return {
      isCircular: true,
      components: [],
      isFreeform: true,
      rotationDirection: null,
      reflectionAxis: null,
      description: "Circular but too short to detect pattern",
    };
  }

  // Must have even number of steps for halved detection
  if (letterSteps.length % 2 !== 0) {
    return {
      isCircular: true,
      components: [],
      isFreeform: true,
      rotationDirection: null,
      reflectionAxis: null,
      description: "Circular with odd number of steps (freeform)",
    };
  }

  const pairMotions = toPairMotions(letterSteps);
  const uniform = uniformHalvedRelation(pairMotions);

  const components: LOOPComponentId[] = [];
  let rotationAngle: RotationAngle | undefined;

  if (uniform && uniform.components.length > 0) {
    for (const c of uniform.components) {
      components.push(c as LOOPComponentId);
    }
    rotationAngle = uniform.rotation;

    // Nested loops (mirrored_rotated family) carry the rotation one quarter
    // apart WITHIN each half; the halved relation only shows the outer
    // reflection. Surface the inner rotation when it holds uniformly.
    if (!components.includes("rotated") && detectsInnerRotation(pairMotions)) {
      components.push("rotated");
    }
  } else if (detectRewoundPattern(pairMotions)) {
    // Time reversal has no uniform index-wise relation — checked separately.
    components.push("rewound");
  }

  if (components.length === 0) {
    return {
      isCircular: true,
      components: [],
      isFreeform: true,
      rotationDirection: null,
      reflectionAxis: null,
      description: "Circular sequence with no detected pattern (freeform)",
    };
  }

  // Rotation direction: 90° relations carry it structurally; 180° relations
  // are direction-ambiguous, so keep the legacy first-step heuristic.
  let direction: "cw" | "ccw" | null = null;
  if (components.includes("rotated")) {
    if (rotationAngle === "90cw") direction = "cw";
    else if (rotationAngle === "90ccw") direction = "ccw";
    else {
      const leftRotDir = letterSteps[0]?.motions.left?.rotationDirection;
      if (leftRotDir === "cw" || leftRotDir === "ccw") direction = leftRotDir;
    }
  }

  return {
    isCircular: true,
    components,
    isFreeform: false,
    rotationDirection: direction,
    reflectionAxis: uniform?.reflectionAxis ?? null,
    description: `LOOP: ${components.join(" + ")}`,
  };
}

/**
 * Check the temporal relationship directly.
 *
 * Rewound sequences can also happen to satisfy a spatial relation such as
 * mirrored. The general detector picks one canonical label for display, so
 * callers validating a rewound request must check the temporal structure
 * itself instead of comparing that display label.
 */
export function hasRewoundStructure(
  steps: readonly SequenceStep[]
): boolean {
  const letterSteps = reduceRepeatedMotionSkeleton(
    steps.filter((step) => (step.stepNumber ?? 0) > 0)
  );
  return detectRewoundPattern(toPairMotions(letterSteps));
}

/**
 * Project engine steps down to the minimal per-hand view the pair-relation
 * algebra reads (locations + motionType — MCP-grounded LOOP signal space).
 */
function toPairMotions(steps: readonly SequenceStep[]): PairMotions[] {
  return steps.map((s) => ({
    left: {
      startLocation: s.motions.left?.startLocation ?? "",
      endLocation: s.motions.left?.endLocation ?? "",
      motionType: s.motions.left?.motionType ?? "",
    },
    right: {
      startLocation: s.motions.right?.startLocation ?? "",
      endLocation: s.motions.right?.endLocation ?? "",
      motionType: s.motions.right?.motionType ?? "",
    },
  }));
}

/**
 * Orientation closure may repeat an already-complete placement/motion
 * skeleton. LOOP classification is defined on that reduced signal space, so
 * detect against the shortest exact motion cycle rather than mistaking two
 * identical placement cycles for a repeated/freeform LOOP.
 */
function reduceRepeatedMotionSkeleton(
  steps: readonly SequenceStep[]
): SequenceStep[] {
  const length = steps.length;

  for (
    let candidateLength = 1;
    candidateLength <= length / 2;
    candidateLength++
  ) {
    if (length % candidateLength !== 0) continue;

    const repeats = steps.every((step, index) =>
      sameLOOPSignal(step, steps[index % candidateLength]!)
    );
    if (repeats) return steps.slice(0, candidateLength);
  }

  return [...steps];
}

function sameLOOPSignal(a: SequenceStep, b: SequenceStep): boolean {
  return (["left", "right"] as const).every((side) => {
    const am = a.motions[side];
    const bm = b.motions[side];
    return (
      am.startLocation === bm.startLocation &&
      am.endLocation === bm.endLocation &&
      am.motionType === bm.motionType
    );
  });
}

/**
 * Rich LOOP detector that supports quartered rotation, compound patterns,
 * and LOOPType resolution. Operates on SequenceStep arrays without
 * needing app-specific dependencies.
 */
export class LOOPDetectorClass {
  private deriveStartPlacement(step: SequenceStep): string | null {
    const left = step.motions.left;
    const right = step.motions.right;
    if (!left?.startLocation || !right?.startLocation) return null;

    try {
      return gridPlacementDeriver.getGridPlacementFromLocations(
        left.startLocation,
        right.startLocation
      );
    } catch {
      return null;
    }
  }

  private buildLOOPSpec(
    components: Set<LOOPComponent>,
    period: Period | null,
    reflectionAxis?: ReflectionAxis,
    compoundPattern?: CompoundPattern
  ): LOOPSpec | null {
    if (components.size === 0) return null;

    const periodNum = period ? (period === Period.QUARTERED ? 4 : 2) : 2;
    const compMap = new Map<LOOPComponent, ComponentSpec>();

    for (const comp of components) {
      const canonical = comp;
      const isReflection =
        canonical === LOOPComponent.MIRRORED ||
        canonical === LOOPComponent.FLIPPED;
      compMap.set(canonical, {
        period: periodNum,
        ...(isReflection && reflectionAxis ? { reflectionAxis } : {}),
      });
    }

    if (compoundPattern) {
      // Quartered transformations get period 4, halved transformations get period 2
      for (const comp of compoundPattern.quarteredTransformations) {
        const canonical = comp;
        if (compMap.has(canonical)) {
          compMap.set(canonical, { period: 4 });
        }
      }
      for (const comp of compoundPattern.halvedTransformations) {
        const canonical = comp;
        if (compMap.has(canonical)) {
          compMap.set(canonical, { period: 2 });
        }
      }
    }

    const prop: PropLOOPSpec = { components: compMap };
    return { left: prop, right: prop };
  }

  /**
   * Takes an array of SequenceStep where step 0 is the start placement
   * and subsequent steps are the letter steps.
   */
  detectLOOPType(steps: SequenceStep[]): RichLOOPDetectionResult {
    // Check circularity using the start-placement step and last step
    const circular = isSequenceCircular(steps);

    if (!circular) {
      return {
        isCircular: false,
        spec: null,
        loopType: null,
        period: null,
        reflectionAxis: null,
        confidence: "accidental",
      };
    }

    // Get letter steps only (exclude start placement)
    const letterSteps = reduceRepeatedMotionSkeleton(
      steps.filter((s) => (s.stepNumber ?? s.stepNumber) > 0)
    );

    if (letterSteps.length < 2) {
      return {
        isCircular: true,
        spec: null,
        loopType: null,
        period: null,
        reflectionAxis: null,
        confidence: "accidental",
      };
    }

    const pairMotions = toPairMotions(letterSteps);

    // Detect transformations at BOTH intervals independently
    const quarteredTransformations = this.detectAtQuartered(
      letterSteps,
      pairMotions
    );
    const halvedTransformations = this.detectAtHalved(pairMotions);
    const reflectionAxis =
      uniformHalvedRelation(pairMotions)?.reflectionAxis ?? null;

    // Check for compound pattern (transformations at different intervals)
    const compoundPattern = this.detectCompoundPattern(
      letterSteps,
      pairMotions,
      quarteredTransformations,
      halvedTransformations
    );

    // Determine primary period and components for LOOP type
    let period: Period | null = null;
    const detectedComponents = new Set<LOOPComponent>();

    if (compoundPattern) {
      period = this.detectsQuarteredRotation(letterSteps)
        ? Period.QUARTERED
        : Period.HALVED;
      compoundPattern.quarteredTransformations.forEach((c) =>
        detectedComponents.add(c)
      );
      compoundPattern.halvedTransformations.forEach((c) =>
        detectedComponents.add(c)
      );
    } else {
      period = this.determinePeriod(letterSteps);

      for (const comp of halvedTransformations) detectedComponents.add(comp);

      // Time reversal has no uniform index-wise relation — checked separately,
      // and only when nothing else explains the loop.
      if (detectedComponents.size === 0 && detectRewoundPattern(pairMotions)) {
        detectedComponents.add(LOOPComponent.REWOUND);
      }
    }

    // Map components to LOOP type
    let loopType: LOOPType | null = null;
    let confidence: DetectionConfidence = "accidental";

    if (detectedComponents.size > 0) {
      loopType = deriveLoopTypeFromComponents(detectedComponents);
      confidence = loopType ? "strict" : "probable";
    }

    return {
      isCircular: true,
      spec: this.buildLOOPSpec(
        detectedComponents,
        period,
        reflectionAxis ?? undefined,
        compoundPattern ?? undefined
      ),
      loopType,
      period: detectedComponents.has(LOOPComponent.ROTATED) ? period : null,
      reflectionAxis,
      confidence,
      compoundPattern: compoundPattern ?? undefined,
    };
  }

  // ============ PERIOD DETERMINATION ============

  private determinePeriod(steps: readonly SequenceStep[]): Period {
    const length = steps.length;

    // Check quartered FIRST (more specific)
    if (length >= 4 && length % 4 === 0) {
      if (this.detectsQuarteredRotation(steps)) {
        return Period.QUARTERED;
      }
    }

    return Period.HALVED;
  }

  private detectsQuarteredRotation(steps: readonly SequenceStep[]): boolean {
    const length = steps.length;
    if (length < 4 || length % 4 !== 0) return false;

    const quarterLength = length / 4;

    const q1Start = steps[0] ? this.deriveStartPlacement(steps[0]) : null;
    const q2Start = steps[quarterLength]
      ? this.deriveStartPlacement(steps[quarterLength]!)
      : null;
    const q3Start = steps[quarterLength * 2]
      ? this.deriveStartPlacement(steps[quarterLength * 2]!)
      : null;
    const q4Start = steps[quarterLength * 3]
      ? this.deriveStartPlacement(steps[quarterLength * 3]!)
      : null;

    if (!q1Start || !q2Start || !q3Start || !q4Start) return false;

    const cwMatch =
      QUARTER_PLACEMENT_MAP_CW[q1Start] === q2Start &&
      QUARTER_PLACEMENT_MAP_CW[q2Start] === q3Start &&
      QUARTER_PLACEMENT_MAP_CW[q3Start] === q4Start;

    const ccwMatch =
      QUARTER_PLACEMENT_MAP_CCW[q1Start] === q2Start &&
      QUARTER_PLACEMENT_MAP_CCW[q2Start] === q3Start &&
      QUARTER_PLACEMENT_MAP_CCW[q3Start] === q4Start;

    return cwMatch || ccwMatch;
  }

  // ============ COMPOUND PATTERN DETECTION ============

  private detectAtQuartered(
    steps: readonly SequenceStep[],
    pairMotions: readonly PairMotions[]
  ): LOOPComponent[] {
    const components: LOOPComponent[] = [];
    const length = steps.length;

    if (length < 4 || length % 4 !== 0) return components;

    if (this.detectsQuarteredRotation(steps))
      components.push(LOOPComponent.ROTATED);

    // Swap/invert at the quarter interval, read through the pair-relation
    // algebra (hand-identity aware — see pair-relation.ts).
    const rel = uniformRelationAtInterval(pairMotions, length / 4, {
      wrap: true,
    });
    if (rel) {
      if (rel.components.includes("swapped"))
        components.push(LOOPComponent.SWAPPED);
      if (rel.components.includes("inverted"))
        components.push(LOOPComponent.INVERTED);
    }

    return components;
  }

  private detectAtHalved(pairMotions: readonly PairMotions[]): LOOPComponent[] {
    const components: LOOPComponent[] = [];
    const rel = uniformHalvedRelation(pairMotions);
    if (!rel) return components;

    const MAP: Partial<Record<PairComponentId, LOOPComponent>> = {
      rotated: LOOPComponent.ROTATED,
      mirrored: LOOPComponent.MIRRORED,
      flipped: LOOPComponent.FLIPPED,
      swapped: LOOPComponent.SWAPPED,
      inverted: LOOPComponent.INVERTED,
    };
    for (const c of rel.components) {
      const mapped = MAP[c];
      if (mapped) components.push(mapped);
    }

    return components;
  }

  private detectCompoundPattern(
    steps: readonly SequenceStep[],
    pairMotions: readonly PairMotions[],
    quarteredComponents: LOOPComponent[],
    halvedComponents: LOOPComponent[]
  ): CompoundPattern | null {
    const length = steps.length;
    if (length < 8 || length % 4 !== 0) return null;

    const hasQuarteredRotation = quarteredComponents.includes(
      LOOPComponent.ROTATED
    );
    const hasQuarteredSwap = quarteredComponents.includes(
      LOOPComponent.SWAPPED
    );
    const hasHalvedSwap = halvedComponents.includes(LOOPComponent.SWAPPED);
    const hasHalvedInversion = halvedComponents.includes(
      LOOPComponent.INVERTED
    );

    // Compound: rotation at quartered + swap ONLY at halved
    if (hasQuarteredRotation && !hasQuarteredSwap && hasHalvedSwap) {
      const dir = this.getQuarteredRotationDirection(steps);
      const rotDesc =
        dir === "ccw" ? "90 deg CCW Rotated" : "90 deg CW Rotated";
      return {
        isCompound: true,
        quarteredTransformations: [LOOPComponent.ROTATED],
        halvedTransformations: [LOOPComponent.SWAPPED],
        description: `${rotDesc} (quartered) + Swapped (halved)`,
      };
    }

    // Compound: rotation at quartered + inversion ONLY at halved
    if (hasQuarteredRotation && hasHalvedInversion) {
      const hasQuarteredInversion = quarteredComponents.includes(
        LOOPComponent.INVERTED
      );
      if (!hasQuarteredInversion) {
        const dir = this.getQuarteredRotationDirection(steps);
        const rotDesc =
          dir === "ccw" ? "90 deg CCW Rotated" : "90 deg CW Rotated";
        return {
          isCompound: true,
          quarteredTransformations: [LOOPComponent.ROTATED],
          halvedTransformations: [LOOPComponent.INVERTED],
          description: `${rotDesc} (quartered) + Inverted (halved)`,
        };
      }
    }

    // Compound: rotation at quartered + swap + inversion at halved
    if (
      hasQuarteredRotation &&
      !hasQuarteredSwap &&
      hasHalvedSwap &&
      hasHalvedInversion
    ) {
      const dir = this.getQuarteredRotationDirection(steps);
      const rotDesc =
        dir === "ccw" ? "90 deg CCW Rotated" : "90 deg CW Rotated";
      return {
        isCompound: true,
        quarteredTransformations: [LOOPComponent.ROTATED],
        halvedTransformations: [LOOPComponent.SWAPPED, LOOPComponent.INVERTED],
        description: `${rotDesc} (quartered) + Swapped + Inverted (halved)`,
      };
    }

    // Compound: inner halved rotation + outer mirrored/swapped
    if (!hasQuarteredRotation && detectsInnerRotation(pairMotions)) {
      const outerTransformations = halvedComponents.filter(
        (c) => c !== LOOPComponent.ROTATED
      );
      if (outerTransformations.length > 0) {
        return {
          isCompound: true,
          quarteredTransformations: [LOOPComponent.ROTATED],
          halvedTransformations: outerTransformations,
          description: `180° Inner Rotated (halved) + ${outerTransformations.join(" + ")} (outer halved)`,
        };
      }
    }

    return null;
  }

  private getQuarteredRotationDirection(
    steps: readonly SequenceStep[]
  ): "cw" | "ccw" | null {
    const length = steps.length;
    if (length < 4 || length % 4 !== 0) return null;

    const quarterLength = length / 4;
    const q1Start = steps[0] ? this.deriveStartPlacement(steps[0]) : null;
    const q2Start = steps[quarterLength]
      ? this.deriveStartPlacement(steps[quarterLength]!)
      : null;

    if (!q1Start || !q2Start) return null;
    if (QUARTER_PLACEMENT_MAP_CW[q1Start] === q2Start) return "cw";
    if (QUARTER_PLACEMENT_MAP_CCW[q1Start] === q2Start) return "ccw";
    return null;
  }
}

export const loopDetectorClass = new LOOPDetectorClass();
