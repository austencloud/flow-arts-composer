import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { mountStepCellRow } from "./step-cell-focus-harness.svelte";

// The pictograph, its context menu and the arrow modal need the whole render
// stack. Focus lives on the cell around them.
vi.mock(
  "#lib/shared/pictograph/shared/components/PictographContainer.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/shared/pictograph/shared/components/context-menu/PictographContextMenuHost.svelte",
  () => ({ default: () => ({}) })
);
vi.mock(
  "#lib/features/create/shared/components/arrow-adjustment/ArrowLayerModal.svelte",
  () => ({ default: () => ({}) })
);

// The global setup stubs document.createElement; the cells need real elements.
let stubbed: typeof document.createElement;
const rows: Array<{ destroy: () => void }> = [];
beforeEach(() => {
  stubbed = document.createElement;
  document.createElement = Object.getPrototypeOf(document).createElement.bind(
    document
  );
});
afterEach(() => {
  for (const row of rows.splice(0)) row.destroy();
  document.createElement = stubbed;
});

function row(stepCount: number) {
  const mounted = mountStepCellRow(stepCount);
  rows.push(mounted);
  return mounted;
}

/** A newly selected cell decides about focus on the next frame. */
async function frames() {
  for (let frame = 0; frame < 2; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function press(cell: HTMLElement, key: "Delete" | "Backspace") {
  cell.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
  flushSync();
}

/**
 * A key press the way Create delivers it while the step editor is open. Its
 * Delete shortcut listens on the window, so it sees the key before the cell:
 * it closes the editor, which clears the selection, and removes the step
 * itself. The browser applies that update before the cell's own handler runs.
 */
function pressThroughCreateShortcut(
  grid: ReturnType<typeof row>,
  cell: HTMLElement,
  key: "Delete" | "Backspace"
) {
  window.addEventListener("keydown", () => grid.select(null), {
    capture: true,
    once: true,
  });
  press(cell, key);
}

/**
 * The same shortcut with the step editor closed, as after one delete on
 * Construct. There is no editor to close, so the step stays selected, and the
 * shortcut removes it and marks the key handled before the cell sees it.
 */
function pressHandledByCreateShortcut(
  cell: HTMLElement,
  key: "Delete" | "Backspace"
) {
  window.addEventListener("keydown", (event) => event.preventDefault(), {
    capture: true,
    once: true,
  });
  press(cell, key);
}

async function clickCell(cell: HTMLElement) {
  cell.click();
  flushSync();
  await frames();
}

describe("step cell focus while the selection moves", () => {
  // The Composer's Making demo and Create's playback both select the playing
  // step on every beat. Each selected cell used to take focus, so keyboard
  // focus left the Play button on the first beat and hopped cell to cell.
  it("leaves focus on Play while playback walks the grid", async () => {
    const grid = row(4);
    grid.playButton.focus();
    for (const beat of [1, 2, 3, 4]) {
      grid.select(beat);
      await frames();
      expect(document.activeElement).toBe(grid.playButton);
    }
  });

  it("keeps focus on the clicked cell instead of chasing the playhead", async () => {
    const grid = row(4);
    await clickCell(grid.cell(2));
    expect(document.activeElement).toBe(grid.cell(2));

    grid.select(3);
    await frames();
    grid.select(4);
    await frames();
    expect(document.activeElement).toBe(grid.cell(2));
  });

  // The demo's grid deletes nothing, so the focused cell stays put. Later
  // beats must not read the key press as permission to move focus, even once
  // focus has left the grid.
  it("ignores a delete press that removes nothing", async () => {
    const grid = row(4);
    await clickCell(grid.cell(2));
    press(grid.cell(2), "Backspace");

    grid.select(3);
    await frames();
    expect(document.activeElement).toBe(grid.cell(2));

    grid.cell(2).blur();
    grid.select(4);
    await frames();
    expect(document.activeElement).toBe(document.body);
  });

  it("hands focus to the step selected after the focused step is deleted", async () => {
    const grid = row(4);
    await clickCell(grid.cell(4));
    press(grid.cell(4), "Delete");
    expect(grid.deleteRequests()).toEqual([4]);

    // Create removes the step once its fade has played.
    await new Promise((resolve) => setTimeout(resolve, DURATION.normal));
    grid.removeFrom(4);
    await frames();
    expect(document.activeElement).toBe(grid.cell(3));

    // So the next press keeps deleting.
    press(grid.cell(3), "Backspace");
    expect(grid.deleteRequests()).toEqual([4, 3]);
  });

  it("hands focus on when Create's shortcut deletes the focused step", async () => {
    const grid = row(4);
    await clickCell(grid.cell(4));
    pressThroughCreateShortcut(grid, grid.cell(4), "Delete");
    // The cell saw the key already deselected; the shortcut did the delete.
    expect(grid.deleteRequests()).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, DURATION.normal));
    grid.removeFrom(4);
    await frames();
    expect(document.activeElement).toBe(grid.cell(3));

    pressThroughCreateShortcut(grid, grid.cell(3), "Backspace");
    grid.removeFrom(3);
    await frames();
    expect(document.activeElement).toBe(grid.cell(2));
  });

  // Deleting here as well removed the steps twice and left two undo entries
  // for one press.
  it("leaves a delete to Create's shortcut once it has handled the key", async () => {
    const grid = row(4);
    await clickCell(grid.cell(4));
    pressHandledByCreateShortcut(grid.cell(4), "Delete");
    expect(grid.deleteRequests()).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, DURATION.normal));
    grid.removeFrom(4);
    await frames();
    expect(document.activeElement).toBe(grid.cell(3));

    pressHandledByCreateShortcut(grid.cell(3), "Backspace");
    expect(grid.deleteRequests()).toEqual([]);
  });

  it("leaves focus where the user went while a delete was finishing", async () => {
    const grid = row(4);
    await clickCell(grid.cell(4));
    press(grid.cell(4), "Delete");
    grid.playButton.focus();

    grid.removeFrom(4);
    await frames();
    expect(document.activeElement).toBe(grid.playButton);
  });
});
