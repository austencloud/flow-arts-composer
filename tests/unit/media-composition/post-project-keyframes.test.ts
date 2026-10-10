import { describe, expect, it } from "vitest";
import { POST_MAX_ZOOM } from "#lib/shared/media-composition/domain/post-project.js";
import {
  DEFAULT_EASING,
  EASING_PRESETS,
  adjacentKeyframeSeconds,
  boxAt,
  channelKeyframeSeconds,
  channelSegments,
  channelValueAt,
  channelsOf,
  clampChannelValue,
  clearChannel,
  clearItemKeyframes,
  keyframeCount,
  easingControlPoints,
  easingPresetOf,
  framingAt,
  isAnimated,
  keyframeIndexAt,
  keyframeInView,
  keyframeMarkers,
  keyframeTimeOf,
  moveKeyframe,
  moveKeyframes,
  opacityAt,
  postSecondsOfKeyframe,
  removeKeyframe,
  removeKeyframesAt,
  sameChannelValue,
  sampleEasing,
  segmentAt,
  setKeyframe,
  setSegmentEasing,
  shiftKeyframes,
  toggleKeyframe,
  writeChannelValue,
  type PostEasingPresetId,
} from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import { text, video } from "./post-project-fixtures";

describe("channelsOf", () => {
  it("includes editable source geometry for videos", () => {
    expect(channelsOf(video("v"))).toEqual([
      "framing",
      "sourceGeometry",
      "box",
      "opacity",
    ]);
    expect(channelsOf(text("t", 0, 5))).toEqual(["box", "opacity"]);
  });
});

describe("content-time conversion", () => {
  it("uses take media seconds for a video item", () => {
    const v = video("v", { sourceIn: 2, sourceOut: 12, speed: 1 });
    expect(keyframeTimeOf(v, 0)).toBeCloseTo(2, 9);
    expect(keyframeTimeOf(v, 10)).toBeCloseTo(12, 9);
    expect(postSecondsOfKeyframe(v, 2)).toBeCloseTo(0, 9);
    expect(postSecondsOfKeyframe(v, 12)).toBeCloseTo(10, 9);
  });

  it("uses seconds-from-item-start for a non-video item", () => {
    const t = text("t", 2, 5);
    expect(keyframeTimeOf(t, 2)).toBe(0);
    expect(keyframeTimeOf(t, 7)).toBe(5);
    expect(postSecondsOfKeyframe(t, 0)).toBe(2);
    expect(postSecondsOfKeyframe(t, 5)).toBe(7);
  });

  it("keeps a video keyframe on the take's own clock: the post second it lands on moves with speed, not the content time", () => {
    const slow = video("v", { sourceIn: 0, sourceOut: 20, speed: 1 });
    const fast = video("v", { sourceIn: 0, sourceOut: 20, speed: 2 });
    expect(postSecondsOfKeyframe(slow, 10)).toBeCloseTo(10, 9);
    expect(postSecondsOfKeyframe(fast, 10)).toBeCloseTo(5, 9);
  });

  it("reports whether content time t is inside the item's visible span", () => {
    const t = text("t", 2, 5); // spans post [2, 7]
    expect(keyframeInView(t, 0)).toBe(true);
    expect(keyframeInView(t, 5)).toBe(true);
    expect(keyframeInView(t, -0.5)).toBe(false);
    expect(keyframeInView(t, 5.5)).toBe(false);
  });
});

