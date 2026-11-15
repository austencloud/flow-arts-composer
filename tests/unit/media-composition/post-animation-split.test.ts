import { describe, expect, it } from "vitest";
import {
  POST_SPLIT_DEFAULT_SCALE,
  POST_SPLIT_DEFAULT_SPREAD,
  POST_SPLIT_THREE_DEFAULTS,
  PostAnimationSplitSchema,
  SPLIT_ECHO_WINDOW_SECONDS,
  SPLIT_ONE_CANVAS,
  SPLIT_PEEL_LEAD_SECONDS,
  normalizeAnimationSplit,
  splitCanvasPlace,
  splitFitScale,
  splitGridReach,
  splitMiddleRise,
  splitMountSpan,
  splitPose,
  splitSpreadOf,
  splitRestFrame,
  type PostAnimationSplit,
  type PostSplitStyle,
} from "#lib/shared/media-composition/domain/post-animation-split.js";
import {
  POST_LIFT_DEFAULTS,
  panelLiftLayout,
} from "#lib/shared/media-composition/domain/post-panel-lift.js";

const STYLES: PostSplitStyle[] = ["glide", "spring", "peel", "echo"];
const base = (style: PostSplitStyle): PostAnimationSplit => ({
  openAt: 2,
  openSeconds: 0.7,
  closeAt: 6,
  closeSeconds: 0.7,
  style,
});
const STEP = 1e-4;

/** Largest change in `apart` and `scale` over one tiny step across `t`. */
function jumpAt(split: PostAnimationSplit, t: number) {
  const a = splitPose(split, t - STEP);
  const b = splitPose(split, t + STEP);
  return Math.max(Math.abs(a.apart - b.apart), Math.abs(a.scale - b.scale));
}

function sample(split: PostAnimationSplit, from: number, to: number, n = 2000) {
  return Array.from({ length: n + 1 }, (_, i) =>
    splitPose(split, from + ((to - from) * i) / n)
  );
}

