import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  POST_BOX,
  POST_DEFAULT_CARD_SECONDS,
  findItem,
  mainItems,
  overlaysAnchoredTo,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  TUTORIAL_FADE_SECONDS,
  applyLook,
  applyTutorialPreset,
  applyTutorialTemplate,
  lookOf,
} from "$lib/shared/media-composition/domain/post-project-looks";
import {
  setTrackFlag,
  updateItem,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { isAnimated } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  NOW,
  card,
  overlay,
  project,
  spans,
  take,
  text,
  video,
} from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const LABELS = { runThrough: "Run through", slowMo: "Slow mo", card: "Card" };

function valid(p: PostProject): PostProject {
  const parsed = PostProjectSchema.safeParse(p);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return p;
}

function looksOn(p: PostProject, clipId: string) {
  return overlaysAnchoredTo(p, clipId)
    .filter(({ item }) => item.fill)
    .map(({ item, trackIndex }) => ({
      kind: item.kind,
      trackIndex,
      box: item.box,
    }));
}

describe("looks", () => {
  it("round-trips each look through lookOf", () => {
    const base = project([video("v1", { fadeIn: 0.5 })], [[text("t1", 1, 2)]]);
    expect(lookOf(base, "v1")).toBe("full");

    const dual = valid(applyLook(base, "v1", "dual", ctx));
    expect(lookOf(dual, "v1")).toBe("dual");
    expect(findItem(dual, "v1")!.item.box).toEqual(POST_BOX.top);
    expect(looksOn(dual, "v1")).toEqual([
      { kind: "animation", trackIndex: 1, box: POST_BOX.bottom },
    ]);

    const breakdown = valid(applyLook(dual, "v1", "breakdown", ctx));
    expect(lookOf(breakdown, "v1")).toBe("breakdown");
    expect(
      looksOn(breakdown, "v1")
        .map((entry) => entry.kind)
        .sort()
    ).toEqual(["carousel", "moves"]);

    const full = valid(applyLook(breakdown, "v1", "full", ctx));
    expect(lookOf(full, "v1")).toBe("full");
    expect(looksOn(full, "v1")).toEqual([]);
    // The text is not part of any look.
    expect(findItem(full, "t1")).not.toBeNull();
  });

  it("drops the clip's box animation when a look sets its own box, keeping framing and opacity", () => {
    const base = project([
      video("v1", {
        keyframes: {
          box: [
            {
              t: 0,
              value: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
              easing: "hold",
            },
          ],
          opacity: [{ t: 0, value: 0.5, easing: "hold" }],
          framing: [
            {
              t: 0,
              value: { zoom: 1.5, panX: 0, panY: 0, rotation: 0 },
              easing: "hold",
            },
          ],
        },
      }),
    ]);
    expect(isAnimated(findItem(base, "v1")!.item, "box")).toBe(true);

    const dual = valid(applyLook(base, "v1", "dual", ctx));
    const clip = findItem(dual, "v1")!.item;
    expect(isAnimated(clip, "box")).toBe(false);
    expect(clip.box).toEqual(POST_BOX.top);
    expect(isAnimated(clip, "opacity")).toBe(true);
    expect(isAnimated(clip, "framing")).toBe(true);
  });

  it("puts look overlays below texts and fades them with the clip", () => {
    const base = project(
      [video("v1", { fadeIn: 0.5, fadeOut: 1 })],
      [[text("t1", 1, 2)]]
    );
    const dual = valid(applyLook(base, "v1", "dual", ctx));
    // The text track had no room over the whole clip, so the look got a new
    // track directly above the main one.
    expect(spans(dual, 1)[0]![0]).toMatch(/^animation/);
    expect(spans(dual, 2)).toEqual([["t1", 1, 2]]);
    const [anim] = overlaysAnchoredTo(dual, "v1");
    expect(anim!.item).toMatchObject({ fadeIn: 0.5, fadeOut: 1, opacity: 1 });
  });

  it("calls a changed layout custom and ignores anything but a main clip", () => {
    const dual = applyLook(project([video("v1")]), "v1", "dual", ctx);
    const moved = updateItem(
      dual,
      "v1",
      { box: { x: 0, y: 0, width: 1, height: 0.6 } },
      ctx
    );
    expect(lookOf(moved, "v1")).toBe("custom");
    expect(lookOf(dual, "nope")).toBeNull();
    const withCard = project([card("c1")]);
    expect(lookOf(withCard, "c1")).toBeNull();
    expect(applyLook(withCard, "c1", "dual", ctx)).toBe(withCard);
  });

  it("calls a turned clip custom, and a look sets it straight again", () => {
    const turned = valid(
      updateItem(
        project([video("v1")]),
        "v1",
        { box: { ...POST_BOX.full, turn: 10 } },
        ctx
      )
    );
    expect(lookOf(turned, "v1")).toBe("custom");
    const full = valid(applyLook(turned, "v1", "full", ctx));
    expect(lookOf(full, "v1")).toBe("full");
    expect(findItem(full, "v1")!.item.box).toEqual(POST_BOX.full);
  });

  it("returns the same project when the clip already has the look", () => {
    const dual = applyLook(project([video("v1")]), "v1", "dual", ctx);
    expect(applyLook(dual, "v1", "dual", ctx)).toBe(dual);
  });

  it("skips a hidden track when placing a look's overlay", () => {
    const base = project(
      [video("v1", { fadeIn: 0.5 })],
      [[text("marker", 20, 1)]]
    );
    const hidden = setTrackFlag(base, "track-1", "hidden", true, ctx);
    const dual = valid(applyLook(hidden, "v1", "dual", ctx));
    expect(looksOn(dual, "v1")).toEqual([
      { kind: "animation", trackIndex: 1, box: POST_BOX.bottom },
    ]);
    // The hidden track keeps its own item instead of receiving the look.
    expect(spans(dual, 2)).toEqual([["marker", 20, 1]]);
  });
});

