import { afterEach, describe, expect, it, vi } from "vitest";
import { holdWhenStopLeaves } from "../hold-when-stop-leaves";

function stubIntersectionObserver() {
  let reportIntersection = (_visible: boolean) => {};
  const disconnects = vi.fn();
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
      disconnect() {
        disconnects();
      }
    }
  );
  return {
    report: (visible: boolean) => reportIntersection(visible),
    disconnects,
  };
}

function mountSection(pointerEvents: string) {
  const section = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "section"
  );
  section.style.pointerEvents = pointerEvents;
  document.body.appendChild(section);
  return section;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("holdWhenStopLeaves", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("does not hold on a stage pose made before the viewport is measured", async () => {
    const { report: reportIntersection } = stubIntersectionObserver();
    const section = mountSection("");
    const hold = vi.fn();
    const handle = holdWhenStopLeaves(section, hold);

    section.style.transform = "translate3d(0, 0, 0)";
    section.style.opacity = "1";
    await tick();
    expect(hold).not.toHaveBeenCalled();

    reportIntersection(true);
    expect(hold).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("holds once when the stop leaves the viewport", () => {
    const { report: reportIntersection } = stubIntersectionObserver();
    const section = mountSection("");
    const hold = vi.fn();
    holdWhenStopLeaves(section, hold);

    reportIntersection(true);
    expect(hold).not.toHaveBeenCalled();
    reportIntersection(false);
    expect(hold).toHaveBeenCalledTimes(1);

    reportIntersection(true);
    reportIntersection(false);
    expect(hold).toHaveBeenCalledTimes(1);
  });

  it("holds when the stage takes the stop's pointer events", async () => {
    const { report: reportIntersection } = stubIntersectionObserver();
    const section = mountSection("");
    const hold = vi.fn();
    holdWhenStopLeaves(section, hold);

    reportIntersection(true);
    section.style.pointerEvents = "none";
    await tick();
    expect(hold).toHaveBeenCalledTimes(1);
  });

  it("holds at once when a deep link arrives already past the stop", () => {
    const { report: reportIntersection } = stubIntersectionObserver();
    const section = mountSection("none");
    const hold = vi.fn();
    holdWhenStopLeaves(section, hold);

    reportIntersection(false);
    expect(hold).toHaveBeenCalledTimes(1);
  });

  it("releases both observers once it has held", () => {
    const { report: reportIntersection, disconnects } =
      stubIntersectionObserver();
    const stageDisconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const section = mountSection("");
    const hold = vi.fn();
    holdWhenStopLeaves(section, hold);

    reportIntersection(true);
    expect(disconnects).not.toHaveBeenCalled();
    expect(stageDisconnect).not.toHaveBeenCalled();

    reportIntersection(false);
    expect(hold).toHaveBeenCalledTimes(1);
    expect(disconnects).toHaveBeenCalledTimes(1);
    expect(stageDisconnect).toHaveBeenCalledTimes(1);
  });
});
