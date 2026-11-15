import { describe, expect, it } from "vitest";
import {
  encodeCometMap,
  findBulbs,
  stampsFor,
} from "../../../../../scripts/feature-video/comet-map.mjs";
import { cometSettings } from "../../../../../scripts/feature-video/comet-settings.mjs";
import {
  COMET_REPLAY_SECONDS,
  createCometReplay,
  parseCometLightMap,
  type CometLight,
} from "./comet-light-map";
import { PostCometTrailsSchema, cometLookAt } from "./comet-trails";

const W = 160;
const H = 120;

/** A dark frame with one blown-out red bulb (white core, red rim) at x, y. */
function frameWithBulb(cx: number, cy: number): Uint8Array {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = (y * W + x) * 3;
      if (d <= 6) rgb.set([255, 255, 255], i);
      else if (d <= 10) rgb.set([240, 60, 40], i);
    }
  return rgb;
}

/** A bulb sweeping left to right at 60 frames a second. */
function sweepMap(frames = 120) {
  const out: { seconds: number; stamps: ReturnType<typeof stampsFor> }[] = [];
  let previous: ReturnType<typeof findBulbs> = [];
  let last: number | null = null;
  for (let f = 0; f < frames; f++) {
    const seconds = 10 + f / 60;
    const cx = 20 + ((f * 3) % 120);
    const bulbs = findBulbs(frameWithBulb(cx, 60), W, H);
    const dt = last === null ? 0 : seconds - last;
    out.push({ seconds, stamps: stampsFor(bulbs, previous, dt, W, H) });
    previous = bulbs;
    last = seconds;
  }
  return parseCometLightMap(
    encodeCometMap({
      width: W,
      height: H,
      sourceWidth: W * 2,
      sourceHeight: H * 2,
      frames: out,
    })
  );
}

const LOOK = { length: 0.4, gain: 0.9, taper: 1.6 };

function same(a: CometLight | null, b: CometLight | null): void {
  expect(a && { ...a, rgba: undefined }).toEqual(b && { ...b, rgba: undefined });
  if (a && b) expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
}

describe("comet light map", () => {
  it("finds a bulb by its blown-out core and keeps its red", () => {
    const bulbs = findBulbs(frameWithBulb(80, 60), W, H);
    expect(bulbs).toHaveLength(1);
    expect(bulbs[0]!.warm).toBe(true);
    expect(bulbs[0]!.cx).toBeCloseTo(80, 0);
  });

  it("ignores a pale patch with no blown-out core", () => {
    const rgb = new Uint8Array(W * H * 3).fill(200);
    expect(findBulbs(rgb, W, H)).toEqual([]);
  });

  it("reads back what it wrote, with repeats filling the gap between frames", () => {
    const map = sweepMap(10);
    expect(map.times.length).toBe(10);
    expect(map.width).toBe(W);
    expect(map.sourceWidth).toBe(W * 2);
    // Moving 3 px a frame is under the 4 px step: no repeats; the first frame has none either.
    expect(map.counts[0]).toBe(1);
  });

  it("lands a seek on the same light as playing there", () => {
    const map = sweepMap();
    const played = createCometReplay(map);
    let atEnd: CometLight | null = null;
    for (let f = 0; f < map.times.length; f++) {
      played.seek(map.times[f]!);
      if (f === map.times.length - 1) atEnd = played.light(LOOK);
    }
    const sought = createCometReplay(map);
    sought.seek(map.times[3]!);
    sought.seek(map.times[map.times.length - 1]!);
    expect(atEnd).not.toBeNull();
    same(sought.light(LOOK), atEnd);

    // Back and forth again, past the replay window and back.
    sought.seek(0);
    sought.seek(map.times[map.times.length - 1]! + 0.00005);
    same(sought.light(LOOK), atEnd);
  });

  it("keeps the replay window longer than any tail can be", () => {
    expect(COMET_REPLAY_SECONDS).toBeGreaterThan(2.5);
  });

  it("goes dark when the tail length is zero", () => {
    const replay = createCometReplay(sweepMap(30));
    replay.seek(10.4);
    expect(replay.light({ ...LOOK, length: 0 })).toBeNull();
    expect(replay.light(LOOK)).not.toBeNull();
  });
});

describe("comet look over time", () => {
  const trails = PostCometTrailsSchema.parse({
    map: "/api/dev/feature-videos/x/media/comet/a.cometmap",
    first: { length: 0.3, gain: 0.7 },
    second: { length: 0.6, gain: 0.9, at: 82.362272, seconds: 1 },
    growIn: { at: 70.512272, seconds: 0.9 },
    pullBack: { at: 93.112272, seconds: 0.8 },
  });

  it("grows in, switches and pulls back on the footage clock", () => {
    expect(cometLookAt(trails, 70).length).toBe(0);
    expect(cometLookAt(trails, 75)).toEqual({ length: 0.3, gain: 0.7 });
    const after = cometLookAt(trails, 90);
    expect(after.length).toBeCloseTo(0.6);
    expect(after.gain).toBeCloseTo(0.9);
    expect(cometLookAt(trails, 94).length).toBe(0);
  });

  it("takes clip-clock times from the command line as footage seconds", () => {
    const set = cometSettings(
      { map: trails.map, first: { length: 0.3, gain: 0.7 } },
      {
        clipStart: 65.512272,
        second: "0.6,0.9,16.85,1",
        grow: "5,0.9",
        pullBack: "27.6,0.8",
      }
    );
    expect(set.second).toEqual(trails.second);
    expect(set.growIn).toEqual(trails.growIn);
    expect(set.pullBack).toEqual(trails.pullBack);
    expect(PostCometTrailsSchema.safeParse(set).success).toBe(true);
    expect(cometSettings(set, { second: "none" }).second).toBeUndefined();
  });
});