describe("setKeyframe / removeKeyframe / toggleKeyframe / isAnimated", () => {
  it("adds a first keyframe with the default easing and marks the channel animated", () => {
    const t = text("t", 0, 10);
    expect(isAnimated(t, "opacity")).toBe(false);
    const next = setKeyframe(t, "opacity", 3, 0.4);
    expect(isAnimated(next, "opacity")).toBe(true);
    expect(next.keyframes?.opacity).toEqual([
      { t: 3, value: 0.4, easing: DEFAULT_EASING },
    ]);
  });

  it("updates the keyframe within half a frame instead of adding a second one", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.4);
    const next = setKeyframe(t, "opacity", 3.001, 0.9);
    expect(next.keyframes?.opacity).toHaveLength(1);
    expect(next.keyframes?.opacity?.[0]?.value).toBe(0.9);
  });

  it("returns the same reference when nothing changes", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.4);
    expect(setKeyframe(t, "opacity", 3, 0.4)).toBe(t);
  });

  it("does nothing outside the item's span", () => {
    const t = text("t", 2, 5); // post [2, 7]
    expect(setKeyframe(t, "opacity", 20, 0.4)).toBe(t);
  });

  it("removing the last keyframe folds its value into the static field", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.4);
    const next = removeKeyframe(t, "opacity", 3);
    expect(isAnimated(next, "opacity")).toBe(false);
    expect(next.opacity).toBe(0.4);
    expect(next.keyframes).toBeUndefined();
  });

  it("removing a keyframe that isn't there is a no-op", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.4);
    expect(removeKeyframe(t, "opacity", 8)).toBe(t);
    expect(removeKeyframe(text("t", 0, 10), "opacity", 3)).toEqual(
      text("t", 0, 10)
    );
  });

  it("toggles a keyframe on, then off", () => {
    const t = text("t", 0, 10);
    const on = toggleKeyframe(t, "box", 4);
    expect(isAnimated(on, "box")).toBe(true);
    const off = toggleKeyframe(on, "box", 4);
    expect(isAnimated(off, "box")).toBe(false);
    expect(off.box).toEqual(t.box);
  });

  it("removeKeyframesAt clears whichever channels have a keyframe at s", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "box", 3, t.box);
    t = setKeyframe(t, "opacity", 3, 0.5);
    const next = removeKeyframesAt(t, 3);
    expect(isAnimated(next, "box")).toBe(false);
    expect(isAnimated(next, "opacity")).toBe(false);
  });

  it("keyframeIndexAt finds the nearest keyframe within half a frame, else -1", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.4);
    expect(keyframeIndexAt(t, "opacity", 3)).toBe(0);
    expect(keyframeIndexAt(t, "opacity", 3.5)).toBe(-1);
    expect(keyframeIndexAt(t, "box", 3)).toBe(-1);
  });

  it("treats an empty keyframe list as not animated", () => {
    const t = text("t", 0, 10, { keyframes: { opacity: [] } });
    expect(isAnimated(t, "opacity")).toBe(false);
  });
});

