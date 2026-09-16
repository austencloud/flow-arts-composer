import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { UndoOperationType } from "./undo-manager";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

export type HistoryDirection = "undo" | "redo" | "jump";

export type HistoryStepVisualChange =
  | "arrow"
  | "duration"
  | "grid"
  | "notation"
  | "path"
  | "prop"
  | "step-number"
  | "visibility";

export interface HistoryStepTransition {
  readonly identity: string;
  readonly fromIndex: number | null;
  readonly toIndex: number | null;
  readonly changes: ReadonlySet<HistoryStepVisualChange>;
}

export type HistorySequenceChangeKind =
  | "none"
  | "membership"
  | "reorder"
  | "content"
  | "mixed"
  | "replacement";

export interface HistoryTransitionPlan {
  readonly direction: HistoryDirection;
  readonly operation: UndoOperationType | string;
  readonly label: string;
  readonly kind: HistorySequenceChangeKind;
  readonly steps: readonly HistoryStepTransition[];
  readonly insertedStepIdentities: ReadonlySet<string>;
  readonly removedStepIdentities: ReadonlySet<string>;
  readonly movedStepIdentities: ReadonlySet<string>;
  readonly changedStepIdentities: ReadonlySet<string>;
  readonly startPlacementChanged: boolean;
  readonly gridModeChanged: boolean;
  readonly wordChanged: boolean;
  readonly circularityChanged: boolean;
  readonly selectionChanged: boolean;
  readonly fromSelectedStepNumber: number | null;
  readonly toSelectedStepNumber: number | null;
}

export interface CreateHistoryTransitionPlanInput {
  readonly direction: HistoryDirection;
  readonly operation: UndoOperationType | string;
  readonly label: string;
  readonly fromSequence: SequenceData | null;
  readonly toSequence: SequenceData | null;
  readonly fromSelectedStepNumber: number | null;
  readonly toSelectedStepNumber: number | null;
}

interface IdentifiedStep {
  readonly identity: string;
  readonly step: StepData;
  readonly index: number;
}

/**
 * Stable keys let a step keep its DOM node while history moves it around the
 * grid. Legacy data with missing or duplicated IDs stays renderable, but is
 * deliberately treated as weaker identity than a canonical unique ID.
 */
