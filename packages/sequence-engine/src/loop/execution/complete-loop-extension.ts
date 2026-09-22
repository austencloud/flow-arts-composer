/**
 * Canonical completion boundary for a selected LOOP seed.
 *
 * It owns the domain work shared by generation and extension: validate the
 * requested transformation against this seed, execute it, close orientations,
 * and remove only redundant derived passes. Presentations own letter lookup,
 * view fields, and any user-facing numbering policy.
 */

import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import {
  LOOPComponent,
  type LOOPSpec,
  allActiveComponents,
  loopSpecFromLegacyRhythm,
  specsAreEqual,
  symmetricSpec,
  validateLOOPSpec,
} from "../loop-spec.js";
import { ALL_LOOP_TYPES, LOOPType, Period } from "../loop-types.js";
import { reduceToMinimalLoop } from "../reduction/minimal-loop-reducer.js";
import { determineEndPlacementsForSpec } from "../targeting/LOOPEndPlacementSelector.js";
import { gridPlacementDeriver } from "../../core/placements/GridPlacementDeriver.js";
import { closeOrientationCycle } from "./orientation-cycle.js";
import {
  executeLOOPSpec,
  getLOOPSpecExpansionMultiplier,
} from "./spec-executor.js";

export type LOOPCompletionRequest =
  | { readonly spec: LOOPSpec }
  | { readonly loopType: LOOPType; readonly period?: Period };

export interface LOOPCompletionResult {
  /** Complete, placement- and orientation-closed sequence. */
  readonly steps: SequenceStep[];
  /** Number of authored non-start-placement steps copied to the result intact. */
  readonly seedStepCount: number;
  /** One-based step numbers added after the authored seed. */
  readonly derivedStepIndices: number[];
  /** Structural passes emitted before orientation closure and redundancy removal. */
  readonly structuralExpansionMultiplier: number;
  /** Number of structural patterns required to return prop orientations home. */
  readonly orientationCycleCount: number;
  /** Whether a literal redundant derived pass was removed. */
  readonly reduced: boolean;
  /** The exact spec executed after legacy translation, when applicable. */
  readonly spec: LOOPSpec;
}

/** True for every legacy type that can be translated by this package. */
export function isSupportedLegacyLOOPType(value: string): value is LOOPType {
  return (ALL_LOOP_TYPES as readonly string[]).includes(value);
}

/**
 * Shared admission check for legacy extension pickers and completion.
 *
 * `null` from the targeting owner means the transform has no positional seam
 * requirement (rewound); structural execution still verifies closure.
 */
export function isLegacyLOOPSeedValid(
  startPlacement: string,
  endPlacement: string,
  loopType: LOOPType,
  period: Period = Period.HALVED
): boolean {
  if (!isSupportedLegacyLOOPType(loopType)) return false;
  if (!areKnownPlacements(startPlacement, endPlacement)) return false;
  if (loopType === LOOPType.REWOUND) return period !== Period.QUARTERED;
  if (isHistoricallyDegenerateLegacySeed(startPlacement, loopType)) {
    return false;
  }
  const spec = legacyExtensionSpec(loopType, period);
  const expectedEnds = determineEndPlacementsForSpec(spec, startPlacement);
  return expectedEnds.length === 0 || expectedEnds.includes(endPlacement);
}

/**
 * Complete a selected LOOP seed without mutating the caller's steps.
 *
 * Flat legacy requests deliberately use legacy rhythm translation. Explicit
 * LOOPSpecs are executed exactly as supplied, including independent periods
 * and overlay modes.
 */