describe("channelValueAt sampling", () => {
  it("clamps to the first/last keyframe's value outside their range", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 3, 0.3);
    t = setKeyframe(t, "opacity", 7, 0.7);
    expect(opacityAt(t, 0)).toBe(0.3);
    expect(opacityAt(t, 10)).toBe(0.7);
  });

  it("eases between two keyframes with the default ease-in-out bezier", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "opacity", 0, 0);
    t = setKeyframe(t, "opacity", 10, 1);
    expect(t.keyframes?.opacity?.[0]?.easing).toEqual(DEFAULT_EASING);
    expect(opacityAt(t, 0)).toBe(0);
    expect(opacityAt(t, 10)).toBe(1);
    expect(opacityAt(t, 5)).toBeCloseTo(0.5, 5);
    // ease-in-out is slow off the first keyframe and slow into the last.
    expect(opacityAt(t, 2.5)).toBeLessThan(0.25);
    expect(opacityAt(t, 7.5)).toBeGreaterThan(0.75);
  });

  it("holds the previous value until the next keyframe under a hold segment", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 8, 0.9);
    t = setSegmentEasing(t, "opacity", 2, "hold");
    expect(opacityAt(t, 2)).toBe(0.2);
    expect(opacityAt(t, 5)).toBe(0.2);
    expect(opacityAt(t, 7.999)).toBe(0.2);
    expect(opacityAt(t, 8)).toBe(0.9);
  });

  it("clamps an overshoot-eased sample back into the channel's range", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 0, 0.5);
    t = setKeyframe(t, "opacity", 10, 1);
    t = setSegmentEasing(t, "opacity", 0, EASING_PRESETS.overshoot);
    // Overshoot peaks near p = 0.6 at ~1.1 (see the easing presets test
    // below), which would lerp opacity past 1; the reader clamps it back.
    expect(opacityAt(t, 6)).toBe(1);
  });

  it("reads the static field when the channel has no keyframes", () => {
    const t = text("t", 0, 10, { opacity: 0.42 });
    expect(opacityAt(t, 5)).toBe(0.42);
  });

  it("framingAt reads a video's framing channel", () => {
    let v = video("v", { sourceIn: 0, sourceOut: 10 });
    v = setKeyframe(v, "framing", 0, {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    v = setKeyframe(v, "framing", 10, {
      zoom: 3,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    expect(framingAt(v, 5).zoom).toBeCloseTo(2, 5);
  });

  it("turns the short way between keys across -180..180", () => {
    const at = (rotation: number) => ({ zoom: 1, panX: 0, panY: 0, rotation });
    const linear = EASING_PRESETS.linear;
    const v = video("v", {
      sourceIn: 0,
      sourceOut: 10,
      keyframes: {
        framing: [
          { t: 0, value: at(-180), easing: linear },
          { t: 4, value: at(175), easing: linear },
          { t: 10, value: at(-90), easing: linear },
        ],
      },
    });

    // 5 degrees back, not 355 forward.
    expect(framingAt(v, 2).rotation).toBeCloseTo(177.5, 6);
    // From 175 on to -90 is 95 degrees forward across the seam.
    expect(framingAt(v, 7).rotation).toBeCloseTo(-137.5, 6);
  });

  it("turns a box the short way between keys and drops the turn once straight", () => {
    const at = (turn?: number) => ({
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.4,
      ...(turn === undefined ? {} : { turn }),
    });
    const linear = EASING_PRESETS.linear;
    const t = text("t", 0, 10, {
      keyframes: {
        box: [
          { t: 0, value: at(170), easing: linear },
          { t: 4, value: at(-170), easing: linear },
          { t: 10, value: at(), easing: linear },
        ],
      },
    });

    // 20 degrees on through 180, not 340 back.
    expect(boxAt(t, 1).turn).toBeCloseTo(175, 6);
    expect(boxAt(t, 3).turn).toBeCloseTo(-175, 6);
    // A key with no turn is straight, so the blend runs to 0.
    expect(boxAt(t, 7).turn).toBeCloseTo(-85, 6);
    expect(boxAt(t, 10)).not.toHaveProperty("turn");
  });

  it("boxAt reads any kind's box channel", () => {
    let t = setKeyframe(text("t", 0, 10), "box", 0, {
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
    t = setKeyframe(t, "box", 10, { x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(boxAt(t, 0).x).toBe(0);
    expect(boxAt(t, 10).x).toBe(0.5);
  });

  it("channelValueAt is the same reader framingAt/boxAt/opacityAt specialize", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 5, 0.6);
    expect(channelValueAt(t, "opacity", 5)).toBe(opacityAt(t, 5));
  });
});

describe("clampChannelValue", () => {
  it("clamps opacity to [0, 1]", () => {
    expect(clampChannelValue("opacity", 1.5)).toBe(1);
    expect(clampChannelValue("opacity", -0.5)).toBe(0);
  });

  it("clamps a box back inside the frame", () => {
    expect(
      clampChannelValue("box", { x: 0.9, y: 0, width: 0.5, height: 0.5 })
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
  });

  it("wraps a box's turn and drops it when the box is straight again", () => {
    const at = { x: 0, y: 0, width: 0.5, height: 0.5 };
    expect(clampChannelValue("box", { ...at, turn: 270 })).toEqual({
      ...at,
      turn: -90,
    });
    expect(clampChannelValue("box", { ...at, turn: 360 })).toEqual(at);
    expect(clampChannelValue("box", { ...at, turn: 0 })).toEqual(at);
  });

  it("clamps a framing's zoom and wraps its rotation", () => {
    const framing = clampChannelValue("framing", {
      zoom: 10,
      panX: 0,
      panY: 0,
      rotation: 270,
    });
    expect(framing.zoom).toBe(POST_MAX_ZOOM);
    expect(framing.rotation).toBe(-90);
  });
});

describe("sameChannelValue", () => {
  it("compares opacity, box and framing by value, not reference", () => {
    expect(sameChannelValue("opacity", 0.5, 0.5)).toBe(true);
    expect(sameChannelValue("opacity", 0.5, 0.6)).toBe(false);
    const box = { x: 0, y: 0, width: 1, height: 1 };
    expect(sameChannelValue("box", box, { ...box })).toBe(true);
    expect(sameChannelValue("box", box, { ...box, x: 0.1 })).toBe(false);
    expect(sameChannelValue("box", box, { ...box, turn: 10 })).toBe(false);
    expect(sameChannelValue("box", box, { ...box, turn: 0 })).toBe(true);
    const framing = { zoom: 1, panX: 0, panY: 0, rotation: 0 };
    expect(sameChannelValue("framing", framing, { ...framing })).toBe(true);
    expect(
      sameChannelValue("framing", framing, { ...framing, rotation: 1 })
    ).toBe(false);
  });
});

describe("adjacentKeyframeSeconds", () => {
  it("finds the nearest in-view keyframe strictly before or after s", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 8, 0.8);
    expect(adjacentKeyframeSeconds(t, "opacity", 5, "previous")).toBe(2);
    expect(adjacentKeyframeSeconds(t, "opacity", 5, "next")).toBe(8);
    expect(adjacentKeyframeSeconds(t, "opacity", 1, "previous")).toBeNull();
    expect(adjacentKeyframeSeconds(t, "opacity", 9, "next")).toBeNull();
  });

  it("returns null on an unanimated channel", () => {
    const t = text("t", 0, 10);
    expect(adjacentKeyframeSeconds(t, "opacity", 5, "previous")).toBeNull();
  });
});

describe("keyframeMarkers", () => {
  it("merges same-instant keyframes across channels into one marker", () => {
    let v = video("v", { sourceIn: 0, sourceOut: 10 });
    v = setKeyframe(v, "framing", 0, {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    v = setKeyframe(v, "opacity", 0, 1);
    v = setKeyframe(v, "framing", 10, {
      zoom: 2,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    const markers = keyframeMarkers(v);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.seconds).toBe(0);
    expect(markers[0]?.channels).toHaveLength(2);
    expect(markers[0]?.channels).toEqual(
      expect.arrayContaining(["framing", "opacity"])
    );
    expect(markers[1]).toEqual({ seconds: 10, channels: ["framing"] });
  });

  it("is empty for an item with no keyframes", () => {
    expect(keyframeMarkers(text("t", 0, 10))).toEqual([]);
  });
});

describe("segmentAt", () => {
  it("finds the segment a time falls inside, or that a keyframe departs into or arrives from", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "box", 0, t.box);
    t = setKeyframe(t, "box", 5, t.box);
    t = setKeyframe(t, "box", 10, t.box);
    expect(segmentAt(t, "box", 2)).toMatchObject({
      fromSeconds: 0,
      toSeconds: 5,
      index: 0,
    });
    // On the middle keyframe: the segment it departs into.
    expect(segmentAt(t, "box", 5)).toMatchObject({
      fromSeconds: 5,
      toSeconds: 10,
      index: 1,
    });
    // On the last keyframe: the segment arriving into it.
    expect(segmentAt(t, "box", 10)).toMatchObject({
      fromSeconds: 5,
      toSeconds: 10,
      index: 1,
    });
    expect(segmentAt(t, "box", -1)).toBeNull();
    expect(segmentAt(t, "box", 20)).toBeNull();
  });

  it("is null with fewer than two keyframes", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 0, 0.2);
    expect(segmentAt(t, "opacity", 0)).toBeNull();
    expect(segmentAt(text("t", 0, 10), "box", 0)).toBeNull();
  });
});

describe("setSegmentEasing", () => {
  it("sets the departing keyframe's easing for the segment under s", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "opacity", 0, 0);
    t = setKeyframe(t, "opacity", 10, 1);
    t = setSegmentEasing(t, "opacity", 5, EASING_PRESETS.linear);
    expect(t.keyframes?.opacity?.[0]?.easing).toEqual(EASING_PRESETS.linear);
    expect(opacityAt(t, 2.5)).toBeCloseTo(0.25, 6);
    expect(opacityAt(t, 7.5)).toBeCloseTo(0.75, 6);
  });

  it("is a no-op with fewer than two keyframes or the same easing already set", () => {
    const single = setKeyframe(text("t", 0, 10), "opacity", 0, 0.2);
    expect(setSegmentEasing(single, "opacity", 0, EASING_PRESETS.linear)).toBe(
      single
    );
    let t = setKeyframe(text("t", 0, 10), "opacity", 0, 0);
    t = setKeyframe(t, "opacity", 10, 1);
    // Already DEFAULT_EASING (ease-in-out).
    expect(
      setSegmentEasing(t, "opacity", 5, EASING_PRESETS["ease-in-out"])
    ).toBe(t);
  });
});

