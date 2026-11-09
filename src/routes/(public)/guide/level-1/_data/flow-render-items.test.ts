import { describe, expect, it } from "vitest";
import type { GuideBlock } from "./guide-content-blocks";
import { flowRenderItems, flowScreens, isLeadIn, unbreakSentences } from "./flow-render-items";
import { stripHtml } from "./flow-intro";
import { GUIDE_CONTENT } from "./guide-content";
import { hmGammaContent } from "./content/hm-gamma.content";
import { negativeSpaceContent } from "./content/negative-space.content";
import { screenRoom, type ScreenRoom } from "../../_components/fit/guide-screen-url";

const card = (caption: string): GuideBlock =>
  ({
    kind: "pictographGroup",
    items: [],
    card: true,
    layout: "strip",
    caption,
  }) as unknown as GuideBlock;
const gallery = (caption: string, tiles: number): GuideBlock =>
  ({
    kind: "pictographGroup",
    items: Array.from({ length: tiles }, () => ({})),
    layout: "row",
    caption,
  }) as unknown as GuideBlock;
const strip = (caption: string, cells: number): GuideBlock =>
  ({
    kind: "pictographGroup",
    items: Array.from({ length: cells }, () => ({})),
    layout: "strip",
    caption,
  }) as unknown as GuideBlock;
const p = (html: string, attach?: "next" | "previous"): GuideBlock => ({
  kind: "prose",
  html,
  ...(attach ? { attach } : {}),
});
const h = (text: string): GuideBlock => ({ kind: "heading", level: 2, text });

const room = (over: Partial<ScreenRoom> = {}): ScreenRoom => ({
  beside: 400,
  over: 400,
  band: 400,
  tiles: 12,
  alone: 800,
  stripCols: 8,
  stripRowChars: 100,
  ...over,
});

