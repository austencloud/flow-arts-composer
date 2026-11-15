import { describe, expect, it } from "vitest";
import {
  POST_LIFT_DEFAULTS,
  STEP_NUMBER_ANCHOR,
  normalizePanelLift,
  panelLiftAmount,
  panelLiftBar,
  panelLiftLayout,
  type PostPanelLift,
} from "./post-panel-lift";
import { splitPlacementFrame } from "./post-animation-split";
import { GLYPH_OVERLAY_BASE_SIZE } from "#lib/shared/animation-engine/domain/glyph-overlay-frame.js";

/** The Reel's bottom half: a 1080 x 960 box, its strip 8 px high. */
const BOX = { width: 1080, height: 960, barHeight: 8 };
/** The hand-made cut's lift, on the clip's own clock. */
const CUT: PostPanelLift = {
  ...POST_LIFT_DEFAULTS,
  inAt: 5.33,
  inSeconds: 0.8,
  outAt: 27.73,
  outSeconds: 0.7,
};

/** Where the animator's step number lands for a layout: scene point to box. */
function drawnStep(layout: ReturnType<typeof panelLiftLayout>) {
  const unit = layout.rest.size / GLYPH_OVERLAY_BASE_SIZE;
  const half = GLYPH_OVERLAY_BASE_SIZE / 2;
  const anchor = STEP_NUMBER_ANCHOR * GLYPH_OVERLAY_BASE_SIZE;
  return {
    x:
      layout.canvas.x +
      (anchor + layout.step.sceneShiftX - half) * unit * layout.canvas.scale,
    y:
      layout.canvas.y +
      (anchor + layout.step.sceneShiftY - half) * unit * layout.canvas.scale,
  };
}

describe("panelLiftLayout", () => {
  it("is the app's own layout without a lift", () => {
    const layout = panelLiftLayout(BOX, null, 3);
    expect(layout.amount).toBe(0);
    expect(layout.canvas).toEqual({
      x: 540,
      y: 476,
      scale: 1,
      size: 952,
      offsetY: 0,
    });
    expect(layout.step.sceneShiftX).toBe(0);
    expect(layout.bar).toMatchObject({ rise: 0, y: 952, offsetY: 0 });
  });

  it("is the app's own layout before the move in and after going back", () => {
    for (const t of [0, 4.5, 28.43, 40]) {
      const layout = panelLiftLayout(BOX, CUT, t);
      expect(layout.amount).toBe(0);
      expect(layout.canvas.offsetY).toBe(0);
      expect(layout.bar.offsetY).toBe(0);
    }
  });

  it("lands on the hand-made cut's numbers once in", () => {
    const layout = panelLiftLayout(BOX, CUT, 10);
    expect(layout.amount).toBe(1);
    // Canvas centre at y 1290 of the frame, 330 into a box from y 960.
    expect(layout.canvas.y).toBeCloseTo(330.24, 1);
    expect(layout.canvas.scale).toBe(0.95);
    // Step number digits from about x 60, y 988 of the frame.
    expect(layout.step.x).toBeCloseTo(60.5, 0);
    expect(layout.step.y).toBeCloseTo(27.8, 0);
    // The bar rides the box's top edge.
    expect(layout.bar).toMatchObject({ edge: "top", rise: 1, y: 0 });
    expect(layout.bar.offsetY).toBe(-952);
  });

  it("puts the animator's own step number exactly where it says", () => {
    for (const t of [4.6, 5, 5.33, 12, 27.9, 28.3]) {
      const layout = panelLiftLayout(BOX, CUT, t);
      const drawn = drawnStep(layout);
      expect(drawn.x).toBeCloseTo(layout.step.x, 6);
      expect(drawn.y).toBeCloseTo(layout.step.y, 6);
    }
  });

  it("moves all three on one curve, the number on a straight line", () => {
    const rest = panelLiftLayout(BOX, CUT, 0);
    const lifted = panelLiftLayout(BOX, CUT, 10);
    const mid = panelLiftLayout(BOX, CUT, 4.93);
    const a = mid.amount;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    const along = (from: number, to: number) => from + (to - from) * a;
    expect(mid.canvas.y).toBeCloseTo(along(rest.canvas.y, lifted.canvas.y), 6);
    expect(mid.canvas.scale).toBeCloseTo(
      along(rest.canvas.scale, lifted.canvas.scale),
      6
    );
    expect(mid.step.x).toBeCloseTo(along(rest.step.x, lifted.step.x), 6);
    expect(mid.step.y).toBeCloseTo(along(rest.step.y, lifted.step.y), 6);
    expect(mid.bar.y).toBeCloseTo(along(rest.bar.y, lifted.bar.y), 6);
  });

  it("keeps the bar under the canvas when its edge is the bottom", () => {
    const layout = panelLiftLayout(BOX, { ...CUT, barEdge: "bottom" }, 10);
    expect(layout.canvas.scale).toBe(0.95);
    expect(layout.bar).toMatchObject({ rise: 0, offsetY: 0 });
  });
});

