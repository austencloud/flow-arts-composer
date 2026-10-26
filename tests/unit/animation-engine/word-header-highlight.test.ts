import { describe, expect, it } from "vitest";
import { activeWordHeaderStep } from "#lib/shared/animation-engine/domain/word-header-highlight.js";

describe("word header highlight timing", () => {
  it("lights the letter of the move that is playing", () => {
    expect(activeWordHeaderStep(0, 4)).toBeNull();
    expect(activeWordHeaderStep(1, 4)).toBe(1);
    expect(activeWordHeaderStep(1.5, 4)).toBe(1);
    expect(activeWordHeaderStep(2.8, 4)).toBe(2);
    expect(activeWordHeaderStep(4.5, 4)).toBe(4);
  });

  it("holds the last letter through the end hold", () => {
    expect(activeWordHeaderStep(5, 4)).toBe(4);
  });
});
