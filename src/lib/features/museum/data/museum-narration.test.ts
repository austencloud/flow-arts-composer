/**
 * K's lines for what the visitor carries into the Room of Collaboration
 * (museum-narration.ts): one curator line per visitor moment, short enough
 * to land while the village moves.
 */

import { describe, expect, it } from "vitest";
import { VISITOR_MOMENTS } from "#lib/features/village/state/village-moments.js";
import { NARRATION_CUES, cueLines } from "./museum-narration";

function cueFor(moment: string) {
  const cues = NARRATION_CUES.filter(
    (cue) => cue.trigger.kind === "village" && cue.trigger.moment === moment
  );
  expect(cues, moment).toHaveLength(1);
  return cues[0]!;
}

const wordCount = (line: string) => line.split(/\s+/).length;

describe("visitor moment narration", () => {
  it("gives each visitor moment one curator line in the collaboration room, under 12 words", () => {
    for (const moment of VISITOR_MOMENTS) {
      const cue = cueFor(moment);
      expect(cue.roomId).toBe("collaboration");
      expect(cue.voice).toBe("curator");
      expect(cue.draft).toBe(true);
      for (const line of cue.lines)
        expect(wordCount(line), line).toBeLessThan(12);
    }
  });
});

describe("narration on a carried sequence", () => {
  // A stranger's sequence: a word the exhibits never use.
  const STRANGER = "KLM";

  it("names the carried word when teaching it and when coming back to it", () => {
    for (const moment of ["visitor:taught", "memory:found", "memory:lost"]) {
      const lines = cueLines(cueFor(moment), STRANGER);
      expect(lines.join(" "), moment).toContain(STRANGER);
      for (const line of lines) {
        expect(line, moment).not.toContain("{word}");
        expect(line, moment).not.toContain("OOGA");
        expect(wordCount(line), line).toBeLessThan(12);
      }
    }
  });

  it("falls back to the plain lines when no word is known", () => {
    for (const moment of ["visitor:taught", "memory:found", "memory:lost"]) {
      const cue = cueFor(moment);
      expect(cueLines(cue)).toBe(cue.lines);
      expect(cueLines(cue, "  ")).toBe(cue.lines);
    }
  });

  it("shows a repeated word simplified, like every sequence word", () => {
    expect(
      cueLines(cueFor("visitor:taught"), "ABCABC").join(" ")
    ).not.toContain("ABCABC");
  });

  it("leaves cues without carried lines alone", () => {
    const cue = cueFor("visitor:passed-on");
    expect(cue.carriedLines).toBeUndefined();
    expect(cueLines(cue, STRANGER)).toBe(cue.lines);
  });
});
