/**
 * Selection Actions
 *
 * Extracted clip selection mutations.
 * Uses callback injection to preserve Svelte 5 reactivity.
 */

import type {
  SelectionState,
  TimelineClip,
  TimeSeconds,
} from "#lib/shared/animation-engine/domain/timeline-types.js";
import {
  createDefaultSelectionState,
  getClipEndTime,
} from "#lib/shared/animation-engine/domain/timeline-types.js";

export interface SelectionContext {
  getSelection: () => SelectionState;
  setSelection: (s: SelectionState) => void;
  getAllClips: () => TimelineClip[];
}

export function createSelectionActions(ctx: SelectionContext) {
  const { getSelection, setSelection, getAllClips } = ctx;

  function selectClip(clipId: string, addToSelection: boolean = false) {
    const selection = getSelection();
    if (addToSelection) {
      setSelection({
        ...selection,
        selectedClipIds: selection.selectedClipIds.includes(clipId)
          ? selection.selectedClipIds.filter((id) => id !== clipId)
          : [...selection.selectedClipIds, clipId],
      });
    } else {
      setSelection({
        ...selection,
        selectedClipIds: [clipId],
      });
    }
  }

  function selectClips(clipIds: string[]) {
    setSelection({ ...getSelection(), selectedClipIds: clipIds });
  }

  function selectAllClips() {
    setSelection({
      ...getSelection(),
      selectedClipIds: getAllClips().map((c) => c.id),
    });
  }

  function clearSelection() {
    setSelection(createDefaultSelectionState());
  }

  function selectClipsInRange(
    start: TimeSeconds,
    end: TimeSeconds,
    trackIds?: string[]
  ) {
    const clipsInRange = getAllClips().filter((c) => {
      const inTimeRange = c.startTime < end && getClipEndTime(c) > start;
      const inTrackRange = !trackIds || trackIds.includes(c.trackId);
      return inTimeRange && inTrackRange;
    });

    setSelection({
      ...getSelection(),
      selectedClipIds: clipsInRange.map((c) => c.id),
    });
  }

  return {
    selectClip,
    selectClips,
    selectAllClips,
    clearSelection,
    selectClipsInRange,
  };
}
