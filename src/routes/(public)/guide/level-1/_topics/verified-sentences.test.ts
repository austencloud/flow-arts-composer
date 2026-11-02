import { describe, expect, it } from "vitest";
import en from "../../../../../../messages/en.json";
import ja from "../../../../../../messages/ja.json";
import { sentenceCount, takeSentences } from "./verified-sentences";

const english = en as Record<string, string>;

describe("takeSentences", () => {
  it("cuts the Cross-Shift paragraph after its second sentence", () => {
    const html = english.verified_level1_hm_type34_120!;
    expect(sentenceCount(html)).toBe(3);
    expect(takeSentences(html, 0, 2)).toBe(
      'A <span class="cross">Cross</span><span class="shift">-Shift</span> combines a shift and a dash.<br>' +
        "Since a dash has further to travel, it moves slightly faster."
    );
    expect(takeSentences(html, 2, 3)).toBe(
      'To understand <span class="cross">Cross</span><span class="shift">-Shifts</span>, let’s break one down into parts:'
    );
  });

  it("keeps the halfway note's first three sentences, break included", () => {
    expect(takeSentences(english.verified_level1_hm_type34_122!, 0, 3)).toBe(
      "Note the halfway point. One hand is in the center point and one is on a diagonal hand point.<br>" +
        "By pausing at this halfway point, it ensures that the dash moves at the correct speed."
    );
  });

  it("takes the Dash line's first sentence", () => {
    expect(takeSentences(english.verified_level1_hm_type56_129!, 0, 1)).toBe(
      'With a <span class="k-dash">Dash</span>, one hand executes a dash while the other hand remains static.'
    );
  });

  it("never splits inside an element or at a mid-sentence break", () => {
    const html = english.verified_level1_hand_motions_80!;
    expect(sentenceCount(html)).toBe(1);
    expect(takeSentences(html, 0, 1)).toBe(html);
  });

  it("cuts full-width sentence marks, which take no space after them", () => {
    const html = (ja as Record<string, string>).verified_level1_hm_type34_122!;
    expect(takeSentences(html, 0, 1)).toBe("中間点に注目してください。");
    expect(sentenceCount(html)).toBe(5);
  });

  it("gives what there is when a translation has fewer sentences", () => {
    expect(takeSentences("One sentence.", 0, 3)).toBe("One sentence.");
    expect(takeSentences("One sentence.", 1, 3)).toBe("");
  });
});
