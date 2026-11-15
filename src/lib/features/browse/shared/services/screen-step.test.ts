import { describe, expect, it } from "vitest";
import { createScreenStepTracker, screenStep } from "./screen-step";

describe("screenStep", () => {
  it("leaving the root is forward, returning to it is back", () => {
    expect(screenStep("home", "explore", "home")).toBe(1);
    expect(screenStep("you", "home", "home")).toBe(-1);
  });

  it("a move between two non-root screens is a peer move", () => {
    expect(screenStep("explore", "you", "home")).toBe(0);
  });

  it("no previous key, or the same key, is no move", () => {
    expect(screenStep(null, "explore", "home")).toBe(0);
    expect(screenStep("home", "home", "home")).toBe(0);
  });
});

describe("createScreenStepTracker", () => {
  it("reports each change from the key before it, including an interrupted open", () => {
    const tracker = createScreenStepTracker("list", "list");
    expect(tracker.step("a/1")).toBe(1);
    // Back pressed halfway through the opening.
    expect(tracker.step("list")).toBe(-1);
    // A second collection tapped during that Back.
    expect(tracker.step("b/2")).toBe(1);
    expect(tracker.step("c/3")).toBe(0);
  });

  it("a re-read with the key unchanged keeps the running move", () => {
    const tracker = createScreenStepTracker("home", "home");
    expect(tracker.step("explore")).toBe(1);
    expect(tracker.step("explore")).toBe(1);
  });
});
