import { describe, it, expect } from "vitest";
import {
  countOwnEffects,
  hubEffectWrite,
  performerHasOwnEffect,
  trayPickClearsOwnEffect,
} from "./performer-effect-follow";

describe("hubEffectWrite", () => {
  it("one performer and no sink writes the shared effect", () => {
    expect(hubEffectWrite(1, false)).toBe("shared");
  });
  it("a sink keeps the per-performer write", () => {
    expect(hubEffectWrite(1, true)).toBe("performer");
  });
  it("two or more performers keep the per-performer write", () => {
    expect(hubEffectWrite(2, false)).toBe("performer");
    expect(hubEffectWrite(5, false)).toBe("performer");
  });
  it("an empty scene has no performer to follow", () => {
    expect(hubEffectWrite(0, false)).toBe("performer");
  });
});

describe("trayPickClearsOwnEffect", () => {
  it("clears a sole performer's own effect", () => {
    expect(trayPickClearsOwnEffect(1, true)).toBe(true);
  });
  it("does nothing when the sole performer already follows", () => {
    expect(trayPickClearsOwnEffect(1, false)).toBe(false);
  });
  it("leaves performers alone once there are several", () => {
    expect(trayPickClearsOwnEffect(2, true)).toBe(false);
  });
});

describe("own effect counting", () => {
  const follows = { rawEffect: null, rawHandEffects: null };
  it("a null effect and no pair is following", () => {
    expect(performerHasOwnEffect(follows)).toBe(false);
  });
  it("an explicit none is still its own effect", () => {
    expect(performerHasOwnEffect({ ...follows, rawEffect: "none" })).toBe(true);
  });
  it("a hand pair is its own effect", () => {
    expect(
      performerHasOwnEffect({
        rawEffect: null,
        rawHandEffects: { left: "fire", right: "led" },
      })
    ).toBe(true);
  });
  it("counts only the performers that have one", () => {
    expect(
      countOwnEffects([follows, { ...follows, rawEffect: "fire" }, follows])
    ).toBe(1);
  });
});
