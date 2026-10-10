import { describe, it, expect } from "vitest";
import { generateViewerURL } from "./sequence-encoder";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const sequence = createSequenceData({ word: "EHWE" });

describe("generateViewerURL short-code path", () => {
  it("uses the short code as the path instead of the inline-encoded sequence", () => {
    const result = generateViewerURL(sequence, {
      compress: true,
      shortCode: "EHWE",
    });
    expect(new URL(result.url, "https://example.com").pathname).toBe(
      "/sequence/EHWE"
    );
    expect(result.compressed).toBe(false);
    expect(result.savings).toBe(0);
  });

  it("still carries share metadata as query params", () => {
    const result = generateViewerURL(sequence, {
      shortCode: "EHWE",
      metadata: { bpm: 90 },
    });
    const url = new URL(result.url, "https://example.com");
    expect(url.pathname).toBe("/sequence/EHWE");
    expect(url.searchParams.get("bpm")).toBe("90");
  });

  it("falls back to the encoded sequence when no short code is minted", () => {
    const result = generateViewerURL(sequence, { compress: true });
    expect(new URL(result.url, "https://example.com").pathname).not.toBe(
      "/sequence/EHWE"
    );
  });
});
