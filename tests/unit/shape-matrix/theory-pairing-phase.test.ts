import { describe, expect, it } from "vitest";
import { makeSpinRatio } from "@vtg/domain";
import {
  handIndexAt,
  propIndexAt,
  traceScaledPath,
} from "$lib/shared/notation/qft/qft-model";
import {
  buildTheoryAxis,
  theoryKnobs,
  theorySoloKnobs,
  type TheoryFlower,
} from "$lib/shared/shape-matrix/domain/theory-flower";
import {
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

/** Austen's report: 5:1 antispin, prop starting in, both hands the same. */
const FIVE_ONE_ANTI_IN: TheoryFlower = {
  ratio: makeSpinRatio(5, 1),
  style: "anti",
  ori: "in",
  petals: 6,
};

/** Austen's report: 2:3 against 2:3, column 4 — the antispin clock start. */
const TWO_THREE_ANTI_CLOCK: TheoryFlower = {
  ratio: makeSpinRatio(3, 2),
  style: "anti",
  ori: "clock",
  petals: 5,
};

const eighths = (value: number) => ((value % 8) + 8) % 8;

const samples = [0, 0.25, 0.5, 1, 1.75, 2, 3.5, 5];

const OFFSET: Record<VtgMode, number> = {
  TS: 0,
  TO: 0,
  SS: 4,
  SO: 4,
  QS: 2,
  QO: 2,
};

/** The staff's tip reach against its hand orbit, as the tiles are drawn. */
const UNITS = { hand: 1, prop: 0.84 };
const LOCUS_SAMPLES = 1600;

/**
 * Hausdorff distance between two closed curves, sampled densely. Where the
 * curves start and which way they run does not matter; where they LIE does,
 * so a rotated copy of a flower scores far above the tolerance.
 */
function locusDistance(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>
): number {
  const directed = (
    from: Array<{ x: number; y: number }>,
    to: Array<{ x: number; y: number }>
  ) => {
    let worst = 0;
    for (const p of from) {
      let nearest = Infinity;
      for (const q of to) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < nearest) nearest = d;
      }
      if (nearest > worst) worst = nearest;
    }
    return worst;
  };
  return Math.max(directed(a, b), directed(b, a));
}

function locusOf(knobs: ReturnType<typeof theoryKnobs>) {
  return traceScaledPath(knobs, UNITS, LOCUS_SAMPLES);
}