describe("saved tutorial template", () => {
  it("keeps destination speed and zoom while moving captions with the same beat", () => {
    const source = project(
      [
        video("source-run"),
        video("source-slow", { takeId: "b", start: 9 }),
        card("source-card", 5, { start: 19 }),
      ],
      [
        [
          overlay("source-animation", "animation", {
            start: 0,
            duration: 10,
            anchor: { itemId: "source-run", offset: 0 },
          }),
        ],
        [
          overlay("source-pip", "moves", {
            start: 9,
            duration: 10,
            anchor: { itemId: "source-slow", offset: 0 },
          }),
        ],
        [
          text("source-caption", 10, 3, {
            anchor: { itemId: "source-slow", offset: 1 },
          }),
        ],
      ]
    );
    const zoomKey = {
      t: 0,
      value: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        crop: { left: 0, top: 0, right: 1, bottom: 1 },
      },
      easing: "hold" as const,
    };
    const destination = project([
      video("target-run", { speed: 0.7, duration: 10 / 0.7 }),
      video("target-slow", {
        takeId: "b",
        start: 10 / 0.7 - 1,
        speed: 0.7,
        duration: 10 / 0.7,
        keyframes: { sourceGeometry: [zoomKey] },
      }),
    ]);
    const timing = (takeKey: string, taps: number[]) => ({
      schemaVersion: 1 as const,
      sequenceId: "seq",
      takeKey,
      updatedAt: NOW,
      sections: [
        {
          id: "section",
          startSeconds: 0,
          endSeconds: 20,
          bpm: 60,
          tempo: "locked" as const,
          snap: "taps" as const,
          taps,
          firstTapPosition: 1,
          offsetSeconds: 0,
          overrides: [],
        },
      ],
    });
    source.timings = { b: timing("key-b", [2, 3, 4]) };
    destination.timings = { b: timing("key-b", [4, 5, 6]) };

    const result = valid(applyTutorialTemplate(destination, source, ctx));
    const slow = findItem(result, "target-slow")!.item;
    expect(slow).toMatchObject({
      speed: 0.7,
      keyframes: { sourceGeometry: [zoomKey] },
    });
    expect(
      result.tracks
        .flatMap((track) => track.items)
        .filter((item) => item.kind === "moves")
        .map((item) => item.mode)
        .sort()
    ).toEqual(["alternate", "mandala"]);
    const caption = result.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "text")!;
    expect(caption.start).toBeCloseTo(slow.start + 4 / 0.7 - 1);
    expect(mainItems(result).at(-1)?.kind).toBe("card");
  });
});