describe("writeChannelValue: the auto-key rule", () => {
  it("writes the static field while the channel has no keyframes", () => {
    const t = text("t", 0, 10);
    const next = writeChannelValue(t, "opacity", 5, 0.3);
    expect(isAnimated(next, "opacity")).toBe(false);
    expect(next.opacity).toBe(0.3);
  });

  it("writes a keyframe once the channel is animated", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 0, 1);
    t = writeChannelValue(t, "opacity", 5, 0.3);
    expect(isAnimated(t, "opacity")).toBe(true);
    expect(t.keyframes?.opacity).toHaveLength(2);
    expect(opacityAt(t, 5)).toBeCloseTo(0.3, 9);
  });
});

describe("clearChannel", () => {
  it("un-animates a channel, freezing the static field at s's sampled value", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 0, 0.2);
    t = setKeyframe(t, "opacity", 10, 1);
    const sampledAtFive = opacityAt(t, 5);
    const next = clearChannel(t, "opacity", 5);
    expect(isAnimated(next, "opacity")).toBe(false);
    expect(next.opacity).toBeCloseTo(sampledAtFive, 9);
  });

  it("is a no-op when the channel is not animated", () => {
    const t = text("t", 0, 10);
    expect(clearChannel(t, "opacity", 5)).toBe(t);
  });

  it("freezes at the visible edge when trimmed media has hidden source keys", () => {
    const v = video("v", {
      start: 4,
      sourceIn: 4,
      sourceOut: 8,
      speed: 2,
      keyframes: {
        opacity: [
          { t: 0, value: 0, easing: EASING_PRESETS.linear },
          { t: 4, value: 0.4, easing: EASING_PRESETS.linear },
          { t: 8, value: 0.8, easing: EASING_PRESETS.linear },
          { t: 12, value: 1, easing: EASING_PRESETS.linear },
        ],
      },
    });
    expect(clearChannel(v, "opacity", 0).opacity).toBeCloseTo(0.4);
    expect(clearChannel(v, "opacity", 20).opacity).toBeCloseTo(0.8);
    expect(clearChannel(v, "opacity", 5).opacity).toBeCloseTo(0.6);
  });

  it("clears all channels while preserving non-keyframe timing fields", () => {
    let v = video("v", { sourceIn: 2, sourceOut: 12, speed: 2 });
    v = setKeyframe(v, "opacity", 0, 0.2);
    v = setKeyframe(v, "opacity", 5, 0.8);
    v = setKeyframe(v, "framing", 0, {
      zoom: 1,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    v = setKeyframe(v, "framing", 5, {
      zoom: 2,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    expect(keyframeCount(v)).toBe(4);
    const next = clearItemKeyframes(v, 2.5);
    expect(keyframeCount(next)).toBe(0);
    expect(next.opacity).toBeCloseTo(0.5);
    expect(next.kind === "video" && next.zoom).toBeCloseTo(1.5);
    expect(next.kind === "video" && next.speed).toBe(2);
    expect(clearItemKeyframes(next, 2.5)).toBe(next);
  });
});

describe("shiftKeyframes", () => {
  it("shifts box and opacity keyframes by -headCut", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 4, 0.5);
    t = setKeyframe(t, "opacity", 8, 1);
    const shifted = shiftKeyframes(t, 3);
    expect(shifted.keyframes?.opacity?.map((k) => k.t)).toEqual([1, 5]);
  });

  it("never shifts a video item's keyframes - they already ride the take's clock", () => {
    let v = video("v", { sourceIn: 0, sourceOut: 10 });
    v = setKeyframe(v, "framing", 3, {
      zoom: 2,
      panX: 0,
      panY: 0,
      rotation: 0,
    });
    expect(shiftKeyframes(v, 3)).toBe(v);
  });

  it("is a no-op with headCut 0 or no keyframes at all", () => {
    const t = text("t", 0, 10);
    expect(shiftKeyframes(t, 0)).toBe(t);
    expect(shiftKeyframes(t, 3)).toBe(t);
  });
});