describe("splitPose", () => {
  it.each(STYLES)("%s does not jump at the hit or at the close", (style) => {
    const split = base(style);
    expect(jumpAt(split, split.openAt)).toBeLessThan(0.01);
    expect(jumpAt(split, split.closeAt!)).toBeLessThan(0.01);
    expect(jumpAt(split, split.closeAt! + split.closeSeconds!)).toBeLessThan(
      0.01
    );
  });

  it.each(STYLES)(
    "%s is exactly one canvas before it moves and after it closes",
    (style) => {
      const split = base(style);
      const lead =
        style === "peel" || style === "echo" ? SPLIT_PEEL_LEAD_SECONDS : 0;
      expect(splitPose(split, 0)).toEqual(SPLIT_ONE_CANVAS);
      expect(splitPose(split, split.openAt - lead - 0.001)).toEqual(
        SPLIT_ONE_CANVAS
      );
      expect(splitPose(split, 6.7)).toEqual(SPLIT_ONE_CANVAS);
      expect(splitPose(split, 100)).toEqual(SPLIT_ONE_CANVAS);
    }
  );

  it("springs about a tenth past its marks and settles within the move", () => {
    const split = base("spring");
    const poses = sample(split, 2, 2.7);
    const peak = Math.max(...poses.map((pose) => pose.apart));
    expect(peak).toBeGreaterThanOrEqual(1.08);
    expect(peak).toBeLessThanOrEqual(1.12);
    expect(Math.abs(splitPose(split, 2.7).apart - 1)).toBeLessThan(0.01);
    // It first reaches its marks about a fifth of the way through.
    const first = poses.findIndex((pose) => pose.apart >= 1);
    expect(first / poses.length).toBeGreaterThan(0.15);
    expect(first / poses.length).toBeLessThan(0.25);
  });

  it("glides without ever passing its marks, and with no flash", () => {
    const poses = sample(base("glide"), 1.5, 7);
    expect(Math.max(...poses.map((pose) => pose.apart))).toBeLessThanOrEqual(1);
    expect(poses.every((pose) => pose.flash === 1)).toBe(true);
    expect(splitPose(base("glide"), 2.7).apart).toBe(1);
  });

  it("flashes on the hit and the flash dies within the move", () => {
    const split = { ...base("spring"), flash: 0.7 };
    expect(splitPose(split, 2.0001).flash).toBeCloseTo(1.7, 2);
    expect(splitPose(split, 2.7).flash).toBeLessThan(1.01);
  });

  it("peels a few percent apart before the hit", () => {
    const split = base("peel");
    const atHit = splitPose(split, 2);
    expect(atHit.apart).toBeGreaterThan(0.02);
    expect(atHit.apart).toBeLessThan(0.08);
    expect(atHit.scale).toBe(1);
    expect(
      splitPose(split, 2 - SPLIT_PEEL_LEAD_SECONDS / 2).apart
    ).toBeLessThan(atHit.apart);
  });

  it("drags fading echoes while it flies, and none once at rest", () => {
    const split = base("echo");
    const flying = splitPose(split, 2.05);
    expect(flying.echoes.length).toBeGreaterThan(0);
    for (let i = 1; i < flying.echoes.length; i++)
      expect(flying.echoes[i]!.strength).toBeLessThan(
        flying.echoes[i - 1]!.strength
      );
    // Each copy trails behind its canvas on the way out.
    expect(flying.echoes.every((echo) => echo.offset < 0)).toBe(true);
    const late = splitPose(split, 2 + SPLIT_ECHO_WINDOW_SECONDS * 0.9);
    const lateMax = Math.max(0, ...late.echoes.map((echo) => echo.strength));
    expect(lateMax).toBeLessThan(flying.echoes[0]!.strength * 0.2);
    expect(
      splitPose(split, 2 + SPLIT_ECHO_WINDOW_SECONDS + 0.01).echoes
    ).toEqual([]);
    expect(splitPose(split, 4).echoes).toEqual([]);
    expect(splitPose(base("peel"), 2.05).echoes).toEqual([]);
  });

  it("closes from wherever the opening had got to", () => {
    const early: PostAnimationSplit = { ...base("glide"), closeAt: 2.35 };
    expect(jumpAt(early, 2.35)).toBeLessThan(0.01);
    expect(splitPose(early, 2.35 + 0.7)).toEqual(SPLIT_ONE_CANVAS);
  });

  it("stays apart to the end without a close", () => {
    const open: PostAnimationSplit = { openAt: 1, openSeconds: 0.5 };
    const pose = splitPose(open, 500);
    expect(pose.apart).toBe(1);
    expect(pose.show).toBe(1);
    expect(splitMountSpan(open).end).toBe(Number.POSITIVE_INFINITY);
  });

  it("mounts the extra canvases before the split first moves", () => {
    const span = splitMountSpan(base("echo"));
    expect(span.start).toBeLessThan(2 - SPLIT_PEEL_LEAD_SECONDS);
    expect(span.end).toBeCloseTo(6.7);
  });
});

describe("the split's data", () => {
  it("is strict and bounded", () => {
    expect(PostAnimationSplitSchema.safeParse(base("echo")).success).toBe(true);
    expect(
      PostAnimationSplitSchema.safeParse({ ...base("echo"), extra: 1 }).success
    ).toBe(false);
    expect(
      PostAnimationSplitSchema.safeParse({ ...base("echo"), openSeconds: 0 })
        .success
    ).toBe(false);
    expect(
      PostAnimationSplitSchema.safeParse({ ...base("echo"), style: "zoom" })
        .success
    ).toBe(false);
  });

  it("never closes before it opens, and drops a lone closing length", () => {
    expect(
      normalizeAnimationSplit({ openAt: 3, openSeconds: 1, closeAt: 1 }).closeAt
    ).toBe(3);
    expect(
      normalizeAnimationSplit({ openAt: 3, openSeconds: 1, closeSeconds: 2 })
    ).toEqual({ openAt: 3, openSeconds: 1 });
    const kept = base("echo");
    expect(normalizeAnimationSplit(kept)).toBe(kept);
  });
});

