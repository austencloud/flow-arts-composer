import { describe, expect, it } from "vitest";
import type { GuideBlock } from "./guide-content-blocks";
import { flowProse } from "./flow-prose";
import { htmlSentences } from "../../_components/sentences";
import { negativeSpaceContent } from "./content/negative-space.content";
import { baseLettersContent } from "./content/base-letters.content";

const proseWith = (content: readonly GuideBlock[], needle: string): string => {
  const b = content.find((x) => x.kind === "prose" && x.html.includes(needle));
  if (!b || b.kind !== "prose") throw new Error(`no prose with ${needle}`);
  return b.html;
};

describe("flowProse", () => {
  it("keeps the break before a bullet line", () => {
    const out = flowProse(proseWith(negativeSpaceContent, "• Pass the thumb end"));
    expect(out).toMatch(/step 2\.<br>• Turn your torso/);
  });

  it("keeps the break after a label line that ends no sentence", () => {
    const out = flowProse(proseWith(baseLettersContent, "Notice the pattern"));
    expect(out).toContain("Hybrid</strong><br>This pattern helps");
  });

  it("turns a break between two sentences into a space", () => {
    expect(flowProse("One full sentence.<br>Another full sentence.")).toBe(
      "One full sentence. Another full sentence."
    );
    expect(flowProse("He said “go.”<br>Then he went.")).toBe(
      "He said “go.” Then he went."
    );
  });
  it("survives the sentence split the centred paragraphs use", () => {
    const out = flowProse(proseWith(baseLettersContent, "Notice the pattern"));
    expect(htmlSentences(out).join(" ")).toContain("<br>");
  });
});
