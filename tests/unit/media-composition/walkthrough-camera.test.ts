import { describe, expect, it } from "vitest";
import {
  calculateMediaFit,
  resolvePanOffset,
} from "#lib/shared/media-composition/services/media-fit.js";
import {
  WIDE,
  cameraKeyframes,
  cameraSampler,
  framingForRegion,
  framingForView,
  planShots,
  scheduleMoves,
  splitKeyframes,
  toOutput,
  viewOfFraming,
  type CameraBeat,
  type CameraMove,
} from "#lib/shared/media-composition/domain/walkthrough-camera.js";

const W = 1920;
const H = 1080;

/** Where the compositor draws a take point for a framing, in output pixels. */
function compositorPoint(
  framing: { zoom: number; panX: number; panY: number },
  u: number,
  v: number
) {
  const fit = calculateMediaFit({
    sourceWidth: W,
    sourceHeight: H,
    regionWidth: W,
    regionHeight: H,
    fit: "cover",
  });
  const pan = resolvePanOffset({
    drawWidth: fit.drawRect.width,
    drawHeight: fit.drawRect.height,
    regionWidth: W,
    regionHeight: H,
    scale: framing.zoom,
    translateX: framing.panX,
    translateY: framing.panY,
  });
  // applyLayerTransform: about the region's centre, pan then scale.
  return {
    x: W / 2 + pan.x + framing.zoom * (fit.drawRect.x + u * W - W / 2),
    y: H / 2 + pan.y + framing.zoom * (fit.drawRect.y + v * H - H / 2),
  };
}

// The three Level buttons along the top of the Generate page, as shares.
const level = (x: number) => ({
  x: x / W,
  y: 34 / H,
  width: 150 / W,
  height: 30 / H,
});
const generateButton = {
  x: 1480 / W,
  y: 855 / H,
  width: 170 / W,
  height: 40 / H,
};

describe("framing geometry", () => {
  it.each([1.25, 1.6, 2])("agrees with the compositor at zoom %s", (zoom) => {
    for (const [cx, cy] of [
      [0.5, 0.5],
      [0.7, 0.3],
      [0.2, 0.85],
    ] as const) {
      const framing = framingForView(cx, cy, zoom);
      for (const [u, v] of [
        [cx, cy],
        [0.1, 0.9],
        [0.95, 0.05],
      ] as const) {
        const ours = toOutput(framing, { x: u, y: v });
        const drawn = compositorPoint(framing, u, v);
        expect(ours.x * W).toBeCloseTo(drawn.x, 6);
        expect(ours.y * H).toBeCloseTo(drawn.y, 6);
      }
    }
  });

  it("centres the view on the point when the edges allow", () => {
    const framing = framingForView(0.6, 0.4, 2);
    const centre = toOutput(framing, { x: 0.6, y: 0.4 });
    expect(centre.x).toBeCloseTo(0.5);
    expect(centre.y).toBeCloseTo(0.5);
    const view = viewOfFraming(framing);
    expect(view.x + view.width / 2).toBeCloseTo(0.6);
    expect(view.width).toBeCloseTo(0.5);
  });

  it("stops at the frame's edge for a point near the corner", () => {
    const framing = framingForView(0.98, 0.03, 2);
    expect(framing.panX).toBe(-0.5);
    expect(framing.panY).toBe(0.5);
    const view = viewOfFraming(framing);
    expect(view.x + view.width).toBeCloseTo(1);
    expect(view.y).toBeCloseTo(0);
  });

  it("zooms out to fit a target too big for the cap", () => {
    const wideTarget = { x: 0.1, y: 0.2, width: 0.6, height: 0.2 };
    expect(framingForRegion(wideTarget, 2).zoom).toBeCloseTo(1 / 0.7);
    expect(framingForRegion({ ...wideTarget, width: 0.95 }, 2)).toEqual(WIDE);
  });
});