const textOf = (items: ReturnType<typeof flowRenderItems>) =>
  items.map((it) =>
    it.type === "showcase"
      ? `[${it.card.caption}: ${it.text
          .map((b) => (b.kind === "heading" ? `#${b.text}` : b.kind === "prose" ? b.html : ""))
          .join(" | ")}]`
      : it.block.kind === "prose"
        ? it.block.html
        : it.block.kind
  );

const isFigureItem = (it: ReturnType<typeof flowRenderItems>[number]) =>
  it.type === "showcase" ||
  it.block.kind === "pictograph" ||
  it.block.kind === "pictographGroup" ||
  it.block.kind === "gridFigure" ||
  it.block.kind === "gridExplorer";

describe("unbreakSentences", () => {
  it("joins a line broken inside a sentence and keeps the other breaks", () => {
    expect(unbreakSentences("the hub that<br>everything revolves around.")).toBe(
      "the hub that everything revolves around."
    );
    expect(unbreakSentences("Move to an<br><strong>adjacent</strong> point")).toBe(
      "Move to an <strong>adjacent</strong> point"
    );
    expect(unbreakSentences("One line.<br>Next line.")).toBe("One line.<br>Next line.");
    expect(unbreakSentences("Para one.<br><br>again")).toBe("Para one.<br><br>again");
    expect(unbreakSentences("• one<br>• two")).toBe("• one<br>• two");
  });
});

describe("isLeadIn", () => {
  it("reads a closing colon or an explicit attach", () => {
    expect(isLeadIn(p("Here’s one:"))).toBe(true);
    expect(isLeadIn(p("A note."))).toBe(false);
    expect(isLeadIn(p("A note.", "next"))).toBe(true);
    expect(isLeadIn(p("Here’s one:", "previous"))).toBe(false);
  });
});

describe("flowRenderItems", () => {
  it("gives a lead-in to the card after it, not the card before", () => {
    const items = flowRenderItems(
      [card("A"), p("About A."), p("Now B:"), card("B")],
      ""
    );
    expect(textOf(items)).toEqual(["[A: About A.]", "[B: Now B:]"]);
  });
  it("keeps a heading-led section with its card", () => {
    const items = flowRenderItems([h("Two"), p("Words."), card("B")], "");
    expect(textOf(items)).toEqual(["[B: #Two | Words.]"]);
  });
  it("runs a card's long words across screens, the card on each", () => {
    const one = `${"x".repeat(150)}.`;
    const two = `${"y".repeat(150)}.`;
    const items = flowRenderItems([h("Two"), p(one), p(two), card("B")], "", undefined, {
      room: room({ beside: 200 }),
    });
    expect(textOf(items)).toEqual([`[B: #Two | ${one}]`, `[B: ${two}]`]);
  });
  it("breaks a paragraph longer than a screen at its sentences", () => {
    const one = `${"x".repeat(150)}.`;
    const two = `${"y".repeat(150)}.`;
    const items = flowRenderItems([p(`${one} ${two}`), card("B")], "", undefined, {
      room: room({ beside: 200 }),
    });
    expect(textOf(items)).toEqual([`[B: ${one}]`, `[B: ${two}]`]);
  });
  it("hands notes past a figure's room to the next figure", () => {
    const items = flowRenderItems(
      [gallery("A", 2), p("x".repeat(120)), p("y".repeat(120)), gallery("B", 2)],
      "",
      undefined,
      { room: room({ over: 200 }) }
    );
    const screens = flowScreens(items);
    expect(screens.map((s) => textOf(s.items.map((i) => items[i]!)))).toEqual([
      ["pictographGroup", "x".repeat(120)],
      ["y".repeat(120), "pictographGroup"],
    ]);
  });
  it("packs a gallery set by how many tiles fit", () => {
    const content = [gallery("A", 4), gallery("B", 4), gallery("C", 4)];
    const cut = (tiles: number) =>
      flowScreens(flowRenderItems(content, "", undefined, { room: room({ tiles }) })).map(
        (s) => s.items.length
      );
    expect(cut(12)).toEqual([3]);
    expect(cut(8)).toEqual([2, 1]);
    expect(cut(4)).toEqual([1, 1, 1]);
  });
  it("packs consecutive bare strips onto one screen while their cells fit", () => {
    // Reversals: two three-cell strips under one heading share a screen. A
    // strip's fused cells cost two thirds of a captioned tile each.
    const content = [h("Hand"), p("Words."), strip("A", 3), strip("B", 3), h("Prop"), strip("C", 3)];
    const cut = (tiles: number) =>
      flowScreens(flowRenderItems(content, "", undefined, { room: room({ tiles }) })).map(
        (s) => s.label
      );
    expect(cut(12)).toEqual(["Hand", "Prop"]);
    expect(cut(4)).toEqual(["Hand", "Prop"]);
    expect(cut(3)).toEqual(["Hand", "B", "Prop"]);
  });
  it("keeps strips apart when the words before them need more than a screen and a half", () => {
    const content = [h("Prop"), p("w".repeat(400)), strip("A", 3), strip("B", 3)];
    const cut = (over: number) =>
      flowScreens(flowRenderItems(content, "", undefined, { room: room({ tiles: 12, over }) })).map(
        (s) => s.items.length
      );
    expect(cut(1000)).toEqual([4]);
    expect(cut(200).length).toBeGreaterThan(1);
  });
  it("leaves the first screen room for a lead note and keeps every word", () => {
    const content = [h("Hand"), p("a".repeat(150)), p("b".repeat(150)), strip("A", 3)];
    const screensOf = (lead?: number) =>
      flowScreens(flowRenderItems(content, "", undefined, { room: room({ over: 500, lead }) }));
    expect(screensOf().length).toBe(1);
    const withNote = flowRenderItems(content, "", undefined, { room: room({ over: 500, lead: 200 }) });
    expect(screensOf(200).length).toBeGreaterThan(1);
    const words = withNote.filter((i) => i.type === "block" && i.block.kind === "prose");
    expect(words.length).toBe(2);
  });
  it("keeps a run of cards' captions when words join them", () => {
    const items = flowRenderItems([card("A"), card("B"), p("Words.")], "", undefined, {
      room: room(),
    });
    const last = items[items.length - 1]!;
    expect(last.type === "showcase" && last.keepCaption).toBe(true);
  });
});

describe("a long tagline", () => {
  const long = `${"x".repeat(300)}.`;
  const wordsOf = (content: GuideBlock[]) =>
    textOf(flowRenderItems(content, long, undefined, { room: room() }));
  it("becomes the first words when the page does not say it", () => {
    expect(wordsOf([p("Other words."), gallery("A", 2)])[0]).toBe(long);
  });
  it("does not repeat a sentence a pool's example already says", () => {
    const pooled = {
      ...gallery("A", 2),
      pool: { entries: [{ proseHtml: long }] },
    } as unknown as GuideBlock;
    expect(wordsOf([pooled]).join(" ")).not.toContain(long);
  });
});

describe("a pool of examples", () => {
  const pooled = {
    ...card("A"),
    pool: {
      entries: [{ proseHtml: "x".repeat(150) }, { proseHtml: "y".repeat(40) }],
    },
  } as unknown as GuideBlock;
  const held = (beside: number) =>
    flowRenderItems([p("Page words."), pooled], "", undefined, {
      room: room({ beside }),
    }).map((it) => it.type === "showcase" && it.holdPool);

  it("shares a screen with the page's words when its longest example fits", () => {
    expect(held(400)).toEqual([false]);
  });
  it("follows the page's words when its longest example would not fit", () => {
    expect(held(200)).toEqual([true, false]);
  });
});

