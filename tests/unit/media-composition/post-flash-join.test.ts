import { describe, expect, it } from "vitest";
import {
  boxAt,
  channelKeyframeSeconds,
  easingPresetOf,
  findItem,
  itemEnd,
  segmentAt,
  setKeyframe,
  updateItem,
  type PostBox,
  type PostItem,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  compilePostProject,
  editContext,
  evaluatePresetFrame,
  type PostFlashItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  FLASH_DEFAULT_FADE_SECONDS,
  FLASH_DEFAULT_STRENGTH,
  FLASH_ITEM_SECONDS,
  FLASH_MARK_ARM_SHARE,
  FLASH_MARK_LINE_SHARE,
  flashFrameRect,
  flashMarks,
  flashReach,
  flashSquareBox,
  flashVeilStrength,
} from "#lib/shared/media-composition/domain/flash.js";
import {
  FLY_DEFAULT_SECONDS,
  addFlashItem,
  canFlyIntoNext,
  flyIntoNext,
  flyIntoNextEdit,
} from "#lib/shared/media-composition/domain/post-flash-join-edits.js";
import { pipHandoffOf } from "#lib/shared/media-composition/domain/pip-handoff.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { NOW, card, overlay, project, video } from "./post-project-fixtures";
import { flashFixture } from "../../../src/routes/test/post-studio/flash-fixture";
import { joinFixture } from "../../../src/routes/test/post-studio/join-fixture";

const ctx = editContext(NOW);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("the flash veil", () => {
  it("starts at the strength, falls steadily, and is gone at the fade", () => {
    expect(flashVeilStrength(0, 0.22, 0.4)).toBeCloseTo(0.22, 9);
    let last = Infinity;
    for (let s = 0; s < 0.4; s += 0.01) {
      const value = flashVeilStrength(s, 0.22, 0.4);
      expect(value).toBeLessThanOrEqual(last);
      expect(value).toBeGreaterThanOrEqual(0);
      last = value;
    }
    expect(flashVeilStrength(0.4, 0.22, 0.4)).toBe(0);
    expect(flashVeilStrength(2, 0.22, 0.4)).toBe(0);
    // Most of the light is gone by the halfway point, as a flash's is.
    expect(flashVeilStrength(0.2, 0.22, 0.4)).toBeLessThan(0.22 * 0.15);
  });

  it("is nothing before the hit or with no strength or fade", () => {
    expect(flashVeilStrength(-0.01, 0.22, 0.4)).toBe(0);
    expect(flashVeilStrength(Number.NaN, 0.22, 0.4)).toBe(0);
    expect(flashVeilStrength(0, 0, 0.4)).toBe(0);
    expect(flashVeilStrength(0, 0.22, 0)).toBe(0);
  });
});

describe("the flash geometry", () => {
  const box: PostBox = { x: 0.2, y: 0.25, width: 0.6, height: 0.5 };

  it("reaches from the box to every frame edge, at the furthest box", () => {
    const reach = flashReach([box, { x: 0, y: 0, width: 0.5, height: 0.5 }]);
    close(reach.left, 0.2 / 0.6);
    close(reach.top, 0.25 / 0.5);
    close(reach.right, 1); // the second box: (1 - 0.5) / 0.5
    close(reach.bottom, 1);
  });

  it("finds the whole frame from the box's own rect", () => {
    const rect = { x: 216, y: 480, width: 648, height: 960 };
    const frame = flashFrameRect(rect, box);
    close(frame.x, 0);
    close(frame.y, 0);
    close(frame.width, 1080);
    close(frame.height, 1920);
  });

  it("puts an L at each corner, arms a share of the shorter side, inside the box", () => {
    const rect = { x: 100, y: 200, width: 400, height: 300 };
    const { marks, lineWidth } = flashMarks(rect, 1080);
    close(lineWidth, FLASH_MARK_LINE_SHARE * 1080);
    expect(marks).toHaveLength(4);
    const arm = FLASH_MARK_ARM_SHARE * 300;
    const [topLeft] = marks;
    close(topLeft!.corner.x, 100 + lineWidth / 2);
    close(topLeft!.corner.y, 200 + lineWidth / 2);
    close(topLeft!.from.y - topLeft!.corner.y, arm);
    close(topLeft!.to.x - topLeft!.corner.x, arm);
    for (const mark of marks) {
      for (const point of [mark.from, mark.corner, mark.to]) {
        expect(point.x).toBeGreaterThanOrEqual(100);
        expect(point.x).toBeLessThanOrEqual(500);
        expect(point.y).toBeGreaterThanOrEqual(200);
        expect(point.y).toBeLessThanOrEqual(500);
      }
    }
  });

  it("makes a centred square in the frame's pixels", () => {
    const square = flashSquareBox({ width: 1080, height: 1920 });
    close(square.width * 1080, square.height * 1920);
    close(square.x + square.width / 2, 0.5);
    close(square.y + square.height / 2, 0.5);
  });
});

