import { describe, expect, it } from "vitest";
import {
  createBeatClock,
  fitTapsToGrid,
} from "$lib/shared/media-composition/domain/tap-fit";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

interface SimulatedTake {
  taps: number[];
  /** Landing time of each position 0..N·passes, no latency. */
  truth: number[];
  secondsPerBeat: number;
}

function simulateTake(options: {
  random: () => number;
  moveBeats: number[];
  trueBpm: number;
  originSeconds: number;
  passes: number;
  jitter: number;
  miss: number;
  extra: number;
  latency: number;
}): SimulatedTake {
  const { random } = options;
  const gauss = () =>
    Math.sqrt(-2 * Math.log(random() + 1e-12)) *
    Math.cos(2 * Math.PI * random());
  const clock = createBeatClock(options.moveBeats);
  const secondsPerBeat = 60 / options.trueBpm;
  const taps: number[] = [];
  const truth: number[] = [];
  const lastPosition = options.moveBeats.length * options.passes;
  for (let position = 0; position <= lastPosition; position += 1) {
    const landing =
      options.originSeconds + secondsPerBeat * clock.beatsBefore(position);
    truth.push(landing);
    // Nobody taps the opening pose, and the first landing is always tapped
    // so the test controls which position the earliest tap marks.
    if (position === 0) continue;
    if (position > 1 && random() < options.miss) continue;
    taps.push(landing + options.latency + options.jitter * gauss());
    if (position > 1 && random() < options.extra) {
      taps.push(landing + secondsPerBeat * (0.3 + 0.4 * random()));
    }
  }
  return { taps, truth, secondsPerBeat };
}

/** Largest landing error after removing the constant tap latency. */
function worstSpread(
  take: SimulatedTake,
  fit: { originSeconds: number; secondsPerBeat: number },
  moveBeats: number[]
): number {
  const clock = createBeatClock(moveBeats);
  const errors = take.truth.map(
    (landing, position) =>
      fit.originSeconds +
      fit.secondsPerBeat * clock.beatsBefore(position) -
      landing
  );
  const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  return Math.max(...errors.map((error) => Math.abs(error - mean)));
}

describe("createBeatClock", () => {
  it("spaces landings by each move's beats and continues across passes", () => {
    const clock = createBeatClock([1, 2, 1]);
    expect([0, 1, 2, 3, 4, 5, 6].map(clock.beatsBefore)).toEqual([
      0, 1, 3, 4, 5, 7, 8,
    ]);
    expect(clock.nearestPosition(2.9)).toBe(2);
    expect(clock.nearestPosition(6.6)).toBe(5);
    expect(clock.nearestPosition(-3)).toBe(0);
    expect(clock.moveBeatsAt(2)).toBe(2);
    expect(clock.moveBeatsAt(5)).toBe(2);
  });
});

