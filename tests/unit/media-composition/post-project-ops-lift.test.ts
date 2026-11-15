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

const patchLift = (
  base: ReturnType<typeof post>,
  panelLift: unknown,
  item = "anim"
) =>
  applyPostProjectOps(
    base,
    [
      {
        op: "item",
        item,
        patch: { panelLift: panelLift as PostAnimationItem["panelLift"] },
      },
    ],
    ctx
  );

describe("a scripted lifted panel", () => {
  it("sets, changes, normalizes and clears an animation's lift", () => {
    const lifted = patchLift(post(), {
      canvasY: 0.344,
      canvasScale: 0.95,
      inAt: 1.6,
      inSeconds: 0.8,
      outAt: 1,
      outSeconds: 0.7,
    });
    // Going back never starts before the lift is in.
    expect(anim(lifted).panelLift).toEqual({
      canvasY: 0.344,
      canvasScale: 0.95,
      inAt: 1.6,
      inSeconds: 0.8,
      outAt: 1.6,
      outSeconds: 0.7,
    });
    const changed = patchLift(lifted, {
      ...anim(lifted).panelLift,
      outAt: 8,
      barEdge: "bottom",
    });
    expect(anim(changed).panelLift?.outAt).toBe(8);
    expect(anim(changed).panelLift?.barEdge).toBe("bottom");
    expect(anim(patchLift(changed, null)).panelLift).toBeUndefined();
  });

  it("drops a move length that has no time", () => {
    const lifted = patchLift(post(), { inSeconds: 0.8 });
    expect(anim(lifted).panelLift).toEqual({});
  });

  it("says what is wrong with a bad lift", () => {
    expect(() => patchLift(post(), { canvasY: 1.4 })).toThrow(
      /panelLift: canvasY/
    );
    expect(() => patchLift(post(), { canvasScale: 0 })).toThrow(
      /panelLift: canvasScale/
    );
    expect(() => patchLift(post(), { inAt: 2, inSeconds: 0 })).toThrow(
      /panelLift: inSeconds/
    );
    expect(() => patchLift(post(), { barEdge: "left" })).toThrow(
      /panelLift: barEdge/
    );
    expect(() => patchLift(post(), { lift: true })).toThrow(/panelLift/);
    expect(() => patchLift(post(), { inAt: 2 }, "v1")).toThrow(
      /Only an animation clip lifts its panel/
    );
  });
});
