import { describe, it, expect } from "vitest";
import {
  PULSE_FULL_ENERGY_TRAVEL,
  PulseBeatClock,
  PulseTipMotion,
  pulseAccentThreshold,
  pulseCharge,
  pulseRingLife,
} from "./pulse-rhythm";

const FRAME = 1 / 60;

/** Play whole steps that change every `secondsPerStep`; returns ring beats seen. */
function playWholeSteps(
  clock: PulseBeatClock,
  secondsPerStep: number,
  seconds: number,
  beatInterval = 1
): number {
  let beats = 0;
  for (let t = 0; t < seconds; t += FRAME) {
    if (clock.advance(Math.floor(t / secondsPerStep), FRAME, beatInterval)) beats++;
  }
  return beats;
}

describe("PulseBeatClock", () => {
  it("measures the beat length from whole-step changes", () => {
    const clock = new PulseBeatClock();
    playWholeSteps(clock, 0.5, 4);
    expect(clock.beatSeconds).toBeCloseTo(0.5, 1);
  });

  it("measures the beat length from a fractional step and reports exact phase", () => {
    const clock = new PulseBeatClock();
    let step = 0;
    for (let t = 0; t < 3; t += FRAME) {
      step += FRAME / 0.8;
      clock.advance(step, FRAME, 1);
    }
    expect(clock.beatSeconds).toBeCloseTo(0.8, 1);
    expect(clock.phase).toBeCloseTo(step - Math.floor(step), 5);
  });

  it("starts a ring beat on the first frame, then once per beat interval", () => {
    const clock = new PulseBeatClock();
    expect(clock.advance(0, FRAME, 2)).toBe(true);
    expect(clock.advance(0, FRAME, 2)).toBe(false);
    expect(clock.advance(1, FRAME, 2)).toBe(false);
    expect(clock.advance(2, FRAME, 2)).toBe(true);
  });

  it("lets the phase run past 1 while the next beat is late", () => {
    const clock = new PulseBeatClock();
    playWholeSteps(clock, 0.5, 2);
    for (let t = 0; t < 1; t += FRAME) clock.advance(3, FRAME, 1);
    expect(clock.phase).toBeGreaterThan(1.5);
  });
});

describe("PulseTipMotion", () => {
  it("gives the same energy at every playback speed", () => {
    const full = new PulseTipMotion();
    const half = new PulseTipMotion();
    for (let i = 0; i < 60; i++) {
      full.feed(400, 0, 0, FRAME, 0.5);
      half.feed(200, 0, 0, FRAME, 1);
    }
    expect(full.energy).toBeCloseTo(half.energy, 5);
    expect(full.energy).toBeCloseTo((400 * 0.5) / PULSE_FULL_ENERGY_TRAVEL, 2);
  });

  it("accents once per swing, not on every fast frame", () => {
    const motion = new PulseTipMotion();
    const threshold = pulseAccentThreshold(0.3);
    let accents = 0;
    let clock = 0;
    // A pendulum swing, 1 s period: two speed peaks per period.
    for (let i = 0; i < 180; i++) {
      clock += FRAME;
      const vx = 80 * 2 * Math.PI * Math.cos(2 * Math.PI * clock);
      motion.feed(vx, 0, 0, FRAME, 1);
      if (motion.accent(threshold, clock, 1)) accents++;
    }
    expect(accents).toBeGreaterThanOrEqual(5);
    expect(accents).toBeLessThanOrEqual(6);
  });

  it("stays quiet below the threshold", () => {
    const motion = new PulseTipMotion();
    const threshold = pulseAccentThreshold(1);
    let accents = 0;
    let clock = 0;
    for (let i = 0; i < 180; i++) {
      clock += FRAME;
      motion.feed(80 * Math.cos(2 * Math.PI * clock), 0, 0, FRAME, 1);
      if (motion.accent(threshold, clock, 1)) accents++;
    }
    expect(accents).toBe(0);
  });

  it("keeps a steady spin accenting about every three quarters of a beat", () => {
    const motion = new PulseTipMotion();
    let accents = 0;
    let clock = 0;
    for (let i = 0; i < 180; i++) {
      clock += FRAME;
      motion.feed(600, 0, 0, FRAME, 1);
      if (motion.accent(pulseAccentThreshold(0.3), clock, 1)) accents++;
    }
    expect(accents).toBeGreaterThanOrEqual(3);
    expect(accents).toBeLessThanOrEqual(4);
  });

  it("owes more continuous rings per beat the faster the tip moves", () => {
    const count = (speed: number) => {
      const motion = new PulseTipMotion();
      let rings = 0;
      for (let i = 0; i < 120; i++) {
        motion.feed(speed, 0, 0, FRAME, 1);
        rings += motion.continuous(FRAME, 1);
      }
      return rings / 2;
    };
    expect(count(0)).toBeGreaterThanOrEqual(0.5);
    expect(count(0)).toBeLessThanOrEqual(1);
    expect(count(2000)).toBeGreaterThanOrEqual(3);
  });
});

describe("Pulse timing helpers", () => {
  it("counts ring lifetime in beats", () => {
    expect(pulseRingLife(1.2, 0.5)).toBeCloseTo(0.6);
    expect(pulseRingLife(1.2, 1)).toBeCloseTo(1.2);
    expect(pulseRingLife(3, 4)).toBe(6);
    expect(pulseRingLife(1.2, 1, 0.4)).toBeLessThan(pulseRingLife(1.2, 1));
  });

  it("builds a charge into the beat and drops it once the beat is overdue", () => {
    expect(pulseCharge(0.3).strength).toBe(0);
    expect(pulseCharge(0.9).strength).toBeGreaterThan(0.5);
    expect(pulseCharge(1).shape).toBe(1);
    expect(pulseCharge(1.4).strength).toBe(0);
  });
});