describe("panelLiftAmount", () => {
  it("comes in over the seconds before inAt, goes back over those after outAt", () => {
    expect(panelLiftAmount(CUT, 4.53)).toBe(0);
    expect(panelLiftAmount(CUT, 5.33)).toBe(1);
    expect(panelLiftAmount(CUT, 27.73)).toBe(1);
    expect(panelLiftAmount(CUT, 28.43)).toBe(0);
  });

  it("goes back along the move in, reversed", () => {
    const into = panelLiftAmount(CUT, 4.53 + 0.8 * 0.3);
    const back = panelLiftAmount(
      { ...CUT, outSeconds: 0.8 },
      27.73 + 0.8 * 0.7
    );
    expect(back).toBeCloseTo(into, 6);
  });

  it("is in from the start without inAt and to the end without outAt", () => {
    expect(panelLiftAmount({}, 0)).toBe(1);
    expect(panelLiftAmount({}, 99)).toBe(1);
    expect(panelLiftAmount({ outAt: 2 }, 0)).toBe(1);
    expect(panelLiftAmount({ inAt: 2 }, 99)).toBe(1);
  });

  it("is already in at the clip's start when inAt is before it", () => {
    expect(panelLiftAmount({ inAt: -1, inSeconds: 0.8 }, 0)).toBe(1);
  });
});

describe("normalizePanelLift", () => {
  it("keeps the same object when nothing changes", () => {
    expect(normalizePanelLift(CUT)).toBe(CUT);
  });
  it("never goes back before the lift is in", () => {
    expect(normalizePanelLift({ inAt: 3, outAt: 2 }).outAt).toBe(3);
  });
});

describe("the split reads the lift's centre", () => {
  it("places both hands from the lifted canvas", () => {
    const stage = { width: 1080, height: 952 };
    const layout = panelLiftLayout(BOX, CUT, 10);
    const frame = splitPlacementFrame(stage.width, stage.height, {
      x: layout.canvas.x / stage.width,
      y: layout.canvas.y / stage.height,
      scale: layout.canvas.scale,
    });
    expect(frame.rest).toEqual({ x: 540, y: 476, size: 952 });
    expect(frame.centre.y).toBeCloseTo(layout.canvas.y, 6);
    expect(frame.centre.size).toBeCloseTo(layout.canvas.size, 6);
    expect(frame.scale).toBe(0.95);
  });
  it("is the resting frame without a lift", () => {
    const frame = splitPlacementFrame(1080, 952, null);
    expect(frame.centre).toBe(frame.rest);
    expect(frame.scale).toBe(1);
  });
});

describe("panelLiftBar", () => {
  /** The ΩΛ-XJ reel's lift: in at 4.557 over 0.8 s, back at 28.433 over 0.7 s. */
  const REEL: PostPanelLift = {
    ...POST_LIFT_DEFAULTS,
    inAt: 4.557,
    inSeconds: 0.8,
    outAt: 28.433,
    outSeconds: 0.7,
  };

  it("fades out on the top edge as the panel leaves, never riding it", () => {
    expect(panelLiftBar(REEL, 28.4)).toEqual({ rise: 1, opacity: 1 });
    const fading = panelLiftBar(REEL, 28.55);
    expect(fading.rise).toBe(1);
    expect(fading.opacity).toBeGreaterThan(0.3);
    expect(fading.opacity).toBeLessThan(0.7);
    for (let t = 28.7; t < 29.133; t += 1 / 30) {
      expect(panelLiftBar(REEL, t).opacity).toBe(0);
    }
  });

  it("only ever sits under the canvas or on the top edge", () => {
    for (let t = 0; t < 32; t += 1 / 60) {
      const bar = panelLiftBar(REEL, t);
      expect([0, 1]).toContain(bar.rise);
      // Wherever it shows at all, the layout's canvas is not moving under it
      // from a different bar place: it is at rest, or fully lifted.
      if (bar.opacity > 0 && bar.rise === 1) {
        expect(t).toBeGreaterThanOrEqual(4.557);
      }
    }
  });

  it("fades out under the canvas as the panel comes in, then in on top", () => {
    expect(panelLiftBar(REEL, 3.7)).toEqual({ rise: 0, opacity: 1 });
    expect(panelLiftBar(REEL, 3.9).rise).toBe(0);
    expect(panelLiftBar(REEL, 3.9).opacity).toBeLessThan(1);
    expect(panelLiftBar(REEL, 4.3).opacity).toBe(0);
    const back = panelLiftBar(REEL, 4.7);
    expect(back.rise).toBe(1);
    expect(back.opacity).toBeGreaterThan(0);
    expect(back.opacity).toBeLessThan(1);
    expect(panelLiftBar(REEL, 6)).toEqual({ rise: 1, opacity: 1 });
  });

  it("comes back under the canvas once the panel is back", () => {
    expect(panelLiftBar(REEL, 29.2).rise).toBe(0);
    expect(panelLiftBar(REEL, 29.2).opacity).toBeLessThan(1);
    expect(panelLiftBar(REEL, 30)).toEqual({ rise: 0, opacity: 1 });
  });

  it("follows the move lengths, so a longer move fades more slowly", () => {
    const slow = { ...REEL, outSeconds: 1.4 };
    expect(panelLiftBar(slow, 28.7).opacity).toBeGreaterThan(0);
    expect(panelLiftBar(slow, 28.95).opacity).toBe(0);
  });

  it("stays on top for a lift with no moves, and leaves a bottom bar alone", () => {
    expect(panelLiftBar(POST_LIFT_DEFAULTS, 10)).toEqual({
      rise: 1,
      opacity: 1,
    });
    const bottom = { ...REEL, barEdge: "bottom" as const };
    for (const t of [3.9, 4.3, 28.55, 28.9]) {
      expect(panelLiftBar(bottom, t)).toEqual({ rise: 0, opacity: 1 });
    }
    expect(panelLiftBar(null, 28.9)).toEqual({ rise: 0, opacity: 1 });
    expect(panelLiftBar(REEL, Number.NaN)).toEqual({ rise: 0, opacity: 1 });
  });
});
