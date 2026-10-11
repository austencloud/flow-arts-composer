import { flushSync, mount, unmount } from "svelte";
import StepCell from "#lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";

/**
 * A row of real step cells inside a focus scope, the way WorkspaceGrid lays
 * them out, with a Play button outside it. The selection moves either the way
 * playback moves it, one beat at a time, or the way Create moves it after a
 * delete. Needs a real `document.createElement`.
 */
export function mountStepCellRow(stepCount: number) {
  let selected = $state<number | null>(null);
  const deleteRequests: number[] = [];
  const root = document.body.appendChild(document.createElement("div"));
  const playButton = root.appendChild(document.createElement("button"));
  playButton.textContent = "Play";
  const scope = root.appendChild(document.createElement("div"));
  scope.setAttribute("data-step-focus-scope", "");

  const cells = new Map<
    number,
    { container: HTMLElement; component: ReturnType<typeof mount> }
  >();
  for (let stepNumber = 1; stepNumber <= stepCount; stepNumber += 1) {
    const container = scope.appendChild(document.createElement("div"));
    const component = mount(StepCell, {
      target: container,
      props: {
        step: createStepData({ id: `step-${stepNumber}`, stepNumber }),
        index: stepNumber - 1,
        get isSelected() {
          return selected === stepNumber;
        },
        onClick: () => {
          selected = stepNumber;
        },
        onDelete: () => {
          deleteRequests.push(stepNumber);
        },
      },
    });
    cells.set(stepNumber, { container, component });
  }
  flushSync();

  return {
    playButton,
    cell: (stepNumber: number) => {
      const cell = cells
        .get(stepNumber)
        ?.container.querySelector<HTMLElement>(".step-cell");
      if (!cell) throw new Error(`Step ${stepNumber} has no cell`);
      return cell;
    },
    deleteRequests: () => [...deleteRequests],
    /** The playhead reaching a step. */
    select: (stepNumber: number | null) => {
      selected = stepNumber;
      flushSync();
    },
    /**
     * Create finishing a delete: the step and every step after it leave, and
     * the step before them is selected, in the same update.
     */
    removeFrom: (stepNumber: number) => {
      for (const [number, cell] of cells) {
        if (number < stepNumber) continue;
        unmount(cell.component);
        cell.container.remove();
        cells.delete(number);
      }
      selected = stepNumber > 1 ? stepNumber - 1 : null;
      flushSync();
    },
    destroy: () => {
      for (const cell of cells.values()) unmount(cell.component);
      root.remove();
    },
  };
}