export function completeLOOPExtension(
  steps: readonly SequenceStep[],
  request: LOOPCompletionRequest
): LOOPCompletionResult {
  const input = steps.map(cloneStep);
  const authoredSeed = input.map(cloneStep);
  const seedStepCount = input.filter((step) => step.stepNumber > 0).length;
  if (seedStepCount < 1) {
    throw new Error(
      "Sequence must contain a start placement and at least one step"
    );
  }

  const spec = resolveSpec(request);
  validateSelectedSeed(input, spec, request);

  const structuralExpansionMultiplier = getLOOPSpecExpansionMultiplier(spec);
  const structurallyExtended = executeLOOPSpec(input, spec);
  assertSeedPreserved(authoredSeed, structurallyExtended, seedStepCount);
  const closed = closeOrientationCycle(structurallyExtended, { seedStepCount });

  // A completion must retain the authored seed and one transformed pass. This
  // removes the period-four literal duplicate produced by order-two transforms
  // while never returning an unextended seed or changing its IDs.
  const minimal = reduceToMinimalLoop(closed.steps, {
    minimumLetterSteps: seedStepCount * 2,
    preservePrefixSteps: seedStepCount,
  });
  const completed = minimal.reduced
    ? closeOrientationCycle(minimal.steps, { seedStepCount }).steps
    : closed.steps;
  assertClosed(completed);
  assertSequenceCoherence(completed, "Completed LOOP");
  assertSeedPreserved(authoredSeed, completed, seedStepCount);

  const derived = completed.filter((step) => step.stepNumber > seedStepCount);
  return {
    steps: completed,
    seedStepCount,
    derivedStepIndices: derived.map((step) => step.stepNumber),
    structuralExpansionMultiplier,
    orientationCycleCount: closed.orientationCycleCount,
    reduced: minimal.reduced,
    spec,
  };
}

function resolveSpec(request: LOOPCompletionRequest): LOOPSpec {
  if ("spec" in request) return request.spec;
  if (!isSupportedLegacyLOOPType(request.loopType)) {
    throw new Error(`Unsupported LOOP type "${request.loopType}"`);
  }
  if (
    request.loopType === LOOPType.REWOUND &&
    request.period === Period.QUARTERED
  ) {
    throw new Error("Rewound LOOP does not support a quartered period");
  }
  return legacyExtensionSpec(request.loopType, request.period ?? Period.HALVED);
}

/** Extension-only compatibility translation. Fresh generation keeps the public
 * `loopSpecFromLegacyRhythm` interpretation unchanged. */
function legacyExtensionSpec(loopType: LOOPType, period: Period): LOOPSpec {
  const rotationPeriod = period === Period.QUARTERED ? 4 : 2;
  const base = loopSpecFromLegacyRhythm(loopType, rotationPeriod);
  if (rotationPeriod === 2) return base;

  const prop = base.left ?? base.right;
  if (!prop) return base;
  const components = new Map(prop.components);
  const hasReflection =
    components.has(LOOPComponent.MIRRORED) ||
    components.has(LOOPComponent.FLIPPED);
  if (
    components.has(LOOPComponent.ROTATED) &&
    components.has(LOOPComponent.SWAPPED) &&
    !hasReflection
  ) {
    components.set(LOOPComponent.SWAPPED, { period: rotationPeriod });
    if (components.has(LOOPComponent.INVERTED)) {
      components.set(LOOPComponent.INVERTED, { period: rotationPeriod });
    }
  }
  if (loopType === LOOPType.ROTATED_INVERTED) {
    components.set(LOOPComponent.INVERTED, {
      period: rotationPeriod,
      mode: "overlay",
    });
  }
  return symmetricSpec(components);
}

function validateSelectedSeed(
  steps: readonly SequenceStep[],
  spec: LOOPSpec,
  request: LOOPCompletionRequest
): void {
  const errors = validateLOOPSpec(spec);
  if (errors.length > 0) {
    throw new Error(
      `Invalid LOOPSpec: ${errors.map((e) => e.message).join("; ")}`
    );
  }
  if (!specsAreEqual(spec.left, spec.right)) {
    throw new Error("Asymmetric LOOPSpecs are not supported for completion");
  }

  for (const [, component] of allActiveComponents(spec)) {
    if (component.period !== 2 && component.period !== 4) {
      throw new Error(
        `Unsupported LOOP period ${component.period}; expected 2 or 4`
      );
    }
  }
  const rewound = allActiveComponents(spec).get(LOOPComponent.REWOUND);
  if (rewound?.period === 4) {
    throw new Error("Rewound LOOP does not support a quartered period");
  }

  const startStep = steps[0];
  if (!startStep || startStep.stepNumber !== 0) {
    throw new Error("Sequence must begin with its step-0 start placement");
  }
  const start = startStep.startPlacement;
  const letterSteps = steps.slice(1);
  if (letterSteps.some((step, index) => step.stepNumber !== index + 1)) {
    throw new Error(
      "Sequence letter steps must be contiguous and numbered from 1"
    );
  }
  const end = letterSteps.at(-1)?.endPlacement;
  if (!start || !end) {
    throw new Error(
      "Sequence must have a start placement and an ending placement"
    );
  }
  assertSequenceCoherence(steps, "Seed");
  if (
    "loopType" in request &&
    !isLegacyLOOPSeedValid(start, end, request.loopType, request.period)
  ) {
    throw new Error(
      `Selected seed is not valid for this legacy LOOP (${start} -> ${end})`
    );
  }
  // This targeting owner applies component composition in executor order and
  // deliberately ignores overlays. Checking components independently rejects
  // valid composites such as swapped+inverted and rotated+swapped.
  const expectedEnds = determineEndPlacementsForSpec(spec, start);
  if (expectedEnds.length > 0 && !expectedEnds.includes(end)) {
    throw new Error(
      `Selected seed is not valid for this LOOP (${start} -> ${end})`
    );
  }
}

