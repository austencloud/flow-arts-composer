import { describe, expect, it } from "vitest";
import { sampleEasing, type PostKeyframe, type PostSourceGeometry } from "@austencloud/video-editor/core";
import {
  autoFrameKeyTimes,
  findBackdropLine,
  propsCutShare,
  shownPart,
  solveAutoFrame,
  type FrameBox,
} from "#lib/shared/media-composition/domain/auto-frame.js";

/** The framing at time t, eased as the renderer does: the leaving key's ease. */
function geometryAt(keys: PostKeyframe<PostSourceGeometry>[], t: number): PostSourceGeometry {
  if (t <= keys[0]!.t) return keys[0]!.value;
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t > b.t) continue;
    const w = a.easing === "hold" ? 0 : sampleEasing(a.easing, (t - a.t) / (b.t - a.t));
    const mix = (k: "x" | "y" | "width" | "height") => a.value[k] + (b.value[k] - a.value[k]) * w;
    return { ...a.value, x: mix("x"), y: mix("y"), width: mix("width"), height: mix("height") };
  }
  return keys[keys.length - 1]!.value;
}

/** A take where the props drift left to right and grow, sampled 15 times a second. */
function driftingTake() {
  const times: number[] = [];
  const props: FrameBox[] = [];
  for (let i = 0; i <= 150; i++) {
    const t = 10 + i / 15;
    const s = i / 150;
    times.push(t);
    props.push([0.25 + 0.2 * s, 0.35 - 0.05 * s, 0.5 + 0.25 * s, 0.6 + 0.05 * s]);
  }
  const keyTimes = Array.from({ length: 9 }, (_, k) => 10 + (k * 10) / 8);
  return { times, props, keyTimes };
}

describe("auto frame key times", () => {
  it("uses the landings inside the clip and pads the clip's ends", () => {
    const landings = Array.from({ length: 14 }, (_, k) => 21 + k);
    const { times, from } = autoFrameKeyTimes(20, 36, [3, ...landings, 80], 16);
    expect(from).toBe("landings");
    expect(times).toEqual([20, ...landings, 36]);
  });

  it("cuts the clip into even moves when the take has too few landings", () => {
    const { times, from } = autoFrameKeyTimes(0, 16, [1, 2, 3], 16);
    expect(from).toBe("even");
    expect(times).toHaveLength(17);
    expect(times[0]).toBe(0);
    expect(times[16]).toBe(16);
  });
});

describe("auto frame solve", () => {
  const take = driftingTake();
  const solve = (flip: boolean) =>
    solveAutoFrame({
      times: take.times,
      mustStay: take.props,
      centreOn: take.props,
      keyTimes: take.keyTimes,
      shape: 1,
      backdropLine: null,
      finalBox: null,
      flip,
    });

  it("zooms in and keeps the props on screen along the eased path", () => {
    const { keys } = solve(false);
    expect(keys.map((key) => key.t)).toEqual(take.keyTimes);
    // Zoomed in: the window is smaller than the footage.
    const shown = (t: number) => shownPart(geometryAt(keys, t), 9 / 16, 9 / 16);
    const widths = take.times.map((t) => {
      const w = shown(t);
      return w[2] - w[0];
    });
    expect(Math.max(...widths)).toBeLessThan(0.9);
    expect(propsCutShare(take.times, take.props, shown)).toBe(0);
    // Nothing outside the footage is shown.
    for (const t of take.times) {
      const w = shown(t);
      expect(w[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(w[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(w[2]).toBeLessThanOrEqual(1 + 1e-6);
      expect(w[3]).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("mirrors the keys for a flipped clip so the same footage shows", () => {
    const plain = solve(false).keys;
    const flipped = solve(true).keys;
    flipped.forEach((key, i) => {
      const p = plain[i]!.value;
      expect(key.value.x).toBeCloseTo(1 - p.x - p.width, 9);
      const a = shownPart(key.value, 9 / 16, 9 / 16, true);
      const b = shownPart(p, 9 / 16, 9 / 16, false);
      a.forEach((v, k) => expect(v).toBeCloseTo(b[k]!, 9));
    });
  });

  it("keeps the window top under a ceiling line", () => {
    const { keys } = solveAutoFrame({
      times: take.times,
      mustStay: take.props,
      centreOn: take.props,
      keyTimes: take.keyTimes,
      shape: 1,
      backdropLine: 0.28,
      finalBox: null,
      flip: false,
    });
    for (const t of take.times) {
      expect(shownPart(geometryAt(keys, t), 9 / 16, 9 / 16)[1]).toBeGreaterThan(0.28 - 0.01);
    }
  });
});

describe("backdrop line", () => {
  it("finds where a bright ceiling meets a dark backdrop", () => {
    const rows = Array.from({ length: 480 }, (_, r) => (r < 98 ? 190 : 12));
    // Just below the edge, so the window clears it.
    expect(findBackdropLine(rows)).toBeCloseTo(98 / 480 + 0.015, 3);
  });

  it("finds none on an evenly lit stage", () => {
    expect(findBackdropLine(Array.from({ length: 480 }, () => 120))).toBeNull();
  });
});
