import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  computeGrade,
  scoreAnswer,
  speedBonus,
  streakMultiplier,
} from "#lib/features/learn/play/domain/scoring.js";

describe("speedBonus", () => {
  it("full bonus under 1.5s", () => expect(speedBonus(1000)).toBe(50));
  it("half bonus under 3.5s", () => expect(speedBonus(3000)).toBe(25));
  it("no bonus at/after 6s", () => expect(speedBonus(6000)).toBe(0));
});

describe("streakMultiplier", () => {
  it("x1 below 3-streak", () => expect(streakMultiplier(2)).toBe(1));
  it("x1.5 at 3", () => expect(streakMultiplier(3)).toBe(1.5));
  it("x2 at 6", () => expect(streakMultiplier(6)).toBe(2));
  it("caps at x3 for 10+", () => {
    expect(streakMultiplier(10)).toBe(3);
    expect(streakMultiplier(50)).toBe(3);
  });
});

describe("scoreAnswer", () => {
  it("wrong answer = 0 points", () =>
    expect(scoreAnswer({ isCorrect: false, answerTimeMs: 500, streakBefore: 5 })).toBe(0));
  it("right answer = (base + speed) * multiplier, rounded", () =>
    // (100 + 50) * 1.5 = 225 (streakBefore 3 → ×1.5)
    expect(scoreAnswer({ isCorrect: true, answerTimeMs: 1000, streakBefore: 3 })).toBe(225));
  it("slow right answer = base only at x1", () =>
    expect(scoreAnswer({ isCorrect: true, answerTimeMs: 9000, streakBefore: 0 })).toBe(BASE_POINTS));
  it("can disable the speed bonus without disabling streak scoring", () =>
    expect(
      scoreAnswer({
        isCorrect: true,
        answerTimeMs: 100,
        streakBefore: 3,
        rewardsSpeed: false,
      })
    ).toBe(150));
});

describe("computeGrade", () => {
  it("S needs >=95% accuracy", () => {
    expect(computeGrade(0.95)).toBe("S");
    expect(computeGrade(0.949)).toBe("A");
  });
  it("boundaries A/B/C/D", () => {
    expect(computeGrade(0.85)).toBe("A");
    expect(computeGrade(0.7)).toBe("B");
    expect(computeGrade(0.5)).toBe("C");
    expect(computeGrade(0.49)).toBe("D");
    expect(computeGrade(0)).toBe("D");
  });
});
