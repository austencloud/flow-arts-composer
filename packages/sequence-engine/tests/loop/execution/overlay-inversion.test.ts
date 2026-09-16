import { describe, expect, it } from "vitest";
import { executeSymmetricSpec } from "../../../src/loop/execution/spec-executor.js";
import { LOOPComponent, type PropLOOPSpec } from "../../../src/loop/loop-spec.js";
import type { SequenceStep } from "../../../src/core/types/sequence-engine-types.js";

// Minimal 2-step closed-under-mirror seed: startPos + 2 letter steps whose
// motions are pro/anti (so inversion is observable). Build hand-rolled steps
// with the fields the executors touch (motions, positions, stepNumber, letter).
// Copied verbatim from canonical-stage-order.test.ts — tests independently readable.
function step(n: number, letter: string, sp: string, ep: string, left: any, right: any): SequenceStep {
  return { stepNumber: n, letter, startPlacement: sp, endPlacement: ep, motions: { left, right } } as unknown as SequenceStep;
}
const m = (
  motionType: string,
  rotationDirection: string,
  startLocation: string,
  endLocation: string,
  turns = 0,
) => ({
  motionType, rotationDirection, startLocation, endLocation,
  startOrientation: "in", endOrientation: "in", turns, hand: "left",
});

// Deviation from the plan's literal seed: the plan's makeSeed() ends at
// gamma5 (left e, right s), which is NOT a valid halved-rotation pair for
// gamma13 (HALF_PLACEMENT_MAP maps gamma13 -> gamma9, left e / right n —
// see packages/sequence-engine/src/loop/placement-maps/circular-placement-maps.ts).
// canonical-stage-order.test.ts's copy never exercises ROTATED so it never
// hit this gate; this file's tests do (ROTATED period 2), so StrictRotatedExecutor's
// validateSequence throws on the plan's literal seed. Fixing the seed (per plan
// discipline: fix the seed, never weaken assertions) — right now dashes s->n in
// step 2 instead of staying static, landing the sequence on gamma9 (left e, right n),
// the valid halved-rotation partner of gamma13. Left's pro/ccw s->e motion (the
// thing the inversion assertions actually observe) is unchanged from the plan.
function makeSeed(): SequenceStep[] {
  return [
    step(0, "", "gamma13", "gamma13", m("static", "noRotation", "w", "w"), m("static", "noRotation", "s", "s")),
    step(1, "Z", "gamma13", "beta5", m("anti", "cw", "w", "s"), m("static", "noRotation", "s", "s")),
    step(2, "Θ", "beta5", "gamma9", m("pro", "ccw", "s", "e"), m("dash", "noRotation", "s", "n")),
  ];
}

function spec(entries: Array<[LOOPComponent, { period: number; mode?: "expand" | "overlay" }]>): PropLOOPSpec {
  return { components: new Map(entries) };
}

describe("overlay inversion", () => {
  it("applies inversion in place: same positions, motion types flipped on odd blocks", () => {
    const base = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.MIRRORED, { period: 2 }],
    ]));
    const overlaid = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.ROTATED, { period: 2 }],
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 4, mode: "overlay" }],
    ]));

    expect(overlaid).toHaveLength(base.length); // x1 — no expansion
    const blockSize = (base.length - 1) / 4;
    for (let i = 1; i < base.length; i++) {
      // positions identical everywhere
      expect(overlaid[i]!.startPlacement).toBe(base[i]!.startPlacement);
      expect(overlaid[i]!.endPlacement).toBe(base[i]!.endPlacement);
      const odd = Math.floor((i - 1) / blockSize) % 2 === 1;
      const b = base[i]!.motions.left.motionType;
      const o = overlaid[i]!.motions.left.motionType;
      if (!odd || b === "dash" || b === "static") expect(o).toBe(b);
      else expect(o).toBe(b === "pro" ? "anti" : "pro");
    }
  });

  it("keeps the orientation chain continuous after overlay", () => {
    const overlaid = executeSymmetricSpec(makeSeed(), spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 2, mode: "overlay" }],
    ]));
    for (let i = 2; i < overlaid.length; i++) {
      expect(overlaid[i]!.motions.left.startOrientation).toBe(overlaid[i - 1]!.motions.left.endOrientation);
      expect(overlaid[i]!.motions.right.startOrientation).toBe(overlaid[i - 1]!.motions.right.endOrientation);
    }
  });

  it("inverts the swapped source hand's rotating dash", () => {
    const dashSeed = [
      step(
        0,
        "",
        "alpha1",
        "alpha1",
        m("static", "noRotation", "s", "s"),
        m("static", "noRotation", "n", "n"),
      ),
      step(
        1,
        "Φ-",
        "alpha1",
        "alpha5",
        m("dash", "noRotation", "s", "n"),
        m("dash", "cw", "n", "s", 0.5),
      ),
    ];

    const overlaid = executeSymmetricSpec(dashSeed, spec([
      [LOOPComponent.MIRRORED, { period: 2 }],
      [LOOPComponent.SWAPPED, { period: 2 }],
      [LOOPComponent.INVERTED, { period: 2, mode: "overlay" }],
    ]));

    const transformedBlue = overlaid[2]!.motions.left;
    expect(transformedBlue.motionType).toBe("dash");
    expect(transformedBlue.turns).toBe(0.5);
    expect(transformedBlue.rotationDirection).toBe("cw");
  });

  it("throws when letter count is not divisible by the overlay period", () => {
    expect(() =>
      executeSymmetricSpec(makeSeed(), spec([
        [LOOPComponent.MIRRORED, { period: 2 }], // 2 -> 4 steps
        [LOOPComponent.INVERTED, { period: 8, mode: "overlay" }], // 4 % 8 != 0
      ]))
    ).toThrow(/divisible/);
  });
});
