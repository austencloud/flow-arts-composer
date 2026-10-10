import { describe, expect, it } from "vitest";
import {
  MUSIC_GRID_MAX_LINES,
  NO_GRID_MESSAGE,
  barBeatAt,
  downbeatFromTaps,
  musicBarLabelEvery,
  musicBarMarks,
  musicGridLines,
  musicSnapTargets,
  musicSpan,
  postSecondsAtBar,
  postSecondsAtTrack,
  resolvePostTime,
  resolveTrackTime,
  trackSecondsAt,
} from "#lib/shared/media-composition/domain/music-grid.js";

// 120 BPM in 4: a beat is 0.5 s and a bar 2 s. The file's bar 1 is at its
// 5.25 s, and the clip plays the file from 5 s at the post's 2 s, so bar 1
// sounds at the post's 2.25 s.
const grid = { bpm: 120, downbeatSeconds: 5.25, beatsPerBar: 4 };
const placed = {
  startSeconds: 2,
  sourceInSeconds: 5,
  sourceOutSeconds: 35,
  grid,
};

describe("the music's place on the post clock", () => {
  it("maps post seconds to the file's seconds and back", () => {
    expect(musicSpan(placed)).toEqual({ start: 2, end: 32 });
    expect(trackSecondsAt(placed, 2)).toBe(5);
    expect(trackSecondsAt(placed, 10)).toBe(13);
    expect(postSecondsAtTrack(placed, 13)).toBe(10);
  });

  it("puts bars and beats where the spec's formula does", () => {
    expect(postSecondsAtBar(placed, 1)).toBeCloseTo(2.25, 9);
    expect(postSecondsAtBar(placed, 9)).toBeCloseTo(18.25, 9);
    // 2 + (5.25 - 5) + ((9 - 1) * 4 + (3 - 1)) * 60 / 120
    expect(postSecondsAtBar(placed, 9, 3)).toBeCloseTo(19.25, 9);
  });

  it("names the bar and beat sounding at a post second", () => {
    expect(barBeatAt(placed, 19.3)).toEqual({ bar: 9, beat: 3 });
    expect(barBeatAt(placed, 2.25)).toEqual({ bar: 1, beat: 1 });
    // Just before bar 1: the last beat of bar 0.
    expect(barBeatAt(placed, 2.1)).toEqual({ bar: 0, beat: 4 });
  });

  it("counts bars of three, before bar 1 too", () => {
    // 90 BPM in 3: a beat is 2/3 s and a bar 2 s; bar 1 still sounds at 2.25.
    const waltz = {
      ...placed,
      grid: { bpm: 90, downbeatSeconds: 5.25, beatsPerBar: 3 },
    };
    // 2 + (5.25 - 5) + ((4 - 1) * 3 + (2 - 1)) * 60 / 90
    expect(postSecondsAtBar(waltz, 4, 2)).toBeCloseTo(2.25 + 20 / 3, 9);
    expect(barBeatAt(waltz, 2.25 + 20 / 3 + 0.01)).toEqual({ bar: 4, beat: 2 });
    expect(barBeatAt(waltz, 2.25 - 2 / 3 + 0.01)).toEqual({ bar: 0, beat: 3 });
    expect(barBeatAt(waltz, 2.25 - 4 / 3 + 0.01)).toEqual({ bar: 0, beat: 2 });
    expect(barBeatAt(waltz, 2.25 - 2 - 0.01)).toEqual({ bar: -1, beat: 3 });
    expect(() => resolvePostTime({ bar: 4, beat: 4 }, waltz, "at")).toThrow(
      "at: the beat must be a whole number from 1 to 3."
    );
  });
});

describe("grid lines", () => {
  it("lists every beat in a window, marking each bar's first", () => {
    const lines = musicGridLines(placed, 0, 4).map((line) => [
      line.seconds,
      line.bar,
      line.beat,
      line.downbeat,
    ]);
    expect(lines).toEqual([
      [2.25, 1, 1, true],
      [2.75, 1, 2, false],
      [3.25, 1, 3, false],
      [3.75, 1, 4, false],
    ]);
  });

  it("stops where the music stops", () => {
    const lines = musicGridLines(placed, 30, 40);
    expect(lines.map((line) => line.seconds)).toEqual([
      30.25, 30.75, 31.25, 31.75,
    ]);
    expect(lines[0]).toMatchObject({ bar: 15, beat: 1, downbeat: true });
    expect(musicGridLines(placed, 40, 50)).toEqual([]);
  });

  it("counts the beats before bar 1 as bar 0 and earlier", () => {
    // Bar 1 sounds at 1.25 s, so the beats at 0.25 s and 0.75 s come before it.
    const late = {
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 10,
      grid: { bpm: 120, downbeatSeconds: 1.25, beatsPerBar: 4 },
    };
    expect(
      musicGridLines(late, 0, 2).map((line) => [
        line.seconds,
        line.bar,
        line.beat,
        line.downbeat,
      ])
    ).toEqual([
      [0.25, 0, 3, false],
      [0.75, 0, 4, false],
      [1.25, 1, 1, true],
      [1.75, 1, 2, false],
    ]);
  });

  it("returns when bar 1 is so far off that counting beats cannot move", () => {
    // Past 2^53 a beat count no longer changes when 1 is added to it, so a
    // loop that counted up by 1 never ended and used up the tab's memory.
    const far = { ...placed, grid: { ...grid, downbeatSeconds: 1e17 } };
    const lines = musicGridLines(far, 0, 4);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(MUSIC_GRID_MAX_LINES);
  });

  it("stops at the backstop however many beats the music holds", () => {
    // 300 BPM is a beat every 0.2 s, so 30,000 s hold 150,000 beats.
    const long = {
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 30_000,
      grid: { bpm: 300, downbeatSeconds: 0, beatsPerBar: 4 },
    };
    const lines = musicGridLines(long, 0, 30_000);
    expect(lines).toHaveLength(MUSIC_GRID_MAX_LINES);
    expect(lines[0]).toMatchObject({
      seconds: 0,
      bar: 1,
      beat: 1,
      downbeat: true,
    });
    expect(lines[MUSIC_GRID_MAX_LINES - 1]!.seconds).toBeCloseTo(
      (MUSIC_GRID_MAX_LINES - 1) * 0.2,
      6
    );
  });
});

