import { describe, expect, it } from "vitest";
import {
  computeStars,
  mergeProgress,
  applyResult,
} from "#lib/features/learn/play/domain/progression.js";
import type {
  GameProgress,
  PlayProgress,
} from "#lib/features/learn/play/domain/arcade-types.js";

const stars = { one: 500, two: 1000, three: 1500 };

describe("computeStars", () => {
  it("0 below one-star threshold", () =>
    expect(computeStars(499, stars)).toBe(0));
  it("thresholds inclusive", () => {
    expect(computeStars(500, stars)).toBe(1);
    expect(computeStars(1000, stars)).toBe(2);
    expect(computeStars(1500, stars)).toBe(3);
  });
});

describe("applyResult", () => {
  const base: GameProgress = {
    bestScore: 800,
    bestGrade: "B",
    starsByChallenge: { "1": 2 },
    challengesUnlocked: 2,
    totalPlays: 3,
  };
  it("keeps best score/stars when result is worse", () => {
    const next = applyResult(base, {
      challengeNumber: 1,
      score: 400,
      starsEarned: 1,
      grade: "C",
    });
    expect(next.bestScore).toBe(800);
    expect(next.starsByChallenge["1"]).toBe(2);
    expect(next.totalPlays).toBe(4);
  });
  it("upgrades best + stars + unlocks next challenge on >=1 star", () => {
    const next = applyResult(base, {
      challengeNumber: 2,
      score: 1200,
      starsEarned: 2,
      grade: "A",
    });
    expect(next.bestScore).toBe(1200);
    expect(next.starsByChallenge["2"]).toBe(2);
    expect(next.challengesUnlocked).toBe(3);
  });
  it("no unlock on 0 stars", () => {
    const next = applyResult(base, {
      challengeNumber: 2,
      score: 100,
      starsEarned: 0,
      grade: "D",
    });
    expect(next.challengesUnlocked).toBe(2);
  });
});

describe("mergeProgress", () => {
  it("newer lastUpdated wins per the concept-progress convention", () => {
    const local: PlayProgress = {
      games: {
        "speed-blitz": {
          bestScore: 10,
          bestGrade: "D",
          starsByChallenge: {},
          challengesUnlocked: 1,
          totalPlays: 1,
        },
      },
      lastUpdated: "2026-07-12T10:00:00Z",
    };
    const remote: PlayProgress = {
      games: {
        "speed-blitz": {
          bestScore: 99,
          bestGrade: "A",
          starsByChallenge: {},
          challengesUnlocked: 2,
          totalPlays: 5,
        },
      },
      lastUpdated: "2026-07-12T11:00:00Z",
    };
    expect(mergeProgress(local, remote)).toBe(remote);
    expect(mergeProgress(remote, local)).toBe(remote);
  });
});
