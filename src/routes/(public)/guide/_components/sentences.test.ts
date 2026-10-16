import { describe, expect, it } from "vitest";
import { htmlSentences, sentences } from "./sentences";

describe("sentences", () => {
  it("splits after closing marks and keeps every word", () => {
    const text = "Zan made it. Can you? Try it now!";
    expect(sentences(text)).toEqual([
      "Zan made it.",
      "Can you?",
      "Try it now!",
    ]);
  });

  it("keeps a closing quote with its sentence", () => {
    expect(sentences('He called it "the diamond." It stuck.')).toEqual([
      'He called it "the diamond."',
      "It stuck.",
    ]);
  });

  it("leaves decimals and unspaced scripts alone", () => {
    expect(sentences("Turn 1.5 times.")).toEqual(["Turn 1.5 times."]);
    expect(sentences("回します。次へ。")).toEqual(["回します。次へ。"]);
  });
});

describe("htmlSentences", () => {
  it("splits top-level sentences and keeps tags whole", () => {
    expect(
      htmlSentences(
        'The <span class="cR">red</span> hand leads. <strong>Then</strong> blue.'
      )
    ).toEqual([
      'The <span class="cR">red</span> hand leads.',
      "<strong>Then</strong> blue.",
    ]);
  });

  it("splits after a sentence that ends inside a closed tag", () => {
    expect(htmlSentences("Read <em>this.</em> Then that.")).toEqual([
      "Read <em>this.</em>",
      "Then that.",
    ]);
  });

  it("never splits inside an open element", () => {
    const html = '<span class="cB">One. Two.</span> Three.';
    expect(htmlSentences(html)).toEqual([
      '<span class="cB">One. Two.</span>',
      "Three.",
    ]);
  });

  it("treats void tags as closed", () => {
    expect(htmlSentences("One.<br> Two.")).toEqual(["One.<br>", "Two."]);
  });
});