describe("snap targets", () => {
  it("offers every beat when beats sit at least 12 px apart", () => {
    // 60 px a second puts beats 30 px apart.
    const targets = musicSnapTargets(placed, 60);
    expect(targets.slice(0, 4)).toEqual([2, 32, 2.25, 2.75]);
    expect(targets).toHaveLength(2 + 60);
  });

  it("offers only bars when beats crowd", () => {
    // 20 px a second puts beats 10 px apart and bars 40 px apart.
    const targets = musicSnapTargets(placed, 20);
    expect(targets).toHaveLength(2 + 15);
    expect(targets.slice(2, 5)).toEqual([2.25, 4.25, 6.25]);
  });

  it("offers just the music's edges without a grid", () => {
    const { grid: _grid, ...plain } = placed;
    expect(musicSnapTargets(plain, 60)).toEqual([2, 32]);
  });
});

describe("bar numbers on the ruler", () => {
  it("labels every bar when there is room", () => {
    const marks = musicBarMarks(placed, 60);
    expect(marks).toHaveLength(15);
    expect(marks[0]).toEqual({ seconds: 2.25, label: "1" });
    expect(marks[8]).toEqual({ seconds: 18.25, label: "9" });
  });

  it("numbers one bar in 1, 2, 4 or more as the bars crowd", () => {
    expect(musicBarLabelEvery(placed, 60)).toBe(1);
    expect(musicBarLabelEvery(placed, 8)).toBe(2);
    expect(musicBarLabelEvery(placed, 4)).toBe(4);
    // Bars 2 px apart: 16 of them make 32 px.
    expect(musicBarLabelEvery(placed, 1)).toBe(16);
  });

  it("labels every 2nd, then every 4th bar as the zoom shrinks", () => {
    // Bars 16 px apart: every 2nd bar is 32 px.
    expect(musicBarMarks(placed, 8).map((mark) => mark.label)).toEqual([
      "1",
      "3",
      "5",
      "7",
      "9",
      "11",
      "13",
      "15",
    ]);
    // Bars 8 px apart: every 4th bar is 32 px.
    expect(musicBarMarks(placed, 4).map((mark) => mark.label)).toEqual([
      "1",
      "5",
      "9",
      "13",
    ]);
  });
});

describe("times a command names", () => {
  it("reads seconds as seconds and bars through the grid", () => {
    expect(resolvePostTime(9, placed, "at")).toBe(9);
    expect(resolvePostTime({ bar: 9 }, placed, "at")).toBeCloseTo(18.25, 9);
    expect(resolvePostTime({ bar: 9, beat: 3 }, placed, "at")).toBeCloseTo(
      19.25,
      9
    );
    expect(resolveTrackTime({ bar: 2 }, grid, "in")).toBeCloseTo(7.25, 9);
    expect(resolveTrackTime(12, undefined, "in")).toBe(12);
  });

  it("explains what is wrong with a time it cannot use", () => {
    const { grid: _grid, ...plain } = placed;
    expect(() => resolvePostTime({ bar: 9 }, plain, "at")).toThrow(
      NO_GRID_MESSAGE
    );
    expect(() => resolvePostTime({ bar: 9 }, undefined, "at")).toThrow(
      NO_GRID_MESSAGE
    );
    expect(() => resolvePostTime({ bar: 9, beat: 5 }, placed, "at")).toThrow(
      "at: the beat must be a whole number from 1 to 4."
    );
    expect(() => resolvePostTime({ bar: 9.5 }, placed, "at")).toThrow(
      "at: a bar must be a whole number, like @9."
    );
    expect(() => resolvePostTime("soon", placed, "at")).toThrow(
      "at must be a number of seconds or a bar like @9 or @9.3."
    );
    expect(() => resolvePostTime(Number.NaN, placed, "at")).toThrow(
      "at must be a number of seconds or a bar like @9 or @9.3."
    );
  });
});

describe("a downbeat from taps", () => {
  it("averages the taps' place on the beat", () => {
    // Taps on a 0.5 s beat at phase 0.1, each a little early or late.
    const downbeat = downbeatFromTaps([10.1, 10.62, 11.08, 11.61], 120, 10.1);
    expect(downbeat).not.toBeNull();
    expect(Math.abs(downbeat! - 10.1)).toBeLessThan(0.02);
  });

  it("averages around the beat, so taps either side of it agree", () => {
    // Phases 0.49, 0.01, 0.02 and 0.48 all sit near the beat at 0.
    const downbeat = downbeatFromTaps([10.49, 11.01, 11.52, 11.98], 120, 10.49);
    expect(Math.abs(downbeat! - 10.5)).toBeLessThan(0.02);
  });

  it("needs two taps that agree", () => {
    expect(downbeatFromTaps([10.1], 120, 10.1)).toBeNull();
    expect(downbeatFromTaps([0, 0.25], 120, 0)).toBeNull();
  });
});
