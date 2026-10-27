import { describe, expect, it } from "vitest";
import type { GuideBlock } from "./guide-content-blocks";
import { flowRenderItems, flowScreens, isLeadIn, unbreakSentences } from "./flow-render-items";
import { hmGammaContent } from "./content/hm-gamma.content";

const card = (caption: string): GuideBlock =>
  ({
    kind: "pictographGroup",
    items: [],
    card: true,
    layout: "strip",
    caption,
  }) as unknown as GuideBlock;
const p = (html: string, attach?: "next" | "previous"): GuideBlock => ({
  kind: "prose",
  html,
  ...(attach ? { attach } : {}),
});
const h = (text: string): GuideBlock => ({ kind: "heading", level: 2, text });

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
  it("lets a card's long words go on a small window", () => {
    const long = "x".repeat(120);
    const content = [h("Two"), p(long), card("B"), p("After.")];
    expect(textOf(flowRenderItems(content, "", undefined, { detachTextChars: 90 }))).toEqual([
      "heading",
      long,
      "[B: ]",
      "After.",
    ]);
    expect(textOf(flowRenderItems(content, ""))).toEqual([`[B: #Two | ${long} | After.]`]);
  });
});

describe("flowScreens", () => {
  it("puts each figure on its own screen with its own words", () => {
    const items = flowRenderItems(
      [p("Intro words."), h("One"), card("A"), p("About A."), h("Two"), card("B")],
      ""
    );
    const screens = flowScreens(items);
    expect(screens.map((s) => s.label)).toEqual(["One", "Two"]);
    expect(screens[0]!.items).toEqual([0, 1]);
  });
  it("gives the opening words their own screen when the first figure brings its own", () => {
    const items = flowRenderItems([p("Intro words."), h("One"), card("A"), p("About A.")], "");
    expect(flowScreens(items, "Intro", { introOwnScreen: true }).map((s) => s.label)).toEqual([
      "Intro",
      "One",
    ]);
    expect(flowScreens(items, "Intro").map((s) => s.label)).toEqual(["One"]);
  });
  it("gives long text its own screen on a small window", () => {
    const long = p("x".repeat(120));
    const items = flowRenderItems([long, h("One"), card("A")], "");
    expect(flowScreens(items, "Intro", { textScreenChars: 90 }).map((s) => s.label)).toEqual([
      "Intro",
      "One",
    ]);
    expect(flowScreens(items).map((s) => s.label)).toEqual(["One"]);
  });
  it("gives long notes after a figure their own screen on a small window", () => {
    const items = flowRenderItems(
      [h("One"), card("A"), p("x".repeat(120), "previous")],
      "",
      undefined,
      { detachTextChars: 90 }
    );
    expect(flowScreens(items, "Intro", { textScreenChars: 90 })).toHaveLength(2);
    expect(flowScreens(items)).toHaveLength(1);
  });
  it("ends a screen of words alone before it passes the small window's limit", () => {
    const items = flowRenderItems([p("x".repeat(300)), h("Two"), p("y".repeat(100))], "");
    const capped = flowScreens(items, "Intro", { textScreenMaxChars: 340 });
    expect(capped.map((s) => s.label)).toEqual(["Intro", "Two"]);
    expect(capped[1]!.items.map((i) => items[i]!.type === "block" && items[i]!.block.kind)).toEqual([
      "heading",
      "prose",
    ]);
    expect(flowScreens(items)).toHaveLength(1);
  });
});

describe("the Gamma page", () => {
  const items = flowRenderItems(hmGammaContent, "");
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
