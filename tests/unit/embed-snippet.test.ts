import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippet,
  embedDisplayWord,
  embedPageUrl,
  embedPlayerUrl,
} from "../../src/lib/shared/share/services/embed-snippet";

describe("embedDisplayWord", () => {
  it("falls back to 'Sequence' for a null/blank word", () => {
    expect(embedDisplayWord(null)).toBe("Sequence");
    expect(embedDisplayWord(undefined)).toBe("Sequence");
    expect(embedDisplayWord("   ")).toBe("Sequence");
  });

  it("simplifies a repeated word the same way the rest of the product does", () => {
    // AA -> A per simplifyRepeatedWord's repeat-collapsing rule.
    expect(embedDisplayWord("AA")).toBe("A");
  });
});

describe("embedPageUrl / embedPlayerUrl", () => {
  it("build the canonical page and player URLs from a code", () => {
    expect(embedPageUrl("P3WN")).toBe("https://tkaflowarts.com/sequence/P3WN");
    expect(embedPlayerUrl("P3WN")).toBe(
      "https://tkaflowarts.com/embed/sequence/P3WN"
    );
  });

  it("URL-encodes a code that contains reserved characters", () => {
    expect(embedPageUrl("s~q1:a|b")).toBe(
      "https://tkaflowarts.com/sequence/s~q1%3Aa%7Cb"
    );
  });
});

describe("buildEmbedSnippet", () => {
  it("uses the default 560x560 square when no size is given", () => {
    const html = buildEmbedSnippet({ code: "P3WN", word: "Flow" });
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
    expect(html).toContain("aspect-ratio:560/560");
  });

  it("honors a custom width/height", () => {
    const html = buildEmbedSnippet({
      code: "P3WN",
      word: "Flow",
      width: 400,
      height: 300,
    });
    expect(html).toContain('width="400"');
    expect(html).toContain('height="300"');
    expect(html).toContain("aspect-ratio:400/300");
  });

  it("points the iframe at the embed player URL, not the canonical page", () => {
    const html = buildEmbedSnippet({ code: "P3WN", word: "Flow" });
    expect(html).toContain(
      '<iframe src="https://tkaflowarts.com/embed/sequence/P3WN"'
    );
  });

  it("puts the attribution link OUTSIDE the iframe, pointing at the canonical page", () => {
    const html = buildEmbedSnippet({ code: "P3WN", word: "Flow" });
    const iframeEnd = html.indexOf("</iframe>");
    const linkStart = html.indexOf(
      '<a href="https://tkaflowarts.com/sequence/P3WN">'
    );

    expect(iframeEnd).toBeGreaterThan(-1);
    expect(linkStart).toBeGreaterThan(iframeEnd);
    expect(html).toContain(
      '<p><a href="https://tkaflowarts.com/sequence/P3WN">Flow</a> on Flow Arts Composer</p>'
    );
  });

  it("escapes HTML-significant characters in the word", () => {
    const html = buildEmbedSnippet({
      code: "P3WN",
      word: `<b>"Wild & Free"</b>`,
    });

    expect(html).not.toContain("<b>Wild");
    expect(html).toContain("&lt;b&gt;&quot;Wild &amp; Free&quot;&lt;/b&gt;");
  });

  it("falls back to 'Sequence' when the word is missing", () => {
    const html = buildEmbedSnippet({ code: "P3WN", word: null });
    expect(html).toContain('title="Sequence, a flow arts sequence"');
    expect(html).toContain(">Sequence</a> on Flow Arts Composer");
  });

  it("ignores a non-positive width/height and falls back to the default", () => {
    const html = buildEmbedSnippet({
      code: "P3WN",
      word: "Flow",
      width: -10,
      height: 0,
    });
    expect(html).toContain('width="560"');
    expect(html).toContain('height="560"');
  });
});