describe("moveKeyframes", () => {
  it("moves every channel's keyframe at fromS to toS", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "opacity", 2, 0.2);
    t = setKeyframe(t, "box", 2, t.box);
    const moved = moveKeyframes(t, 2, 6);
    expect(moved.keyframes?.opacity?.[0]?.t).toBe(6);
    expect(moved.keyframes?.box?.[0]?.t).toBe(6);
  });

  it("clamps the destination to the item's span", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 8, 0.8);
    const moved = moveKeyframes(t, 2, 50); // past the item's end at post 10
    expect(moved.keyframes?.opacity).toEqual([
      { t: 8, value: 0.8, easing: DEFAULT_EASING },
      { t: 10, value: 0.2, easing: DEFAULT_EASING },
    ]);
  });

  it("replaces a keyframe already at the landing time", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 6, 0.6);
    const moved = moveKeyframes(t, 2, 6);
    expect(moved.keyframes?.opacity).toEqual([
      { t: 6, value: 0.2, easing: DEFAULT_EASING },
    ]);
  });

  it("is a no-op for a channel with no keyframe at fromS", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    expect(moveKeyframes(t, 5, 6)).toBe(t);
  });
});

describe("moveKeyframe", () => {
  it("moves only the named channel's keyframe", () => {
    let t = text("t", 0, 10);
    t = setKeyframe(t, "opacity", 2, 0.2);
    t = setKeyframe(t, "box", 2, t.box);
    const moved = moveKeyframe(t, "opacity", 2, 6);
    expect(moved.keyframes?.opacity?.[0]?.t).toBe(6);
    expect(moved.keyframes?.box?.[0]?.t).toBe(2);
  });

  it("keeps the moved keyframe's value and easing", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 8, 0.8);
    t = setSegmentEasing(t, "opacity", 2, "hold");
    const moved = moveKeyframe(t, "opacity", 2, 4);
    expect(moved.keyframes?.opacity?.[0]).toEqual({
      t: 4,
      value: 0.2,
      easing: "hold",
    });
  });

  it("returns the same item when nothing moves", () => {
    const t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    expect(moveKeyframe(t, "opacity", 2, 2)).toBe(t);
    expect(moveKeyframe(t, "box", 2, 6)).toBe(t);
  });
});