describe("the size a split fits its box at", () => {
  /** Each grid's left and right edge, at rest apart, in box pixels. */
  function gridEdges(width: number, height: number, gridMode = "diamond") {
    const scale = splitFitScale(width, height, gridMode);
    const rest = splitRestFrame(width, height);
    const reach = splitGridReach(gridMode) * rest.size * scale;
    return ([-1, 1] as const).map((side) => {
      const place = splitCanvasPlace(
        rest,
        width,
        side,
        1,
        scale,
        POST_SPLIT_DEFAULT_SPREAD
      );
      return {
        left: place.x - reach,
        right: place.x + reach,
        top: place.y - reach,
        bottom: place.y + reach,
      };
    });
  }

  it("reaches the outer points of the grid the animator paints", () => {
    // Diamond outer points sit 300 from the centre with a 25 radius, of 950.
    expect(splitGridReach("diamond")).toBeCloseTo(325 / 950, 6);
    expect(splitGridReach("box")).toBeLessThan(splitGridReach("diamond"));
  });

  it("leaves nothing outside a full-frame 9:16 box, and a gap between grids", () => {
    for (const mode of ["diamond", "box"]) {
      const [left, right] = gridEdges(1080, 1920, mode);
      expect(left!.left).toBeGreaterThan(0);
      expect(right!.right).toBeLessThan(1080);
      expect(left!.top).toBeGreaterThan(0);
      expect(left!.bottom).toBeLessThan(1920);
      expect(right!.left - left!.right).toBeGreaterThan(0);
    }
    expect(splitFitScale(1080, 1920, "diamond")).toBeLessThan(
      POST_SPLIT_DEFAULT_SCALE
    );
  });

  it("keeps the default size in a wide panel", () => {
    expect(splitFitScale(1080, 900, "diamond")).toBe(POST_SPLIT_DEFAULT_SCALE);
  });

  it("is what a split without its own size uses, and a set size wins", () => {
    const at = 3;
    const fitted = splitFitScale(1080, 1920, "diamond");
    const open = { openAt: 2, openSeconds: 0.7, style: "glide" as const };
    expect(splitPose(open, at, fitted).scale).toBeCloseTo(fitted, 9);
    expect(splitPose({ ...open, scale: 0.9 }, at, fitted).scale).toBeCloseTo(
      0.9,
      9
    );
  });
});

