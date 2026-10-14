import { describe, expect, it } from "vitest";
import { hoverPlayAction, shouldArmHoverPlay } from "./hover-play-intent";

describe("shouldArmHoverPlay", () => {
  it("arms only for a mouse with motion allowed outside selection mode", () => {
    const base = { pointerType: "mouse", reducedMotion: false, selectionMode: false };
    expect(shouldArmHoverPlay(base)).toBe(true);
    expect(shouldArmHoverPlay({ ...base, pointerType: "touch" })).toBe(false);
    expect(shouldArmHoverPlay({ ...base, pointerType: "pen" })).toBe(false);
    expect(shouldArmHoverPlay({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldArmHoverPlay({ ...base, selectionMode: true })).toBe(false);
  });
});

describe("hoverPlayAction", () => {
  it("plays after the dwell and stops after the pointer leaves", () => {
    expect(hoverPlayAction({ wants: true, active: false, inFlight: false })).toBe("play");
    expect(hoverPlayAction({ wants: false, active: true, inFlight: false })).toBe("stop");
  });

  it("does nothing when the player already matches the intent", () => {
    expect(hoverPlayAction({ wants: true, active: true, inFlight: false })).toBeNull();
    expect(hoverPlayAction({ wants: false, active: false, inFlight: false })).toBeNull();
  });

  it("waits out an in-flight chip morph, then still stops a card the pointer left", () => {
    expect(hoverPlayAction({ wants: false, active: true, inFlight: true })).toBeNull();
    expect(hoverPlayAction({ wants: false, active: true, inFlight: false })).toBe("stop");
  });

  it("stays out of the way once the reader used the chip", () => {
    expect(hoverPlayAction({ wants: null, active: true, inFlight: false })).toBeNull();
    expect(hoverPlayAction({ wants: null, active: false, inFlight: false })).toBeNull();
  });
});
