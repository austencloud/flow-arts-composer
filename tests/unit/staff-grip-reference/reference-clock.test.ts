import { describe, expect, it } from "vitest";

import {
  createTakeTiming,
  resolveTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

import {
  LANDED_PHASE_MARGIN,
  adjacentLandingSeconds,
  followerVideoSeconds,
  labPhaseAtVideoSeconds,
} from "../../../src/routes/test/staff-grip/reference/reference-clock";

const MOVE_BEATS = [1, 1, 1, 1];

function resolved() {
  const timing = createTakeTiming({
    sequenceId: "seq-test",
    takeKey: "local:a.mp4:1:1",
    durationSeconds: 30,
    bpm: 60,
    now: 1,
  });
  timing.sections[0] = {
    ...timing.sections[0]!,
    tempo: "locked",
    beatOneSeconds: 2,
    lastPosition: 8,
  };
  return resolveTakeTiming(timing, MOVE_BEATS);
}

describe("labPhaseAtVideoSeconds", () => {
  it("lands each move on its whole phase, wrapping each pass", () => {
    const timing = resolved();
    const landings = timing.sections[0]!.landings.filter(
      (landing) => landing.position >= 1 && landing.position <= 7,
    );
    expect(landings.length).toBe(7);
    for (const landing of landings) {
      const phase = labPhaseAtVideoSeconds(timing, MOVE_BEATS, landing.seconds);
      expect(phase).toBeCloseTo(
        landing.position % 4 === 0
          ? 4 - LANDED_PHASE_MARGIN
          : landing.position % 4,
        3,
      );
    }
  });

  it("is between two landings while a move is in flight", () => {
    const timing = resolved();
    const [, one, two] = timing.sections[0]!.landings;
    const phase = labPhaseAtVideoSeconds(
      timing,
      MOVE_BEATS,
      (one!.seconds + two!.seconds) / 2,
    )!;
    expect(phase).toBeGreaterThan(one!.position % 4);
    expect(phase).toBeLessThan(two!.position % 4 || 4);
  });

  it("holds the opening before the first move", () => {
    expect(labPhaseAtVideoSeconds(resolved(), MOVE_BEATS, 0)).toBe(0);
  });

  it("holds the last landing after the performance ends", () => {
    expect(labPhaseAtVideoSeconds(resolved(), MOVE_BEATS, 29)).toBeCloseTo(
      4 - LANDED_PHASE_MARGIN,
      6,
    );
  });
});

describe("adjacentLandingSeconds", () => {
  it("steps to the next and previous landing", () => {
    const timing = resolved();
    const seconds = timing.sections[0]!.landings.map(
      (landing) => landing.seconds,
    );
    const middle = (seconds[2]! + seconds[3]!) / 2;
    expect(adjacentLandingSeconds(timing, middle, 1)).toBeCloseTo(
      seconds[3]!,
      6,
    );
    expect(adjacentLandingSeconds(timing, middle, -1)).toBeCloseTo(
      seconds[2]!,
      6,
    );
    expect(adjacentLandingSeconds(timing, seconds[2]!, 1)).toBeCloseTo(
      seconds[3]!,
      6,
    );
  });

  it("returns null past the last landing", () => {
    expect(adjacentLandingSeconds(resolved(), 29.9, 1)).toBeNull();
  });
});

describe("followerVideoSeconds", () => {
  it("shifts a follower by the difference between the claps", () => {
    expect(
      followerVideoSeconds(
        10,
        { clapSeconds: 2, manualOffsetSeconds: 0 },
        { clapSeconds: 3.5, manualOffsetSeconds: 0.1 },
      ),
    ).toBeCloseTo(11.6, 9);
  });

  it("uses only the manual offset when either clap is missing", () => {
    expect(
      followerVideoSeconds(
        10,
        { clapSeconds: null, manualOffsetSeconds: 0 },
        { clapSeconds: 3.5, manualOffsetSeconds: -0.2 },
      ),
    ).toBeCloseTo(9.8, 9);
  });
});
