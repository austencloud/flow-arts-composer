import { describe, expect, it } from "vitest";
import {
  QFT_FLOWERS,
  resolveSessionHand,
} from "../../src/lib/shared/notation/qft/qft-app-selection";
import {
  flowerToTrajectory,
  startSoloHand,
  createRoundClock,
  NOTATION_ROUND_SECONDS,
  realPace,
  slowestRoundSeconds,
  createStringClock,
  slowestStringSwing,
  stringSwingFor,
  createExtendulumTrajectory,
  createPendulumTrajectory,
  trajectoryFromKnobs,
  trajectoryPosesAt,
  type QftTrajectory,
} from "@tka/shape-domain";
import { QFT_PRESETS } from "../../src/lib/shared/notation/qft/qft-presets";

const G = 9.81;
const L = 0.6;

const inspin = (radius: number, downbeats = 1, phase = 0) =>
  trajectoryFromKnobs({ radius, downbeats, spin: "inspin", phase });
const antispin = (radius: number, downbeats: number) =>
  trajectoryFromKnobs({ radius, downbeats, spin: "antispin" });

/**
 * The force a string must give at each sample, per kilogram, measured straight
 * off the drawn path: the head's acceleration by finite difference, less
 * gravity. Screen y grows downward, so gravity is +y.
 */
function stringForces(trajectory: QftTrajectory, speeds: number[]) {
  const dx = 8 / speeds.length;
  const at = (index: number) => (index + speeds.length) % speeds.length;
  const head = (cursor: number) => trajectoryPosesAt(trajectory, cursor).head;
  /* Velocity half a sample on, from the two heads either side of it. */
  const velocity = (index: number, axis: "x" | "y") =>
    ((head((index + 1) * dx)[axis] - head(index * dx)[axis]) / dx) *
    ((speeds[at(index)]! + speeds[at(index + 1)]!) / 2);
  return speeds.map((speed, index) => {
    const bend = (axis: "x" | "y") =>
      ((velocity(index, axis) - velocity(index - 1, axis)) / dx) * speed * L;
    const pose = trajectoryPosesAt(trajectory, index * dx);
    const x = pose.hand.x - pose.head.x;
    const y = pose.hand.y - pose.head.y;
    const size = Math.hypot(x, y);
    const [ax, ay] = [bend("x"), bend("y") - G];
    return {
      along: (ax * x + ay * y) / size,
      across: (ax * y - ay * x) / size,
    };
  });
}

describe("QfT real pace", () => {
  it("is the textbook ball on a string", () => {
    // v^2 = g L at the top, 5 g L at the bottom: one round is
    // (4 / sqrt 5) K(sqrt 0.8) = 4.0379 times sqrt(L / g).
    const still = slowestStringSwing(inspin(0), L)!;
    expect(still.seconds / Math.sqrt(L / G)).toBeCloseTo(4.0379, 3);
    const headSpeeds = still.speeds.map((speed) => (speed * Math.PI * L) / 4);
    expect(Math.min(...headSpeeds) ** 2).toBeCloseTo(G * L, 3);
    expect(Math.max(...headSpeeds) ** 2).toBeCloseTo(5 * G * L, 3);
    // An extension's head circles at twice the string.
    expect(slowestRoundSeconds(inspin(1), L)).toBeCloseTo(
      Math.SQRT2 * still.seconds,
      6
    );
  });

  // Austen, 2026-11-23: flowers "eventually started playing slower than they
  // would in reality". They spun about once in 1.5 s; a real 60 cm poi cannot.
  it("spins every flower about once a second", () => {
    let spun = 0;
    for (const flower of QFT_FLOWERS) {
      const hand = flowerToTrajectory(flower);
      if (Math.abs(hand.propRate[0]) < 2) continue;
      const turn = slowestRoundSeconds(hand, L)! / Math.abs(hand.propRate[0]);
      expect(turn).toBeGreaterThan(0.6);
      expect(turn).toBeLessThan(1);
      spun += 1;
    }
    expect(spun).toBe(8);
  });

  it("is a real pendulum's period, level to level", () => {
    // 4 K(sin 45 degrees) = 7.4163: the exact large-swing period over sqrt(l/g).
    for (const radius of [0.05, 0.1, 0.5, 1, 1.5]) {
      const exact = 7.4163 * Math.sqrt((L * (1 + radius)) / G);
      expect(
        slowestRoundSeconds(createPendulumTrajectory(radius), L)! / exact
      ).toBeCloseTo(1, 3);
    }
  });

  it("gives an extendulum the same fall through the bottom", () => {
    expect(slowestRoundSeconds(createExtendulumTrajectory(1), L)).toBeCloseTo(
      slowestRoundSeconds(createPendulumTrajectory(1), L)!,
      6
    );
  });

  it("scales with the square root of the poi's length", () => {
    for (const hand of [
      inspin(0),
      antispin(1, 3),
      createPendulumTrajectory(0.1),
    ]) {
      expect(
        slowestRoundSeconds(hand, 4 * L)! / slowestRoundSeconds(hand, L)!
      ).toBeCloseTo(2, 9);
    }
  });

  it("needs only a string that is just tight, measured on the drawing", () => {
    const hands = [
      ...QFT_FLOWERS.map((flower) => flowerToTrajectory(flower)),
      ...QFT_FLOWERS.map((flower) => flowerToTrajectory(flower, 0.6)),
      ...QFT_PRESETS.filter(
        ({ id }) => id !== "pendulum" && id !== "extendulum"
      ).map(({ trajectory }) => trajectory),
    ];
    let measured = 0;
    for (const hand of hands) {
      const swing = slowestStringSwing(hand, L);
      if (!swing) continue;
      measured += 1;
      const forces = stringForces(hand, swing.speeds);
      const pulls = forces.map(({ along }) => along);
      expect(Math.min(...pulls)).toBeGreaterThan(-0.06);
      expect(Math.min(...pulls)).toBeLessThan(0.06);
      for (const { across } of forces)
        expect(Math.abs(across)).toBeLessThan(0.1);
    }
    expect(measured).toBeGreaterThan(20);
  });

  // Two of his poi rules, and nothing else on the axis, come out of it.
  it("refuses only the 1:1 flowers his rules refuse, at radius 1", () => {
    const refused = QFT_FLOWERS.filter(
      (flower) => slowestRoundSeconds(flowerToTrajectory(flower), L) === null
    ).map(({ turns, style, ori }) => `${style} ${turns} ${ori}`);
    expect(refused).toEqual(["pro 0 in", "anti 0 in", "anti 0 out"]);
  });

  it("does not depend on where the hand starts", () => {
    for (const { trajectory } of QFT_PRESETS) {
      const pace = slowestRoundSeconds(trajectory, L)!;
      for (let start = 0; start < 8; start += 1) {
        const begun = startSoloHand(trajectory, start);
        if (begun) expect(slowestRoundSeconds(begun, L)).toBeCloseTo(pace, 6);
      }
    }
  });

  it("plays a pair at the speed of the hand that must go faster", () => {
    const pace = realPace(
      { left: antispin(1, 3), right: createPendulumTrajectory(0.1) },
      L
    );
    expect(pace.setBy).toBe("right");
    expect(pace.seconds).toBe(
      slowestRoundSeconds(createPendulumTrajectory(0.1), L)
    );
    expect(pace.slack).toEqual([]);
  });

  it("keeps the notation's pace when no speed works", () => {
    const never = resolveSessionHand({
      source: {
        kind: "flower",
        index: QFT_FLOWERS.findIndex(
          ({ style, turns }) => style === "anti" && turns === 0
        ),
      },
      radius: 1,
    });
    expect(realPace({ left: never }, L)).toEqual({
      seconds: NOTATION_ROUND_SECONDS,
      setBy: null,
      slack: ["left"],
    });
  });
});

