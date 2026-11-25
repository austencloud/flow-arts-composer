import { describe, expect, it } from "vitest";
import {
  MODE_ORDER,
  type VtgMode,
  readHandRelations,
  relateHands,
  startSoloHand,
  createSwingClock,
  flowerToKnobs,
  flowerToTrajectory,
  createExtendulumTrajectory,
  createPendulumTrajectory,
  isGravityBound,
  traceTrajectory,
  trajectoryFromKnobs,
  trajectoryHandIndexAt,
  trajectoryPosesAt,
  type QftTrajectory,
} from "@tka/shape-domain";
import { QFT_FLOWERS } from "../../src/lib/shared/notation/qft/qft-app-selection";
import { tracePath } from "../../src/lib/shared/notation/qft/qft-model";
import { QFT_PRESETS } from "../../src/lib/shared/notation/qft/qft-presets";

const inspin = trajectoryFromKnobs({ radius: 1, downbeats: 1, spin: "inspin" });
const antispin = trajectoryFromKnobs({
  radius: 1,
  downbeats: 3,
  spin: "antispin",
});
const extendulum = createExtendulumTrajectory(1);
const pendulum = createPendulumTrajectory(0.5);

const unique = (modes: Array<VtgMode | null>) => [...new Set(modes)];

describe("QfT hand timing and direction", () => {
  // Same-direction hands: how far apart. Opposite: where the two hands meet.
  it("draws each mode where its name says the hands are", () => {
    const at = (hand: QftTrajectory, cursor: number) => {
      const { x, y } = trajectoryPosesAt(hand, cursor).hand;
      return [Math.round(x * 1000) / 1000 + 0, Math.round(y * 1000) / 1000 + 0];
    };
    const pair = (mode: VtgMode, start = 0) =>
      relateHands(inspin, antispin, mode, start)!;

    for (let cursor = 0; cursor < 8; cursor += 0.5) {
      const ts = pair("TS", 3);
      expect(at(ts.right, cursor)).toEqual(at(ts.left, cursor));

      const ss = pair("SS", 3);
      const [x, y] = at(ss.left, cursor);
      const [sx, sy] = at(ss.right, cursor);
      expect([sx! + x!, sy! + y!]).toEqual([0, 0]);

      // Together opposite: level with each other all the way, mirrored.
      const to = pair("TO", 3);
      const [tx, ty] = at(to.left, cursor);
      const [mx, my] = at(to.right, cursor);
      expect([mx! + tx!, my! - ty!]).toEqual([0, 0]);

      // Split opposite: one up while the other is down.
      const so = pair("SO", 3);
      const [ox, oy] = at(so.left, cursor);
      const [px, py] = at(so.right, cursor);
      expect([px! - ox!, py! + oy!]).toEqual([0, 0]);
    }
  });

  it("holds a chosen mode all the way round when both hands circle", () => {
    for (const left of [inspin, antispin, extendulum]) {
      for (const right of [inspin, antispin, extendulum]) {
        for (const mode of MODE_ORDER) {
          for (let start = 0; start < 8; start += 1) {
            const hands = relateHands(left, right, mode, start)!;
            expect(hands, `${mode} from ${start}`).not.toBeNull();
            expect(
              unique(readHandRelations(hands.left, hands.right)),
              `${mode} from ${start}`
            ).toEqual([mode]);
          }
        }
      }
    }
  });

  it("reports every mode a pendulum passes through against a circle", () => {
    const hands = relateHands(inspin, pendulum, "TS", 2)!;
    expect(readHandRelations(hands.left, hands.right)).toEqual([
      "TS",
      "TS",
      "TS",
      "TS",
      "SO",
      "SO",
      "SO",
      "SO",
    ]);
  });

  it("starts in the mode it was given, whatever happens after", () => {
    for (const right of [pendulum, extendulum]) {
      for (const mode of MODE_ORDER) {
        for (let start = 0; start < 8; start += 1) {
          const hands = relateHands(inspin, right, mode, start);
          if (!hands) continue;
          expect(readHandRelations(hands.left, hands.right)[0]).toBe(mode);
        }
      }
    }
  });

  it("says nothing about a hand that stands still", () => {
    const still = { ...inspin, radius: 0 };
    expect(unique(readHandRelations(still, antispin))).toEqual([null]);
  });
});

