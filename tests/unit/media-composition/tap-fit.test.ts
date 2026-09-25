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
  /** Seconds before landing 1 of a stray key press, or none. */
  strayLead?: number;
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
  if (options.strayLead !== undefined) {
    taps.unshift(truth[1]! - options.strayLead);
  }
  return { taps, truth, secondsPerBeat };
}

/**
 * Largest landing error once the known tap latency is taken off. Measured
 * against the true landings, so a map a whole move off fails however tidy
 * its spacing.
 */
function worstError(
  take: SimulatedTake,
  fit: { originSeconds: number; secondsPerBeat: number },
  moveBeats: number[],
  latency: number
): number {
  const clock = createBeatClock(moveBeats);
  return Math.max(
    ...take.truth.map((landing, position) =>
      Math.abs(
        fit.originSeconds +
          fit.secondsPerBeat * clock.beatsBefore(position) -
          latency -
          landing
      )
    )
  );
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

  it("finds the nearest landing the same way a full scan would", () => {
    const moveBeats = [1, 1, 2, 1, 3, 1, 1, 2];
    const clock = createBeatClock(moveBeats);
    const scan = (beats: number) => {
      let best = 0;
      for (let position = 1; position <= 200; position += 1) {
        if (
          Math.abs(clock.beatsBefore(position) - beats) <
          Math.abs(clock.beatsBefore(best) - beats)
        ) {
          best = position;
        }
      }
      return best;
    };
    const random = seededRandom(3);
    for (let trial = 0; trial < 500; trial += 1) {
      const beats = random() * 150;
      expect(clock.nearestPosition(beats)).toBe(scan(beats));
    }
    // Halfway between two landings goes to the earlier one.
    expect(clock.nearestPosition(2.5)).toBe(2);
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

  // Without a beat-1 mark, the stray-tap rule wrongly sets aside a real first
  // tap when the next few landings go untapped. That costs a few takes at
  // high miss rates, and each one must be flagged for the UI to ask about.
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
      let flaggedFailures = 0;
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
        if (
          worstError(take, fit, moveBeats, 0.06) >
          0.25 * take.secondsPerBeat
        ) {
          if (fit.ignoredLeadingTaps > 0) flaggedFailures += 1;
          else failures += 1;
        }
      }
      expect({ scenario, failures }).toEqual({ scenario, failures: 0 });
      expect(flaggedFailures).toBeLessThanOrEqual(2);
    }
  });

  it("finds move 1 through a stray early tap once beat 1 is marked", () => {
    const random = seededRandom(11);
    const moveBeats = [1, 1, 2, 1, 1, 1, 1, 1];
    for (const miss of [0.1, 0.4]) {
      let failures = 0;
      for (let trial = 0; trial < 40; trial += 1) {
        const take = simulateTake({
          random,
          moveBeats,
          trueBpm: 86 + 2 * random(),
          originSeconds: 4 + 3 * random(),
          passes: 4,
          jitter: 0.05,
          miss,
          extra: 0.1,
          latency: 0.06,
          strayLead: 0.8 + 3 * random(),
        });
        const fit = fitTapsToGrid({
          taps: take.taps,
          bpm: 87,
          moveBeats,
          firstTapPosition: 1,
          // Marked by eye, up to 0.15 s either side of the landing.
          beatOneSeconds: take.truth[1]! + 0.3 * (random() - 0.5),
          tempo: "follow",
        });
        if (
          worstError(take, fit, moveBeats, 0.06) >
          0.25 * take.secondsPerBeat
        ) {
          failures += 1;
        }
      }
      expect({ miss, failures }).toEqual({ miss, failures: 0 });
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
    expect(fit.ignoredLeadingTaps).toBe(1);
  });

  it("reads three misses right after a real first tap as a stray, until beat 1 is marked", () => {
    // The rule's known cost: nothing in the taps separates this from a key
    // pressed early. The fit reports the tap it set aside so the UI can ask.
    const landing = (position: number) => 3 + SECONDS_PER_BEAT * position;
    const taps = [1, 5, 6, 7, 8, 9, 10, 11, 12].map(landing);
    const unmarked = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(unmarked.ignoredLeadingTaps).toBe(1);
    const marked = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      beatOneSeconds: landing(1),
      tempo: "locked",
    });
    expect(marked.labels.map((label) => label.position)).toEqual([
      1, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(marked.ignoredLeadingTaps).toBe(0);
  });

  it("counts a key registered twice as one tap", () => {
    const landing = (position: number) => 3 + SECONDS_PER_BEAT * position;
    const taps = [1, 2, 3, 4, 5, 6].map(landing);
    const fit = fitTapsToGrid({
      taps: [...taps, landing(4) + 0.0004],
      bpm: 87,
      moveBeats: eightMoves,
      firstTapPosition: 1,
      tempo: "locked",
    });
    expect(fit.labels.map((label) => label.position)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(fit.extraCount).toBe(0);
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

  it("holds the typed tempo until the taps span a pass", () => {
    // Three rough taps once swung the fit 5% off; over a few moves, jitter
    // cannot be told from tempo.
    const sixteen = Array.from({ length: 16 }, () => 1);
    const at80 = (position: number) => 2 + (60 / 80) * position;
    const short = fitTapsToGrid({
      taps: [1, 2, 3, 4, 5].map(at80),
      bpm: 87,
      moveBeats: sixteen,
      firstTapPosition: 1,
      tempo: "follow",
    });
    expect(short.bpm).toBeCloseTo(87, 6);
    const long = fitTapsToGrid({
      taps: Array.from({ length: 20 }, (_, index) => at80(index + 1)),
      bpm: 84,
      moveBeats: sixteen,
      firstTapPosition: 1,
      tempo: "follow",
    });
    expect(long.bpm).toBeCloseTo(80, 0);
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

describe("fitTapsToGrid with a beat-1 mark", () => {
  // DCKΨ- and ΩΛ-XJ: sixteen one-beat moves at 87 BPM, the same four
  // letters four times over, so a label a group off still shows the right
  // letter. Only the mark can tell which landing is move 1.
  const sixteen = Array.from({ length: 16 }, () => 1);
  const spb = 60 / 87;
  const origin = 2;
  const landing = (position: number) => origin + spb * position;
  const run = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => landing(from + index));
  const fit = (taps: number[]) =>
    fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats: sixteen,
      firstTapPosition: 1,
      beatOneSeconds: landing(1) + 0.05,
      tempo: "follow",
    });
  const labelOf = (result: ReturnType<typeof fit>, seconds: number) =>
    result.labels.find((label) => label.seconds === seconds)!.position;

  it("keeps a tap on the opening pose from shifting every label", () => {
    const taps = run(0, 32);
    const result = fit(taps);
    expect(labelOf(result, landing(0))).toBe(0);
    expect(labelOf(result, landing(1))).toBe(1);
    expect(labelOf(result, landing(17))).toBe(17);
    expect(result.originSeconds).toBeCloseTo(origin, 2);
  });

  it("does not let a stray just after the opening pose become move 1", () => {
    const taps = [origin + 0.14, ...run(1, 32)];
    const result = fit(taps);
    expect(labelOf(result, landing(1))).toBe(1);
    expect(labelOf(result, landing(16))).toBe(16);
  });

  it("sets aside a test tap well before the performer starts", () => {
    const early = landing(1) - 1.4;
    const result = fit([early, ...run(1, 32)]);
    expect(labelOf(result, early)).toBeNull();
    expect(labelOf(result, landing(1))).toBe(1);
    expect(result.extraCount).toBe(1);
  });

  it("numbers a late start from the mark, not from the first tap", () => {
    const result = fit(run(5, 32));
    expect(labelOf(result, landing(5))).toBe(5);
    expect(labelOf(result, landing(17))).toBe(17);
    expect(result.missedPositions).toEqual([]);
  });

  it("places a two-beat move where the mark says", () => {
    const moveBeats = [1, 1, 2, 1];
    const clock = createBeatClock(moveBeats);
    const at = (position: number) => origin + spb * clock.beatsBefore(position);
    const taps = [3, 4, 5, 6, 7, 8, 9, 10].map(at);
    const result = fitTapsToGrid({
      taps,
      bpm: 87,
      moveBeats,
      firstTapPosition: 1,
      beatOneSeconds: at(1),
      tempo: "locked",
    });
    expect(result.labels.map((label) => label.position)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(result.worstMissSeconds).toBeLessThan(1e-6);
  });
});
