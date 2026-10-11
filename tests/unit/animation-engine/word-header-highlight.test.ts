import { describe, expect, it } from "vitest";
import { activeWordHeaderStep } from "#lib/shared/animation-engine/domain/word-header-highlight.js";

describe("word header highlight timing", () => {
  it("waits for arrival and holds the letter through the next travel", () => {
    expect(activeWordHeaderStep(0, 4, "arrival")).toBeNull();
    expect(activeWordHeaderStep(1.5, 4, "arrival")).toBeNull();
    expect(activeWordHeaderStep(2, 4, "arrival")).toBe(1);
    expect(activeWordHeaderStep(2.8, 4, "arrival")).toBe(1);
    expect(activeWordHeaderStep(3, 4, "arrival")).toBe(2);
    expect(activeWordHeaderStep(5, 4, "arrival")).toBe(4);
  });

  it("can highlight the travelling move instead", () => {
    expect(activeWordHeaderStep(0, 4, "travel")).toBeNull();
    expect(activeWordHeaderStep(1, 4, "travel")).toBe(1);
    expect(activeWordHeaderStep(2.8, 4, "travel")).toBe(2);
    expect(activeWordHeaderStep(5, 4, "travel")).toBe(4);
  });
});
