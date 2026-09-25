import { describe, expect, it } from "vitest";
import {
  buildSequenceSeo,
  cleanSequenceText,
  isSequenceIndexable,
  toTrustedThumbnailUrl,
  type SequenceRouteMeta,
} from "../sequence-seo";

const curatedMeta: SequenceRouteMeta = {
  word: "AAAA",
  creator: "TKA System",
  difficulty: "1",
  stepCount: 4,
  thumbnailUrl: null,
  source: "catalog",
  curated: true,
  catalogId: "l1-tnd-motions",
  deckName: "TKA 1: Learning Letters (Base Motions)",
  deckNumber: 4,
  letters: ["A", "A", "A", "A"],
};

describe("sequence route indexing", () => {
  it("indexes only a curated sequence backed by a resolved record", () => {
    expect(isSequenceIndexable(curatedMeta)).toBe(true);
    expect(
      isSequenceIndexable({ ...curatedMeta, curated: false, source: "public" })
    ).toBe(false);
    expect(isSequenceIndexable({ ...curatedMeta, source: "inline" })).toBe(
      false
    );
    expect(isSequenceIndexable({ ...curatedMeta, source: "unknown" })).toBe(
      false
    );
    expect(isSequenceIndexable({ ...curatedMeta, stepCount: 0 })).toBe(false);
    expect(isSequenceIndexable({ ...curatedMeta, creator: null })).toBe(false);
  });

  it("builds a stable canonical and useful metadata from the released record", () => {
    const seo = buildSequenceSeo("tnd-split-same-aaaa", curatedMeta);

    expect(seo.indexable).toBe(true);
    expect(seo.canonical).toBe(
      "https://tkaflowarts.com/sequence/tnd-split-same-aaaa"
    );
    expect(seo.title).toBe("A Flow Arts Sequence | Flow Arts Composer");
    expect(seo.description).toContain("4-step flow arts sequence");
    expect(seo.description).toContain("submitted by TKA System");
    expect(seo.description).toContain(curatedMeta.deckName);
    expect(seo.jsonLd).toMatchObject({
      "@type": "CreativeWork",
      "@id": `${seo.canonical}#sequence`,
      url: seo.canonical,
      contributor: curatedMeta.creator,
      isPartOf: {
        "@id": "https://tkaflowarts.com/composer#software",
      },
    });
  });

  it("keeps encoded and untrusted metadata out of the index", () => {
    const seo = buildSequenceSeo("z:encoded|payload", {
      ...curatedMeta,
      source: "inline",
      curated: false,
      catalogId: null,
      deckName: null,
      deckNumber: null,
    });

    expect(seo.indexable).toBe(false);
    expect(seo.canonical).toBe(
      "https://tkaflowarts.com/sequence/z%3Aencoded%7Cpayload"
    );
    expect(seo.jsonLd).toBeNull();
  });
});

describe("sequence metadata boundaries", () => {
  it("normalizes and caps text supplied through a share URL", () => {
    expect(cleanSequenceText("  A\n\tB  ")).toBe("A B");
    expect(cleanSequenceText("ABCDE", 3)).toBe("ABC");
    expect(cleanSequenceText("   ")).toBeNull();
  });

  it("accepts only trusted HTTPS thumbnail hosts", () => {
    expect(
      toTrustedThumbnailUrl(
        "https://firebasestorage.googleapis.com/v0/b/example/o/card.png?alt=media"
      )
    ).toContain("firebasestorage.googleapis.com");
    expect(toTrustedThumbnailUrl("http://tkaflowarts.com/card.png")).toBeNull();
    expect(toTrustedThumbnailUrl("https://example.com/card.png")).toBeNull();
    expect(toTrustedThumbnailUrl("not a URL")).toBeNull();
  });
});