describe("channelKeyframeSeconds / channelSegments", () => {
  it("lists one channel's in-view keyframes in post seconds, earliest first", () => {
    let t = text("t", 2, 10); // spans post [2, 12]
    t = setKeyframe(t, "opacity", 9, 0.9);
    t = setKeyframe(t, "opacity", 3, 0.3);
    t = setKeyframe(t, "box", 5, t.box);
    expect(channelKeyframeSeconds(t, "opacity")).toEqual([3, 9]);
    expect(channelKeyframeSeconds(t, "box")).toEqual([5]);
    expect(channelKeyframeSeconds(text("u", 0, 5), "opacity")).toEqual([]);
  });

  it("leaves out a video keyframe a trim has pushed out of view", () => {
    let v = video("v", { sourceIn: 0, sourceOut: 10, speed: 1 });
    v = setKeyframe(v, "framing", 2);
    v = setKeyframe(v, "framing", 8);
    const trimmed = { ...v, sourceIn: 4, duration: 6 };
    expect(channelKeyframeSeconds(trimmed, "framing")).toEqual([4]);
  });

  it("gives every segment with its departing easing, even partly out of view", () => {
    let t = setKeyframe(text("t", 0, 10), "opacity", 2, 0.2);
    t = setKeyframe(t, "opacity", 5, 0.5);
    t = setKeyframe(t, "opacity", 8, 0.8);
    t = setSegmentEasing(t, "opacity", 6, "hold");
    expect(channelSegments(t, "opacity")).toEqual([
      { fromSeconds: 2, toSeconds: 5, easing: DEFAULT_EASING, index: 0 },
      { fromSeconds: 5, toSeconds: 8, easing: "hold", index: 1 },
    ]);
    expect(
      channelSegments(
        setKeyframe(text("u", 0, 5), "opacity", 1, 0.1),
        "opacity"
      )
    ).toEqual([]);
  });
});