describe("applyTutorialPreset", () => {
  function expectTutorial(p: PostProject) {
    valid(p);
    const main = mainItems(p);
    expect(main.map((item) => item.kind)).toEqual(["video", "video", "card"]);
    const [first, second, last] = main;
    expect(first).toMatchObject({ label: "Run through", fadeIn: 0 });
    expect(second).toMatchObject({
      label: "Slow mo",
      fadeIn: TUTORIAL_FADE_SECONDS,
    });
    expect(last).toMatchObject({
      label: "Card",
      fadeIn: TUTORIAL_FADE_SECONDS,
      duration: POST_DEFAULT_CARD_SECONDS,
    });
    expect(lookOf(p, first!.id)).toBe("dual");
    expect(lookOf(p, second!.id)).toBe("breakdown");
    for (const { item } of overlaysAnchoredTo(p, second!.id)) {
      if (item.fill) expect(item.fadeIn).toBe(TUTORIAL_FADE_SECONDS);
    }
    return main;
  }

  it("does nothing without a video", () => {
    const base = project([], [], []);
    expect(applyTutorialPreset(base, LABELS, ctx)).toEqual({
      project: base,
      timingSplit: null,
    });
    expect(applyTutorialPreset(base, LABELS, ctx).project).toBe(base);
  });

  it("cuts one recording in half but does not pin timing to the guessed midpoint", () => {
    const base = project([], [], [take("a", 40)]);
    const result = applyTutorialPreset(base, LABELS, ctx);
    const [first, second] = expectTutorial(result.project);
    expect(first).toMatchObject({ takeId: "a", sourceIn: 0, sourceOut: 20 });
    expect(second).toMatchObject({ takeId: "a", sourceIn: 20, sourceOut: 40 });
    expect(result.timingSplit).toBeNull();
  });

  it("uses the first two videos when there are no clips yet", () => {
    const base = project([], [], [take("a", 12), take("b", 30), take("c")]);
    const result = applyTutorialPreset(base, LABELS, ctx);
    const [first, second] = expectTutorial(result.project);
    expect(first).toMatchObject({ takeId: "a" });
    expect(second).toMatchObject({ takeId: "b" });
    expect(result.timingSplit).toBeNull();
  });

  it("splits a single trimmed clip at its middle but does not pin timing there", () => {
    const base = project([video("v1", { sourceIn: 4, sourceOut: 16 })]);
    const result = applyTutorialPreset(base, LABELS, ctx);
    const [first, second] = expectTutorial(result.project);
    expect(first).toMatchObject({ id: "v1", sourceIn: 4, sourceOut: 10 });
    expect(second).toMatchObject({ sourceIn: 10, sourceOut: 16 });
    expect(result.timingSplit).toBeNull();
  });

  it("builds on two cut clips, drops old cards and keeps texts", () => {
    const base = project(
      [
        card("old-card", 3),
        video("run", { sourceIn: 1, sourceOut: 9 }),
        video("slow", { sourceIn: 12, sourceOut: 30 }),
      ],
      [[text("t1", 2, 2)]]
    );
    const result = applyTutorialPreset(base, LABELS, ctx);
    const [first, second] = expectTutorial(result.project);
    expect(first!.id).toBe("run");
    expect(second!.id).toBe("slow");
    expect(findItem(result.project, "old-card")).toBeNull();
    expect(findItem(result.project, "t1")).not.toBeNull();
    // The text over the run through stays above its look.
    const textTrack = findItem(result.project, "t1")!.trackIndex;
    const lookTracks = overlaysAnchoredTo(result.project, "run")
      .filter(({ item }) => item.fill)
      .map((entry) => entry.trackIndex);
    expect(lookTracks.length).toBeGreaterThan(0);
    expect(Math.max(...lookTracks)).toBeLessThan(textTrack);
    expect(result.timingSplit).toEqual({ takeId: "a", atSeconds: 12 });
  });

  it("keeps the split when two clips already come from one take", () => {
    const base = project([
      video("run", { sourceIn: 0, sourceOut: 6 }),
      video("slow", { sourceIn: 6, sourceOut: 20 }),
    ]);
    const result = applyTutorialPreset(base, LABELS, ctx);
    expectTutorial(result.project);
    expect(result.timingSplit).toEqual({ takeId: "a", atSeconds: 6 });
  });

  it("leaves speeds as recorded", () => {
    const base = project([
      video("run", { sourceOut: 8 }),
      video("slow", { takeId: "b", sourceOut: 16, speed: 0.5 }),
    ]);
    const [, second] = expectTutorial(
      applyTutorialPreset(base, LABELS, ctx).project
    );
    expect(second).toMatchObject({ speed: 0.5 });
  });

  it("returns the same project when applied twice", () => {
    const once = applyTutorialPreset(
      project([video("v1")]),
      LABELS,
      ctx
    ).project;
    expect(applyTutorialPreset(once, LABELS, ctx).project).toBe(once);
  });
});
