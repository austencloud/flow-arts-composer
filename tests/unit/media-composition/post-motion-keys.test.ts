import { describe, expect, it } from "vitest";
import {
  POST_BOX,
  type PostAnimationItem,
  type PostMovesItem,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { withMotionKeys } from "#lib/shared/media-composition/domain/post-project-motion-keys.js";
import {
  moveKeyframe,
  setSegmentEasing,
} from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import { overlay, project, video } from "./post-project-fixtures";

const CORNER = { x: 0.6, y: 0.78, width: 0.4, height: 0.22 };

function scene(tunnelSeconds?: number) {
  const anim = overlay("anim", "animation", {
    start: 0,
    duration: 10,
    box: { ...POST_BOX.bottom },
    ...(tunnelSeconds ? { tunnelHook: { seconds: tunnelSeconds } } : {}),
    animationAppearance: { mandala: true },
  } as Partial<PostAnimationItem>);
  const pip = overlay("pip", "moves", {
    start: 9,
    duration: 12,
    box: { ...CORNER },
    animationAppearance: { mandala: false },
  } as Partial<PostMovesItem>);
  return project(
    [video("v1", { start: 0, sourceOut: 25 } as never)],
    [[anim], [pip]]
  );
}
const animOf = (p: PostProject) =>
  p.tracks.flatMap((t) => t.items).find((i) => i.id === "anim")!;
const keysOf = (p: PostProject) =>
  (animOf(p) as PostAnimationItem).keyframes?.box ?? [];

describe("tunnel and hand-off moves as keyframes", () => {
  it("writes both moves as the animation's own box keys", () => {
    const keys = keysOf(withMotionKeys(scene(5)));
    expect(keys.map((k) => [k.t, k.auto])).toEqual([
      [0, "tunnel"],
      [2, "tunnel"],
      [4.5, "tunnel"],
      [9, "handoff"],
      [10, "handoff"],
    ]);
    expect(keys[0]!.value).toEqual(POST_BOX.full);
    expect(keys[2]!.value).toEqual(POST_BOX.bottom);
    expect(keys[4]!.value).toMatchObject(CORNER);
  });

  it("is a no-op once in step", () => {
    const once = withMotionKeys(scene(5));
    expect(withMotionKeys(once)).toBe(once);
  });

  it("follows a longer tunnel while the keys are untouched", () => {
    const once = withMotionKeys(scene(5));
    const longer = {
      ...once,
      tracks: once.tracks.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.id === "anim" ? { ...i, tunnelHook: { seconds: 6 } } : i
        ),
      })),
    } as PostProject;
    const keys = keysOf(withMotionKeys(longer)).filter(
      (k) => k.auto === "tunnel"
    );
    expect(keys.map((k) => +k.t.toFixed(6))).toEqual([0, 2.4, 5.4]);
  });

  it("drops the tag on an edited key and stops following", () => {
    const once = withMotionKeys(scene(5));
    const anim = animOf(once);
    const moved = moveKeyframe(anim, "box", 4.5, 4) as PostAnimationItem;
    expect(moved.keyframes!.box!.find((k) => k.t === 4)!.auto).toBeUndefined();
    const eased = setSegmentEasing(moved, "box", 9.5, [0, 0, 1, 1]);
    const edited = {
      ...once,
      tracks: once.tracks.map((t) => ({
        ...t,
        items: t.items.map((i) => (i.id === "anim" ? eased : i)),
      })),
    } as PostProject;
    const keys = keysOf(withMotionKeys(edited));
    expect(keys.some((k) => k.auto === "tunnel")).toBe(false);
    expect(keys.find((k) => k.t === 4)!.value).toEqual(POST_BOX.bottom);
  });
});