function postWithFlash(): { post: PostProject; id: string } {
  const base = project([video("v1", { sourceOut: 10 })]);
  const added = addFlashItem(base, ctx, { at: 2 });
  if (!added) throw new Error("no flash");
  return { post: added.project, id: added.itemId };
}

function flashOf(post: PostProject, id: string): PostFlashItem {
  const item = findItem(post, id)?.item;
  if (item?.kind !== "flash") throw new Error("not a flash");
  return item;
}

describe("a flash clip in the post", () => {
  it("is added at the hit with its defaults and a square box", () => {
    const { post, id } = postWithFlash();
    const flash = flashOf(post, id);
    expect(flash.start).toBe(2);
    expect(flash.duration).toBe(FLASH_ITEM_SECONDS);
    expect(flash.strength).toBe(FLASH_DEFAULT_STRENGTH);
    expect(flash.fade).toBe(FLASH_DEFAULT_FADE_SECONDS);
    expect(flash.marks).toBe(true);
  });

  it("compiles to a painted plan with its timing and reach", () => {
    const { post, id } = postWithFlash();
    const compiled = compilePostProject(post, ctx)!;
    const plan = compiled.flashes.find((entry) => entry.itemId === id);
    expect(plan).toBeDefined();
    expect(plan!.start).toBe(2);
    expect(plan!.end).toBe(2 + FLASH_ITEM_SECONDS);
    expect(plan!.reach.left).toBeGreaterThan(0);
    expect(
      compiled.preset.clips.some(
        (clip) => clip.kind === "visual" && clip.sourceRole === plan!.role
      )
    ).toBe(true);
  });

  it("keeps patched values inside their ranges", () => {
    const { post, id } = postWithFlash();
    const next = updateItem(
      post,
      id,
      { strength: 4, fade: 0.001, marks: false },
      ctx
    );
    const flash = flashOf(next, id);
    expect(flash.strength).toBe(1);
    expect(flash.fade).toBe(0.05);
    expect(flash.marks).toBe(false);
  });

  it("the add-flash op places one, and item patches on other clips are refused", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const next = applyPostProjectOps(
      base,
      [{ op: "add-flash", at: 1, strength: 0.5, marks: false }],
      ctx
    );
    const flash = next.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "flash") as PostFlashItem;
    expect(flash.start).toBe(1);
    expect(flash.strength).toBe(0.5);
    expect(flash.marks).toBe(false);
    expect(() =>
      applyPostProjectOps(
        next,
        [{ op: "item", item: flash.id, patch: { strength: 3 } }],
        ctx
      )
    ).toThrow(/strength/);
    expect(() =>
      applyPostProjectOps(
        next,
        [{ op: "item", item: "v1", patch: { fade: 1 } }],
        ctx
      )
    ).toThrow(/flash/);
  });
});

const BIG_LOW: PostBox = { x: 0.05, y: 0.45, width: 0.9, height: 0.5 };
const SMALL_TOP_RIGHT: PostBox = { x: 0.6, y: 0.05, width: 0.35, height: 0.2 };

function joinPost(outgoing: Partial<PostItem> = {}): PostProject {
  return project(
    [video("v1", { sourceOut: 12 })],
    [
      [
        overlay("a1", "animation", {
          start: 0,
          duration: 4,
          box: BIG_LOW,
          ...outgoing,
        }),
        overlay("m1", "moves", {
          start: 4,
          duration: 4,
          box: SMALL_TOP_RIGHT,
        }),
      ],
    ]
  );
}

