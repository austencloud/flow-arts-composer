import { describe, expect, it } from "vitest";
import {
  boxAt,
  findItem,
  postOutputSize,
  type PostItem,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  CARD_TITLE_LANDING_SECONDS,
  PostProjectSchema,
  editContext,
  normalizeProject,
  type PostTitlesItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  PAIR_NAME_SHARE,
  titlesPlanOf,
  titlesSpokenShown,
} from "#lib/shared/media-composition/domain/tunnel-titles.js";
import {
  TITLES_HOOK_BOX,
  landTitlesOnCard,
  titlesBoxOverWord,
} from "#lib/shared/media-composition/domain/post-project-edits.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
import { NOW, card, project, video } from "./post-project-fixtures";
import {
  CARD_ENDING_CARD_START,
  cardEndingFixture,
} from "../../../src/routes/test/post-studio/card-ending-fixture";

const ctx = editContext(NOW + 1);
const apply = (before: PostProject, ...ops: PostProjectOp[]) =>
  applyPostProjectOps(before, ops, ctx);
const loose = (op: object) => op as unknown as PostProjectOp;
const itemOf = (p: PostProject, id: string) =>
  findItem(p, id)?.item as Record<string, unknown> & PostItem;

const CARD_BOX = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
const WORD = { x: 0.3, y: 0.05, width: 0.4, height: 0.08 };

