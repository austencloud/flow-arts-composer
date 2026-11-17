import { describe, expect, it } from "vitest";
import type {
  PostItem,
  PostProject,
  PostVideoItem,
} from "@austencloud/video-editor/core";
import type { TakeTiming } from "#lib/shared/media-composition/domain/take-timing.js";
import { beatsClipFor, timingSectionAt } from "./tka-beat-nudge";

// The ΩΛ-XJ reel's shape: a demonstration clip, then the breakdown clip
// with its letters strip over it.
const demo = {
  id: "demo",
  kind: "video",
  takeId: "take-demo",
  start: 0,
  duration: 29.2,
  sourceIn: 65.5,
  speed: 1,
} as unknown as PostVideoItem;
const breakdown = {
  id: "breakdown",
  kind: "video",
  takeId: "take-breakdown",
  start: 28.4,
  duration: 48.9,
  sourceIn: 142.3,
  speed: 1,
} as unknown as PostVideoItem;
const letters = {
  id: "moves-2",
  kind: "moves",
  start: 28.4,
  duration: 48.9,
} as unknown as PostItem;
const project = {
  tracks: [{ items: [demo, breakdown] }, { items: [letters] }],
} as unknown as PostProject;

describe("beatsClipFor", () => {
  it("a camera clip plays to its own beats", () => {
    expect(beatsClipFor(project, breakdown, 3)).toBe(breakdown);
  });

  it("the letters strip follows the camera clip under the playhead", () => {
    expect(beatsClipFor(project, letters, 32.35)?.id).toBe("breakdown");
  });

  it("a playhead outside the strip still names the strip's own clip", () => {
    expect(beatsClipFor(project, letters, 5)?.id).toBe("breakdown");
    expect(beatsClipFor(project, letters, 200)?.id).toBe("breakdown");
  });

  it("where the two clips cross, each canvas keeps the clip it lies over", () => {
    expect(beatsClipFor(project, letters, 28.8)?.id).toBe("breakdown");
    const demoAnimation = {
      id: "animation-1",
      kind: "animation",
      start: 0,
      duration: 29.2,
    } as unknown as PostItem;
    expect(beatsClipFor(project, demoAnimation, 28.8)?.id).toBe("demo");
  });

  it("other kinds have no beats to nudge", () => {
    const text = { id: "t", kind: "text", start: 0, duration: 4 };
    expect(beatsClipFor(project, text as unknown as PostItem, 1)).toBeNull();
  });
});

describe("timingSectionAt", () => {
  const timing = {
    sections: [
      { id: "first", startSeconds: 0 },
      { id: "second", startSeconds: 160 },
    ],
  } as unknown as TakeTiming;

  it("picks the part the clip's footage is in at the playhead", () => {
    // 32.35 s in the post is 146.25 s into the breakdown footage.
    expect(timingSectionAt(timing, breakdown, 32.35)?.id).toBe("first");
    // 50 s in the post is 163.9 s into it.
    expect(timingSectionAt(timing, breakdown, 50)?.id).toBe("second");
  });

  it("holds the playhead inside the clip", () => {
    expect(timingSectionAt(timing, breakdown, 0)?.id).toBe("first");
    expect(timingSectionAt(timing, breakdown, 500)?.id).toBe("second");
  });
});