describe("planShots", () => {
  it("frames the three Level buttons as one shot", () => {
    const beats: CameraBeat[] = [
      { kind: "close", time: 10, region: level(1300), newShot: true },
      { kind: "close", time: 14, region: level(1470) },
      { kind: "close", time: 18, region: level(1640) },
    ];
    const shots = planShots(beats, 2);
    expect(shots).toHaveLength(1);
    expect(shots[0]!.framing.zoom).toBe(2);
    const view = viewOfFraming(shots[0]!.framing);
    expect(view.x).toBeLessThanOrEqual(1300 / W);
    expect(view.x + view.width).toBeGreaterThanOrEqual(1790 / W);
  });

  it("gives far-apart targets their own shots", () => {
    const shots = planShots(
      [
        { kind: "close", time: 10, region: level(1300) },
        { kind: "close", time: 12, region: generateButton },
      ],
      2
    );
    expect(shots).toHaveLength(2);
  });

  it("starts a new shot after a long pause, a pull out or a chapter", () => {
    const close = (time: number, newShot = false): CameraBeat => ({
      kind: "close",
      time,
      region: level(1300),
      newShot,
    });
    expect(planShots([close(0), close(7)], 2)).toHaveLength(2);
    expect(planShots([close(0), close(2, true)], 2)).toHaveLength(2);
    const pulled = planShots(
      [close(0), { kind: "wide", time: 1, startAt: 1.2 }, close(3)],
      2
    );
    expect(pulled.map((shot) => shot.kind)).toEqual(["close", "wide", "close"]);
  });

  it("merges back-to-back pull outs", () => {
    const shots = planShots(
      [
        { kind: "wide", time: 1, startAt: 1.2 },
        { kind: "wide", time: 2, startAt: 2 },
      ],
      2
    );
    expect(shots).toHaveLength(1);
  });
});

describe("scheduleMoves", () => {
  it("lands a close move 0.3 s before its click over 0.8 s", () => {
    const shots = planShots(
      [{ kind: "close", time: 10, region: level(1300) }],
      2
    );
    const { moves, warnings } = scheduleMoves(shots, 7);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.start).toBeCloseTo(8.9);
    expect(moves[0]!.end).toBeCloseTo(9.7);
    expect(moves[0]!.from).toEqual(WIDE);
    expect(warnings).toEqual([]);
  });

  it("starts a crowded move when the last one ends and warns when it is late", () => {
    const shots = planShots(
      [
        { kind: "close", time: 10, region: level(1300) },
        { kind: "wide", time: 10, startAt: 10.2 },
        { kind: "close", time: 10.7, region: generateButton },
      ],
      2
    );
    const { moves, warnings } = scheduleMoves(shots, 7);
    expect(moves).toHaveLength(3);
    expect(moves[1]!.start).toBeCloseTo(10.2);
    expect(moves[1]!.end).toBeCloseTo(11);
    expect(moves[2]!.start).toBeCloseTo(11);
    expect(moves[2]!.end).toBeCloseTo(11.4);
    expect(warnings).toHaveLength(1);
  });

  it("does not move to a framing it already has", () => {
    const { moves } = scheduleMoves(
      [{ kind: "wide", time: 3, startAt: 3, framing: WIDE }],
      0
    );
    expect(moves).toEqual([]);
  });
});

