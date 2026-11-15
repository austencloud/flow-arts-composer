import { describe, expect, it } from "vitest";
import { effectsToggleTarget } from "./effect-quick-toggle";

/** The picker's switch driven the way its component does: it remembers the
 *  last effect that was on, and sets whatever the target says. */
function switchFor(first: string | undefined, start = "none") {
  let active = start;
  let lastOn: string | null = start === "none" ? null : start;
  return {
    get active() {
      return active;
    },
    choose(effect: string) {
      active = effect;
      if (effect !== "none") lastOn = effect;
    },
    toggle() {
      active = effectsToggleTarget({ active, lastOn, first });
      if (active !== "none") lastOn = active;
    },
  };
}

describe("effectsToggleTarget", () => {
  it("turns the effect off and back on to the same one", () => {
    const fx = switchFor("trails");
    fx.choose("fire");
    fx.toggle();
    expect(fx.active).toBe("none");
    fx.toggle();
    expect(fx.active).toBe("fire");
  });

  it("brings back the last one chosen, not the first in the list", () => {
    const fx = switchFor("trails");
    fx.choose("fire");
    fx.choose("coal");
    fx.choose("none");
    fx.toggle();
    expect(fx.active).toBe("coal");
  });

  it("falls to the first effect when none was ever on", () => {
    const fx = switchFor("trails");
    fx.toggle();
    expect(fx.active).toBe("trails");
  });

  it("stays off when the list is empty", () => {
    expect(
      effectsToggleTarget({ active: "none", lastOn: null, first: undefined })
    ).toBe("none");
  });
});