export function createStableStepIdentities(
  steps: readonly StepData[]
): readonly string[] {
  const idTotals = new Map<string, number>();
  for (const step of steps) {
    const id = normalizedStepId(step);
    if (id) idTotals.set(id, (idTotals.get(id) ?? 0) + 1);
  }

  const occurrences = new Map<string, number>();
  return steps.map((step) => {
    const id = normalizedStepId(step);
    if (id && idTotals.get(id) === 1) return `step:${id}`;

    const base = id
      ? `duplicate:${id}`
      : `legacy:${legacyStepFingerprint(step)}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return `${base}:${occurrence}`;
  });
}

export function createHistoryTransitionPlan({
  direction,
  operation,
  label,
  fromSequence,
  toSequence,
  fromSelectedStepNumber,
  toSelectedStepNumber,
}: CreateHistoryTransitionPlanInput): HistoryTransitionPlan {
  const fromSteps = identifySteps(fromSequence?.steps ?? []);
  const toSteps = identifySteps(toSequence?.steps ?? []);
  const fromByIdentity = new Map(
    fromSteps.map((entry) => [entry.identity, entry])
  );
  const toByIdentity = new Map(toSteps.map((entry) => [entry.identity, entry]));
  const allIdentities = new Set([
    ...fromSteps.map((entry) => entry.identity),
    ...toSteps.map((entry) => entry.identity),
  ]);

  const insertedStepIdentities = new Set<string>();
  const removedStepIdentities = new Set<string>();
  const movedStepIdentities = new Set<string>();
  const changedStepIdentities = new Set<string>();
  const steps: HistoryStepTransition[] = [];

  for (const identity of allIdentities) {
    const from = fromByIdentity.get(identity);
    const to = toByIdentity.get(identity);
    const changes = new Set<HistoryStepVisualChange>();

    if (!from && to) insertedStepIdentities.add(identity);
    if (from && !to) removedStepIdentities.add(identity);
    if (from && to) {
      if (from.index !== to.index) movedStepIdentities.add(identity);
      for (const change of getStepVisualChanges(from.step, to.step)) {
        changes.add(change);
      }
      if (changes.size > 0) changedStepIdentities.add(identity);
    }

    steps.push({
      identity,
      fromIndex: from?.index ?? null,
      toIndex: to?.index ?? null,
      changes,
    });
  }

  const retainedCount = steps.filter(
    (step) => step.fromIndex !== null && step.toIndex !== null
  ).length;
  const fromCount = fromSteps.length;
  const toCount = toSteps.length;
  const startPlacementChanged = !sameValue(
    sequenceStartPlacement(fromSequence),
    sequenceStartPlacement(toSequence)
  );
  const gridModeChanged = fromSequence?.gridMode !== toSequence?.gridMode;
  const wordChanged =
    fromSequence?.word !== toSequence?.word ||
    fromSequence?.intendedWord !== toSequence?.intendedWord ||
    fromSequence?.name !== toSequence?.name ||
    fromSequence?.displayName !== toSequence?.displayName;
  const circularityChanged = !sameValue(
    loopPresentation(fromSequence),
    loopPresentation(toSequence)
  );
  const selectionChanged = fromSelectedStepNumber !== toSelectedStepNumber;
  const hasMembershipChange =
    insertedStepIdentities.size > 0 || removedStepIdentities.size > 0;
  const hasReorder = movedStepIdentities.size > 0;
  const hasContentChange =
    changedStepIdentities.size > 0 ||
    startPlacementChanged ||
    gridModeChanged ||
    wordChanged ||
    circularityChanged ||
    selectionChanged;
  const isReplacement = retainedCount === 0 && fromCount > 0 && toCount > 0;

  return {
    direction,
    operation,
    label,
    kind: getChangeKind({
      isReplacement,
      hasMembershipChange,
      hasReorder,
      hasContentChange,
    }),
    steps,
    insertedStepIdentities,
    removedStepIdentities,
    movedStepIdentities,
    changedStepIdentities,
    startPlacementChanged,
    gridModeChanged,
    wordChanged,
    circularityChanged,
    selectionChanged,
    fromSelectedStepNumber,
    toSelectedStepNumber,
  };
}

function identifySteps(steps: readonly StepData[]): readonly IdentifiedStep[] {
  const identities = createStableStepIdentities(steps);
  return steps.map((step, index) => ({
    identity: identities[index]!,
    step,
    index,
  }));
}

function normalizedStepId(step: StepData): string | null {
  const id = typeof step.id === "string" ? step.id.trim() : "";
  return id.length > 0 ? id : null;
}

function legacyStepFingerprint(step: StepData): string {
  return JSON.stringify({
    letter: step.letter ?? null,
    motions: step.motions,
    duration: step.duration,
    gridMode: step.gridMode,
  });
}

function sequenceStartPlacement(sequence: SequenceData | null): unknown {
  return sequence?.startingPlacement ?? sequence?.startPlacement ?? null;
}

function loopPresentation(sequence: SequenceData | null): unknown {
  return {
    isCircular: Boolean(sequence?.isCircular),
    loopType: sequence?.loopType ?? null,
    period: sequence?.period ?? sequence?.orientationCycleCount ?? null,
    components: sequence?.components ?? [],
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function motionPropVisual(motion: MotionData): unknown {
  return {
    isVisible: motion.isVisible,
    color: motion.hand,
    propType: motion.propType,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    rotationDirection: motion.rotationDirection,
    turns: motion.turns,
    gridMode: motion.gridMode,
    plane: motion.plane,
    propPlacementData: motion.propPlacementData,
  };
}

function motionArrowVisual(motion: MotionData): unknown {
  return {
    isVisible: motion.isVisible,
    color: motion.hand,
    motionType: motion.motionType,
    prefloatMotionType: motion.prefloatMotionType,
    prefloatRotationDirection: motion.prefloatRotationDirection,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    rotationDirection: motion.rotationDirection,
    turns: motion.turns,
    arrowLocation: motion.arrowLocation,
    gridMode: motion.gridMode,
    plane: motion.plane,
    arrowPlacementData: motion.arrowPlacementData,
    handPath: motion.handPath,
    skewSteps: motion.skewSteps,
    skewDir: motion.skewDir,
    segment: motion.segment,
  };
}

function getStepVisualChanges(
  from: StepData,
  to: StepData
): ReadonlySet<HistoryStepVisualChange> {
  const changes = new Set<HistoryStepVisualChange>();

  if (from.stepNumber !== to.stepNumber) changes.add("step-number");
  if (from.duration !== to.duration) changes.add("duration");
  if (
    from.gridMode !== to.gridMode ||
    !sameValue(from.startPlacement, to.startPlacement) ||
    !sameValue(from.endPlacement, to.endPlacement)
  ) {
    changes.add("grid");
  }
  if (from.isBlank !== to.isBlank) changes.add("visibility");
  if (
    from.letter !== to.letter ||
    from.leftReversal !== to.leftReversal ||
    from.rightReversal !== to.rightReversal ||
    from.category !== to.category ||
    from.betaSwapped !== to.betaSwapped
  ) {
    changes.add("notation");
  }

    for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
    const fromMotion = from.motions?.[color];
    const toMotion = to.motions?.[color];
    if (!fromMotion || !toMotion) {
      if (fromMotion !== toMotion) {
        changes.add("prop");
        changes.add("arrow");
        changes.add("path");
      }
      continue;
    }
    if (!sameValue(motionPropVisual(fromMotion), motionPropVisual(toMotion))) {
      changes.add("prop");
    }
    if (
      !sameValue(motionArrowVisual(fromMotion), motionArrowVisual(toMotion))
    ) {
      changes.add("arrow");
    }
    if (fromMotion.pathShape !== toMotion.pathShape) changes.add("path");
  }

  return changes;
}

function getChangeKind({
  isReplacement,
  hasMembershipChange,
  hasReorder,
  hasContentChange,
}: {
  isReplacement: boolean;
  hasMembershipChange: boolean;
  hasReorder: boolean;
  hasContentChange: boolean;
}): HistorySequenceChangeKind {
  if (isReplacement) return "replacement";
  const categoryCount = [
    hasMembershipChange,
    hasReorder,
    hasContentChange,
  ].filter(Boolean).length;
  if (categoryCount > 1) return "mixed";
  if (hasMembershipChange) return "membership";
  if (hasReorder) return "reorder";
  if (hasContentChange) return "content";
  return "none";
}
