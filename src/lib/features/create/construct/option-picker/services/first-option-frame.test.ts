import { describe, expect, it } from "vitest";
import { isAwaitingFirstOptionFrame } from "./first-option-frame";

describe("isAwaitingFirstOptionFrame", () => {
  it("holds the placeholder while the first load is in flight", () => {
    expect(
      isAwaitingFirstOptionFrame({
        preparedCount: 0,
        loadState: "loading",
        firstFrameSettled: false,
      })
    ).toBe(true);
  });

  // The bug: the load resolved, the tiles were still being prepared, and the
  // grid drew "no pictographs" for every type before the real tiles arrived.
  it("keeps holding after the load resolves until the first frame is prepared", () => {
    expect(
      isAwaitingFirstOptionFrame({
        preparedCount: 0,
        loadState: "ready",
        firstFrameSettled: false,
      })
    ).toBe(true);
  });

  it("shows an empty grid once an empty result is the settled answer", () => {
    expect(
      isAwaitingFirstOptionFrame({
        preparedCount: 0,
        loadState: "ready",
        firstFrameSettled: true,
      })
    ).toBe(false);
  });

  it("never hides tiles that are already on screen", () => {
    expect(
      isAwaitingFirstOptionFrame({
        preparedCount: 16,
        loadState: "loading",
        firstFrameSettled: true,
      })
    ).toBe(false);
  });

  it("returns to the placeholder when a reset empties the picker", () => {
    expect(
      isAwaitingFirstOptionFrame({
        preparedCount: 0,
        loadState: "idle",
        firstFrameSettled: true,
      })
    ).toBe(true);
  });
});
