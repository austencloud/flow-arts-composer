/**
 * Guide sequence adapter - turns a page's sequence strip (a flat StepData[]) into
 * a playable SequenceData for the reader's animation companion.
 *
 * A strip's first box is the start pose (stepNumber 0 or null); the rest are
 * steps. The animation engine wants a StartPlacementData (PictographData +
 * isStartPlacement) plus 1-based `steps`. The page's StepData already carry
 * motions, so the engine plays this directly (ensureMotionData short-circuits).
 */
import { deriveReversals } from "@tka/sequence-engine";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/** A box is the start pose when it has no beat number (0 or null/undefined). */
export const isStartBox = (b: StepData): boolean =>
  b.stepNumber === 0 || b.stepNumber === null || b.stepNumber === undefined;

/**
 * Force a linear path archetype on every HAND motion of a box (clones - never
 * mutates the page's source StepData). The Level 1 guide teaches the grid points
 * themselves, so a companion animation should trace a straight point-to-point
 * hand path; a curved shift arc reads as extra information the lesson hasn't
 * introduced yet. This is the one seam every page's example strip flows through,
 * so hardcoding it here keeps all guide HAND animations linear (matching the
 * baked demos in guide-motion-configs.ts). resolvePathType honours a per-motion
 * pathShape above any motion-aware/global/user path-shape setting.
 *
 * STAFF motions keep their natural arc: the staff pages teach rotation (a base
 * isolation keeps one end pinned at the grid center), and a straight-line hand
 * path would detach that end mid-sweep.
 */
function withLinearPaths<T extends Record<string, unknown>>(box: T): T {
  const motions = box.motions as Record<string, MotionData | undefined> | undefined;
  if (!motions) return box;
  const linear: Record<string, MotionData | undefined> = {};
  for (const [color, m] of Object.entries(motions)) {
    linear[color] =
      m && m.propType === PropType.HAND ? { ...m, pathShape: "linear" as const } : m;
  }
  return { ...box, motions: linear };
}

/**
 * Bake reversal dots (leftReversal/rightReversal) into a strip FROM ITS OWN
 * MOTION DATA via the canonical engine detector - never hand-author flags on
 * pages that use this. Dots = the `propReversal` channel only (display policy
 * 2026-07-05: dots mark prop-direction reversals). Strips read LINEARLY (no
 * loop wrap): the printed page teaches left-to-right, so the first direction
 * establishes and mid-strip flips get dots - matching the old guide's R marks.
 * The start box (stepNumber 0) never flags and never anchors.
 */
export function bakeReversals(strip: StepData[]): StepData[] {
  const flags = deriveReversals(strip);
  return strip.map((b, i) => {
    const f = flags[i];
    if (!f || (!f.left.propReversal && !f.right.propReversal)) return b;
    return {
      ...b,
      leftReversal: f.left.propReversal,
      rightReversal: f.right.propReversal,
    } as StepData;
  });
}

export function stripToSequence(
  strip: StepData[],
  opts: { word?: string; name?: string } = {}
): SequenceData {
  const startBox = strip.find(isStartBox);
  const stepBoxes = strip.filter((b) => !isStartBox(b));

  const steps = stepBoxes.map((b, i) =>
    withLinearPaths({ ...b, stepNumber: i + 1 })
  ) as unknown as StepData[];

  const startPlacement = startBox
    ? (withLinearPaths({
        ...(startBox as object),
        isStartPlacement: true,
        id: startBox.id ?? "start",
      }) as unknown as StartPlacementData)
    : undefined;

  const gridMode = (strip[0]?.gridMode as GridMode | undefined) ?? GridMode.DIAMOND;

  return createSequenceData({
    steps,
    ...(startPlacement ? { startPlacement } : {}),
    gridMode,
    word: opts.word ?? "",
    name: opts.name ?? opts.word ?? "guide-sequence",
  });
}

/**
 * Inverse of stripToSequence - a SequenceData picked via SequencePickerModal
 * (Guide Companion v2 "Replace") becomes a flat strip: the start position
 * first (stepNumber 0), then the numbered steps. Best-effort field carry-over
 * (StartPlacementData and StepData overlap on motions/gridMode/letter, per the
 * StepData<->PictographData structural-assignability guarantee); the caller
 * persists the result via saveOverride.
 */
export function sequenceToStrip(sequence: SequenceData): StepData[] {
  const strip: StepData[] = [];
  if (sequence.startPlacement) {
    strip.push({ ...(sequence.startPlacement as object), stepNumber: 0 } as unknown as StepData);
  }
  for (const step of sequence.steps ?? []) {
    strip.push(step as unknown as StepData);
  }
  return strip;
}
