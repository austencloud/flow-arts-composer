import { describe, expect, it } from "vitest";
import { POST_BOX } from "@austencloud/video-editor/core";
import type { PostAnimationItem } from "#lib/shared/post-studio-plugin/index.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import { NOW, overlay, project, video } from "./post-project-fixtures";

const ctx = editContext(NOW + 1);

function post() {
  return project(
    [video("v1", { start: 0, duration: 10, pinnedStart: true })],
    [
      [
        overlay("anim", "animation", {
          start: 0,
          duration: 10,
          box: { ...POST_BOX.bottom },
          anchor: { itemId: "v1", offset: 0 },
          fill: true,
        } as Partial<PostAnimationItem>),
      ],
    ]
  );
}

function anim(p: ReturnType<typeof post>): PostAnimationItem {
  const item = p.tracks
    .flatMap((track) => track.items)
    .find((i) => i.id === "anim");
  return item as PostAnimationItem;
}

describe("a scripted split", () => {
  it("sets, normalizes and clears an animation's split", () => {
    const split = applyPostProjectOps(
      post(),
      [
        {
          op: "item",
          item: "anim",
          patch: {
            split: { openAt: 2, openSeconds: 0.7, closeAt: 1, style: "spring" },
          },
        },
      ],
      ctx
    );
    expect(anim(split).split).toEqual({
      openAt: 2,
      openSeconds: 0.7,
      closeAt: 2,
      style: "spring",
    });
    const cleared = applyPostProjectOps(
      split,
      [{ op: "item", item: "anim", patch: { split: null } }],
      ctx
    );
    expect(anim(cleared).split).toBeUndefined();
  });

  it("sets three across and its middle size, and refuses a middle out of range", () => {
    const three = applyPostProjectOps(
      post(),
      [
        {
          op: "item",
          item: "anim",
          patch: {
            split: {
              openAt: 2,
              openSeconds: 0.7,
              three: true,
              middle: 0.82,
              scale: 0.35,
              spread: 0.375,
            },
          },
        },
      ],
      ctx
    );
    expect(anim(three).split).toEqual({
      openAt: 2,
      openSeconds: 0.7,
      three: true,
      middle: 0.82,
      scale: 0.35,
      spread: 0.375,
    });
    expect(() =>
      applyPostProjectOps(
        post(),
        [
          {
            op: "item",
            item: "anim",
            patch: {
              split: { openAt: 2, openSeconds: 0.7, three: true, middle: 3 },
            },
          },
        ],
        ctx
      )
    ).toThrow(/split: middle/);
  });

  it("says what is wrong with a bad split", () => {
    expect(() =>
      applyPostProjectOps(
        post(),
        [
          {
            op: "item",
            item: "anim",
            patch: {
              split: {
                openAt: 2,
                openSeconds: 0,
              } as PostAnimationItem["split"],
            },
          },
        ],
        ctx
      )
    ).toThrow(/split: openSeconds/);
    expect(() =>
      applyPostProjectOps(
        post(),
        [
          {
            op: "item",
            item: "v1",
            patch: { split: { openAt: 2, openSeconds: 0.7 } },
          },
        ],
        ctx
      )
    ).toThrow(/Only an animation clip/);
  });
});
