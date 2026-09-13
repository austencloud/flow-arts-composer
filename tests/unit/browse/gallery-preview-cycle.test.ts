import { describe, expect, it } from "vitest";
import { MUSEUM_EXHIBIT_SEQUENCES } from "$lib/features/museum/data/museum-exhibit-sequences";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  cycleSlotCount,
  performsStartSlot,
  resolvePreviewCycleStep,
} from "$lib/shared/timeline/loop-cycle";

/**
 * Canonical loop semantics for the gallery card preview, against real
 * sequences.
 *
 * The playback controller's own boundary resumes a seamlessly loopable
 * sequence at `startPositionDuration` — it skips the repeated start hold —
 * and restarts a freeform one at 0, replaying it. The card preview must make
 * the same distinction, because a held start beat inserted into a loopable
 * repeat is a pause in something meant to spin continuously.
 */

/** A real, seam-closed LOOP: four beats that end on their own start pose. */
function loopableSequence(): SequenceData {
  const fixture = MUSEUM_EXHIBIT_SEQUENCES["performer-cave-seq"]!;
  return {
    id: "loopable",
    name: "Loopable",
    word: fixture.word,
    steps: fixture.steps,
    startPosition: fixture.startPosition ?? undefined,
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    tags: [],
    metadata: {},
  } as SequenceData;
}

/** The same sequence with its seam broken: it no longer ends where it began. */
function freeformSequence(): SequenceData {
  const sequence = loopableSequence();
  const last = sequence.steps[sequence.steps.length - 1]!;
  return {
    ...sequence,
    id: "freeform",
    steps: [...sequence.steps.slice(0, -1), { ...last, endPosition: "alpha1" }],
  } as SequenceData;
}

describe("gallery preview cycle", () => {
  it("spins a loopable sequence on exactly its own beats", () => {
    const sequence = loopableSequence();
    const beats = sequence.steps.length;
    expect(beats).toBe(4);
    expect(performsStartSlot(sequence)).toBe(false);
    expect(cycleSlotCount(beats, performsStartSlot(sequence))).toBe(beats);

    // No beat is added anywhere: the clock is the same one the preview has
    // always run, and the seam returns to beat 1 after exactly `beats` beats.
    for (let frame = 0; frame <= 320; frame++) {
      const elapsed = frame / 8;
      expect(
        resolvePreviewCycleStep(elapsed, beats, performsStartSlot(sequence))
      ).toBeCloseTo((elapsed % beats) + 1, 10);
    }
  });

  it("replays the start hold for a freeform sequence, as the viewer does", () => {
    const sequence = freeformSequence();
    const beats = sequence.steps.length;
    expect(performsStartSlot(sequence)).toBe(true);
    expect(cycleSlotCount(beats, true)).toBe(beats + 1);

    const slots = Array.from({ length: 2 * (beats + 1) }, (_, elapsed) =>
      resolvePreviewCycleStep(elapsed, beats, true)
    );
    expect(slots).toEqual([1, 2, 3, 4, 0, 1, 2, 3, 4, 0]);
  });
});
