// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isBackgroundInteractionBlocked } from "./background-interaction-routing";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("isBackgroundInteractionBlocked", () => {
  it("settles a tap on a button's icon without reading any computed style", () => {
    // A computed style inside a size container forces a layout; the Create
    // workspace's Play button sits in one, and the icon is the tap target.
    document.body.innerHTML = `<div class="wrap"><button><i class="icon"></i></button></div>`;
    const styles = vi.spyOn(window, "getComputedStyle");
    expect(isBackgroundInteractionBlocked(document.querySelector("i"))).toBe(true);
    expect(styles).not.toHaveBeenCalled();
  });

  it("still blocks on a painted surface above a transparent target", () => {
    document.body.innerHTML = `<div class="panel" style="background-color: rgb(10, 10, 10)"><div class="inner"></div></div>`;
    expect(isBackgroundInteractionBlocked(document.querySelector(".inner"))).toBe(true);
  });

  it("lets a tap on transparent wrappers through to the scene", () => {
    document.body.innerHTML = `<div class="outer"><div class="inner"></div></div>`;
    expect(isBackgroundInteractionBlocked(document.querySelector(".inner"))).toBe(false);
  });
});
