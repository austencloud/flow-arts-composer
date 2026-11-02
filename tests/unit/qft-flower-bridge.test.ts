/**
 * The bridge is a translation between two notations, so the test that matters
 * is that both sides independently agree on the same shape.
 *
 * `flowerPetals` counts petals from TKA's rules (2·turns for prospin, 2·turns+2
 * for antispin). `petalCount` counts them from QfT's rules (n−1 for inspin, n+1
 * for antispin) and was written against the 2011 article without reference to
 * TKA. Neither calls the other. If the mapping is right they agree on all 56
 * flowers on the axis; if it is wrong they diverge immediately.
 */

import { describe, expect, it } from "vitest";
import {
  buildFlowerAxis,
  flowerPetals,
  type Flower,
} from "@tka/shape-domain";
import { MODE_ORDER } from "@tka/shape-domain";
import {
  FLOWER_RADIUS,
  flowerToKnobs,
  flowerToTrajectory,
  realizationToHands,
  realizationToTrajectories,
} from "../../src/lib/shared/notation/qft/qft-flower-bridge";
import { petalCount } from "../../src/lib/shared/notation/qft/qft-naming";
import {
  buildIncrements,
  handIndexAt,
  norm,
} from "../../src/lib/shared/notation/qft/qft-model";
import { GUIDE_MOVES } from "../../src/lib/shared/notation/qft/qft-guide";
import {
  buildTrajectoryIncrements,
  trajectoryHandIndexAt,
} from "../../src/lib/shared/notation/qft/qft-trajectory";

const AXIS = buildFlowerAxis();

describe("flowerToKnobs", () => {
  it("covers the whole axis", () => {
    expect(AXIS).toHaveLength(56);
  });

  it("agrees with TKA's petal count on every flower", () => {
    const disagreements = AXIS.filter(
      (f) => petalCount(flowerToKnobs(f)) !== flowerPetals(f)
    ).map((f) => `${f.style} ${f.turns}t`);
    expect(disagreements).toEqual([]);
  });

  it("reads prospin as inspin and antispin as antispin", () => {
    for (const f of AXIS) {
      expect(flowerToKnobs(f).spin).toBe(
        f.style === "pro" ? "inspin" : "antispin"
      );
    }
  });

  it("turns the VTG ratio's prop count into the downbeat count", () => {
    expect(flowerToKnobs({ ...AXIS[0]!, turns: 0 }).downbeats).toBe(1);
    expect(flowerToKnobs({ ...AXIS[0]!, turns: 1 }).downbeats).toBe(3);
    expect(flowerToKnobs({ ...AXIS[0]!, turns: 2 }).downbeats).toBe(5);
  });

  it("puts an out-facing prop along the hand's bearing and an in-facing one opposite", () => {
    const base = AXIS[0]!;
    expect(flowerToKnobs({ ...base, ori: "out" }).phase).toBe(0);
    expect(flowerToKnobs({ ...base, ori: "in" }).phase).toBe(4);
  });

  it("expresses the box grid as one compass position of hand rotation", () => {
    const base = AXIS[0]!;
    expect(flowerToKnobs({ ...base, grid: "diamond" }).handPhase).toBe(0);
    expect(flowerToKnobs({ ...base, grid: "box" }).handPhase).toBe(1);
  });
});

describe("the 144-cell matrix", () => {
  /** The `large` size preset: turns 0/1/2, diamond only, both styles and oris. */
  const TWELVE = AXIS.filter(
    (f) => f.grid === "diamond" && [0, 1, 2].includes(f.turns)
  );

  it("has twelve flowers per axis, so 144 cells", () => {
    expect(TWELVE).toHaveLength(12);
    expect(TWELVE.length ** 2).toBe(144);
  });

  it("maps every cell in every mode without leaving the compass", () => {
    let cells = 0;
    for (const left of TWELVE) {
      for (const right of TWELVE) {
        for (const mode of MODE_ORDER) {
          const hands = realizationToHands(left, right, mode);
          for (const knobs of [hands.left, hands.right]) {
            expect(Number.isInteger(knobs.handPhase ?? 0)).toBe(true);
            expect(Number.isInteger(knobs.phase ?? 0)).toBe(true);
            /* Eight rows out, every value a real compass position. */
            const rows = buildIncrements(knobs, "drex");
            expect(rows).toHaveLength(8);
            for (const r of rows) {
              expect(r.handDepart).toBeGreaterThanOrEqual(1);
              expect(r.handDepart).toBeLessThanOrEqual(8);
            }
          }
          cells += 1;
        }
      }
    }
    expect(cells).toBe(864);
  });
});