/**
 * These old picker restrictions preserve component identity rather than mere
 * closure. Rotate+swap fixes every alpha placement in location space, and
 * mirror/swap compounds outside beta1/beta5 degrade into a different reading.
 * Explicit LOOPSpecs remain a deliberate expert path and bypass this legacy
 * compatibility filter.
 */
function isHistoricallyDegenerateLegacySeed(
  startPlacement: string,
  loopType: LOOPType
): boolean {
  if (
    (loopType === LOOPType.ROTATED_SWAPPED ||
      loopType === LOOPType.ROTATED_SWAPPED_INVERTED) &&
    startPlacement.startsWith("alpha")
  ) {
    return true;
  }
  if (
    (loopType === LOOPType.MIRRORED_SWAPPED_INVERTED ||
      loopType === LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED) &&
    startPlacement !== "beta1" &&
    startPlacement !== "beta5"
  ) {
    return true;
  }
  return false;
}

function areKnownPlacements(
  startPlacement: string,
  endPlacement: string
): boolean {
  try {
    gridPlacementDeriver.getGridLocationsFromPlacement(startPlacement);
    gridPlacementDeriver.getGridLocationsFromPlacement(endPlacement);
    return true;
  } catch {
    return false;
  }
}

function assertSequenceCoherence(
  steps: readonly SequenceStep[],
  label: string
): void {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    const start = gridPlacementDeriver.getGridPlacementFromLocations(
      step.motions.left.startLocation,
      step.motions.right.startLocation
    );
    const end = gridPlacementDeriver.getGridPlacementFromLocations(
      step.motions.left.endLocation,
      step.motions.right.endLocation
    );
    if (step.startPlacement !== start || step.endPlacement !== end) {
      throw new Error(
        `${label} step ${step.stepNumber} placement does not match its hand locations`
      );
    }
    if (index === 0) continue;
    const previous = steps[index - 1]!;
    for (const hand of ["left", "right"] as const) {
      if (
        step.motions[hand].startLocation !==
          previous.motions[hand].endLocation ||
        step.motions[hand].startOrientation !==
          previous.motions[hand].endOrientation
      ) {
        throw new Error(
          `${label} step ${step.stepNumber} is not continuous with step ${previous.stepNumber}`
        );
      }
    }
    if (step.startPlacement !== previous.endPlacement) {
      throw new Error(
        `${label} step ${step.stepNumber} placement is not continuous with step ${previous.stepNumber}`
      );
    }
  }
}

function assertClosed(steps: readonly SequenceStep[]): void {
  const start = steps[0];
  const letters = steps.slice(1);
  const last = letters.at(-1);
  if (!start || !last || last.endPlacement !== start.startPlacement) {
    throw new Error("LOOP completion did not return to its starting placement");
  }
  for (const hand of ["left", "right"] as const) {
    if (last.motions[hand].endLocation !== start.motions[hand].startLocation) {
      throw new Error(`LOOP completion did not close ${hand} location`);
    }
    if (
      last.motions[hand].endOrientation !== start.motions[hand].startOrientation
    ) {
      throw new Error(`LOOP completion did not close ${hand} orientation`);
    }
  }
}

function assertSeedPreserved(
  seed: readonly SequenceStep[],
  completed: readonly SequenceStep[],
  seedStepCount: number
): void {
  for (let index = 0; index <= seedStepCount; index++) {
    if (stableValue(seed[index]) !== stableValue(completed[index])) {
      throw new Error(
        "LOOPSpec changes an authored seed step; use a generation-specific spec instead"
      );
    }
  }
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneStep(step: SequenceStep): SequenceStep {
  return {
    ...step,
    motions: {
      left: { ...step.motions.left },
      right: { ...step.motions.right },
    },
  };
}
