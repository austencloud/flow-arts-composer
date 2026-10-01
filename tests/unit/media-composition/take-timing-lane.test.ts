import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTakeTiming,
  editTakeSection,
  placeTakeLanding,
  splitTimingSection,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { mountTimingLane } from "./take-timing-lane-harness.svelte";
import { createPostTimingSessionHarness } from "./post-timing-session-harness.svelte";

const EIGHT = [1, 1, 1, 1, 1, 1, 1, 1];

/** Moves 1-16 tapped on whole seconds, 60 BPM. */
function tapped(): TakeTiming {
  const base = createTakeTiming({
    sequenceId: "dck",
    takeKey: "take-a",
    durationSeconds: 60,
    bpm: 60,
    now: 1,
  });
  return {
    ...base,
    sections: [
      {
        ...base.sections[0]!,
        tempo: "locked",
        taps: Array.from({ length: 16 }, (_, index) => index + 1),
      },
    ],
  };
}

// The global setup stubs document.createElement; the lane needs real elements.
// It measures its width with bind:clientWidth, and jsdom has no ResizeObserver
// for Svelte to do that with.
let stubbed: typeof document.createElement;
const lanes: Array<{ destroy: () => void }> = [];
beforeEach(() => {
  stubbed = document.createElement;
  document.createElement =
    Object.getPrototypeOf(document).createElement.bind(document);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});
afterEach(() => {
  for (const lane of lanes.splice(0)) lane.destroy();
  document.createElement = stubbed;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function lane(timing: TakeTiming, mediaSeconds: number, windowSeconds = 8) {
  const mounted = mountTimingLane(timing, mediaSeconds, EIGHT, windowSeconds);
  lanes.push(mounted);
  return mounted;
}

describe("timing lane across a cut", () => {
  it("still draws a landing dragged across a start-over cut", () => {
    const split = splitTimingSection(
      tapped(),
      8.5,
      "part-2",
      2,
      EIGHT,
      "restarts"
    );
    // Part 2's move 1 (9 s) dragged a little earlier, past the cut.
    const placed = placeTakeLanding(split, "part-2", 1, 8.3, EIGHT);
    expect(lane(placed, 8.5).pinnedLabels()).toEqual([
      expect.stringContaining("Move 1 · pass 1 at 0:08.30"),
    ]);
  });

  it("draws the landing at a keep-counting cut once when a part is nudged", () => {
    // Cut just before move 9 (9 s), then part 2 nudged earlier so it draws
    // move 9 before the cut.
    const split = splitTimingSection(
      tapped(),
      8.95,
      "part-2",
      2,
      EIGHT,
      "continues"
    );
    const nudged = editTakeSection(split, "part-2", EIGHT, (section) => ({
      ...section,
      offsetSeconds: -0.1,
    }));
    const moveNine = lane(nudged, 9)
      .labels()
      .filter((label) => label.startsWith("Move 1 · pass 2 "));
    expect(moveNine).toEqual([expect.stringContaining("0:08.90")]);
  });

  it("moves the selection with a landing dragged across a keep-counting cut", () => {
    const split = splitTimingSection(
      tapped(),
      8.5,
      "part-2",
      2,
      EIGHT,
      "continues"
    );
    const harness = createPostTimingSessionHarness(null, split);
    try {
      // Move 9 (part 2, at 9 s) dragged to 8.4 s, before the cut at 8.5 s,
      // where it is part 1's to draw.
      const moveNine = { sectionId: "part-2", position: 9 };
      harness.session.selected = moveNine;
      harness.session.placeLanding(moveNine, 8.4);
      expect(harness.session.selected).toEqual({
        sectionId: "section-1",
        position: 9,
      });
      expect(
        lane(harness.session.timing!, 8.5)
          .labels()
          .filter((label) => label.startsWith("Move 1 · pass 2 "))
      ).toEqual([expect.stringContaining("0:08.40")]);
    } finally {
      harness.dispose();
    }
  });
});

describe("timing lane zoom", () => {
  it("keeps the time under the cursor while Ctrl + wheel zooms from Fit", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    const mounted = lane(tapped(), 0, 60);
    const viewport = mounted.viewport();
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 800,
    } as DOMRect);

    const plainWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      deltaY: -100,
    });
    viewport.dispatchEvent(plainWheel);
    expect(plainWheel.defaultPrevented).toBe(false);
    expect(mounted.windowSeconds()).toBe(60);

    const zoomIn = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 400,
      deltaY: -100,
    });
    viewport.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(mounted.windowSeconds()).toBe(48);
    expect(viewport.scrollLeft).toBeCloseTo(96);

    viewport.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        clientX: 400,
        deltaY: 100,
      })
    );
    expect(mounted.windowSeconds()).toBe(60);
    expect(viewport.scrollLeft).toBeCloseTo(0);
  });
});
