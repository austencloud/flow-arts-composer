import { afterEach, describe, expect, it, vi } from "vitest";
import { observeComposerStopVisibility } from "../../src/routes/(public)/composer/_components/observe-composer-stop-visibility";

function stubIntersectionObserver() {
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
  return (visible: boolean) => reportIntersection(visible);
}

function mountStop(pointerEvents: string) {
  const section = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "section"
  );
  section.style.pointerEvents = pointerEvents;
  const preview = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div"
  );
  section.appendChild(preview);
  document.body.appendChild(section);
  return { section, preview };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("composer stop visibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("requires viewport intersection and an active Glide stop", async () => {
    const reportIntersection = stubIntersectionObserver();
    const { section, preview } = mountStop("none");
    const visible: boolean[] = [];
    const observer = observeComposerStopVisibility(preview, (value) =>
      visible.push(value)
    );

    reportIntersection(true);
    expect(visible.at(-1)).toBe(false);

    section.style.pointerEvents = "";
    await tick();
    expect(visible.at(-1)).toBe(true);

    reportIntersection(false);
    expect(visible.at(-1)).toBe(false);

    observer.destroy();
  });

  it("ignores stage style changes until the viewport has been measured", async () => {
    const reportIntersection = stubIntersectionObserver();
    const { section, preview } = mountStop("");
    const visible: boolean[] = [];
    const observer = observeComposerStopVisibility(preview, (value) =>
      visible.push(value)
    );
    expect(visible).toEqual([false]);

    // Glide poses the stop when it takes over, before the first entry.
    section.style.transform = "translate3d(0, 0, 0)";
    section.style.opacity = "1";
    await tick();
    expect(visible).toEqual([false]);

    reportIntersection(true);
    expect(visible).toEqual([false, true]);

    section.style.pointerEvents = "none";
    await tick();
    expect(visible).toEqual([false, true, false]);

    observer.destroy();
  });
});
