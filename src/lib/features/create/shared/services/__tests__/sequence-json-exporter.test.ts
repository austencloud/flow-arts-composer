import { describe, it, expect } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  toJsonString,
  toAsciiSafeJsonString,
} from "../sequence-json-exporter";

// A sequence whose letters are UTF-8 Greek — the case that got mangled to
// `?` / `�` when the copied JSON crossed a non-UTF-8 clipboard/paste boundary.
const GREEK_SEQ = {
  name: "Θ-Φ",
  word: "Θ-Φ",
  isCircular: true,
  gridMode: "diamond",
  startPlacement: null,
  steps: [
    { stepNumber: 1, letter: "Θ-", startPlacement: "gamma9", endPlacement: "gamma7", motions: {} },
    { stepNumber: 2, letter: "Φ", startPlacement: "gamma7", endPlacement: "gamma3", motions: {} },
  ],
} as unknown as SequenceData;

describe("sequence-json-exporter ASCII-safe transport", () => {
  it("plain toJsonString keeps the raw Greek (fine for UTF-8 file export)", () => {
    expect(toJsonString(GREEK_SEQ)).toContain("Θ");
  });

  it("toAsciiSafeJsonString contains no non-ASCII byte", () => {
    const out = toAsciiSafeJsonString(GREEK_SEQ);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(out)).toBe(false);
  });

  it("escapes Greek letters to their \\uXXXX code points", () => {
    const out = toAsciiSafeJsonString(GREEK_SEQ);
    expect(out).toContain("\\u0398"); // Θ
    expect(out).toContain("\\u03a6"); // Φ
  });

  it("round-trips back to the exact glyphs when parsed", () => {
    const parsed = JSON.parse(toAsciiSafeJsonString(GREEK_SEQ));
    expect(parsed.word).toBe("Θ-Φ");
    expect(parsed.steps[0].letter).toBe("Θ-");
    expect(parsed.steps[1].letter).toBe("Φ");
  });
});