describe("realizationToHands", () => {
  const left = AXIS.find(
    (f) => f.style === "pro" && f.turns === 1 && f.ori === "in"
  )!;
  const right = AXIS.find(
    (f) => f.style === "anti" && f.turns === 1 && f.ori === "in"
  )!;

  it("leaves the blue hand alone in all six modes", () => {
    const solo = flowerToKnobs(left);
    for (const mode of MODE_ORDER) {
      expect(realizationToHands(left, right, mode).left).toEqual(solo);
    }
  });

  it("reads timing as the offset between the two hands", () => {
    const offset = (mode: (typeof MODE_ORDER)[number]) => {
      const h = realizationToHands(left, right, mode);
      return norm(handIndexAt(h.right, 0) - handIndexAt(h.left, 0) + 8);
    };
    /* Together: same point. Quarter: a right angle. Split: opposite points. */
    expect(offset("TS")).toBe(8);
    expect(offset("QS")).toBe(2);
    expect(offset("SS")).toBe(4);
  });

  it("reads direction as the sign on the red hand's travel", () => {
    for (const mode of ["SS", "TS", "QS"] as const) {
      expect(realizationToHands(left, right, mode).right.handDirection).toBe(1);
    }
    for (const mode of ["SO", "TO", "QO"] as const) {
      expect(realizationToHands(left, right, mode).right.handDirection).toBe(
        -1
      );
    }
  });

  it("keeps a reversed hand's flower the same shape", () => {
    /* Reversing the hand must not silently convert inspin to antispin — the
		   petal count is the thing that would change if the sign were wrong. */
    const forward = realizationToHands(left, right, "SS").right;
    const reversed = realizationToHands(left, right, "SO").right;
    expect(petalCount(reversed)).toBe(petalCount(forward));
    expect(petalCount(reversed)).toBe(flowerPetals(right));
  });
});

describe("the trajectory bridge", () => {
  const left = AXIS.find(
    (f) => f.style === "pro" && f.turns === 1 && f.ori === "in"
  )!;
  const right = AXIS.find(
    (f) => f.style === "anti" && f.turns === 1 && f.ori === "out"
  )!;

  it("keeps a flower's notation identical after lifting it into a trajectory", () => {
    expect(buildTrajectoryIncrements(flowerToTrajectory(left))).toEqual(
      buildIncrements(flowerToKnobs(left), "drex")
    );
  });

  it("keeps the six timing and direction relationships identical", () => {
    for (const mode of MODE_ORDER) {
      const knobs = realizationToHands(left, right, mode);
      const trajectories = realizationToTrajectories(left, right, mode);

      expect(buildTrajectoryIncrements(trajectories.left)).toEqual(
        buildIncrements(knobs.left, "drex")
      );
      expect(buildTrajectoryIncrements(trajectories.right)).toEqual(
        buildIncrements(knobs.right, "drex")
      );
      expect(
        norm(
          trajectoryHandIndexAt(trajectories.right, 0) -
            trajectoryHandIndexAt(trajectories.left, 0)
        )
      ).toBe(mode[0] === "T" ? 8 : mode[0] === "Q" ? 2 : 4);
    }
  });
});

describe("the new knobs collapse to the published model", () => {
  it("leaves every guide move's table byte-identical", () => {
    for (const move of GUIDE_MOVES) {
      if (move.pendulum) continue;
      const published = buildIncrements(move.knobs, "charlie");
      const explicit = buildIncrements(
        { ...move.knobs, handPhase: 0, handDirection: 1 },
        "charlie"
      );
      expect(explicit, move.title).toEqual(published);
    }
  });

  it("draws flowers at the radius the guide draws them at", () => {
    const flowers = GUIDE_MOVES.filter((m) => m.title.includes("petal"));
    expect(flowers.length).toBeGreaterThan(0);
    for (const move of flowers) {
      expect(move.knobs.radius, move.title).toBe(FLOWER_RADIUS);
    }
  });
});

describe("degenerate cells", () => {
  it("flags the 0-turn antispin flower as the line it actually is", () => {
    /* At hand radius = prop length a 1:1 antispin has no petal width. TKA
		   calls it a 2-petal flower by the counting rule; the geometry says
		   line. Both are right — this records that the matrix contains cells
		   whose drawn shape is degenerate, so the stage is never asked to
		   explain a "flower" that renders flat. */
    const f: Flower = {
      style: "anti",
      turns: 0,
      ori: "out",
      grid: "diamond",
      petals: 2,
    };
    const knobs = flowerToKnobs(f);
    expect(knobs.downbeats).toBe(1);
    expect(knobs.radius).toBe(1);
    expect(flowerPetals(f)).toBe(2);
  });
});
