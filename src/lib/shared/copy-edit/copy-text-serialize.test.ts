// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  copyTokensFromDom,
  parseCopyText,
  serializeCopyTokens,
} from "./copy-text-serialize";

const roundTrip = (source: string, islands = 2) =>
  serializeCopyTokens(parseCopyText(source, islands));

const fromHtml = (html: string) => {
  // The test setup stubs document.createElement, so this uses its own document.
  const root = document.implementation
    .createHTMLDocument()
    .createElement("span");
  root.innerHTML = html;
  return serializeCopyTokens(copyTokensFromDom(root));
};

// A round trip that drifts marks an untouched block as changed, or rewrites
// words in copy.json that nobody edited.
describe("copy text round trips", () => {
  for (const source of [
    "Plain words, with punctuation.",
    "on {0}, posting as Damien and {1}.",
    "first line<br>second line",
    "<strong>bold <em>both</em> bold</strong> plain",
    "<strong><em>both</em></strong>",
    "<strong>{0}</strong> after",
    "one { brace and } another, {not a slot}",
    "a < b and c > d",
    "",
  ]) {
    it(JSON.stringify(source), () => {
      expect(roundTrip(source)).toBe(source);
    });
  }
});

describe("parseCopyText", () => {
  it("splits text around islands in order", () => {
    expect(parseCopyText("a {1} b {0}", 2).map((t) => t.kind)).toEqual([
      "text",
      "island",
      "text",
      "island",
    ]);
  });

  it("keeps a placeholder with no island as literal text", () => {
    const tokens = parseCopyText("see {5} and {0}", 1);
    expect(tokens[0]).toMatchObject({ kind: "text", text: "see {5} and " });
    expect(tokens[1]).toMatchObject({ kind: "island", index: 0 });
    expect(roundTrip("see {5} and {0}", 1)).toBe("see {5} and {0}");
  });

  it("does not read a padded number as a placeholder", () => {
    expect(parseCopyText("{01}", 2)).toEqual([
      { kind: "text", text: "{01}", strong: false, em: false },
    ]);
  });
});

describe("reading an edited block", () => {
  it("gives an island wrapper back as its placeholder, not its label", () => {
    expect(
      fromHtml(
        'on <span data-island="0" contenteditable="false"><a href="/x">Home of Poi</a></span>, posting'
      )
    ).toBe("on {0}, posting");
  });

  it("turns the no-break space browsers type into a plain space", () => {
    expect(fromHtml("word&nbsp;")).toBe("word ");
  });

  it("drops the placeholder break of an emptied block", () => {
    expect(fromHtml("<br>")).toBe("");
    expect(fromHtml("one<br>two<br>")).toBe("one<br>two");
  });

  it("reads Ctrl+B and Ctrl+I as strong and em", () => {
    expect(fromHtml("<b>a</b> <i>b</i>")).toBe("<strong>a</strong> <em>b</em>");
  });

  it("keeps only the text of any other element", () => {
    expect(fromHtml('<span style="color:red">a<div>b</div></span>')).toBe("ab");
  });
});
