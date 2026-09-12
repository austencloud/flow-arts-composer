import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import StepStrip from "./StepStrip.svelte";
import type { NotationCell } from "./notation-cell";
import { resolveCycleStep } from "./loop-cycle";

/**
 * Runtime proof for the gallery preview's loop boundary: StepStrip cuts its
 * slide transition (`.no-anim`) whenever its focus index moves backwards, so a
 * carousel that wraps by resetting its index visibly pops. These assertions
 * read the real rendered track — the class and the transform — across a wrap.
 */

const STEP_COUNT = 4;

/**
 * Cells shaped like buildNotationCells output: Start, then one per beat.
 * Their pictograph payload is deliberately empty — the rail's travel and cell
 * bookkeeping are what is under test, and real pictograph data would pull the
 * SVG preloader (and the whole static asset tree) into the browser run.
 */
function makeCells(): NotationCell[] {
  const cells: NotationCell[] = [
    {
      key: "start-test",
      data: null as unknown as NotationCell["data"],
      label: "Start",
      isStart: true,
      stepNumber: 0,
    },
  ];
  for (let beat = 1; beat <= STEP_COUNT; beat++) {
    cells.push({
      key: `beat-${beat}`,
      data: null as unknown as NotationCell["data"],
      label: `${beat}`,
      isStart: false,
      stepNumber: beat,
    });
  }
  return cells;
}

function trackOf(container: HTMLElement): HTMLElement {
  const track = container.querySelector<HTMLElement>(".step-track");
  if (!track) throw new Error("step-track never rendered");
  return track;
}

/** Signed px the track has travelled (horizontal rail translates X). */
function trackTravel(track: HTMLElement): number {
  const match = /translateX\((-?[\d.]+)px\)/.exec(track.style.transform);
  if (!match) throw new Error(`unreadable transform: ${track.style.transform}`);
  return Number(match[1]);
}

describe("StepStrip loop boundary", () => {
  it("slides forward through the wrap instead of cutting back", async () => {
    const cells = makeCells();
    const { container, rerender } = render(StepStrip, {
      cells,
      currentStep: resolveCycleStep(1, STEP_COUNT, true),
      bpm: 60,
      loop: true,
      cellSize: 48,
    });

    const track = trackOf(container as HTMLElement);
    const travels: number[] = [];
    let cutAfterFirstFrame = false;

    // Two full repeats of the preview's cycle (Start + 4 beats), a quarter
    // beat at a time — the boundary is crossed twice.
    for (let quarter = 4; quarter <= 4 * (STEP_COUNT + 1) * 2; quarter++) {
      await rerender({
        cells,
        currentStep: resolveCycleStep(quarter / 4, STEP_COUNT, true),
        bpm: 60,
        loop: true,
        cellSize: 48,
      });
      travels.push(trackTravel(track));
      if (track.classList.contains("no-anim")) cutAfterFirstFrame = true;
    }

    // The rail never hard-cuts: `no-anim` is reserved for init/backward scrub.
    expect(cutAfterFirstFrame).toBe(false);
    // And it only ever travels one way, including across both boundaries.
    for (let i = 1; i < travels.length; i++) {
      expect(travels[i]!).toBeLessThanOrEqual(travels[i - 1]!);
    }
    expect(travels[travels.length - 1]!).toBeLessThan(travels[0]!);
  });

  it("carries one morph-pairable copy of each cell while looping", async () => {
    const cells = makeCells();
    const { container } = render(StepStrip, {
      cells,
      currentStep: resolveCycleStep(1, STEP_COUNT, true),
      bpm: 60,
      loop: true,
      cellSize: 48,
    });

    const root = container as HTMLElement;
    for (let stepNumber = 0; stepNumber <= STEP_COUNT; stepNumber++) {
      const primary = root.querySelectorAll(
        `.step-cell[data-cell-instance="primary"][data-step-number="${stepNumber}"]`
      );
      expect(primary).toHaveLength(1);
    }
  });
});