describe("fitTapsToGrid", () => {
  const eightMoves = [1, 1, 1, 1, 1, 1, 1, 1];
  const SECONDS_PER_BEAT = 60 / 87;

  it("recovers an exact grid from clean taps", () => {
    const secondsPerBeat = 60 / 87;
    const taps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
      (position) => 3.2 + secondsPerBeat * position
    );
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(fit.originSeconds).toBeCloseTo(3.2, 2);
    expect(fit.labels.map((label) => label.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(fit.worstMissSeconds).toBeLessThan(0.005);
    expect(fit.missedPositions).toEqual([]);
    expect(fit.extraCount).toBe(0);
    expect(fit.octaveHint).toBeNull();
  });

  it("fills missed landings and ignores extra taps", () => {
    const secondsPerBeat = 60 / 87;
    const landing = (position: number) => 2 + secondsPerBeat * position;
    const taps = [
      landing(1),
      landing(2),
      // 3 and 4 missed
      landing(5),
      landing(5) + 0.3, // a stray double tap
      landing(6) + 0.02,
      landing(7) - 0.03,
      landing(8),
    ];
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(fit.missedPositions).toEqual([3, 4]);
    expect(fit.extraCount).toBe(1);
    expect(fit.labels.find((label) => label.position === null)?.seconds).toBe(
      landing(5) + 0.3
    );
    expect(fit.originSeconds).toBeCloseTo(2, 1);
  });

  it("labels the earliest tap with the chosen first position", () => {
    const secondsPerBeat = 60 / 87;
    const taps = [3, 4, 5, 6, 7].map(
      (position) => 1 + secondsPerBeat * position
    );
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 3,
      tempo: "locked",
    });
    expect(fit.labels[0]!.position).toBe(3);
    expect(fit.originSeconds).toBeCloseTo(1, 2);
  });

  it("respects multi-beat moves", () => {
    const moveBeats = [1, 1, 2, 1];
    const clock = createBeatClock(moveBeats);
    const secondsPerBeat = 60 / 87;
    const taps = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (position) => 0.5 + secondsPerBeat * clock.beatsBefore(position)
    );
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats,
      firstTapPosition: 1,
      tempo: "follow",
    });
    expect(fit.labels.map((label) => label.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(fit.bpm).toBeCloseTo(87, 0);
  });

  it("warns when every other landing is tapped (typed tempo is double)", () => {
    const secondsPerBeat = 60 / 87;
    const taps = [1, 3, 5, 7, 9, 11, 13].map(
      (position) => 1 + secondsPerBeat * position
    );
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(fit.octaveHint).toBe("half");
  });

  it("finds the phase across a seeded sweep of rough takes", () => {
    const random = seededRandom(7);
    const scenarios = [
      { trueBpm: 87, miss: 0.15, extra: 0.05, tempo: "locked" as const },
      { trueBpm: 86.2, miss: 0.15, extra: 0.05, tempo: "follow" as const },
      { trueBpm: 84.5, miss: 0.25, extra: 0.1, tempo: "follow" as const },
      { trueBpm: 90, miss: 0.25, extra: 0.1, tempo: "follow" as const },
      { trueBpm: 87, miss: 0.4, extra: 0.2, tempo: "follow" as const },
    ];
    const moveBeats = [1, 1, 2, 1, 1, 1, 1, 1];
    for (const scenario of scenarios) {
      let failures = 0;
      for (let trial = 0; trial < 40; trial += 1) {
        const take = simulateTake({
          random,
          moveBeats,
          trueBpm: scenario.trueBpm,
          originSeconds: 1 + 5 * random(),
          passes: 4,
          jitter: 0.05,
          miss: scenario.miss,
          extra: scenario.extra,
          latency: 0.06,
        });
        const fit = fitTapsToGrid({
          taps: take.taps,
          bpm: 87,
          moveBeats,
          firstTapPosition: 1,
          tempo: scenario.tempo,
        });
        if (worstSpread(take, fit, moveBeats) > 0.25 * take.secondsPerBeat) {
          failures += 1;
        }
      }
      expect({ scenario, failures }).toEqual({ scenario, failures: 0 });
    }
  });

  it("sets aside a stray tap made well before the performer starts", () => {
    const landing = (position: number) => 3 + SECONDS_PER_BEAT * position;
    const real = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(landing);
    // Nearly on the grid, four landings ahead of the first real tap.
    const stray = landing(-3) + 0.03;
    const fit = fitTapsToGrid({
      taps: [stray, ...real],
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "follow",
    });
    expect(fit.labels[0]!.position).toBeNull();
    expect(fit.labels.slice(1).map((label) => label.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(fit.originSeconds).toBeCloseTo(3, 2);
  });

  it("keeps a first tap that is only a missed landing or two ahead", () => {
    const landing = (position: number) => 3 + SECONDS_PER_BEAT * position;
    const taps = [1, 4, 5, 6, 7, 8].map(landing);
    const fit = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(fit.labels.map((label) => label.position)).toEqual([
      1, 4, 5, 6, 7, 8,
    ]);
    expect(fit.missedPositions).toEqual([2, 3]);
  });

  it("holds the typed tempo with fewer than three taps", () => {
    const fit = fitTapsToGrid({
      taps: [2, 2.75],
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "follow",
    });
    expect(fit.bpm).toBeCloseTo(87, 6);
  });

  it("rejects an empty tap list and a zero BPM", () => {
    expect(() =>
      fitTapsToGrid({
        taps: [],
        bpm: 87,
        moveBeats: eightMoves,
        firstTapPosition: 1,
        tempo: "locked",
      })
    ).toThrow(RangeError);
    expect(() =>
      fitTapsToGrid({
        taps: [1],
        bpm: 0,
        moveBeats: eightMoves,
        firstTapPosition: 1,
        tempo: "locked",
      })
    ).toThrow(RangeError);
  });
});
