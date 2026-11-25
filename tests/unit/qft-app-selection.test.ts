import { describe, expect, it } from "vitest";
import {
  activeHandsAreValid,
  buildActiveHands,
  QFT_FLOWERS,
  resolveSessionHand,
  validOriginPhases,
  validVtgModes,
} from "../../src/lib/shared/notation/qft/qft-app-selection";
import type { QftSessionHand } from "../../src/lib/shared/notation/qft/qft-session";
import { GUIDE_MOVES } from "../../src/lib/shared/notation/qft/qft-guide";
import {
  buildTrajectoryIncrements,
  createExtendulumTrajectory,
  trajectoryPosesAt,
} from "@tka/shape-domain";

const flower = (index: number, radius = 1): QftSessionHand => ({
  source: { kind: "flower", index },
  radius,
});

const preset = (id: string, radius: number): QftSessionHand => ({
  source: { kind: "preset", id },
  radius,
});

describe("QfT app hand selection", () => {
  it("keeps the twelve-flower axis used by the existing matrix surface", () => {
    expect(QFT_FLOWERS).toHaveLength(12);
  });

  // Austen, 2026-11-23: a pendulum "does not pass across the top".
  it("keeps a pendulum's hand off the top however big its swing", () => {
    for (const radius of [0.05, 0.5, 1, 1.5]) {
      const hand = resolveSessionHand(preset("pendulum", radius));
      for (let cursor = 0; cursor <= 8; cursor += 0.05) {
        expect(trajectoryPosesAt(hand, cursor).hand.y).toBeGreaterThanOrEqual(
          -1e-9
        );
      }
    }
  });

  it("sends an extendulum's hand all the way round", () => {
    const hand = resolveSessionHand(preset("extendulum", 1));
    expect(
      buildTrajectoryIncrements(hand).map((row) => row.handDepart)
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 1]);
  });

  it("never lets a swing's hand stand still", () => {
    expect(resolveSessionHand(preset("pendulum", 0)).radius).toBeGreaterThan(0);
    expect(resolveSessionHand(flower(0, 0)).radius).toBe(0);
  });

  it("keeps Triquetra available as a preset outside the odd-rate flower axis", () => {
    const triquetra = GUIDE_MOVES.find(({ id }) => id === "triquetra")!;
    expect(new Set(triquetra.trajectory.propRate)).toEqual(new Set([-2]));
    expect(
      QFT_FLOWERS.some((candidate) =>
        resolveSessionHand({
          source: { kind: "flower", index: QFT_FLOWERS.indexOf(candidate) },
          radius: 1,
        }).propRate.every((rate) => Math.abs(rate) === 2)
      )
    ).toBe(false);
  });

  it("starts a swing only where its hand goes", () => {
    const extendulum: QftSessionHand = {
      source: { kind: "custom", trajectory: createExtendulumTrajectory(1) },
      radius: 1,
    };

    expect(
      validOriginPhases("one", preset("pendulum", 0.1), flower(0), "TS")
    ).toEqual([2, 3, 4, 5, 6]);
    expect(validOriginPhases("one", extendulum, flower(0), "TS")).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(
      activeHandsAreValid(
        buildActiveHands("one", preset("pendulum", 0.1), flower(0), "TS", 0)
      )
    ).toBe(false);
  });

  // Austen, 2026-11-23: in split time the pendulum swung over the top half.
  it("hangs a swing below its hand in every start it allows", () => {
    for (const swing of [preset("pendulum", 0.5), preset("extendulum", 1)]) {
      for (const [left, right] of [
        [flower(0), swing],
        [swing, swing],
        [swing, flower(6)],
      ] as const) {
        const modes = validVtgModes(left, right);
        expect(modes.length).toBeGreaterThan(0);
        for (const mode of modes) {
          for (const origin of validOriginPhases("two", left, right, mode)) {
            const hands = buildActiveHands("two", left, right, mode, origin)!;
            for (const [source, hand] of [
              [left, hands.left],
              [right, hands.right!],
            ] as const) {
              if (source !== swing) continue;
              for (let cursor = 0; cursor <= 8; cursor += 0.05) {
                const pose = trajectoryPosesAt(hand, cursor);
                /* Screen y grows downward: the head is never above the hand. */
                expect(
                  pose.head.y - pose.hand.y,
                  `${mode} from ${origin} at ${cursor}`
                ).toBeGreaterThanOrEqual(-1e-9);
              }
            }
          }
        }
      }
    }
  });

  it("offers two pendulums only the starts their hands can make", () => {
    const pendulum = preset("pendulum", 0.1);
    // Half a circle apart, one of the two hands would be over the top.
    expect([...validVtgModes(pendulum, pendulum)].sort()).toEqual([
      "QO",
      "QS",
      "TO",
      "TS",
    ]);
  });

  it("gives any two flowers every timing and direction from every start", () => {
    expect(validVtgModes(flower(0), flower(6))).toHaveLength(6);
    for (const mode of validVtgModes(flower(0), flower(6))) {
      expect(validOriginPhases("two", flower(0), flower(6), mode)).toHaveLength(
        8
      );
    }
  });
});
