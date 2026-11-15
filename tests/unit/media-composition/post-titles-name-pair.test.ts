import { describe, expect, it } from "vitest";
import {
  boxAt,
  sampleEasing,
  titlesRole,
  type PostItem,
  type PostProject,
  type PostVideoItem,
} from "@austencloud/video-editor/core";
import {
  compilePostProject,
  editContext,
  type PostTitlesItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  PAIR_NAME_SHARE,
  TITLES_SPOKEN_SIZE,
  pairNameShare,
  titlesLayout,
  titlesPlanOf,
  titlesSpokenSizeAt,
  tunnelTitlesLook,
} from "#lib/shared/media-composition/domain/tunnel-titles.js";
import {
  TITLES_HOOK_BOX,
  TITLES_PARK_GLIDE_SECONDS,
  TITLES_PARK_LEFT,
  TITLES_PARK_TOP,
  parkTitles,
  parkedSize,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import { applyPostProjectOps } from "#lib/shared/media-composition/domain/post-project-ops.js";
import { NOW, project, video } from "./post-project-fixtures";
import { namePairFixture } from "../../../src/routes/test/post-studio/name-pair-fixture";

const ctx = editContext(NOW);

function titles(fields: Partial<PostTitlesItem> = {}): PostTitlesItem {
  return {
    id: "name",
    kind: "titles",
    start: 0,
    duration: 20,
    box: { x: 0, y: 0, width: 1, height: 1 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    spoken: "ohm, lam-dash, X, J",
    ...fields,
  };
}

function post(item: PostTitlesItem): PostProject {
  return project(
    [
      video("v1", { start: 0, sourceOut: 10, pinnedStart: true }),
      video("v2", {
        takeId: "b",
        start: 10,
        sourceOut: 10,
        pinnedStart: true,
      } as Partial<PostVideoItem>),
    ],
    [[item as PostItem]]
  );
}

function titlesOf(next: PostProject): PostTitlesItem {
  return next.tracks
    .flatMap((track) => track.items)
    .find((item) => item.kind === "titles") as PostTitlesItem;
}

describe("the titles layout", () => {
  it("keeps the opening's look for a clip whose box never moves", () => {
    expect(titlesPlanOf(titles()).layout).toBe("tunnel");
    // A 9:16 frame: the numbers the opening has always drawn at.
    const layout = titlesLayout("tunnel", {
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
    });
    const above = 1920 / 2 - (1080 * 0.62) / 2;
    expect(layout.glyphHeight).toBeCloseTo(1920 * 0.055, 9);
    expect(layout.nameCenterY).toBeCloseTo(above / 2, 9);
    expect(layout.spokenCenterY).toBeCloseTo(1920 - above / 2, 9);
    expect(layout.spokenPx).toBeCloseTo(1920 * 0.055 * 0.42, 9);
    expect(layout.spokenMaxWidth).toBeCloseTo(1080 * 0.9, 9);
    expect(layout.risePx).toBe(1920);
  });

  it("draws one pair that scales with its box once the box moves", () => {
    const moving = titles({
      keyframes: {
        box: [
          { t: 0, value: TITLES_HOOK_BOX, easing: [0, 0, 1, 1] },
          { t: 2, value: TITLES_HOOK_BOX, easing: [0, 0, 1, 1] },
        ],
      },
    });
    expect(titlesPlanOf(moving).layout).toBe("pair");
    const big = titlesLayout("pair", { x: 0, y: 100, width: 600, height: 200 });
    const small = titlesLayout("pair", { x: 0, y: 10, width: 270, height: 90 });
    for (const [layout, top, height] of [
      [big, 100, 200],
      [small, 10, 90],
    ] as const) {
      expect(layout.glyphHeight).toBeCloseTo(height * PAIR_NAME_SHARE, 9);
      expect(layout.spokenPx).toBeCloseTo(
        layout.glyphHeight * TITLES_SPOKEN_SIZE,
        9
      );
      // The spoken line sits at the same place against the name at every size.
      expect((layout.spokenCenterY - top) / height).toBeCloseTo(
        (big.spokenCenterY - 100) / 200,
        9
      );
      expect(layout.nameCenterY - top).toBeCloseTo(layout.glyphHeight / 2, 9);
    }
    // The spoken line ends on the box's bottom edge.
    const lineBottom = big.spokenCenterY + (big.spokenPx * 1.25) / 2;
    expect(lineBottom).toBeCloseTo(300, 9);
  });
});

describe("the spoken line's size", () => {
  const parked = { x: 0.03, y: 0.03, width: 0.3, height: 0.05 };
  const moving = (fields: Partial<PostTitlesItem> = {}) =>
    titles({
      start: 1,
      keyframes: {
        box: [
          { t: 2, value: TITLES_HOOK_BOX, easing: [0.42, 0, 0.58, 1] },
          { t: 3.2, value: parked, easing: [0, 0, 1, 1] },
        ],
      },
      ...fields,
    });

  it("leaves older posts' plans as they were", () => {
    const plan = titlesPlanOf(moving());
    expect(plan).not.toHaveProperty("spokenSize");
    expect(plan).not.toHaveProperty("spokenSizes");
    expect(titlesSpokenSizeAt(plan, 3)).toBe(TITLES_SPOKEN_SIZE);
  });

  it("follows the box's height, on the box's own easing", () => {
    const item = moving({ spokenSizeSmall: 0.584 });
    const plan = titlesPlanOf(item);
    const tall = TITLES_HOOK_BOX.height;
    for (const seconds of [0, 3, 3.4, 3.6, 3.9, 4.2, 9]) {
      const height = boxAt(item, seconds).height;
      const expected =
        TITLES_SPOKEN_SIZE +
        ((0.584 - TITLES_SPOKEN_SIZE) * (tall - height)) /
          (tall - parked.height);
      expect(titlesSpokenSizeAt(plan, seconds)).toBeCloseTo(expected, 9);
    }
    expect(titlesSpokenSizeAt(plan, 3)).toBeCloseTo(TITLES_SPOKEN_SIZE, 9);
    expect(titlesSpokenSizeAt(plan, 5)).toBeCloseTo(0.584, 9);
  });

  it("jumps where the box holds, as the box does", () => {
    const item = moving({ spokenSizeSmall: 0.6 });
    item.keyframes!.box![0]!.easing = "hold";
    const plan = titlesPlanOf(item);
    expect(titlesSpokenSizeAt(plan, 4.1)).toBe(TITLES_SPOKEN_SIZE);
    expect(titlesSpokenSizeAt(plan, 4.2)).toBeCloseTo(0.6, 9);
  });

  it("keeps one size all through a clip whose box never moves", () => {
    const plan = titlesPlanOf(
      titles({ spokenSize: 0.5, spokenSizeSmall: 0.7 })
    );
    expect(plan.spokenSizes).toBeUndefined();
    expect(titlesSpokenSizeAt(plan, 5)).toBe(0.5);
  });

  it("gives a larger line room by shrinking the name, still filling the box", () => {
    const rect = { x: 0, y: 0, width: 324, height: 91.1 };
    const layout = titlesLayout("pair", rect, 0.584);
    expect(layout.glyphHeight).toBeCloseTo(91.1 * pairNameShare(0.584), 9);
    expect(layout.glyphHeight).toBeLessThan(91.1 * PAIR_NAME_SHARE);
    expect(layout.spokenPx).toBeCloseTo(layout.glyphHeight * 0.584, 9);
    const lineBottom = layout.spokenCenterY + (layout.spokenPx * 1.25) / 2;
    expect(lineBottom).toBeCloseTo(91.1, 9);
  });

  it("is set and cleared through an item edit, and a script hears a bad value", () => {
    const set = applyPostProjectOps(
      post(moving()),
      [
        {
          op: "item",
          item: "name",
          patch: { spokenSize: 0.45, spokenSizeSmall: 0.584 },
        },
      ],
      ctx
    );
    expect(titlesOf(set)).toMatchObject({
      spokenSize: 0.45,
      spokenSizeSmall: 0.584,
    });
    const cleared = applyPostProjectOps(
      set,
      [{ op: "item", item: "name", patch: { spokenSizeSmall: null } }],
      ctx
    );
    expect(titlesOf(cleared)).not.toHaveProperty("spokenSizeSmall");
    expect(() =>
      applyPostProjectOps(
        post(moving()),
        [{ op: "item", item: "name", patch: { spokenSize: 4.2 } }],
        ctx
      )
    ).toThrow(/spokenSize must be a number/);
  });
});

describe("arriving and leaving", () => {
  const look = (item: PostTitlesItem, seconds: number) =>
    tunnelTitlesLook(titlesPlanOf(item), seconds, sampleEasing);

  it("lifts the words away by default", () => {
    expect(look(titles(), 20).name.opacity).toBe(0);
    expect(look(titles(), 0).name.opacity).toBe(0);
  });

  it("holds them to the last frame when they stay", () => {
    const staying = titles({ leave: "stay" });
    expect(look(staying, 20)).toEqual({
      name: { opacity: 1, rise: 0 },
      spoken: { opacity: 1, rise: 0 },
    });
    expect(look(staying, 0).name.opacity).toBe(0);
  });

  it("shows them from the first frame when they do not rise in", () => {
    const already = titles({ enter: "none" });
    expect(look(already, 0)).toEqual({
      name: { opacity: 1, rise: 0 },
      spoken: { opacity: 1, rise: 0 },
    });
    expect(look(already, 20).name.opacity).toBe(0);
  });
});

describe("a lit title in the post", () => {
  it("reads the take clock of the footage under it, piece by piece", () => {
    const compiled = compilePostProject(
      post(titles({ lit: { from: 2, to: 18 } })),
      ctx
    )!;
    const clips = compiled.preset.clips.filter(
      (clip) => clip.kind === "visual" && clip.sourceRole === titlesRole("name")
    ) as { timeMapRole?: string; useResolvedTimeMap: boolean }[];
    expect(clips).toHaveLength(2);
    expect(clips.every((clip) => clip.useResolvedTimeMap)).toBe(true);
    expect(clips.map((clip) => clip.timeMapRole)).toEqual([
      expect.stringContaining("a"),
      expect.stringContaining("b"),
    ]);
    expect(compiled.titles[0]!.lit).toEqual({ from: 2, to: 18 });
  });

  it("stays one clip with no clock when nothing is lit", () => {
    const compiled = compilePostProject(post(titles()), ctx)!;
    const clips = compiled.preset.clips.filter(
      (clip) => clip.kind === "visual" && clip.sourceRole === titlesRole("name")
    );
    expect(clips).toHaveLength(1);
    expect(
      (clips[0] as { useResolvedTimeMap: boolean }).useResolvedTimeMap
    ).toBe(false);
  });
});

describe("parking the title", () => {
  it("writes the hook's spot at the playhead and the parked spot after the glide", () => {
    const parked = titlesOf(parkTitles(post(titles()), "name", 2, ctx));
    const keys = parked.keyframes!.box!;
    expect(keys.map((key) => key.t)).toEqual([
      2,
      2 + TITLES_PARK_GLIDE_SECONDS,
    ]);
    expect(keys[0]!.value).toEqual(TITLES_HOOK_BOX);
    expect(keys[1]!.value.x).toBeCloseTo(TITLES_PARK_LEFT, 9);
    expect(keys[1]!.value.y).toBeCloseTo(TITLES_PARK_TOP, 9);
    const size = parkedSize(TITLES_HOOK_BOX);
    expect(keys[1]!.value.height).toBeCloseTo(size.height, 9);
    expect(keys[1]!.value.width).toBeCloseTo(size.width, 9);
    // Shrunk evenly, as far as the smallest box allows.
    expect(size.width / size.height).toBeCloseTo(
      TITLES_HOOK_BOX.width / TITLES_HOOK_BOX.height,
      9
    );
    expect(size.height).toBeLessThan(TITLES_HOOK_BOX.height * 0.6);
    expect(keys[0]!.easing).not.toBe("hold");
    expect(parked.leave).toBe("stay");
    expect(titlesPlanOf(parked).layout).toBe("pair");
    // Halfway through the glide the box is between the two.
    const mid = boxAt(parked, 2 + TITLES_PARK_GLIDE_SECONDS / 2);
    expect(mid.x).toBeLessThan(TITLES_HOOK_BOX.x);
    expect(mid.x).toBeGreaterThan(TITLES_PARK_LEFT);
    expect(mid.height).toBeLessThan(TITLES_HOOK_BOX.height);
    expect(mid.height).toBeGreaterThan(size.height);
  });

  it("parks from the box as it is when it already moves", () => {
    const moving = { x: 0.1, y: 0.3, width: 0.8, height: 0.1 };
    const start = titles({
      keyframes: {
        box: [
          { t: 0, value: moving, easing: [0, 0, 1, 1] },
          { t: 1, value: moving, easing: [0, 0, 1, 1] },
        ],
      },
    });
    const keys = titlesOf(parkTitles(post(start), "name", 5, ctx)).keyframes!
      .box!;
    expect(keys.map((key) => key.t)).toEqual([
      0,
      1,
      5,
      5 + TITLES_PARK_GLIDE_SECONDS,
    ]);
    expect(keys[2]!.value).toEqual(moving);
    expect(keys[3]!.value.width).toBeCloseTo(parkedSize(moving).width, 9);
    expect(parkedSize(moving).width).toBeLessThan(0.8 * 0.6);
  });
});

describe("titles from the command line", () => {
  const run = (patch: Record<string, unknown>) =>
    titlesOf(
      applyPostProjectOps(
        post(titles()),
        [{ op: "item", item: "name", patch }],
        ctx
      )
    );

  it("sets and clears leave, enter and lit", () => {
    const set = run({ leave: "stay", enter: "none", lit: { from: 3, to: 9 } });
    expect(set).toMatchObject({
      leave: "stay",
      enter: "none",
      lit: { from: 3, to: 9 },
    });
    const cleared = applyPostProjectOps(
      post(set),
      [
        {
          op: "item",
          item: "name",
          patch: { leave: "lift", enter: "rise", lit: null },
        },
      ],
      ctx
    );
    const back = titlesOf(cleared);
    expect(back.leave).toBeUndefined();
    expect(back.enter).toBeUndefined();
    expect(back.lit).toBeUndefined();
  });

  it("says why a value is refused", () => {
    expect(() => run({ leave: "fade" })).toThrow(/leave must be one of/);
    expect(() => run({ enter: "drop" })).toThrow(/enter must be one of/);
    expect(() => run({ lit: { from: 5, to: 2 } })).toThrow(/lit must be/);
    expect(() =>
      applyPostProjectOps(
        post(titles()),
        [{ op: "item", item: "v1", patch: { leave: "stay" } }],
        ctx
      )
    ).toThrow(/Only a titles clip/);
  });
});

describe("the name-pair fixture", () => {
  it("is big for two seconds, parked by 2.8 s, stays, and lights over the slow take", () => {
    const fixture = namePairFixture("post-name-pair-fixture");
    const pair = titlesOf(fixture);
    expect(boxAt(pair, 1)).toEqual(TITLES_HOOK_BOX);
    expect(boxAt(pair, 2)).toEqual(TITLES_HOOK_BOX);
    const parked = boxAt(pair, 2.8);
    expect(parked.x).toBeCloseTo(TITLES_PARK_LEFT, 9);
    expect(parked.y).toBeCloseTo(TITLES_PARK_TOP, 9);
    expect(pair.leave).toBe("stay");
    const compiled = compilePostProject(fixture, ctx)!;
    const clips = compiled.preset.clips.filter(
      (clip) =>
        clip.kind === "visual" && clip.sourceRole === titlesRole(pair.id)
    ) as { timeMapRole?: string }[];
    expect(clips.map((clip) => clip.timeMapRole)).toEqual([
      expect.stringContaining("woods-take-1"),
      expect.stringContaining("woods-take-2"),
    ]);
    expect(pair.lit!.from).toBeGreaterThan(16.16);
  });
});