describe("QfT flower swing", () => {
  it("slows over the top and speeds up through the bottom", () => {
    const clock = createRoundClock(inspin(0), 1, L);
    const speedAt = (cursor: number) => {
      // Find the moment the clock reaches this place, then its rate there.
      let low = 0;
      let high = 8;
      for (let round = 0; round < 40; round += 1) {
        const middle = (low + high) / 2;
        if (clock(middle) < cursor) low = middle;
        else high = middle;
      }
      return (clock(low + 0.02) - clock(low - 0.02)) / 0.04;
    };
    // 0 is the top and 4 the bottom; a still poi's speeds are root 5 apart.
    expect(speedAt(4) / speedAt(8 - 0.03)).toBeCloseTo(Math.sqrt(5), 1);
  });

  it("starts every round where the notation does, and only goes forward", () => {
    for (const flower of QFT_FLOWERS) {
      for (const seconds of [0.5, 1.5, 3, 9]) {
        const clock = createRoundClock(flowerToTrajectory(flower), seconds, L);
        expect(clock(0)).toBeCloseTo(0, 9);
        expect(clock(8)).toBeCloseTo(8, 9);
        let last = 0;
        for (let time = 0.05; time < 16; time += 0.05) {
          expect(clock(time)).toBeGreaterThan(last);
          last = clock(time);
        }
      }
    }
  });

  it("goes round in the time asked, on a string that stays tight", () => {
    for (const flower of QFT_FLOWERS) {
      const hand = flowerToTrajectory(flower);
      const slowest = slowestStringSwing(hand, L);
      if (!slowest) continue;
      const swing = stringSwingFor(hand, slowest.seconds * 0.6, L)!;
      expect(swing.seconds / slowest.seconds).toBeCloseTo(0.6, 6);
      const forces = stringForces(hand, swing.speeds);
      for (const { along, across } of forces) {
        expect(along).toBeGreaterThan(0);
        expect(Math.abs(across)).toBeLessThan(0.2);
      }
      // Slow motion keeps the slowest swing's own shape.
      expect(stringSwingFor(hand, slowest.seconds * 4, L)).toEqual(slowest);
    }
  });

  it("gets more even the faster it goes", () => {
    const uneven = (seconds: number) => {
      const { speeds } = stringSwingFor(inspin(0), seconds, L)!;
      return Math.max(...speeds) / Math.min(...speeds);
    };
    expect(uneven(1)).toBeCloseTo(Math.sqrt(5), 2);
    expect(uneven(0.7)).toBeLessThan(1.5);
    expect(uneven(0.2)).toBeLessThan(1.05);
  });

  it("reads a swing's time back off its clock", () => {
    const swing = slowestStringSwing(flowerToTrajectory(QFT_FLOWERS[4]!), L)!;
    const clock = createStringClock(swing);
    for (const time of [0.7, 2, 3.3, 5.1, 7.6]) {
      const rate = ((clock(time + 0.01) - clock(time - 0.01)) / 0.02) * 8;
      const sample = Math.round((clock(time) / 8) * swing.speeds.length);
      expect(rate / swing.seconds / swing.speeds[sample]!).toBeCloseTo(1, 1);
    }
  });
});