describe("easing presets", () => {
  it("gives the timeline and curve editor control points without changing sampled easing", () => {
    const native = {
      kind: "sampled-bezier" as const,
      curve: [0.3, 0, 0.7, 1] as [number, number, number, number],
      samples: 300 as const,
    };
    expect(easingControlPoints(native)).toEqual([0.3, 0, 0.7, 1]);
    expect(easingControlPoints(EASING_PRESETS.linear)).toEqual([0, 0, 1, 1]);
    expect(easingControlPoints("hold")).toBeNull();
    expect(native.kind).toBe("sampled-bezier");
  });
  it("DEFAULT_EASING is the ease-in-out preset", () => {
    expect(DEFAULT_EASING).toEqual(EASING_PRESETS["ease-in-out"]);
  });

  it("easingPresetOf recognizes every named preset and falls back to custom", () => {
    for (const id of Object.keys(EASING_PRESETS) as PostEasingPresetId[]) {
      expect(easingPresetOf(EASING_PRESETS[id])).toBe(id);
    }
    expect(easingPresetOf([0.1, 0.2, 0.3, 0.4])).toBe("custom");
  });

  it("sampleEasing: linear is close to an exact identity", () => {
    // cubic-bezier(0,0,1,1) is an exact identity in continuous math: x(t) and
    // y(t) share the same coefficients, so whatever t solves x(t)=p also gives
    // y(t)=p. cssCubicBezier's Newton-Raphson only inverts x(t) to within 1e-5
    // before reading y(t) off it though, so the sampled value is close to p,
    // not bit-exact.
    for (const p of [0, 0.1, 0.37, 0.5, 0.82, 1]) {
      expect(sampleEasing(EASING_PRESETS.linear, p)).toBeCloseTo(p, 4);
    }
  });

  it("sampleEasing: hold steps at the end instead of easing", () => {
    expect(sampleEasing("hold", 0)).toBe(0);
    expect(sampleEasing("hold", 0.99)).toBe(0);
    expect(sampleEasing("hold", 1)).toBe(1);
  });

  it("sampleEasing: ease-in-out is symmetric about the midpoint", () => {
    expect(sampleEasing(EASING_PRESETS["ease-in-out"], 0.5)).toBeCloseTo(
      0.5,
      6
    );
    expect(sampleEasing(EASING_PRESETS["ease-in-out"], 0.25)).toBeLessThan(
      0.25
    );
    expect(sampleEasing(EASING_PRESETS["ease-in-out"], 0.75)).toBeGreaterThan(
      0.75
    );
  });

  it("sampleEasing: overshoot can leave [0, 1] before settling at 1", () => {
    const values = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) =>
      sampleEasing(EASING_PRESETS.overshoot, p)
    );
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(sampleEasing(EASING_PRESETS.overshoot, 0)).toBe(0);
    expect(sampleEasing(EASING_PRESETS.overshoot, 1)).toBe(1);
  });

  it("sampleEasing clamps p outside [0, 1]", () => {
    expect(sampleEasing(EASING_PRESETS.linear, -1)).toBe(0);
    expect(sampleEasing(EASING_PRESETS.linear, 2)).toBe(1);
  });
});
