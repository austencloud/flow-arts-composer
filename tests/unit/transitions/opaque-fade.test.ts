// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { opaqueFade } from "$lib/shared/transitions/motion";

const DIMMED = ["hidden-for-sequential"] as const;

// The shared setup stubs document.createElement, so build real elements.
function cell(markup = "<div></div>"): HTMLElement {
  document.body.innerHTML = markup;
  return document.body.firstElementChild as HTMLElement;
}

describe("opaqueFade", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("fades a resting cell from full opacity without reading its style", () => {
    const read = vi.spyOn(window, "getComputedStyle");
    const node = cell();

    const config = opaqueFade(node, { duration: 180, dimmedBy: DIMMED });

    expect(read).not.toHaveBeenCalled();
    expect(config.duration).toBe(180);
    expect(config.css?.(0.25, 0.75)).toBe("opacity: 0.25");
  });

  it("skips the read entirely when there is nothing to animate", () => {
    const read = vi.spyOn(window, "getComputedStyle");
    const node = cell('<div class="hidden-for-sequential"></div>');

    expect(opaqueFade(node, { duration: 0, dimmedBy: DIMMED })).toEqual({
      duration: 0,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps a deliberately hidden cell hidden while it fades", () => {
    const read = vi.spyOn(window, "getComputedStyle");
    const node = cell(
      '<div class="hidden-for-sequential" style="opacity: 0"></div>'
    );

    const config = opaqueFade(node, { duration: 180, dimmedBy: DIMMED });

    expect(read).toHaveBeenCalledWith(node);
    expect(config.css?.(1, 0)).toBe("opacity: 0");
  });
});
