import { describe, expect, it } from "vitest";
import type { PostItem } from "@austencloud/video-editor/core";
import { SPLIT_FORK } from "./tka-parts";

// The reel's own split: the hands part at 17.33 s over 1.5 s and come back
// at 27.73 s over 0.7 s, on a clip that starts 2 s into the post.
const split = {
  openAt: 17.3333,
  openSeconds: 1.5,
  closeAt: 27.7333,
  closeSeconds: 0.7,
  style: "mirror",
  spread: 0.5,
  scale: 1,
  flash: false,
};
const clip = (extra: Record<string, unknown> = {}) =>
  ({
    id: "animation-1",
    kind: "animation",
    start: 2,
    end: 31.2333,
    split,
    ...extra,
  }) as unknown as PostItem;

describe("split hands as the timeline's fork", () => {
  it("puts the fork at the split's times on the post's clock", () => {
    const span = SPLIT_FORK.span(clip())!;
    expect(span.openStart).toBeCloseTo(19.3333, 4);
    expect(span.openEnd).toBeCloseTo(20.8333, 4);
    expect(span.closeStart).toBeCloseTo(29.7333, 4);
    expect(span.closeEnd).toBeCloseTo(30.4333, 4);
  });

  it("closes as long as it opened when the closing length is left out", () => {
    const span = SPLIT_FORK.span(
      clip({ split: { ...split, closeSeconds: undefined } })
    )!;
    expect(span.closeEnd! - span.closeStart!).toBeCloseTo(1.5, 4);
  });

  it("stays apart to the end when it never closes", () => {
    const span = SPLIT_FORK.span(
      clip({ split: { ...split, closeAt: undefined } })
    )!;
    expect(span.closeStart).toBeNull();
    expect(span.closeEnd).toBeNull();
  });

  it("shows no fork for a clip that draws one hand, or has no split", () => {
    expect(SPLIT_FORK.span(clip({ part: { hand: "blue" } }))).toBeNull();
    expect(SPLIT_FORK.span(clip({ split: undefined }))).toBeNull();
    expect(SPLIT_FORK.span(clip({ kind: "image" }))).toBeNull();
  });

  it("writes a moved opening back on the clip's clock and keeps the look", () => {
    const item = clip();
    const span = SPLIT_FORK.span(item)!;
    const patch = SPLIT_FORK.edit!(item, {
      ...span,
      openStart: 18,
      openEnd: 19.5,
    }) as unknown as {
      split: typeof split;
    };
    expect(patch.split.openAt).toBe(16);
    expect(patch.split.openSeconds).toBe(1.5);
    expect(patch.split.closeAt).toBeCloseTo(27.7333, 4);
    expect(patch.split.closeSeconds).toBeCloseTo(0.7, 4);
    expect(patch.split.style).toBe("mirror");
  });

  it("writes the closing length out, so it stays put when left out before", () => {
    const item = clip({ split: { ...split, closeSeconds: undefined } });
    const span = SPLIT_FORK.span(item)!;
    const patch = SPLIT_FORK.edit!(item, {
      ...span,
      openEnd: span.openStart + 3,
    }) as unknown as {
      split: typeof split;
    };
    expect(patch.split.openSeconds).toBe(3);
    expect(patch.split.closeSeconds).toBe(1.5);
  });

  it("does not add a closing to a split that stays open", () => {
    const item = clip({
      split: { ...split, closeAt: undefined, closeSeconds: undefined },
    });
    const span = SPLIT_FORK.span(item)!;
    const patch = SPLIT_FORK.edit!(item, span) as unknown as {
      split: typeof split;
    };
    expect(patch.split.closeAt).toBeUndefined();
    expect(patch.split.closeSeconds).toBeUndefined();
  });
});