function itemOf(post: PostProject, id: string): PostItem {
  const item = findItem(post, id)?.item;
  if (!item) throw new Error(`no ${id}`);
  return item;
}

function boxKeys(post: PostProject, id: string): number[] {
  return channelKeyframeSeconds(itemOf(post, id), "box");
}

function expectBox(actual: PostBox, expected: PostBox): void {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
  close(actual.width, expected.width);
  close(actual.height, expected.height);
}

describe("fly into next clip", () => {
  it("joins the pair with a cross-fade and one eased box path on both", () => {
    const post = joinPost();
    expect(canFlyIntoNext(post, "a1")).toBe(true);
    const next = flyIntoNext(post, "a1", FLY_DEFAULT_SECONDS, ctx);
    const a1 = itemOf(next, "a1");
    const m1 = itemOf(next, "m1");
    expect(a1.transitionOut?.type).toBe("crossfade");
    close(a1.transitionOut!.duration, FLY_DEFAULT_SECONDS);
    const from = m1.start;
    const to = itemEnd(a1);
    close(to - from, FLY_DEFAULT_SECONDS);
    for (const id of ["a1", "m1"]) {
      const keys = boxKeys(next, id);
      expect(keys).toHaveLength(2);
      close(keys[0]!, from);
      close(keys[1]!, to);
      const segment = segmentAt(itemOf(next, id), "box", (from + to) / 2);
      expect(easingPresetOf(segment!.easing)).toBe("ease-in-out");
    }
    // The path runs from the outgoing box to the incoming box, the same on both.
    expectBox(boxAt(a1, from), BIG_LOW);
    expectBox(boxAt(m1, to), SMALL_TOP_RIGHT);
    const mid = (from + to) / 2;
    expectBox(boxAt(a1, mid), boxAt(m1, mid));
    // Outside the overlap each keeps its own box.
    expectBox(boxAt(a1, 0.5), BIG_LOW);
    expectBox(boxAt(m1, itemEnd(m1)), SMALL_TOP_RIGHT);
  });

  it("keeps the outgoing clip's earlier keys", () => {
    const plain = joinPost();
    let a1 = setKeyframe(itemOf(plain, "a1"), "box", 0, {
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
    });
    a1 = setKeyframe(a1, "box", 1, BIG_LOW);
    const post: PostProject = {
      ...plain,
      tracks: plain.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => (item.id === "a1" ? a1 : item)),
      })),
    };
    const next = flyIntoNext(post, "a1", 1, ctx);
    const keys = boxKeys(next, "a1");
    expect(keys).toHaveLength(4);
    close(keys[0]!, 0);
    close(keys[1]!, 1);
    expectBox(boxAt(itemOf(next, "a1"), 1), BIG_LOW);
  });

  it("a second run replaces the first instead of adding keys", () => {
    const once = flyIntoNext(joinPost(), "a1", 1, ctx);
    const twice = flyIntoNext(once, "a1", 0.5, ctx);
    const a1 = itemOf(twice, "a1");
    const m1 = itemOf(twice, "m1");
    close(a1.transitionOut!.duration, 0.5);
    const from = m1.start;
    const to = itemEnd(a1);
    close(to - from, 0.5);
    for (const id of ["a1", "m1"]) {
      const keys = boxKeys(twice, id);
      expect(keys).toHaveLength(2);
      close(keys[0]!, from);
      close(keys[1]!, to);
    }
    expectBox(boxAt(a1, from), BIG_LOW);
    expectBox(boxAt(m1, to), SMALL_TOP_RIGHT);
  });

  it("refuses footage, a gap, and the last clip on a lane", () => {
    const post = joinPost();
    expect(canFlyIntoNext(post, "m1")).toBe(false);
    expect(flyIntoNext(post, "m1", 1, ctx)).toBe(post);
    expect(canFlyIntoNext(post, "v1")).toBe(false);
    const gap = updateItem(post, "m1", { start: 5 }, ctx);
    if (itemOf(gap, "m1").start > itemEnd(itemOf(gap, "a1")) + 1e-6)
      expect(canFlyIntoNext(gap, "a1")).toBe(false);
  });

  it("the fly-into-next op joins the pair and explains a refusal", () => {
    const next = applyPostProjectOps(
      joinPost(),
      [{ op: "fly-into-next", item: "a1", seconds: 0.8 }],
      ctx
    );
    close(itemOf(next, "a1").transitionOut!.duration, 0.8);
    expect(boxKeys(next, "m1")).toHaveLength(2);
    expect(() =>
      applyPostProjectOps(
        joinPost(),
        [{ op: "fly-into-next", item: "m1" }],
        ctx
      )
    ).toThrow(/after it/);
  });
});

