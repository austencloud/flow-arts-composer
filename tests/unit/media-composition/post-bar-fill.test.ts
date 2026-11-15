import { describe, expect, it } from "vitest";
import { POST_BOX } from "@austencloud/video-editor/core";
import type { PostAnimationItem } from "#lib/shared/post-studio-plugin/index.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import {
  PostBarFillSchema,
  barFillAt,
} from "#lib/shared/media-composition/domain/post-bar-fill.js";
import { NOW, overlay, project, video } from "./post-project-fixtures";

// The ΩΛ-XJ reel's bar: empty as the panel lifts in, full as it leaves.
const reel = { emptyAt: 4.56, fullAt: 28.43 };

describe("barFillAt", () => {
  it("runs once across the span: empty, a third, two thirds, full", () => {
    expect(barFillAt(reel, 4.56)).toBe(0);
    expect(barFillAt(reel, 12.5)).toBeCloseTo(1 / 3, 1);
    expect(barFillAt(reel, 20.5)).toBeCloseTo(2 / 3, 1);
    expect(barFillAt(reel, 28.43)).toBe(1);
  });

  it("is empty before and full after, and never goes back", () => {
    expect(barFillAt(reel, 0)).toBe(0);
    expect(barFillAt(reel, 40)).toBe(1);
    let last = -1;
    for (let t = 0; t <= 35; t += 1 / 30) {
      const share = barFillAt(reel, t);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
    expect(barFillAt(reel, Number.NaN)).toBe(0);
  });
});

describe("the bar fill's schema", () => {
  it("needs the full time after the empty time", () => {
    expect(PostBarFillSchema.safeParse(reel).success).toBe(true);
    expect(
      PostBarFillSchema.safeParse({ emptyAt: -3, fullAt: 2 }).success
    ).toBe(true);
    expect(PostBarFillSchema.safeParse({ emptyAt: 5, fullAt: 5 }).success).toBe(
      false
    );
    expect(PostBarFillSchema.safeParse({ emptyAt: 5, fullAt: 4 }).success).toBe(
      false
    );
    expect(PostBarFillSchema.safeParse({ emptyAt: 5 }).success).toBe(false);
    expect(PostBarFillSchema.safeParse({ ...reel, extra: 1 }).success).toBe(
      false
    );
  });
});

describe("a scripted bar fill", () => {
  const ctx = editContext(NOW + 1);
  const post = () =>
    project(
      [video("v1", { start: 0, duration: 30, pinnedStart: true })],
      [
        [
          overlay("anim", "animation", {
            start: 0,
            duration: 30,
            box: { ...POST_BOX.bottom },
            anchor: { itemId: "v1", offset: 0 },
            fill: true,
          } as Partial<PostAnimationItem>),
        ],
      ]
    );
  const anim = (p: ReturnType<typeof post>) =>
    p.tracks
      .flatMap((track) => track.items)
      .find((i) => i.id === "anim") as PostAnimationItem;

  it("sets and clears an animation's bar fill", () => {
    const set = applyPostProjectOps(
      post(),
      [{ op: "item", item: "anim", patch: { barFill: reel } }],
      ctx
    );
    expect(anim(set).barFill).toEqual(reel);
    const cleared = applyPostProjectOps(
      set,
      [{ op: "item", item: "anim", patch: { barFill: null } }],
      ctx
    );
    expect(anim(cleared).barFill).toBeUndefined();
  });

  it("says why it refuses a fill that ends before it starts", () => {
    expect(() =>
      applyPostProjectOps(
        post(),
        [
          {
            op: "item",
            item: "anim",
            patch: { barFill: { emptyAt: 9, fullAt: 3 } },
          },
        ],
        ctx
      )
    ).toThrow(/barFill: /);
  });

  it("refuses a fill on a clip that is not an animation", () => {
    expect(() =>
      applyPostProjectOps(
        post(),
        [{ op: "item", item: "v1", patch: { barFill: reel } }],
        ctx
      )
    ).toThrow(/Only an animation clip fills its bar once/);
  });
});