describe("a Theory pairing's right hand", () => {
  /* Same Direction is one motion played twice, the second hand a fixed number
     of steps into it. Anything the right hand shows that the left never shows
     at any moment is a different motion wearing the same name. */
  for (const [mode, offset] of [
    ["TS", 0],
    ["SS", 4],
    ["QS", 2],
  ] as const) {
    it(`plays the left hand's own motion ${offset} steps ahead in ${mode}`, () => {
      const left = theorySoloKnobs(FIVE_ONE_ANTI_IN);
      const right = theoryKnobs(FIVE_ONE_ANTI_IN, "right", mode);

      for (const u of samples) {
        expect(eighths(handIndexAt(right, u))).toBeCloseTo(
          eighths(handIndexAt(left, u + offset)),
          10
        );
        expect(eighths(propIndexAt(right, u))).toBeCloseTo(
          eighths(propIndexAt(left, u + offset)),
          10
        );
      }
    });
  }

  /* Quarter Time is where the old arithmetic showed: it carried the prop two
     eighths when the motion had already turned it ten, leaving the right-hand
     mandala a half turn out of true against a left it was meant to match. */
  it("does not leave the Quarter Time prop a half turn out of true", () => {
    const right = theoryKnobs(FIVE_ONE_ANTI_IN, "right", "QS");
    const stale = { ...theorySoloKnobs(FIVE_ONE_ANTI_IN), handPhase: 8 + 2 };
    expect(eighths(propIndexAt(right, 0))).not.toBeCloseTo(
      eighths(propIndexAt(stale, 0)),
      10
    );
    expect(eighths(propIndexAt(right, 0) - propIndexAt(stale, 0))).toBeCloseTo(
      4,
      10
    );
  });

  /* Opposite Direction is the same motion run backwards from the offset: the
     hand and the prop both pass through exactly the bearings the left hand
     passes through, in the other order. A mirror would put the prop somewhere
     the left hand's prop never goes, and the flower somewhere the tile's
     flower never was. */
  for (const [mode, offset] of [
    ["TO", 0],
    ["SO", 4],
    ["QO", 2],
  ] as const) {
    for (const ori of ["in", "out", "clock", "counter"] as const) {
      it(`plays the left hand's own motion backwards from ${offset} steps in for a ${ori} start in ${mode}`, () => {
        const flower: TheoryFlower = { ...FIVE_ONE_ANTI_IN, ori };
        const left = theorySoloKnobs(flower);
        const right = theoryKnobs(flower, "right", mode);

        for (const u of samples) {
          expect(eighths(handIndexAt(right, u))).toBeCloseTo(
            eighths(handIndexAt(left, offset - u)),
            10
          );
          expect(eighths(propIndexAt(right, u))).toBeCloseTo(
            eighths(propIndexAt(left, offset - u)),
            10
          );
        }
      });
    }
  }

  /* The tile is the cell. Whatever element is picked, each hand's live guide
     has to lie exactly where its tile's flower lies; timing and direction are
     between the hands, not in the shape. Austen's report: 2:3 against 2:3,
     column 4, Fire rotated the red flower. */
  describe("keeps every hand's mandala where its tile drew it", () => {
    const flowers: TheoryFlower[] = [
      TWO_THREE_ANTI_CLOCK,
      FIVE_ONE_ANTI_IN,
      ...buildTheoryAxis(makeSpinRatio(3, 2)),
      ...buildTheoryAxis(makeSpinRatio(2, 1)),
      ...buildTheoryAxis(makeSpinRatio(4, 1)),
      ...buildTheoryAxis(makeSpinRatio(0, 1)),
      ...buildTheoryAxis(makeSpinRatio(4, 3)),
    ];

    for (const flower of flowers) {
      const label = `${flower.ratio.handCycles}:${flower.ratio.propRotations} ${flower.style} ${flower.ori}`;
      for (const mode of MODE_ORDER) {
        it(`${label} in ${mode}`, () => {
          const tile = locusOf(theorySoloKnobs(flower));
          const right = locusOf(theoryKnobs(flower, "right", mode));
          expect(locusDistance(tile, right)).toBeLessThan(0.03);
        });
      }
    }
  });

  /* The invariance test above has to be able to fail: the mirror the old
     arithmetic applied really does move a 5-petal flower. */
  it("would notice a rotated flower", () => {
    const solo = theorySoloKnobs(TWO_THREE_ANTI_CLOCK);
    const tile = locusOf(solo);
    const rotated = locusOf({ ...solo, handPhase: 8 + 4, phase: -2 });
    expect(locusDistance(tile, rotated)).toBeGreaterThan(0.3);
  });

  it("carries the offset into the hand as well as the prop", () => {
    for (const mode of MODE_ORDER) {
      const right = theoryKnobs(TWO_THREE_ANTI_CLOCK, "right", mode);
      expect(right.handPhase).toBe(8 + OFFSET[mode]);
      expect(right.handDirection).toBe(mode.endsWith("O") ? -1 : 1);
    }
  });

  /* A hand that never travels has no clock to run ahead of, so its timing is
     the plain bearing offset it always was. */
  it("keeps a stationary hand's timing a plain bearing offset", () => {
    const stationary: TheoryFlower = {
      ratio: makeSpinRatio(1, 0),
      style: "pro",
      ori: "out",
      petals: 1,
    };
    const right = theoryKnobs(stationary, "right", "QS");
    expect(right.phase).toBe(theorySoloKnobs(stationary).phase);
    expect(right.handPhase).toBe(8 + 2);
  });
});
