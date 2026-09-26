import { describe, expect, it } from "vitest";
import { migratePostPlan } from "$lib/shared/media-composition/domain/post-project-migration";
import {
  POST_BOX,
  PostProjectSchema,
  findItem,
  itemEnd,
} from "$lib/shared/media-composition/domain/post-project";
import {
  DEFAULT_FRAMING,
  POST_ACT,
  PostPlanSchema,
  addTakeToPlan,
  createDefaultPostPlan,
} from "$lib/shared/media-composition/domain/post-plan";
import { NOW, spans, take } from "./post-project-fixtures";

describe("migratePostPlan", () => {
  it("migrates the default template with one take: split, an alternate-strip breakdown with a carousel, then a card", () => {
    const plan = addTakeToPlan(
      createDefaultPostPlan({ sequenceId: "seq", now: NOW }),
      take("t1", 20),
      NOW
    );
    const result = migratePostPlan(plan, { now: NOW });

    expect(PostProjectSchema.safeParse(result).success).toBe(true);
    expect(result.sequenceId).toBe("seq");
    expect(result.takes).toEqual(plan.takes);
    expect(result.audio).toBe("takes");
    expect(result.updatedAt).toBe(NOW);

    // Full speed (20s), then the breakdown at half speed (40s), then the card.
    expect(spans(result, 0)).toEqual([
      ["video-1", 0, 20],
      ["video-2", 20, 40],
      ["card-1", 60, 5],
    ]);

    const fullSpeed = findItem(result, "video-1")!.item;
    expect(fullSpeed.kind === "video" && fullSpeed.box).toEqual(POST_BOX.top);
    expect(fullSpeed.fadeIn).toBe(0); // the first kept clip never fades in
    expect(fullSpeed.kind === "video" && fullSpeed.volume).toBe(1);

    const breakdown = findItem(result, "video-2")!.item;
    // "full" layout with framing.area "frame" (not "above-strip") runs full
    // frame - the strip draws over the footage rather than shrinking it.
    expect(breakdown.kind === "video" && breakdown.box).toEqual(POST_BOX.full);
    expect(breakdown.fadeIn).toBe(0.25);
    expect(breakdown.kind === "video" && breakdown.speed).toBe(0.5);
    // A slowed act's take would drift and pitch-shift if reused as is.
    expect(breakdown.kind === "video" && breakdown.volume).toBe(0);

    const cardItem = findItem(result, "card-1")!.item;
    expect(cardItem.kind).toBe("card");
    expect(cardItem.fadeIn).toBe(0.25);
    // v1's English template names are dropped so the editor can translate.
    for (const id of ["video-1", "video-2", "card-1"]) {
      expect(findItem(result, id)!.item.label).toBeUndefined();
    }

    // The split's animation overlay fills the full-speed clip exactly.
    const animation = findItem(result, "animation-1")!.item;
    expect(animation.kind === "animation" && animation.overlay).toBe(true);
    expect(animation.fill).toBe(true);
    expect([animation.start, itemEnd(animation)]).toEqual([0, 20]);
    expect(animation.box).toEqual(POST_BOX.bottom);
    expect(animation.fadeIn).toBe(0); // follows the full-speed clip's own fade

    // The breakdown's alternate strip and its carousel both fill that clip.
    const moves = findItem(result, "moves-1")!.item;
    expect(moves.kind === "moves" && moves.mode).toBe("alternate");
    expect(moves.box).toEqual(POST_BOX.stripSquare);
    expect([moves.start, itemEnd(moves)]).toEqual([20, 60]);
    expect(moves.fadeIn).toBe(0.25);

    const carousel = findItem(result, "carousel-1")!.item;
    expect(carousel.kind).toBe("carousel");
    expect(carousel.box).toEqual(POST_BOX.stripCarousel);
    expect([carousel.start, itemEnd(carousel)]).toEqual([20, 60]);
  });

  it("keeps captions above every look", () => {
    const base = addTakeToPlan(
      createDefaultPostPlan({ sequenceId: "seq", now: NOW }),
      take("t1", 20),
      NOW
    );
    const plan = PostPlanSchema.parse({
      ...base,
      captions: [
        {
          id: "cap-1",
          actId: POST_ACT.breakdown,
          text: "Slow",
          startSeconds: 0,
          endSeconds: 4,
          position: "bottom",
          size: "m",
        },
      ],
    });
    const result = migratePostPlan(plan, { now: NOW });
    expect(PostProjectSchema.safeParse(result).success).toBe(true);
    const trackOf = (id: string) => findItem(result, id)!.trackIndex;
    expect([trackOf("animation-1"), trackOf("moves-1")]).toEqual([1, 1]);
    expect(trackOf("carousel-1")).toBe(2);
    expect(trackOf("text-1")).toBe(3);
  });

  it("drops a performance act whose take no longer exists", () => {
    const plan = PostPlanSchema.parse({
      schemaVersion: 1,
      sequenceId: "seq",
      takes: [],
      acts: [
        {
          id: "act-1",
          kind: "performance",
          label: "Act",
          enabled: true,
          takeId: null,
          sourceIn: 0,
          sourceOut: null,
          speed: 1,
          layout: "split",
          strip: "off",
          carousel: false,
          framing: DEFAULT_FRAMING,
        },
        { id: "card-1", kind: "card", label: "Card", enabled: true, seconds: 4 },
      ],
      captions: [],
      audio: "takes",
      updatedAt: NOW,
    });

    const result = migratePostPlan(plan, { now: NOW });
    expect(PostProjectSchema.safeParse(result).success).toBe(true);
    // Only the card survives; the take-less performance act leaves no item.
    expect(spans(result, 0)).toEqual([["card-1", 0, 4]]);
  });

  it("maps captions to anchored text clamped to the act's own length, dropping a blank one and one on a disabled act", () => {
    const plan = PostPlanSchema.parse({
      schemaVersion: 1,
      sequenceId: "seq",
      takes: [take("t1", 10)],
      acts: [
        {
          id: "a1",
          kind: "performance",
          label: "Act",
          enabled: true,
          takeId: "t1",
          sourceIn: 0,
          sourceOut: null,
          speed: 1,
          layout: "split",
          strip: "off",
          carousel: false,
          framing: DEFAULT_FRAMING,
        },
        {
          id: "disabled-1",
          kind: "performance",
          label: "Disabled",
          enabled: false,
          takeId: null,
          sourceIn: 0,
          sourceOut: null,
          speed: 1,
          layout: "split",
          strip: "off",
          carousel: false,
          framing: DEFAULT_FRAMING,
        },
      ],
      captions: [
        {
          id: "cap-1",
          actId: "a1",
          text: "Hello",
          startSeconds: 1,
          endSeconds: 3,
          position: "top",
          size: "m",
        },
        {
          id: "cap-2",
          actId: "a1",
          text: "Late",
          startSeconds: 8,
          endSeconds: 20, // runs past the act's own 10s length
          position: "bottom",
          size: "s",
        },
        {
          id: "cap-3",
          actId: "a1",
          text: "   ",
          startSeconds: 0,
          endSeconds: 1,
          position: "middle",
          size: "l",
        },
        {
          id: "cap-4",
          actId: "disabled-1",
          text: "Ghost",
          startSeconds: 0,
          endSeconds: 1,
          position: "top",
          size: "m",
        },
      ],
      audio: "takes",
      updatedAt: NOW,
    });

    const result = migratePostPlan(plan, { now: NOW });
    expect(PostProjectSchema.safeParse(result).success).toBe(true);
    expect(spans(result, 0)).toEqual([["video-1", 0, 10]]);
    // A name the maker gave an act stays.
    expect(findItem(result, "video-1")!.item.label).toBe("Act");

    const allItems = result.tracks.flatMap((track) => track.items);
    expect(allItems.some((item) => item.kind === "text" && item.text === "Ghost")).toBe(
      false
    );
    expect(allItems.some((item) => item.kind === "text" && item.text.trim() === "")).toBe(
      false
    );
    expect(allItems.filter((item) => item.kind === "text")).toHaveLength(2);

    const cap1 = findItem(result, "text-1")!.item;
    expect(cap1.kind === "text" && cap1.text).toBe("Hello");
    expect([cap1.start, itemEnd(cap1)]).toEqual([1, 3]);
    expect(cap1.anchor).toEqual({ itemId: "video-1", offset: 1 });
    expect(cap1.fadeIn).toBe(0.15);
    expect(cap1.fadeOut).toBe(0.15);

    const cap2 = findItem(result, "text-2")!.item;
    expect(cap2.kind === "text" && cap2.text).toBe("Late");
    // Clamped to the act's own 10s length, not the caption's own 20s end.
    expect([cap2.start, itemEnd(cap2)]).toEqual([8, 10]);
  });
});
