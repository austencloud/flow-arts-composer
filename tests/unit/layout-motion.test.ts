import { afterEach, describe, expect, it, vi } from "vitest";
import { flexPresence } from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

function setReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

describe("flexPresence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves a flex panel's allocation and opacity on one clock", () => {
    setReducedMotion(false);
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({ flexGrow: "1.2", flexBasis: "68px" }))
    );
    const panel = {
      getBoundingClientRect: () => ({ width: 240, height: 68 }),
    } as HTMLElement;

    const transition = flexPresence(panel);
    const midpoint = transition.css?.(0.5, 0.5) ?? "";

    expect(transition.duration).toBe(DURATION.emphasis);
    expect(midpoint).toContain("flex-grow: 0.6");
    expect(midpoint).toContain("flex-basis: 34px");
    expect(midpoint).toContain("opacity: 0.675");
  });

  it("settles immediately when reduced motion is requested", () => {
    setReducedMotion(true);
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({ flexGrow: "1", flexBasis: "100px" }))
    );
    const panel = {
      getBoundingClientRect: () => ({ width: 240, height: 100 }),
    } as HTMLElement;

    expect(flexPresence(panel).duration).toBe(0);
  });
});
