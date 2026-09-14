import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import StepStrip from "./StepStrip.svelte";
import type { NotationCell } from "./notation-cell";
import { resolvePreviewCycleStep } from "./loop-cycle";

/**
 * Runtime proof for the gallery preview's loop boundary: StepStrip cuts its
 * slide transition (`.no-anim`) whenever its focus index moves backwards, so a
 * carousel that wraps by resetting its index visibly pops. These assertions
 * read the real rendered track — the class and the transform — across a wrap,
 * for both seam kinds, and confirm a non-looping rail still behaves as it did.
 *
 * Queries are class-based rather than role-based on purpose: the rail is
 * decorative chrome (its host marks it `aria-hidden`), so it exposes no roles.
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

/** Signed px the track has travelled (a horizontal rail translates X). */
function trackTravel(track: HTMLElement): number {
  const match = /translateX\((-?[\d.]+)px\)/.exec(track.style.transform);
  if (!match) throw new Error(`unreadable transform: ${track.style.transform}`);
  return Number(match[1]);
}

/**
 * Drive the rail with the preview's own clock for two full repeats, a quarter
 * beat at a time, and report what the track did.
 */
async function runTwoRepeats(performsStartSlot: boolean) {
  const cells = makeCells();
  const props = (currentStep: number) => ({
    cells,
    currentStep,
    bpm: 60,
    loop: true,
    cellSize: 48,
  });

  const { container, rerender } = render(
    StepStrip,
    props(resolvePreviewCycleStep(0, STEP_COUNT, performsStartSlot))
  );
  const track = trackOf(container as HTMLElement);

  const travels: number[] = [];
  let cut = false;
  const quarters = 4 * (STEP_COUNT + 1) * 2;
  for (let quarter = 1; quarter <= quarters; quarter++) {
    await rerender(
      props(resolvePreviewCycleStep(quarter / 4, STEP_COUNT, performsStartSlot))
    );
    travels.push(trackTravel(track));
    if (track.classList.contains("no-anim")) cut = true;
  }
  return { travels, cut, container: container as HTMLElement };
}

describe("StepStrip loop boundary", () => {
  it("slides forward through a loopable seam instead of cutting back", async () => {
    // A seamlessly loopable sequence performs no start hold, so the rail is one
    // cell longer than the repeat — the seam must still be travelled, not cut.
    const { travels, cut } = await runTwoRepeats(false);

    expect(cut).toBe(false);
    for (let i = 1; i < travels.length; i++) {
      expect(travels[i]!).toBeLessThanOrEqual(travels[i - 1]!);
    }
    expect(travels.at(-1)!).toBeLessThan(travels[0]!);
  });

  it("slides forward through a freeform seam", async () => {
    const { travels, cut } = await runTwoRepeats(true);

    expect(cut).toBe(false);
    for (let i = 1; i < travels.length; i++) {
      expect(travels[i]!).toBeLessThanOrEqual(travels[i - 1]!);
    }
    expect(travels.at(-1)!).toBeLessThan(travels[0]!);
  });

  it("carries one morph-pairable copy of each cell while looping", async () => {
    const { container } = await runTwoRepeats(false);

    for (let stepNumber = 0; stepNumber <= STEP_COUNT; stepNumber++) {
      const primary = container.querySelectorAll(
        `.step-cell[data-cell-instance="primary"][data-step-number="${stepNumber}"]`
      );
      expect(primary).toHaveLength(1);
    }
    // Including the Start cell, which the loopable rail travels through rather
    // than resting on — it stays in the rail so the card morph can pair it.
    expect(
      container.querySelectorAll('.step-cell[data-step-number="0"]').length
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("StepStrip without loop", () => {
  it("clamps to its real cells and still cuts on a backward scrub", async () => {
    const cells = makeCells();
    const props = (currentStep: number) => ({
      cells,
      currentStep,
      bpm: 60,
      cellSize: 48,
    });

    const { container, rerender } = render(StepStrip, props(1));
    const root = container as HTMLElement;
    const track = trackOf(root);

    await rerender(props(3));
    expect(track.classList.contains("no-anim")).toBe(false);
    // Never more copies than the rail has cells, and no wrapped duplicates.
    expect(root.querySelectorAll(".step-cell")).toHaveLength(cells.length);
    for (const cell of cells) {
      expect(
        root.querySelectorAll(
          `.step-cell[data-step-number="${cell.stepNumber}"]`
        )
      ).toHaveLength(1);
    }

    // A real backward scrub keeps its established snap — that behavior is the
    // reason the wrap had to stop looking like one, not something to remove.
    await rerender(props(1));
    expect(track.classList.contains("no-anim")).toBe(true);
  });
});