describe("the harness fixtures", () => {
  it("flash: a card under a flash clip at 2 s, box around the middle", () => {
    const post = flashFixture("seq");
    const items = post.tracks.flatMap((track) => track.items);
    expect(items.some((item) => item.kind === "card")).toBe(true);
    const flash = items.find((item) => item.kind === "flash")!;
    expect(flash.start).toBe(2);
    close(flash.box.x + flash.box.width / 2, 0.5);
    close(flash.box.y + flash.box.height / 2, 0.5);
  });

  it("join: the animation flies into a square with the look, over footage", () => {
    const post = joinFixture("seq", FOOTAGE);
    const animation = itemOf(post, "join-animation");
    const square = itemOf(post, "join-square");
    expect(animation.transitionOut?.type).toBe("crossfade");
    expect(square.kind === "moves" && square.mode).toBe("alternate");
    expect(square.kind === "moves" && !!square.animationAppearance).toBe(true);
    expect(post.tracks[0]!.items[0]!.kind).toBe("video");
    expect(boxKeys(post, "join-animation")).toHaveLength(2);
    expect(boxKeys(post, "join-square")).toHaveLength(2);
    // Not one surface: the animation has no look of its own.
    expect(pipHandoffOf(post)?.shared).toBe(false);
  });
});

const FOOTAGE = { videoId: "cut", durationSeconds: 25 };

describe("fly into next clip keeps the cut", () => {
  /** a1, m1 and a third clip c1 on one overlay lane; m1 has a key of its own at 7 s. */
  function threeOnALane(): PostProject {
    const base = project(
      [video("v1", { sourceOut: 12 })],
      [
        [
          overlay("a1", "animation", { start: 0, duration: 4, box: BIG_LOW }),
          overlay("m1", "moves", {
            start: 4,
            duration: 4,
            box: SMALL_TOP_RIGHT,
          }),
          overlay("c1", "animation", { start: 8, duration: 3, box: BIG_LOW }),
        ],
      ]
    );
    const m1 = setKeyframe(itemOf(base, "m1"), "box", 7, SMALL_TOP_RIGHT);
    return {
      ...base,
      tracks: base.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) => (item.id === "m1" ? m1 : item)),
      })),
    };
  }
  const hasKeyAt = (post: PostProject, id: string, at: number) =>
    boxKeys(post, id).some((s) => Math.abs(s - at) < 1e-6);

  it("moves only the incoming clip's start; its end and the later clips stay", () => {
    const once = flyIntoNext(threeOnALane(), "a1", FLY_DEFAULT_SECONDS, ctx);
    const m1 = itemOf(once, "m1");
    close(m1.start, 4 - FLY_DEFAULT_SECONDS);
    close(itemEnd(m1), 8);
    close(itemOf(once, "c1").start, 8);
    close(itemOf(once, "c1").duration, 3);
    // Its own key stays at 7 s on the post.
    expect(hasKeyAt(once, "m1", 7)).toBe(true);

    const again = flyIntoNext(once, "a1", 0.5, ctx);
    close(itemOf(again, "m1").start, 3.5);
    close(itemEnd(itemOf(again, "m1")), 8);
    close(itemOf(again, "c1").start, 8);
    expect(hasKeyAt(again, "m1", 7)).toBe(true);
  });

  it("keeps the editor's own layout on the main lane", () => {
    const post = project([card("k1", 4), card("k2", 4, { start: 4 })]);
    const next = flyIntoNext(post, "k1", 1, ctx);
    expect(itemOf(next, "k1").transitionOut?.type).toBe("crossfade");
    expect(boxKeys(next, "k1")).toHaveLength(2);
    expect(boxKeys(next, "k2")).toHaveLength(2);
  });

  it("a run that changes nothing returns the same project", () => {
    const once = flyIntoNext(threeOnALane(), "a1", 1, ctx);
    const edit = flyIntoNextEdit(once, "a1", 1, ctx);
    expect(edit.outcome).toBe("unchanged");
    expect(edit.project).toBe(once);
    expect(
      applyPostProjectOps(
        once,
        [{ op: "fly-into-next", item: "a1", seconds: 1 }],
        ctx
      )
    ).toBe(once);
  });
});

