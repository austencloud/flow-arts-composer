// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { MandalaPaths, MandalaPoint } from "../../domain/mandala-types";
import { calculate } from "../mandala-geometry-calculator";
import { parsePoints } from "../mandala-fingerprint";
import { createMandalaMorph } from "../mandala-path-interpolator";
import type { MotionLike, StepLike } from "../types";

const CLOCKWISE = ["n", "e", "s", "w"] as const;

/** A pro motion one quarter clockwise around the grid. */
function pro(
  start: number,
  turns: number,
  startOrientation: string,
  endOrientation: string
): MotionLike {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: CLOCKWISE[start % 4]!,
    endLocation: CLOCKWISE[(start + 1) % 4]!,
    turns,
    startOrientation,
    endOrientation,
  };
}

/**
 * Eight beats of both hands circling the grid. `rightTurns` adds turns to
 * the red hand's first beat, which flips its orientation from then on, the
 * way a +1 in the step editor does.
 */
function circle(rightTurns: number): StepLike[] {
  const flipped = rightTurns % 2 === 1;
  return Array.from({ length: 8 }, (_, beat) => {
    const rightStart = beat === 0 || !flipped ? "in" : "out";
    const rightEnd = flipped ? "out" : "in";
    return {
      motions: {
        left: pro(beat + 2, 0, "in", "in"),
        right: pro(beat, beat === 0 ? rightTurns : 0, rightStart, rightEnd),
      },
    };
  });
}

function segmentsOf(paths: MandalaPaths, hand: "left" | "right", beat: number) {
  return paths[hand].map((path) => path.beats![beat]!);
}

function sameSegment(
  a: readonly MandalaPoint[],
  b: readonly MandalaPoint[]
): boolean {
  return (
    a.length === b.length &&
    a.every((point, i) => Math.hypot(point.x - b[i]!.x, point.y - b[i]!.y) < 1e-6)
  );
}

describe("mandala change morph", () => {
  const before = calculate(circle(0));
  const after = calculate(circle(1));

  it("records each tip's beats, drawing the same path as before", () => {
    expect(before.right).toHaveLength(2);
    for (const path of before.right) {
      expect(path.beats).toHaveLength(8);
      const points = parsePoints(path.d);
      expect(points).toHaveLength(path.beats!.flat().length);
    }
  });

  it("an added turn re-deals the later beats between the staff's ends", () => {
    // The premise of the beat pairing: past the edited beat, tip 0 now draws
    // what tip 1 drew, so pairing by tip sends those beats across the figure.
    for (let beat = 1; beat < 8; beat++) {
      expect(sameSegment(before.right[0]!.beats![beat]!, after.right[1]!.beats![beat]!)).toBe(true);
      expect(sameSegment(before.right[0]!.beats![beat]!, after.right[0]!.beats![beat]!)).toBe(false);
    }
  });

  it("moves only the edited beat; every other beat stays where it is", () => {
    const morph = createMandalaMorph(before, after);
    expect(morph.still).toBe(false);
    const middle = morph(0.5);
    for (let beat = 1; beat < 8; beat++) {
      const shown = segmentsOf(middle, "right", beat);
      const was = segmentsOf(before, "right", beat);
      for (const segment of shown) {
        expect(was.some((old) => sameSegment(old, segment))).toBe(true);
      }
    }
    // The blue hand did not change at all.
    expect(middle.left).toEqual(before.left);
  });

  it("is still when only the tips trading lines differ", () => {
    const swapped: MandalaPaths = {
      ...before,
      right: [
        { ...before.right[1]!, tipIndex: 0 },
        { ...before.right[0]!, tipIndex: 1 },
      ],
    };
    expect(createMandalaMorph(before, swapped).still).toBe(true);
    expect(createMandalaMorph(before, before).still).toBe(true);
  });

  it("continues from an interrupted frame without jumping", () => {
    const morph = createMandalaMorph(before, after);
    const shown = morph(0.4);
    const back = createMandalaMorph(shown, before);
    // At its start the new morph shows exactly the interrupted frame.
    const first = back(1e-9);
    for (let beat = 0; beat < 8; beat++) {
      const a = segmentsOf(first, "right", beat);
      const b = segmentsOf(shown, "right", beat);
      a.forEach((segment, i) => {
        segment.forEach((point, k) => {
          expect(Math.hypot(point.x - b[i]![k]!.x, point.y - b[i]![k]!.y)).toBeLessThan(1e-3);
        });
      });
    }
  });

  it("still morphs paths that carry no beats, by tip", () => {
    const from: MandalaPaths = {
      left: [{ d: "M 0 0 C 0 0, 10 0, 10 0", tipIndex: 0 }],
      right: [],
      purple: [],
    };
    const to: MandalaPaths = {
      left: [{ d: "M 0 10 C 0 10, 10 10, 10 10", tipIndex: 0 }],
      right: [],
      purple: [],
    };
    const morph = createMandalaMorph(from, to);
    expect(morph.still).toBe(false);
    const middle = parsePoints(morph(0.5).left[0]!.d);
    expect(middle[0]!.y).toBeCloseTo(5);
  });
});
