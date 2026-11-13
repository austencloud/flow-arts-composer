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

describe("auto frame body and Reel", () => {
  /** A still take: the same props and body at every sample. */
  function stillTake(props: FrameBox, body: FrameBox | null) {
    const times = Array.from({ length: 61 }, (_, i) => 10 + i / 15);
    return {
      times,
      mustStay: times.map(() => props),
      centreOn: times.map(() => props),
      bodyOn: times.map(() => body),
      keyTimes: [10, 11, 12, 13, 14],
      shape: 1,
      backdropLine: null,
      finalBox: null,
      flip: false,
    };
  }
  const windowAt = (keys: PostKeyframe<PostSourceGeometry>[], t: number) =>
    shownPart(geometryAt(keys, t), 9 / 16, 9 / 16);

  it("gives a standing body room and centres it while the props stay low", () => {
    const props: FrameBox = [0.44, 0.5, 0.56, 0.68];
    const body: FrameBox = [0.45, 0.42, 0.55, 0.7];
    const { keys } = solveAutoFrame(stillTake(props, body));
    const [, top, , bottom] = windowAt(keys, 12);
    const height = bottom - top;
    expect((body[3] - body[1]) / height).toBeLessThan(0.75);
    const at = ((body[1] + body[3]) / 2 - top) / height;
    expect(at).toBeGreaterThan(0.45);
    expect(at).toBeLessThan(0.65);
    // The head clear of the top, not pressed against it.
    expect((body[1] - top) / height).toBeGreaterThan(0.1);
  });

  it("lets props high above the head lead, legs and all", () => {
    const props: FrameBox = [0.35, 0.12, 0.65, 0.5];
    const body: FrameBox = [0.45, 0.4, 0.55, 0.78];
    const alone = windowAt(solveAutoFrame(stillTake(props, null)).keys, 12);
    const withBody = windowAt(solveAutoFrame(stillTake(props, body)).keys, 12);
    // The body doesn't widen the window to keep the feet.
    expect(withBody[2] - withBody[0]).toBeLessThan((alone[2] - alone[0]) * 1.05);
    expect(withBody[3]).toBeLessThan(body[3]);
  });

  it("lets a bright ceiling hide under a Reel's header but no lower", () => {
    // Props wanted low in the window, so it would rise into the ceiling if it could.
    const take = { ...stillTake([0.4, 0.3, 0.6, 0.5], null), backdropLine: 0.28, settings: { centreYAt: 0.8 } };
    const covered = { top: 140 / 1920, bottom: 360 / 1920 };
    const plain = solveAutoFrame(take).keys;
    const reel = solveAutoFrame({ ...take, covered }).keys;
    for (const t of take.times) {
      expect(windowAt(plain, t)[1]).toBeGreaterThan(0.28 - 0.005);
      const [, top, , bottom] = windowAt(reel, t);
      expect(top + covered.top * (bottom - top)).toBeGreaterThan(0.28 - 0.005);
    }
    // Under the header, the window itself reaches above the line.
    expect(windowAt(reel, 12)[1]).toBeLessThan(0.28 - 0.01);
  });

  it("keeps staff ends hanging by the feet above a Reel's caption", () => {
    // The 20 s moment of his DCK take: standing, both staffs pointing down to the floor.
    const props: FrameBox = [0.48, 0.52, 0.56, 0.68];
    const body: FrameBox = [0.42, 0.41, 0.58, 0.69];
    const covered = { top: 140 / 1920, bottom: 360 / 1920 };
    const { keys } = solveAutoFrame({ ...stillTake(props, body), covered });
    for (const t of [10, 12, 14]) {
      const [, top, , bottom] = windowAt(keys, t);
      expect((props[3] - top) / (bottom - top)).toBeLessThan(1 - covered.bottom);
      // By zooming out, not by sliding down until the head meets the header.
      expect((body[1] - top) / (bottom - top)).toBeGreaterThan(covered.top + 0.08);
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
