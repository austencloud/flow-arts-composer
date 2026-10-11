import { describe, expect, it } from "vitest";
import {
  clock,
  walkthroughReport,
  walkthroughTake,
} from "../../../scripts/feature-video/walkthrough-report.mjs";

const bubble = (
  id: string,
  start: number,
  duration: number,
  label?: string
) => ({
  id,
  kind: "text",
  text: `Words for ${id}`,
  start,
  duration,
  ...(label ? { label } : {}),
});

const post = {
  tracks: [
    { id: "main", items: [] },
    {
      id: "walkthrough",
      items: [
        bubble("c", 80.2, 3, "Turn Intensity"),
        bubble("a", 2.2, 1.4, "Level"),
        bubble("b", 4.9, 2.5),
      ],
    },
  ],
};

const linkedTake = (id: string, file: string) => ({
  id,
  ref: {
    kind: "linked",
    url: `/api/dev/feature-videos/generate-tutorial/media/captures/${file}`,
  },
});

describe("walkthroughReport", () => {
  it("marks each chapter 1.5 s before its first bubble, the first at 0:00", () => {
    const report = walkthroughReport(post);
    expect(report.bubbles).toBe(3);
    expect(report.chapters).toEqual([
      { name: "Level", seconds: 0.7, mark: "0:00" },
      { name: "Turn Intensity", seconds: 78.7, mark: "1:18" },
    ]);
    expect(report.youtube).toBe("0:00 Level\n1:18 Turn Intensity");
  });

  it("lists bubbles too short to read", () => {
    expect(walkthroughReport(post).short).toEqual([
      { id: "a", text: "Words for a", seconds: 1.4 },
    ]);
  });

  it("says how to build one when the post has none", () => {
    expect(() => walkthroughReport({ tracks: [] })).toThrow(
      /walkthrough --feature/
    );
  });
});

describe("walkthroughTake", () => {
  it("finds the take that plays the recording, else the only take", () => {
    const takes = [
      linkedTake("take-1", "other.1.mp4"),
      linkedTake("take-3", "generate-tutorial.3.mp4"),
    ];
    expect(walkthroughTake(takes, "generate-tutorial")).toBe("take-3");
    expect(walkthroughTake([takes[0]], "generate-tutorial")).toBe("take-1");
    expect(() => walkthroughTake(takes, "missing")).toThrow(/--take/);
  });
});

describe("clock", () => {
  it("writes minutes and seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75.9)).toBe("1:15");
  });
});
