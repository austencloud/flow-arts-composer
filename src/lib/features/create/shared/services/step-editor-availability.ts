import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * The Step Editor needs at least one editable beat or start placement. A bare
 * sequence shell can exist briefly during creation, but it has nothing to edit.
 */
export function sequenceHasStepEditorContent(
  sequence: SequenceData | null
): boolean {
  if (!sequence) return false;

  return Boolean(
    sequence.steps?.length ||
    sequence.startingPlacement ||
    sequence.startPlacement
  );
}

interface StepEditorSelectionAvailability {
  sequence: SequenceData | null;
  selectedStepNumber: number | null;
  selectedStepNumbers: ReadonlySet<number>;
  hasMandalaSelection: boolean;
}

interface StepEditorDrawerAvailability
  extends StepEditorSelectionAvailability {
  isSequenceViewerOpen: boolean;
}

/**
 * The shared drawer may show a mandala without a selected step. Its editor
 * branch may not: a restored open flag is not enough to identify what to edit.
 */
export function hasStepEditorSelection({
  sequence,
  selectedStepNumber,
  selectedStepNumbers,
  hasMandalaSelection,
}: StepEditorSelectionAvailability): boolean {
  if (!sequenceHasStepEditorContent(sequence)) {
    return false;
  }

  if (hasMandalaSelection) return true;

  return selectedStepNumber !== null || selectedStepNumbers.size > 0;
}

export function canShowStepEditorDrawer(
  availability: StepEditorDrawerAvailability
): boolean {
  return (
    !availability.isSequenceViewerOpen &&
    hasStepEditorSelection(availability)
  );
}
