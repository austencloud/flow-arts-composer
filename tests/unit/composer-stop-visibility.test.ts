import { afterEach, describe, expect, it, vi } from "vitest";
import { observeComposerStopVisibility } from "../../src/routes/(public)/composer/_components/observe-composer-stop-visibility";

describe("composer stop visibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("requires viewport intersection and an active Glide stop", async () => {
    let reportIntersection = (_visible: boolean) => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          reportIntersection = (visible) =>
            callback(
              [{ isIntersecting: visible } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver
            );
        }
        observe() {}
        disconnect() {}
      }
    );

    const section = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "section"
    );
    section.style.pointerEvents = "none";
    const preview = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    section.appendChild(preview);
    document.body.appendChild(section);
    const visible: boolean[] = [];
    const observer = observeComposerStopVisibility(preview, (value) =>
      visible.push(value)
    );

    reportIntersection(true);
    expect(visible.at(-1)).toBe(false);

    section.style.pointerEvents = "";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(visible.at(-1)).toBe(true);

    reportIntersection(false);
    expect(visible.at(-1)).toBe(false);

    observer.destroy();
  });
});
