import { describe, expect, it } from "vitest";
import {
  assertCaptureId,
  captureFile,
  clipChanges,
  findCaptureTake,
  mediaRelativePath,
  nextCaptureFile,
} from "../../../scripts/feature-video/capture-files.mjs";

describe("assertCaptureId", () => {
  it("accepts lowercase letters, digits and hyphens", () => {
    expect(assertCaptureId("builder-dckpsi")).toBe("builder-dckpsi");
    expect(assertCaptureId("ring-2")).toBe("ring-2");
  });
  it("rejects anything that could leave the captures folder", () => {
    for (const bad of ["", "Builder", "../x", "a/b", "a.b", "-a", undefined])
      expect(() => assertCaptureId(bad as never)).toThrow(/capture id/);
  });
});

describe("nextCaptureFile", () => {
  it("starts at 1", () => {
    expect(nextCaptureFile("builder", [])).toBe("captures/builder.1.mp4");
  });
  it("counts up from the highest existing take, never reusing a number", () => {
    expect(
      nextCaptureFile("builder", [
        "builder.1.mp4",
        "builder.3.mp4",
        "ring.9.mp4",
        "builder.notes.txt",
      ])
    ).toBe("captures/builder.4.mp4");
  });
  it("does not mix up an id with a longer one that starts the same", () => {
    expect(nextCaptureFile("ring", ["ring-2.5.mp4"])).toBe(
      "captures/ring.1.mp4"
    );
  });
  it("names the file the way captureFile does", () => {
    expect(captureFile("a", 2)).toBe("captures/a.2.mp4");
  });
});

describe("mediaRelativePath and findCaptureTake", () => {
  const url = (rel: string) => `/api/dev/feature-videos/promo/media/${rel}`;
  const takes = [
    { id: "take-1", ref: { kind: "linked", url: url("footage/opening.mp4") } },
    {
      id: "take-2",
      ref: { kind: "linked", url: url("captures/builder.2.mp4") },
    },
    { id: "take-3", ref: { kind: "linked", url: url("captures/ring.1.mp4") } },
    { id: "take-4", ref: { kind: "inline", name: "x" } },
  ];
  it("reads the media-relative path, decoding it", () => {
    expect(mediaRelativePath(url("captures/a%20b.1.mp4"))).toBe(
      "captures/a b.1.mp4"
    );
    expect(mediaRelativePath("https://x.test/a.mp4")).toBeNull();
  });
  it("reads only the feature video media route", () => {
    expect(
      mediaRelativePath("https://cdn.test/media/captures/builder.1.mp4")
    ).toBeNull();
    expect(
      mediaRelativePath("/api/dev/feature-videos/media/media/captures/a.1.mp4")
    ).toBe("captures/a.1.mp4");
    expect(mediaRelativePath(url("captures/%E0%A4%A.1.mp4"))).toBeNull();
    expect(
      findCaptureTake(
        [
          {
            id: "elsewhere",
            ref: {
              kind: "linked",
              url: "https://cdn.test/media/captures/builder.1.mp4",
            },
          },
        ],
        "builder"
      )
    ).toBeNull();
  });
  it("finds the take that plays a capture of that id", () => {
    expect(findCaptureTake(takes, "builder")?.id).toBe("take-2");
    expect(findCaptureTake(takes, "ring")?.id).toBe("take-3");
    expect(findCaptureTake(takes, "missing")).toBeNull();
  });
});

describe("clipChanges", () => {
  const post = (clips: [string, string, number][]) => ({
    tracks: [
      {
        items: clips.map(([id, takeId, duration]) => ({
          id,
          kind: "video",
          takeId,
          duration,
        })),
      },
      { items: [{ id: "title", kind: "text", duration: 3 }] },
    ],
  });
  it("names the take's clips a relink removed or cut back", () => {
    const before = post([
      ["a", "take-1", 4],
      ["b", "take-1", 4],
      ["c", "take-1", 3],
      ["other", "take-2", 5],
    ]);
    const after = post([
      ["a", "take-1", 4],
      ["b", "take-1", 2.004],
    ]);
    expect(clipChanges(before, after, "take-1")).toEqual({
      removed: ["c"],
      shortened: [{ id: "b", from: 4, to: 2 }],
    });
  });
  it("reports nothing when every clip still fits", () => {
    const same = post([["a", "take-1", 4]]);
    expect(clipChanges(same, same, "take-1")).toEqual({
      removed: [],
      shortened: [],
    });
  });
});