describe("three across", () => {
  // The ΩΛ-XJ reel's split, with three across on.
  const reel: PostAnimationSplit = {
    openAt: 17.3333,
    openSeconds: 1.5,
    closeAt: 27.7333,
    closeSeconds: 0.7,
    style: "echo",
    three: true,
  };

  it("leaves a two-apart split's single canvas where it was", () => {
    for (const style of STYLES)
      for (const pose of sample(base(style), 0, 8, 400))
        expect(pose.middle).toBe(1);
  });

  it("shrinks the middle on the hands' own motion, and back on the close", () => {
    const m = POST_SPLIT_THREE_DEFAULTS.middle;
    const s = POST_SPLIT_THREE_DEFAULTS.scale;
    for (const pose of sample(reel, 16, 29, 4000)) {
      // The same share of the way at every moment, spring included, so the
      // sides are always coming out of the middle, never crossing it.
      expect((1 - pose.middle) / (1 - m)).toBeCloseTo(
        (1 - pose.scale) / (1 - s),
        9
      );
    }
    expect(splitPose(reel, 16).middle).toBe(1);
    expect(splitPose(reel, 27).middle).toBeCloseTo(m, 3);
    expect(splitPose(reel, 28.5)).toEqual(SPLIT_ONE_CANVAS);
    const jump = (t: number) =>
      Math.abs(
        splitPose(reel, t - STEP).middle - splitPose(reel, t + STEP).middle
      );
    expect(jump(reel.openAt)).toBeLessThan(0.01);
    expect(jump(reel.closeAt!)).toBeLessThan(0.01);
    expect(jump(reel.closeAt! + reel.closeSeconds!)).toBeLessThan(0.01);
  });

  it("uses its own layout until sizes are set, and set sizes win", () => {
    expect(splitSpreadOf(reel)).toBe(POST_SPLIT_THREE_DEFAULTS.spread);
    expect(splitSpreadOf({ ...reel, three: undefined })).toBe(
      POST_SPLIT_DEFAULT_SPREAD
    );
    expect(splitPose(reel, 27, 0.7).scale).toBeCloseTo(
      POST_SPLIT_THREE_DEFAULTS.scale,
      3
    );
    const set = { ...reel, middle: 0.9, scale: 0.4, spread: 0.3 };
    expect(splitPose(set, 27).middle).toBeCloseTo(0.9, 3);
    expect(splitPose(set, 27).scale).toBeCloseTo(0.4, 3);
    expect(splitSpreadOf(set)).toBe(0.3);
    // A middle without three across does nothing.
    expect(splitPose({ ...set, three: undefined }, 27).middle).toBe(1);
  });

  it("keeps its data bounded", () => {
    expect(
      PostAnimationSplitSchema.safeParse({ ...reel, middle: 0.82 }).success
    ).toBe(true);
    expect(
      PostAnimationSplitSchema.safeParse({ ...reel, middle: 0.1 }).success
    ).toBe(false);
    expect(
      PostAnimationSplitSchema.safeParse({ ...reel, middle: 2 }).success
    ).toBe(false);
    expect(
      PostAnimationSplitSchema.safeParse({ ...reel, three: "yes" }).success
    ).toBe(false);
  });

  it("lays out the reel's row: full width, the middle as large as fits, tight under the video", () => {
    // The reel's clip: a 1080 x 960 box under the video, the panel lifted.
    const W = 1080;
    const H = 960;
    const lift = panelLiftLayout(
      { width: W, height: H, barHeight: 0 },
      POST_LIFT_DEFAULTS,
      10
    );
    const reach = splitGridReach("8point");
    const side = lift.canvas.size;
    const pose = splitPose(reel, 27);
    const rise = splitMiddleRise(pose.middle, side, "8point");
    const middle = {
      x: lift.canvas.x,
      y: lift.canvas.y - rise,
      half: reach * side * pose.middle,
    };
    const spread = splitSpreadOf(reel);
    const sides = ([-1, 1] as const).map((dir) => ({
      x: middle.x + dir * spread * W * pose.apart,
      half: reach * side * pose.scale,
    }));
    // The top grid point stays where the single canvas had it.
    expect(middle.y - middle.half).toBeCloseTo(lift.canvas.y - reach * side, 6);
    // The middle's outer points about 512 px across (ring about 470).
    expect(middle.half * 2).toBeGreaterThan(490);
    expect(middle.half * 2).toBeLessThan(530);
    // The sides centred near x 135 and 945, outer points about 218 across.
    expect(sides[0]!.x).toBeCloseTo(135, -1);
    expect(sides[1]!.x).toBeCloseTo(945, -1);
    expect(sides[0]!.half * 2).toBeGreaterThan(200);
    expect(sides[0]!.half * 2).toBeLessThan(235);
    // The row fills the width without leaving the frame or touching.
    expect(sides[0]!.x - sides[0]!.half).toBeGreaterThan(0);
    expect(sides[0]!.x - sides[0]!.half).toBeLessThan(45);
    expect(sides[1]!.x + sides[1]!.half).toBeLessThan(W);
    expect(sides[0]!.x + sides[0]!.half).toBeLessThan(middle.x - middle.half);
  });
});
