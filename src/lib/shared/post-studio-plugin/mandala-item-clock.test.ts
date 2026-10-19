import { describe, expect, it } from "vitest";
import type { PostProject } from "@austencloud/video-editor/core";
import { mandalaItemClock, mandalaItemPostSeconds } from "./mandala-item-clock";

const everyBar = { every: 1 as const, unit: "bars" as const, morph: 2 as const };

function gridded(): Pick<PostProject, "music"> {
  return {
    music: {
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 60,
      grid: { bpm: 100, downbeatSeconds: 0, beatsPerBar: 4 },
    } as PostProject["music"],
  };
}

describe("mandalaItemClock", () => {
  it("anchors on the hold boundary at or before the clip's start, on the grid", () => {
    const clock = mandalaItemClock(gridded(), { start: 3, shift: everyBar });
    expect(clock.hasGrid).toBe(true);
    expect(clock.beatsPerBar).toBe(4);
    expect(clock.anchorSeconds).toBeCloseTo(2.4);
    expect(clock.beatsAt(3)).toBeCloseTo(1);
    expect(clock.beatsAt(2.4)).toBeCloseTo(0);
  });

  it("follows the music's placement on the post", () => {
    const project = gridded();
    project.music = { ...project.music!, startSeconds: 10, sourceInSeconds: 1 };
    // The downbeat sounds at post second 9; bar 2 at 11.4.
    const clock = mandalaItemClock(project, { start: 12, shift: everyBar });
    expect(clock.anchorSeconds).toBeCloseTo(11.4);
    expect(clock.beatsAt(12)).toBeCloseTo(1);
  });

  it("runs at 120 BPM from the clip's start without a grid", () => {
    const clock = mandalaItemClock({ music: undefined }, { start: 5, shift: everyBar });
    expect(clock.hasGrid).toBe(false);
    expect(clock.bpm).toBe(120);
    expect(clock.beatsAt(5.5)).toBeCloseTo(1);
  });

  it("maps a clip's source time back to post seconds", () => {
    expect(mandalaItemPostSeconds({ start: 4, sourceIn: 1, speed: 1 }, 3)).toBe(6);
    expect(mandalaItemPostSeconds({ start: 4, sourceIn: 0, speed: 2 }, 3)).toBe(5.5);
  });
});