describe("flowScreens", () => {
  it("puts each figure on its own screen with its own words", () => {
    const items = flowRenderItems(
      [p("Intro words."), h("One"), card("A"), p("About A."), h("Two"), card("B")],
      "",
      undefined,
      { room: room() }
    );
    const screens = flowScreens(items);
    expect(screens.map((s) => s.label)).toEqual(["One", "Two"]);
    expect(textOf(screens[0]!.items.map((i) => items[i]!))).toEqual([
      "[A: Intro words. | #One | About A.]",
    ]);
  });
  it("names a screen from its caption's plain part, else the one before", () => {
    const long = `${"x".repeat(150)}.`;
    const items = flowRenderItems(
      [h("One"), p(long), p(long), card("A: first"), card("AABB ×2 (after 3): why"), p("z.")],
      "",
      undefined,
      { room: room({ beside: 200 }) }
    );
    const labels = flowScreens(items).map((s) => s.label);
    expect(labels[0]).toBe("One");
    expect(labels[labels.length - 1]).toBe("AABB ×2");
  });
  it("falls back to Intro on a first screen with nothing to name it", () => {
    const items = flowRenderItems([p("Words.")], "", undefined, { room: room() });
    expect(flowScreens(items).map((s) => s.label)).toEqual(["Intro"]);
  });
});

describe("the Negative Space page", () => {
  it("keeps every word on a screen with a figure in a large window", () => {
    const items = flowRenderItems(negativeSpaceContent, "", undefined, {
      room: screenRoom(1440, 900),
    });
    const screens = flowScreens(items);
    expect(screens.every((s) => s.items.some((i) => items[i]!.type === "showcase"))).toBe(true);
    expect(textOf(items).join(" ")).toContain("learn these two first");
  });
});

describe("the Gamma page", () => {
  const items = flowRenderItems(hmGammaContent, "", undefined, {
    room: screenRoom(1440, 900),
  });
  const screens = flowScreens(items);
  const screenText = (n: number) => textOf(screens[n]!.items.map((i) => items[i]!)).join(" ");

  it("shows each mode with its own notes", () => {
    expect(screens.map((s) => s.label)).toEqual([
      "Quarter-Opp",
      "Quarter-Same",
      "Switching between them",
    ]);
    expect(screenText(0)).toContain("antiparallel");
    expect(screenText(1)).toContain("In Quarter-Same that never happens");
    expect(screenText(0)).not.toContain("Quarter-Same that never");
  });
});

// Austen, 2026-11-06: "No scrolling is true... However, we should never have a
// page that's just a bunch of text."
describe.each([
  [375, 667],
  [960, 412],
  [707, 772],
  [820, 1180],
  [1000, 800],
  [1224, 1100],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [3840, 2160],
])("every guide page at %ix%i", (w, h) => {
  const windowRoom = screenRoom(w, h);
  const pages = Object.entries(GUIDE_CONTENT).map(([slug, content]) => {
    const whole = flowRenderItems(content, "");
    const items = flowRenderItems(content, "", undefined, { room: windowRoom });
    return { slug, whole, items, screens: flowScreens(items) };
  });

  it("has no screen without a figure on a page with one", () => {
    const bare = pages.flatMap(({ slug, items, screens }) =>
      items.some(isFigureItem)
        ? screens
            .filter((s) => !s.items.some((i) => isFigureItem(items[i]!)))
            .map((s) => `${slug}: ${s.label}`)
        : []
    );
    expect(bare).toEqual([]);
  });

  it("never names a screen Part N", () => {
    const parts = pages.flatMap(({ slug, screens }) =>
      screens.filter((s) => /^Part \d+$/.test(s.label)).map((s) => `${slug}: ${s.label}`)
    );
    expect(parts).toEqual([]);
  });

  it("shows every word, once, in reading order", () => {
    const words = (list: ReturnType<typeof flowRenderItems>) =>
      list
        .flatMap((it) => {
          const blocks = it.type === "showcase" ? it.text : [it.block];
          return blocks.map((b) => (b.kind === "prose" ? stripHtml(b.html) : ""));
        })
        .join(" ")
        .replace(/\s+/g, "");
    for (const { slug, whole, items } of pages) {
      const sorted = (s: string) => [...s].sort().join("");
      expect(sorted(words(items)), slug).toBe(sorted(words(whole)));
    }
  });
});
