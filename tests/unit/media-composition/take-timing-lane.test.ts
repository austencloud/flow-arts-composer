import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTakeTiming,
  editTakeSection,
  placeTakeLanding,
  splitTimingSection,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { mountTimingLane } from "./take-timing-lane-harness.svelte";

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
let stubbed: typeof document.createElement;
const lanes: Array<{ destroy: () => void }> = [];
beforeEach(() => {
  stubbed = document.createElement;
  document.createElement = Object.getPrototypeOf(document).createElement.bind(
    document
  );
});
afterEach(() => {
  for (const lane of lanes.splice(0)) lane.destroy();
  document.createElement = stubbed;
});

function lane(timing: TakeTiming, mediaSeconds: number) {
  const mounted = mountTimingLane(timing, mediaSeconds, EIGHT);
  lanes.push(mounted);
  return mounted;
}

describe("timing lane across a cut", () => {
  it("marks no tap on a part that only counts on", () => {
    // Moves 1-8 tapped at 87 BPM from 1 s; cut to keep counting at 20 s.
    const base = createTakeTiming({
      sequenceId: "dck",
      takeKey: "take-a",
      durationSeconds: 30,
      bpm: 87,
      now: 1,
    });
    const split = splitTimingSection(
      {
        ...base,
        sections: [
          {
            ...base.sections[0]!,
            tempo: "locked",
            taps: Array.from({ length: 8 }, (_, index) => 1 + (60 / 87) * (index + 1)),
          },
        ],
      },
      20,
      "part-2",
      2,
      EIGHT,
      "continues"
    );
    const taps = (mediaSeconds: number) =>
      lane(split, mediaSeconds).target.querySelectorAll(".detail .tap").length;
    expect(taps(4)).toBeGreaterThan(0);
    expect(taps(20)).toBe(0);
  });

  it("still draws a landing dragged across a start-over cut", () => {
    const split = splitTimingSection(tapped(), 8.5, "part-2", 2, EIGHT, "restarts");
    // Part 2's move 1 (9 s) dragged a little earlier, past the cut.
    const placed = placeTakeLanding(split, "part-2", 1, 8.3, EIGHT);
    const pinned = lane(placed, 8.5)
      .labels()
      .filter((label) => label.includes("placed by hand"));
    expect(pinned).toEqual([expect.stringContaining("Move 1 · pass 1 at 0:08.30")]);
  });

  it("draws the landing at a keep-counting cut once when a part is nudged", () => {
    // Cut just before move 9 (9 s), then part 2 nudged earlier so it draws
    // move 9 before the cut.
    const split = splitTimingSection(tapped(), 8.95, "part-2", 2, EIGHT, "continues");
    const nudged = editTakeSection(split, "part-2", EIGHT, (section) => ({
      ...section,
      offsetSeconds: -0.1,
    }));
    const moveNine = lane(nudged, 9)
      .labels()
      .filter((label) => label.startsWith("Move 1 · pass 2 "));
    expect(moveNine).toEqual([expect.stringContaining("0:08.90")]);
  });

  it("keeps a landing nudged across a cut selected and focused", () => {
    const split = splitTimingSection(tapped(), 8.5, "part-2", 2, EIGHT, "continues");
    const mounted = lane(split, 8.5);
    const moveNine = () =>
      [...mounted.target.querySelectorAll<HTMLButtonElement>("button.landing")].find(
        (button) => button.getAttribute("aria-label")!.startsWith("Move 1 · pass 2 ")
      )!;
    // Move 9 (part 2, at 9 s) nudged a tenth of a second earlier six times.
    moveNine().focus();
    for (let press = 0; press < 6; press += 1) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      flushSync();
    }
    // At 8.4 s it is part 1's to draw, before the cut at 8.5 s.
    const landing = moveNine();
    expect(landing.getAttribute("aria-label")).toContain("0:08.40");
    expect(landing.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(landing);
    expect(mounted.selected()).toEqual({ sectionId: "section-1", position: 9 });
  });
});
