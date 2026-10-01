import { describe, expect, it } from "vitest";
import {
  createTakeTiming,
  createTimingSection,
  type ResolvedTakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  layerTimingParts,
  mappingPreviewAppearance,
  nextMappedLanding,
} from "$lib/shared/share/components/post-studio/builder/post-timing-animation";
import {
  mainItems,
  timingVideoAt,
} from "$lib/shared/media-composition/domain/post-project";
import { overlay, project, video } from "./post-project-fixtures";

function mappedTiming(hold: number, split?: number) {
  const base = createTakeTiming({
    sequenceId: "seq",
    takeKey: "key",
    durationSeconds: 20,
    now: 1,
  });
  if (split === undefined)
    return {
      ...base,
      sections: [{ ...base.sections[0]!, landingHoldRatio: hold }],
    };
  return {
    ...base,
    sections: [
      createTimingSection({ id: "first", startSeconds: 0, endSeconds: split }),
      {
        ...createTimingSection({
          id: "last",
          startSeconds: split,
          endSeconds: 20,
        }),
        landingHoldRatio: hold,
      },
    ],
  };
}

describe("take mapping animation", () => {
  it("reads defaults without adding a layer or changing the project", () => {
    const original = project([video("clip")], [[overlay("moves", "moves")]]);
    const before = JSON.stringify(original);
    expect(mappingPreviewAppearance(original, "a")).toMatchObject({
      props: true,
      darkMode: true,
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it("uses the incoming take for motion timing during a crossfade", () => {
    const original = project([
      video("outgoing", { start: 0, duration: 10, sourceOut: 10, takeId: "a" }),
      video("incoming", { start: 8, duration: 10, sourceOut: 10, takeId: "b" }),
    ]);
    expect(timingVideoAt(mainItems(original), 7)?.takeId).toBe("a");
    expect(timingVideoAt(mainItems(original), 9)?.takeId).toBe("b");
    expect(timingVideoAt(mainItems(original), 18)).toBeNull();
  });

  it("keeps an outgoing linked layer's effort controls on its own take during the fade", () => {
    const original = project([
      video("outgoing", { sourceOut: 10, takeId: "a" }),
      video("incoming", { start: 8, sourceOut: 10, takeId: "b" }),
    ]);
    const timings = { a: mappedTiming(0), b: mappedTiming(0.27) };
    const parts = layerTimingParts(
      original,
      { start: 7, duration: 4, anchor: { itemId: "outgoing", offset: 7 } },
      (id) => timings[id as "a" | "b"]
    );
    expect(
      parts.map((part) => [
        part.takeId,
        part.start,
        part.end,
        part.landingHoldRatio,
      ])
    ).toEqual([
      ["a", 7, 10, 0],
      ["b", 10, 11, 0.27],
    ]);
  });

  it("summarizes all takes and sections under a layer, including later custom timing", () => {
    const original = project([
      video("full", { start: 0, sourceOut: 10, takeId: "a" }),
      video("slow", { start: 9, sourceOut: 10, takeId: "b" }),
    ]);
    const timings = { a: mappedTiming(0), b: mappedTiming(0.27, 4) };
    const parts = layerTimingParts(
      original,
      { start: 2, duration: 16 },
      (id) => timings[id as "a" | "b"]
    );
    expect(
      parts.map(({ takeId, sectionIndex, start, end, landingHoldRatio }) => [
        takeId,
        sectionIndex,
        start,
        end,
        landingHoldRatio,
      ])
    ).toEqual(
      [
        ["a", 0, 2, 9],
        ["b", 0, 9, 13],
        ["b", 1, 13, 18],
      ].map(([takeId, index, start, end], i) => [
        takeId,
        index,
        start,
        end,
        i === 2 ? 0.27 : 0,
      ])
    );
  });

  it("uses source in and speed, and excludes trimmed timing sections", () => {
    const original = project([
      video("slow", {
        start: 5,
        sourceIn: 4,
        sourceOut: 12,
        speed: 2,
        takeId: "b",
      }),
    ]);
    const timing = mappedTiming(0.27, 8);
    timing.sections[0] = { ...timing.sections[0]!, landingHoldRatio: 0.5 };
    const parts = layerTimingParts(
      original,
      { start: 5, duration: 4 },
      () => timing
    );
    expect(
      parts.map((part) => [part.start, part.end, part.landingHoldRatio])
    ).toEqual([
      [5, 7, 0.5],
      [7, 9, 0.27],
    ]);
    expect(
      layerTimingParts(original, { start: 7, duration: 2 }, () => timing)
    ).toEqual([
      expect.objectContaining({ start: 7, end: 9, landingHoldRatio: 0.27 }),
    ]);
  });

  it("gives the incoming clip priority only during its crossfade overlap", () => {
    const original = project([
      video("outgoing", { start: 0, sourceOut: 10, takeId: "a" }),
      video("incoming", { start: 8, sourceOut: 10, takeId: "b" }),
    ]);
    const timings = { a: mappedTiming(0), b: mappedTiming(0.27) };
    expect(
      layerTimingParts(
        original,
        { start: 7, duration: 3 },
        (id) => timings[id as "a" | "b"]
      ).map((part) => [
        part.takeId,
        part.start,
        part.end,
        part.landingHoldRatio,
      ])
    ).toEqual([
      ["a", 7, 8, 0],
      ["b", 8, 10, 0.27],
    ]);
  });

  it("counts only moved landings that play in the active part of a clip", () => {
    const original = project([
      video("outgoing", { start: 0, sourceOut: 10, takeId: "a" }),
      video("incoming", { start: 8, sourceIn: 4, sourceOut: 10, takeId: "b" }),
    ]);
    const a = mappedTiming(0);
    a.sections[0] = {
      ...a.sections[0]!,
      overrides: [
        { position: 1, seconds: 6 },
        { position: 2, seconds: 9 },
      ],
    };
    const b = mappedTiming(0);
    b.sections[0] = {
      ...b.sections[0]!,
      overrides: [
        { position: 1, seconds: 2 },
        { position: 2, seconds: 5 },
      ],
    };
    const timings = { a, b };
    expect(
      layerTimingParts(
        original,
        { start: 7, duration: 3 },
        (id) => timings[id as "a" | "b"]
      ).map((part) => [part.takeId, part.movedLandings])
    ).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("plays to actual mapped landings across sections and ignores duplicate cut marks", () => {
    const resolved = {
      sections: [
        {
          landings: [
            { position: 1, seconds: 0.75 },
            { position: 2, seconds: 1.9 },
          ],
        },
        {
          landings: [
            { position: 2, seconds: 1.9 },
            { position: 3, seconds: 3.45 },
          ],
        },
      ],
    } as ResolvedTakeTiming;
    expect(nextMappedLanding(resolved, 0)).toBe(0.75);
    expect(nextMappedLanding(resolved, 0.75)).toBe(1.9);
    expect(nextMappedLanding(resolved, 1.9)).toBe(3.45);
    expect(nextMappedLanding(resolved, 3.45)).toBeNull();
  });
});
