import { describe, expect, it } from "vitest";
import {
  createTakeTiming,
  resolveTakeTiming,
  setTakePerformanceEndAt,
  splitTimingSection,
  type TakeTiming,
  type TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  landingName,
  summarizeTiming,
} from "$lib/shared/media-composition/domain/timing-summary";

const EIGHT = Array.from({ length: 8 }, () => 1);
const SIXTEEN = Array.from({ length: 16 }, () => 1);

function timingWith(section: Partial<TimingSection>): TakeTiming {
  const base = createTakeTiming({
    sequenceId: "dck",
    takeKey: "local:take.mp4:1:1",
    durationSeconds: 60,
    now: 1,
  });
  return { ...base, sections: [{ ...base.sections[0]!, ...section }] };
}

function summarize(section: Partial<TimingSection>) {
  const timing = timingWith(section);
  const resolved = resolveTakeTiming(timing, SIXTEEN).sections[0] ?? null;
  return summarizeTiming({
    section: timing.sections[0]!,
    resolved,
    moveBeats: SIXTEEN,
  });
}

/** Landings of moves 1..count at `bpm`, move 1 at `origin`. */
function taps(bpm: number, count: number, origin = 2): number[] {
  return Array.from(
    { length: count },
    (_, index) => origin + (60 / bpm) * index
  );
}

describe("summarizeTiming", () => {
  it("asks for taps before anything is mapped", () => {
    const summary = summarize({});
    expect(summary.tone).toBe("empty");
    expect(summary.suggestedBpm).toBeNull();
  });

  it("runs the typed tempo from a marked move 1 until taps arrive", () => {
    const summary = summarize({ bpm: 87, beatOneSeconds: 2 });
    expect(summary.tone).toBe("tapping");
    expect(summary.text).toContain("87 BPM");
  });

  it("keeps asking for taps while too few have landed to judge", () => {
    const summary = summarize({ bpm: 87, taps: taps(87, 3) });
    expect(summary.tone).toBe("tapping");
    expect(summary.text).toContain("3 taps");
  });

  it("reports a tight fit at the typed tempo", () => {
    const summary = summarize({ bpm: 87, tempo: "locked", taps: taps(87, 12) });
    expect(summary.tone).toBe("good");
    expect(summary.text).toMatch(/^Fits 87 BPM/);
  });

  it("names the tempo the taps point to when the typed one is wrong", () => {
    // A slow take tapped at its own tempo with 87 still typed.
    const summary = summarize({ bpm: 87, tempo: "locked", taps: taps(50, 12) });
    expect(summary.tone).toBe("tempo");
    expect(summary.suggestedBpm).toBeCloseTo(50, 0);
    expect(summary.text).toContain("not 87");
  });

  describe("on an untapped part that keeps counting", () => {
    // Moves 1-8 tapped from 1.7 s, then a keep-counting cut at 20 s, where
    // the grid is at move 4 of pass 4.
    const split = splitTimingSection(
      timingWith({ tempo: "locked", taps: taps(87, 8, 1 + 60 / 87) }),
      20,
      "section-2",
      2,
      EIGHT,
      "continues"
    );
    const summarizePart2 = (timing: TakeTiming) =>
      summarizeTiming({
        section: timing.sections[1]!,
        resolved: resolveTakeTiming(timing, EIGHT).sections[1]!,
        moveBeats: EIGHT,
      }).text;

    it("names the landing it runs on from", () => {
      expect(split.sections[1]!.beatOnePosition).toBe(28);
      const ended = setTakePerformanceEndAt(split, "section-2", EIGHT, 25);
      const text = summarizePart2(ended);
      expect(text).toContain("Running at 87 BPM from move 4 · pass 4");
      expect(text).not.toContain("from move 1");
    });

    it("says it holds the pose the performance ended on", () => {
      expect(summarizePart2(split)).toBe(
        "Held at move 8 · pass 1, where the taps stop. Tap along to count on."
      );
      const ended = setTakePerformanceEndAt(split, "section-1", EIGHT, 1 + (60 / 87) * 6);
      expect(summarizePart2(ended)).toBe(
        "Held at move 6 · pass 1, where the performance ends."
      );
    });
  });
});

describe("landingName", () => {
  it("counts moves within a pass and passes from one", () => {
    expect(landingName(0, 16)).toBe("Start");
    expect(landingName(1, 16)).toBe("Move 1 · pass 1");
    expect(landingName(16, 16)).toBe("Move 16 · pass 1");
    expect(landingName(17, 16)).toBe("Move 1 · pass 2");
  });
});
