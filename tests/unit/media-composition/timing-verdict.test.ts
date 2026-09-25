import { describe, expect, it } from "vitest";
import { fitTapsToGrid } from "$lib/shared/media-composition/domain/tap-fit";
import {
  judgeTimingFit,
  suggestBpmFromTaps,
} from "$lib/shared/media-composition/domain/timing-verdict";

const SIXTEEN = Array.from({ length: 16 }, () => 1);

/** Rough taps on every landing 1..count, with a fixed wobble pattern. */
function tapsAt(bpm: number, count: number, every = 1): number[] {
  const wobble = [0.02, -0.015, 0.03, -0.025, 0.01, 0, -0.02, 0.015];
  const spb = 60 / bpm;
  const taps: number[] = [];
  for (let position = 1; position <= count; position += every) {
    taps.push(2 + spb * position + wobble[position % wobble.length]!);
  }
  return taps;
}

function verdictFor(taps: number[], typedBpm: number) {
  const fit = fitTapsToGrid({
    taps,
    bpm: typedBpm,
    moveBeats: SIXTEEN,
    firstTapPosition: 1,
    tempo: "follow",
  });
  return judgeTimingFit({
    fit,
    typedBpm,
    tempo: "follow",
    taps,
    moveBeats: SIXTEEN,
  });
}

describe("suggestBpmFromTaps", () => {
  it("reads the tempo from the taps' spacing, missed landings and all", () => {
    expect(suggestBpmFromTaps(tapsAt(87, 32), SIXTEEN)).toBeCloseTo(87, 0);
    const withGaps = tapsAt(50, 32).filter((_, index) => index % 5 !== 3);
    expect(suggestBpmFromTaps(withGaps, SIXTEEN)).toBeCloseTo(50, 0);
  });

  it("waits for enough taps", () => {
    expect(suggestBpmFromTaps(tapsAt(87, 4), SIXTEEN)).toBeNull();
  });
});

describe("judgeTimingFit", () => {
  it("passes a take tapped at the typed tempo", () => {
    expect(verdictFor(tapsAt(87, 32), 87)).toEqual({ kind: "good" });
  });

  it("says so when a slow take was fitted at the fast take's BPM", () => {
    const verdict = verdictFor(tapsAt(50, 32), 87);
    expect(verdict.kind).toBe("tempo");
    expect(verdict.kind === "tempo" && verdict.suggestedBpm).toBeCloseTo(
      50,
      0
    );
  });

  it("catches a tempo a little outside what the fit may follow", () => {
    const verdict = verdictFor(tapsAt(80, 32), 87);
    expect(verdict).toMatchObject({ kind: "tempo" });
    expect(verdict.kind === "tempo" && verdict.suggestedBpm).toBeCloseTo(
      80,
      0
    );
  });

  it("offers half the tempo when every other landing was tapped", () => {
    expect(verdictFor(tapsAt(87, 32, 2), 87)).toEqual({
      kind: "tempo",
      suggestedBpm: 43.5,
    });
  });

  it("waits for a few taps before judging", () => {
    expect(verdictFor(tapsAt(87, 3), 87)).toEqual({ kind: "tapping" });
  });
});