describe("the compiled join", () => {
  const steps = Array.from({ length: 8 }, () => ({
    duration: 1,
  })) as unknown as StepData[];
  const alignment = { steps, startPlacementDuration: 1, clocks: {} };

  /** The fixture, or the fixture with the animation wearing the square's look (one surface). */
  function joined(shared: boolean): PostProject {
    const post = joinFixture("seq", FOOTAGE);
    if (!shared) return post;
    return {
      ...post,
      tracks: post.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.id === "join-animation"
            ? ({ ...item, animationAppearance: { mandala: false } } as PostItem)
            : item
        ),
      })),
    };
  }

  function sampler(post: PostProject) {
    const compiled = compilePostProject(post, ctx)!;
    return (time: number) =>
      evaluatePresetFrame(
        compiled.preset,
        compiled.durationSeconds,
        time,
        alignment as never
      ).filter(
        (layer) =>
          (layer.clipId.startsWith("join-animation") ||
            layer.clipId.startsWith("join-square")) &&
          !layer.clipId.endsWith(":overlay")
      );
  }

  for (const shared of [false, true]) {
    const name = shared ? "one surface" : "dissolving (the fixture)";
    it(`${name}: a full-strength picture on the one box path throughout`, () => {
      const post = joined(shared);
      expect(pipHandoffOf(post)?.shared).toBe(shared);
      const square = itemOf(post, "join-square");
      const animation = itemOf(post, "join-animation");
      const from = square.start;
      const to = itemEnd(animation);
      close(to - from, FLY_DEFAULT_SECONDS);
      const frame = sampler(post);
      const opacity = (time: number, id: string) =>
        Math.max(
          0,
          ...frame(time)
            .filter((layer) => layer.clipId.startsWith(id))
            .map((layer) => layer.opacity)
        );
      for (let i = 0; i <= 20; i++) {
        const time = from + ((to - from) * i) / 20;
        const layers = frame(time);
        expect(layers.length).toBeGreaterThan(0);
        // Never both thin, never neither: one layer is at full strength.
        expect(Math.max(...layers.map((layer) => layer.opacity))).toBeCloseTo(
          1,
          6
        );
        // Every layer drawn rides the one path both clips carry.
        const path = boxAt(square, time);
        for (const layer of layers) expectBox(layer.regionRect!, path);
        expectBox(boxAt(animation, time), path);
      }
      const mid = (from + to) / 2;
      // The animation stays solid to its end.
      expect(opacity(from, "join-animation")).toBeCloseTo(1, 6);
      expect(opacity(mid, "join-animation")).toBeCloseTo(1, 6);
      if (shared) {
        // One surface: the square's pieces wait for the end, then show whole.
        expect(opacity(mid, "join-square")).toBe(0);
        expect(opacity(to, "join-square")).toBeCloseTo(1, 6);
      } else {
        // The square rises over it once, from nothing to full.
        expect(opacity(from, "join-square")).toBeCloseTo(0, 6);
        expect(opacity(mid, "join-square")).toBeGreaterThan(0.2);
        expect(opacity(mid, "join-square")).toBeLessThan(0.8);
        expect(opacity(to, "join-square")).toBeCloseTo(1, 6);
      }
      expect(opacity(to + 0.5, "join-square")).toBeCloseTo(1, 6);
      expect(opacity(to + 0.5, "join-animation")).toBe(0);
      expectBox(frame(to + 0.5)[0]!.regionRect!, square.box);
    });
  }
});
