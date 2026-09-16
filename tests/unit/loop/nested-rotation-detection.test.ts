/**
 * Nested-rotation detection regression.
 *
 * Real reported bug (2026-07-12): a generated 16-beat
 * `mirrored_inverted_rotated` sequence (ΩZ-ΩZ-ΩZ-ΩZ-ΘY-ΘY-ΘY-ΘY-,
 * id b990bff1) showed only the mirrored + inverted icons on the ChoreoCard
 * glyph. The card resolves components via detection (loop-display-resolver,
 * detection-over-stored precedence), and the loop-labeler detector could not
 * see the rotation: it completes a full cycle WITHIN each half, so index-wise
 * half/quarter pair comparisons never find a unanimous "rotated" relation.
 *
 * The fix detects the closed first half as its own circular loop and merges
 * its rotation (loop-detector.ts detectNestedRotation).
 */

import { describe, expect, it } from "vitest";
import {
  resolveLoopDisplay,
  clearLoopDisplayCache,
} from "$lib/features/loop-labeler/services/loop-display-resolver";
import { loopDetector as labelerLoopDetector } from "$lib/features/loop-labeler/services/loop-detector";
import { convert as convertSequenceToEntry } from "$lib/features/choreo-card/services/sequence-to-entry-converter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";

// [letter, startPos, endPos, blue(type,rot,s>e,ori s>e), red(...)] per beat,
// transcribed 1:1 from the reported sequence.
const M = (
  motionType: string,
  rotationDirection: string,
  startLocation: string,
  endLocation: string,
  startOrientation: string,
  endOrientation: string
) => ({
  motionType,
  rotationDirection,
  startLocation,
  endLocation,
  startOrientation,
  endOrientation,
  turns: 0,
});

interface Beat {
  letter: string;
  start: string;
  end: string;
  left: ReturnType<typeof M>;
  right: ReturnType<typeof M>;
}

const BEATS: Beat[] = [
  { letter: "Ω", start: "beta1", end: "gamma9", left: M("anti", "ccw", "n", "e", "in", "out"), right: M("static", "cw", "n", "n", "in", "out") },
  { letter: "Z-", start: "gamma9", end: "beta7", left: M("dash", "ccw", "e", "w", "out", "out"), right: M("anti", "cw", "n", "w", "out", "out") },
  { letter: "Ω", start: "beta7", end: "gamma15", left: M("anti", "ccw", "w", "n", "out", "in"), right: M("static", "cw", "w", "w", "out", "in") },
  { letter: "Z-", start: "gamma15", end: "beta5", left: M("dash", "ccw", "n", "s", "in", "in"), right: M("anti", "cw", "w", "s", "in", "in") },
  { letter: "Ω", start: "beta5", end: "gamma13", left: M("anti", "ccw", "s", "w", "in", "out"), right: M("static", "cw", "s", "s", "in", "out") },
  { letter: "Z-", start: "gamma13", end: "beta3", left: M("dash", "ccw", "w", "e", "out", "out"), right: M("anti", "cw", "s", "e", "out", "out") },
  { letter: "Ω", start: "beta3", end: "gamma11", left: M("anti", "ccw", "e", "s", "out", "in"), right: M("static", "cw", "e", "e", "out", "in") },
  { letter: "Z-", start: "gamma11", end: "beta1", left: M("dash", "ccw", "s", "n", "in", "in"), right: M("anti", "cw", "e", "n", "in", "in") },
  { letter: "Θ", start: "beta1", end: "gamma1", left: M("pro", "ccw", "n", "w", "in", "in"), right: M("static", "cw", "n", "n", "in", "out") },
  { letter: "Y-", start: "gamma1", end: "beta3", left: M("dash", "ccw", "w", "e", "in", "in"), right: M("pro", "cw", "n", "e", "out", "in") },
  { letter: "Θ", start: "beta3", end: "gamma3", left: M("pro", "ccw", "e", "n", "in", "in"), right: M("static", "cw", "e", "e", "in", "out") },
  { letter: "Y-", start: "gamma3", end: "beta5", left: M("dash", "ccw", "n", "s", "in", "in"), right: M("pro", "cw", "e", "s", "out", "in") },
  { letter: "Θ", start: "beta5", end: "gamma5", left: M("pro", "ccw", "s", "e", "in", "in"), right: M("static", "cw", "s", "s", "in", "out") },
  { letter: "Y-", start: "gamma5", end: "beta7", left: M("dash", "ccw", "e", "w", "in", "in"), right: M("pro", "cw", "s", "w", "out", "in") },
  { letter: "Θ", start: "beta7", end: "gamma7", left: M("pro", "ccw", "w", "s", "in", "in"), right: M("static", "cw", "w", "w", "in", "out") },
  { letter: "Y-", start: "gamma7", end: "beta1", left: M("dash", "ccw", "s", "n", "in", "in"), right: M("pro", "cw", "w", "n", "out", "in") },
];

function buildSequence(): SequenceData {
  return {
    id: "b990bff1-nested-rotation-regression",
    name: "nested-rotation-regression",
    word: "ΩZ-ΩZ-ΩZ-ΩZ-ΘY-ΘY-ΘY-ΘY-",
    isCircular: true,
    loopType: "mirrored_inverted_rotated",
    gridMode: "diamond",
    thumbnails: [],
    startPlacement: { endPlacement: "beta1" },
    steps: BEATS.map((b, i) => ({
      id: `step-${i + 1}`,
      stepNumber: i + 1,
      duration: 1,
      letter: b.letter,
      startPlacement: b.start,
      endPlacement: b.end,
      motions: {
        left: { ...b.left, color: "blue" },
        right: { ...b.right, color: "red" },
      },
    })),
  } as unknown as SequenceData;
}

describe("nested rotation detection (mirrored_inverted_rotated card glyph)", () => {
  it("labeler detector recovers rotated from the closed rotating half", () => {
    const entry = convertSequenceToEntry(buildSequence());
    const result = labelerLoopDetector.detectLOOP(entry);

    expect(result.isCircular).toBe(true);
    expect(result.components).toContain("mirrored");
    expect(result.components).toContain("inverted");
    // The regression: rotation completes a full cycle inside each half and
    // was invisible to seam-pair comparison.
    expect(result.components).toContain("rotated");
  });

  it("resolveLoopDisplay (the ChoreoCard path) shows all three components", () => {
    clearLoopDisplayCache();
    const display = resolveLoopDisplay(buildSequence());

    expect(display.components).toContain(LOOPComponent.MIRRORED);
    expect(display.components).toContain(LOOPComponent.INVERTED);
    expect(display.components).toContain(LOOPComponent.ROTATED);
  });
});
