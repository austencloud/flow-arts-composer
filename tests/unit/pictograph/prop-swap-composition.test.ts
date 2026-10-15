import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPropSwap } from "./prop-swap-harness.svelte";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock("#lib/shared/transitions/motion", () => ({
  reducedMotion: () => preference.reduced,
}));

const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let originalCreateElement: typeof document.createElement;
let host: HTMLElement;
let mounted: ReturnType<typeof mountPropSwap> | undefined;
let frames: Map<number, FrameRequestCallback>;
const assets = (x: number) => ({
  imageSrc: `<rect width='${x * 2}' height='${x}' />`,
  viewBox: `0 0 ${x * 2} ${x}`,
  center: { x, y: x / 2 },
});
function tick() {
  const due = [...frames.values()];
  frames.clear();
  due.forEach((callback) => callback(0));
  flushSync();
}

beforeEach(() => {
  originalCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
  preference.reduced = false;
  frames = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
});
afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  host.remove();
  document.createElement = originalCreateElement;
  vi.unstubAllGlobals();
});

describe("PropSvg centered swap composition", () => {
  it.each([false, true])(
    "preserves placement, rotation and mirroring for clickable=%s",
    (clickable) => {
      mounted = mountPropSwap(host, {
        rotation: 35,
        directPositioning: false,
        assets: assets(50),
        hand: HandSide.RIGHT,
        clickable,
      });
      const outer = host.querySelector(".prop-svg")!;
      const placement = outer.getAttribute("style");
      expect(placement).toContain(
        "translate(475px, 475px) rotate(35deg) scaleX(-1)"
      );
      mounted.set({ assets: assets(100) });
      const swap = outer.querySelector(".prop-swap")!;
      const artwork = swap.querySelector(".prop-artwork")!;
      expect(outer.getAttribute("style")).toBe(placement);
      expect(swap.getAttribute("style")).toContain("scale(0.5)");
      expect(artwork.getAttribute("style")).toContain(
        "translate(-100px, -50px)"
      );
      expect(swap.classList.contains("swap-snapping")).toBe(true);
      tick();
      expect(swap.getAttribute("style")).toContain("scale(0.5)");
      tick();
      expect(swap.getAttribute("style")).toContain("scale(1)");
      expect(swap.classList.contains("swap-snapping")).toBe(false);
      expect(outer.getAttribute("style")).toBe(placement);
    }
  );

  it("uses the project reduced-motion preference to skip scaling", () => {
    preference.reduced = true;
    mounted = mountPropSwap(host, {
      rotation: 0,
      directPositioning: false,
      assets: assets(50),
    });
    mounted.set({ assets: assets(100) });
    expect(host.querySelector(".prop-swap")!.getAttribute("style")).toContain(
      "scale(1)"
    );
    expect(frames.size).toBe(0);
  });
});