/** The points a drawing passes through, wherever on it the trace begins. */
const drawing = (points: Array<{ x: number; y: number }>) =>
  [
    ...new Set(
      points.map(({ x, y }) => `${(x + 9).toFixed(3)},${(y + 9).toFixed(3)}`)
    ),
  ].sort();

// Austen, 2026-11-23: the 1:3 picked with its flowers at north and south was
// performed with them at east and west. "We must check all of them."
describe("QfT flowers stay where they were picked", () => {
  it.each(
    QFT_FLOWERS.map(
      (flower) => [flower.turns, flower.style, flower.ori, flower] as const
    )
  )("%s turns %s %s", (_turns, _style, _ori, flower) => {
    const picked = drawing(tracePath(flowerToKnobs(flower), 96));
    const hand = flowerToTrajectory(flower);
    for (let start = 0; start < 8; start += 1) {
      const solo = startSoloHand(hand, start)!;
      expect(drawing(traceTrajectory(solo, 96))).toEqual(picked);
      expect(((trajectoryHandIndexAt(solo, 0) % 8) + 8) % 8).toBe(start);
      for (const mode of MODE_ORDER) {
        const pair = relateHands(antispin, hand, mode, start)!;
        expect(
          drawing(traceTrajectory(pair.right, 96)),
          `${mode} from ${start}`
        ).toEqual(picked);
      }
    }
  });

  it("holds for every named move whose hand goes round", () => {
    for (const { id, trajectory } of QFT_PRESETS) {
      if (isGravityBound(trajectory)) continue;
      const picked = drawing(traceTrajectory(trajectory, 96));
      for (let start = 0; start < 8; start += 1) {
        for (const mode of MODE_ORDER) {
          const pair = relateHands(antispin, trajectory, mode, start)!;
          expect(
            drawing(traceTrajectory(pair.right, 96)),
            `${id} ${mode} from ${start}`
          ).toEqual(picked);
        }
      }
    }
  });
});

describe("QfT swing clock", () => {
  it("leaves a move that never turns on even steps", () => {
    const clock = createSwingClock(antispin);
    for (let time = 0; time < 8; time += 0.3) expect(clock(time)).toBe(time);
  });

  it("keeps both turns, and the loop, on their notated steps", () => {
    for (const { trajectory } of QFT_PRESETS) {
      const clock = createSwingClock(trajectory);
      for (const time of [0, 4, 8, 12])
        expect(clock(time)).toBeCloseTo(time, 9);
    }
  });

  it("only ever runs forward", () => {
    const clock = createSwingClock(pendulum);
    for (let time = 0; time < 16; time += 0.01) {
      expect(clock(time + 0.01)).toBeGreaterThan(clock(time));
    }
  });

  // Austen, 2026-11-22: slows "to reach the extension part", then "speed up on
  // the way down".
  it("is slow at a pendulum's turns and fastest at the bottom", () => {
    const clock = createSwingClock(pendulum);
    const speed = (time: number) =>
      (clock(time + 0.01) - clock(time - 0.01)) / 0.02;
    expect(clock(2)).toBeCloseTo(2, 2);
    expect(speed(2)).toBeGreaterThan(1.15);
    expect(speed(0.2)).toBeLessThan(0.6);
    expect(speed(3.8)).toBeLessThan(0.6);
  });

  it("leaves an extendulum's level pass across the middle alone", () => {
    const clock = createSwingClock(extendulum);
    for (let time = 4; time <= 8; time += 0.25) {
      expect(clock(time)).toBeCloseTo(time, 9);
    }
    expect(Math.abs(clock(1) - 1)).toBeGreaterThan(0.02);
  });
});
