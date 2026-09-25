import { describe, expect, it } from "vitest";
import { MediaCompositionPresetSchema } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import {
  BREAKDOWN_MARKER,
  BREAKDOWN_POST_LAYOUT,
  BREAKDOWN_REGION,
} from "$lib/shared/media-composition/domain/post-studio-presets";
import {
  withBreakdownFraming,
  withBreakdownMarker,
} from "$lib/shared/media-composition/domain/post-studio-breakdown";
import { normalizePresetToSlots } from "$lib/shared/media-composition/domain/post-studio-slots";
import { createSectionTimeMap } from "$lib/shared/media-composition/domain/sequence-time-map";
import {
  evaluatePresetFrame,
  evaluateRegionRects,
} from "$lib/shared/media-composition/services/frame-evaluator";

const DURATION = 100;

function rectAt(
  time: number,
  regionId: string,
  preset = BREAKDOWN_POST_LAYOUT
) {
  return evaluateRegionRects(preset, DURATION, time).get(regionId);
}

function layerAt(
  time: number,
  regionId: string,
  preset = BREAKDOWN_POST_LAYOUT
) {
  return evaluatePresetFrame(preset, DURATION, time).find(
    (layer) => layer.regionId === regionId
  );
}

describe("Post Studio breakdown", () => {
  it("keeps the free layout and its moving regions through slot normalization", () => {
    expect(normalizePresetToSlots(BREAKDOWN_POST_LAYOUT)).toEqual(
      BREAKDOWN_POST_LAYOUT
    );
  });

  it("moves the strip in, holds it, and clears it before the ending card", () => {
    expect(rectAt(24, BREAKDOWN_REGION.performance)?.height).toBe(1);
    expect(rectAt(24, BREAKDOWN_REGION.animation)?.y).toBe(1);
    expect(rectAt(25.4, BREAKDOWN_REGION.animation)?.y).toBeGreaterThan(
      1420 / 1920
    );
    expect(rectAt(25.4, BREAKDOWN_REGION.animation)?.y).toBeLessThan(1);
    expect(rectAt(30, BREAKDOWN_REGION.performance)?.height).toBeCloseTo(
      1420 / 1920
    );
    expect(rectAt(30, BREAKDOWN_REGION.carousel)?.y).toBeCloseTo(1420 / 1920);
    expect(rectAt(89.6, BREAKDOWN_REGION.carousel)?.y).toBeGreaterThan(
      1420 / 1920
    );
    expect(rectAt(90, BREAKDOWN_REGION.performance)?.height).toBe(1);
    expect(rectAt(90, BREAKDOWN_REGION.carousel)?.y).toBe(1);
  });

  it("fades strip layers at marker edges and keeps the performance full length", () => {
    expect(layerAt(24, BREAKDOWN_REGION.animation)).toBeUndefined();
    expect(layerAt(25, BREAKDOWN_REGION.animation)).toBeUndefined();
    expect(layerAt(25.25, BREAKDOWN_REGION.animation)?.opacity).toBeCloseTo(
      0.5
    );
    expect(layerAt(30, BREAKDOWN_REGION.animation)?.opacity).toBe(1);
    expect(layerAt(89.75, BREAKDOWN_REGION.carousel)?.opacity).toBeCloseTo(0.5);
    expect(layerAt(90, BREAKDOWN_REGION.carousel)).toBeUndefined();
    expect(layerAt(95, BREAKDOWN_REGION.performance)?.opacity).toBe(1);
  });

  it("carries both the strip clip and its motion when the start marker moves", () => {
    const moved = withBreakdownMarker(
      BREAKDOWN_POST_LAYOUT,
      "start",
      40,
      DURATION
    );
    expect(layerAt(30, BREAKDOWN_REGION.animation, moved)).toBeUndefined();
    expect(rectAt(39, BREAKDOWN_REGION.animation, moved)?.y).toBe(1);
    expect(
      layerAt(40.25, BREAKDOWN_REGION.animation, moved)?.opacity
    ).toBeCloseTo(0.5);
    expect(rectAt(40.8, BREAKDOWN_REGION.animation, moved)?.y).toBeCloseTo(
      1420 / 1920
    );
  });

  it("keeps performance full frame with Behind framing", () => {
    const behind = withBreakdownFraming(BREAKDOWN_POST_LAYOUT, "behind");
    expect(rectAt(50, BREAKDOWN_REGION.performance, behind)?.height).toBe(1);
    expect(
      behind.regions.find(
        (region) => region.id === BREAKDOWN_REGION.performance
      )?.fit
    ).toBe("cover");
  });

  it("rejects a clip bound to an unknown marker", () => {
    const clips = BREAKDOWN_POST_LAYOUT.clips.map((clip) =>
      clip.kind === "visual" && clip.regionId === BREAKDOWN_REGION.animation
        ? {
            ...clip,
            start: {
              unit: "marker" as const,
              markerId: "missing",
              offsetSeconds: 0,
            },
          }
        : clip
    );
    const parsed = MediaCompositionPresetSchema.safeParse({
      ...BREAKDOWN_POST_LAYOUT,
      clips,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some(
          (issue) => issue.message === "Clip marker does not exist"
        )
      ).toBe(true);
    }
  });

  it("spreads beats across only the marked media section", () => {
    const map = createSectionTimeMap({
      sequenceRef: { sequenceId: "sequence", contentHash: "revision" },
      mediaSourceId: "performance-video",
      startSeconds: 25,
      endSeconds: 90,
      motionDurations: [1, 2, 1],
    });
    expect(map.anchors[0]).toEqual({
      mediaTimeSeconds: 25,
      sequencePosition: 0,
    });
    expect(map.anchors[1]?.mediaTimeSeconds).toBeCloseTo(25 + 65 / 4);
    expect(map.anchors[2]?.mediaTimeSeconds).toBeCloseTo(25 + (65 * 3) / 4);
    expect(map.anchors.at(-1)).toEqual({
      mediaTimeSeconds: 90,
      sequencePosition: 3,
    });
    expect(BREAKDOWN_POST_LAYOUT.markers?.map((marker) => marker.id)).toEqual([
      BREAKDOWN_MARKER.start,
      BREAKDOWN_MARKER.end,
    ]);
  });
});