describe("keyframes", () => {
  const shots = planShots(
    [
      { kind: "close", time: 10, region: level(1300) },
      { kind: "wide", time: 12, startAt: 12.2 },
    ],
    2
  );
  const { moves } = scheduleMoves(shots, 7);
  const keys = cameraKeyframes(moves, 7);
  const sample = cameraSampler(keys);

  it("holds wide, moves in, then pulls out", () => {
    const times = keys.map((key) => Math.round(key.t * 1000) / 1000);
    for (const t of [7, 8.9, 9.7, 12.2, 13]) expect(times).toContain(t);
    // Every other key is on the way in or out.
    const inside = (t: number) => (t > 8.9 && t < 9.7) || (t > 12.2 && t < 13);
    expect(
      times.filter((t) => ![7, 8.9, 9.7, 12.2, 13].includes(t)).every(inside)
    ).toBe(true);
    // Wide is zoom 1, where the pan shows nothing.
    expect(viewOfFraming(sample(8))).toEqual(viewOfFraming(WIDE));
    expect(sample(11).zoom).toBe(2);
    expect(viewOfFraming(sample(13.5))).toEqual(viewOfFraming(WIDE));
  });

  it("moves straight to the next view instead of zooming, then sliding", () => {
    // Close to close at another zoom, across the frame, in a short move.
    const across = cameraSampler(
      cameraKeyframes(
        [
          {
            start: 1,
            end: 1.4,
            from: framingForView(0.85, 0.15, 2),
            to: framingForView(0.2, 0.7, 1.5),
          },
        ],
        0
      )
    );
    // Out to wide and straight back in somewhere else.
    const close = framingForView(0.85, 0.15, 2);
    const elsewhere = framingForView(0.2, 0.7, 1.5);
    const outAndIn = cameraSampler(
      cameraKeyframes(
        [
          { start: 1, end: 1.8, from: close, to: WIDE },
          { start: 1.8, end: 2.6, from: WIDE, to: elsewhere },
        ],
        0
      )
    );
    expect(viewOfFraming(outAndIn(1.8))).toEqual(viewOfFraming(WIDE));
    for (const [at, start, end] of [
      [sample, 8.9, 9.7],
      [sample, 12.2, 13],
      [across, 1, 1.4],
      [outAndIn, 1, 1.8],
      [outAndIn, 1.8, 2.6],
    ] as const) {
      const from = viewOfFraming(at(start));
      const to = viewOfFraming(at(end));
      const edges = (view: ReturnType<typeof viewOfFraming>) => [
        view.x,
        view.y,
        view.x + view.width,
        view.y + view.height,
      ];
      let previous = edges(from);
      for (let i = 1; i <= 200; i++) {
        const view = viewOfFraming(at(start + ((end - start) * i) / 200));
        const now = edges(view);
        // Each edge only ever moves toward where it ends up.
        now.forEach((edge, index) => {
          const goal = edges(to)[index]!;
          const before = previous[index]!;
          expect(Math.abs(goal - edge)).toBeLessThanOrEqual(
            Math.abs(goal - before) + 1e-9
          );
        });
        previous = now;
        // And the view keeps to the line between the two, within 3 px at
        // 1920 wide on the shortest move. Two keys strayed 0.05 to 0.09.
        const q = (view.width - from.width) / (to.width - from.width);
        expect(Math.abs(view.x - (from.x + (to.x - from.x) * q))).toBeLessThan(
          0.0015
        );
        expect(Math.abs(view.y - (from.y + (to.y - from.y) * q))).toBeLessThan(
          0.0015
        );
      }
    }
  });

  it("keeps two keys for a pan at one zoom, which is already straight", () => {
    const pan: CameraMove = {
      start: 1,
      end: 1.8,
      from: framingForView(0.8, 0.1, 2),
      to: framingForView(0.8, 0.9, 2),
    };
    expect(cameraKeyframes([pan], 0).map((key) => key.t)).toEqual([0, 1, 1.8]);
  });

  it("keeps every key inside the zoom and pan bounds", () => {
    for (const key of keys) {
      expect(key.value.zoom).toBeGreaterThanOrEqual(1);
      expect(key.value.zoom).toBeLessThanOrEqual(4);
      expect(Math.abs(key.value.panX)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(key.value.panY)).toBeLessThanOrEqual(0.5);
    }
  });

  it("gives a clip after a cut the framing the camera has there", () => {
    const clip = splitKeyframes(keys, 9.3, 12.5, sample);
    expect(clip[0]!.t).toBe(9.3);
    expect(clip[0]!.value).toEqual(sample(9.3));
    const times = clip.map((key) => key.t);
    expect(times.slice(0, 1)).toEqual([9.3]);
    expect(times).toContain(9.7);
    expect(times).toContain(12.2);
    expect(times.at(-1)).toBe(12.5);
    expect(times.every((t) => t >= 9.3 && t <= 12.5)).toBe(true);
    expect(clip.at(-1)!.value).toEqual(sample(12.5));
    const settled = splitKeyframes(keys, 10, 11, sample);
    expect(settled.map((key) => key.value.zoom)).toEqual([2, 2]);
  });
});