function titles(fields: Partial<PostTitlesItem> = {}): PostTitlesItem {
  return {
    id: "name",
    kind: "titles",
    start: 0,
    duration: 12,
    box: { x: 0, y: 0, width: 1, height: 1 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    spoken: "ohm, lam-dash",
    ...fields,
  };
}

/** A video to 4 s, a card from 4 s to 12 s, and a titles clip over both. */
function post(extra: Partial<PostTitlesItem> = {}): PostProject {
  return project(
    [
      video("v1", { start: 0, sourceOut: 4, pinnedStart: true }),
      card("end", 8, { start: 4, box: CARD_BOX } as Partial<PostItem>),
    ],
    [[titles(extra) as PostItem]]
  );
}

describe("a card's ending settings through the item op", () => {
  it("sets and clears each field", () => {
    const set = apply(post(), {
      op: "item",
      item: "end",
      patch: {
        enter: { style: "cascade" },
        ring: { at: 1, every: 0.75 },
        qrExit: { at: 6, caption: "Scan to try it" },
        headerTitle: "clip",
      },
    });
    expect(itemOf(set, "end")).toMatchObject({
      enter: { style: "cascade" },
      ring: { at: 1, every: 0.75 },
      qrExit: { at: 6, caption: "Scan to try it" },
      headerTitle: "clip",
    });
    const cleared = apply(set, {
      op: "item",
      item: "end",
      patch: { enter: null, ring: null, qrExit: null, headerTitle: "card" },
    });
    const item = itemOf(cleared, "end");
    for (const key of ["enter", "ring", "qrExit", "headerTitle"])
      expect(item).not.toHaveProperty(key);
  });

  it("survives a save: the stored post keeps the fields, in order", () => {
    const set = apply(post(), {
      op: "item",
      item: "end",
      patch: { ring: { at: 1, every: 0.5 }, headerTitle: "clip" },
    });
    const parsed = PostProjectSchema.parse(set);
    expect(itemOf(parsed, "end")).toMatchObject({
      ring: { at: 1, every: 0.5 },
      headerTitle: "clip",
    });
  });

  it("names what is wrong", () => {
    const before = post();
    expect(() =>
      apply(
        before,
        loose({ op: "item", item: "end", patch: { enter: { style: "slide" } } })
      )
    ).toThrow(/enter must be/);
    expect(() =>
      apply(
        before,
        loose({ op: "item", item: "end", patch: { ring: { at: 1 } } })
      )
    ).toThrow("ring needs every");
    expect(() =>
      apply(
        before,
        loose({ op: "item", item: "end", patch: { qrExit: { at: -4000 } } })
      )
    ).toThrow(/qrExit must be/);
    expect(() =>
      apply(
        before,
        loose({ op: "item", item: "end", patch: { headerTitle: "both" } })
      )
    ).toThrow(/headerTitle must be/);
    expect(() =>
      apply(
        before,
        loose({ op: "item", item: "v1", patch: { ring: { at: 1, every: 1 } } })
      )
    ).toThrow("Only a card takes");
    expect(() =>
      apply(
        before,
        loose({
          op: "item",
          item: "name",
          patch: { quiet: { from: 2, to: 1 } },
        })
      )
    ).toThrow(/quiet must be/);
  });

  it("still takes a titles clip's own enter", () => {
    const next = apply(post(), {
      op: "item",
      item: "name",
      patch: { enter: "none" },
    });
    expect(itemOf(next, "name").enter).toBe("none");
  });
});

describe("landing the titles on the card", () => {
  it("puts the name exactly over the card's word at the same size", () => {
    const frame = postOutputSize(post().canvas);
    const box = titlesBoxOverWord(CARD_BOX, WORD, frame);
    const wordTop = CARD_BOX.y + WORD.y * CARD_BOX.height;
    const wordHeight = WORD.height * CARD_BOX.height;
    const wordCentre = CARD_BOX.x + (WORD.x + WORD.width / 2) * CARD_BOX.width;
    // The pair draws its name in the top PAIR_NAME_SHARE of its box.
    expect(box.y).toBeCloseTo(wordTop, 9);
    expect(box.height * PAIR_NAME_SHARE).toBeCloseTo(wordHeight, 9);
    expect(box.x + box.width / 2).toBeCloseTo(wordCentre, 9);
    expect(box.width).toBeGreaterThan(WORD.width * CARD_BOX.width);
  });

  it("writes the box at the playhead and the landed box 0.6 s later", () => {
    const landed = landTitlesOnCard(post(), "name", "end", 4, WORD, ctx);
    const item = itemOf(landed, "name") as unknown as PostTitlesItem;
    const keys = item.keyframes!.box!;
    expect(keys.map((key) => key.t)).toEqual([
      4,
      4 + CARD_TITLE_LANDING_SECONDS,
    ]);
    expect(keys[0]!.value).toEqual(TITLES_HOOK_BOX);
    expect(keys[0]!.easing).not.toBe("hold");
    expect(item.leave).toBe("stay");
    expect(item.quiet).toEqual({ from: 4, to: 12 });
    expect(itemOf(landed, "end").headerTitle).toBe("clip");
    expect(titlesPlanOf(item).layout).toBe("pair");
    const frame = postOutputSize(landed.canvas);
    expect(boxAt(item, 11)).toEqual(titlesBoxOverWord(CARD_BOX, WORD, frame));
  });

  it("starts no earlier than the card", () => {
    const landed = landTitlesOnCard(post(), "name", "end", 1, WORD, ctx);
    const keys = (itemOf(landed, "name") as unknown as PostTitlesItem)
      .keyframes!.box!;
    expect(keys[0]!.t).toBe(4);
  });

  it("leaves the post alone when the glide would outlast a clip", () => {
    const before = post();
    expect(landTitlesOnCard(before, "name", "end", 11.8, WORD, ctx)).toBe(
      before
    );
  });

  it("is a command-line op that takes the measured word", () => {
    const landed = apply(post(), { op: "land-titles", word: WORD });
    expect(itemOf(landed, "end").headerTitle).toBe("clip");
    expect(() =>
      apply(
        post(),
        loose({ op: "land-titles", word: { x: 0, y: 0, width: 0, height: 1 } })
      )
    ).toThrow(/word must be/);
  });

  it("fades the spoken line out from the landing on", () => {
    const landed = landTitlesOnCard(post(), "name", "end", 4, WORD, ctx);
    const plan = titlesPlanOf(
      itemOf(landed, "name") as unknown as PostTitlesItem
    );
    expect(titlesSpokenShown(plan, 3.9)).toBe(1);
    expect(titlesSpokenShown(plan, 4.15)).toBeCloseTo(0.5);
    expect(titlesSpokenShown(plan, 5)).toBe(0);
  });
});

describe("the card-ending harness post", () => {
  it("normalises and stores with the card at 4 s and its ending intact", () => {
    const fixture = normalizeProject(
      cardEndingFixture("post-card-ending-fixture")
    );
    const parsed = PostProjectSchema.parse(fixture);
    const card = itemOf(parsed, "card-ending-card") as Record<
      string,
      unknown
    > & {
      start: number;
      ring: { at: number; every: number };
      qrExit: { at: number; caption: string };
    };
    expect(card.start).toBe(CARD_ENDING_CARD_START);
    expect(card).toMatchObject({
      enter: { style: "cascade" },
      ring: { at: 1, every: 0.75 },
      headerTitle: "clip",
    });
    // Pictograph 16 is reached 15 steps after the first, 0.05 s late.
    expect(card.qrExit.at).toBeCloseTo(1 + 0.05 + 15 * 0.75 + 0.5, 9);
    const titles = itemOf(
      parsed,
      "card-ending-titles"
    ) as unknown as PostTitlesItem;
    expect(titles.keyframes!.box!.map((key) => key.t)).toEqual([
      0,
      CARD_ENDING_CARD_START,
      CARD_ENDING_CARD_START + CARD_TITLE_LANDING_SECONDS,
    ]);
    expect(titles.leave).toBe("stay");
    expect(itemOf(parsed, "card-ending-animation").duration).toBe(
      CARD_ENDING_CARD_START
    );
  });
});
