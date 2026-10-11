import type { ItemLane, ItemLanesUi } from "@austencloud/video-editor";
import { faTableCells } from "@austencloud/video-editor/icons";
import { visibleCells } from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { arrangementCellCycleBeats } from "#lib/shared/media-composition/domain/arrangement-timing.js";
import { setArrangementCellOffset } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { arrangementCellLabel } from "./arrangement-labels";
import { tkaEditorOf } from "./tka-editor-context";

/** The clip an arrangement's beats are measured against. */
export interface ArrangementClipTiming {
  start: number;
  duration: number;
  sourceIn: number;
  speed: number;
}

/** Project seconds covered by one grid beat of a clip playing at `speed`. */
export function arrangementBeatSeconds(bpm: number, speed: number): number {
  return 60 / bpm / speed;
}

/** The project second at which grid beat `beat` of the arrangement plays in `clip`. */
export function arrangementBeatToSeconds(
  clip: Pick<ArrangementClipTiming, "start" | "sourceIn" | "speed">,
  bpm: number,
  beat: number
): number {
  return clip.start + ((beat * 60) / bpm - clip.sourceIn) / clip.speed;
}

export interface CellLaneSpan {
  /** Project seconds, clamped to the clip. */
  startSeconds: number;
  endSeconds: number;
  /** The cell's first beat is past the clip's end: the bar sits there as a stub. */
  pinned: boolean;
}

/**
 * Where a cell's bar sits: one cycle of the cell, `cycleBeats` long at the
 * grid's rate, starting at its beat offset. A clip trimmed past that cycle
 * shows the first cycle still playing at its trimmed-in point. The bar is
 * clamped to the clip; when even its first beat is past the clip's end the
 * bar is pinned there so it can still be dragged back.
 */
export function cellLaneSpan(
  clip: ArrangementClipTiming,
  bpm: number,
  beatOffset: number,
  cycleBeats: number
): CellLaneSpan {
  const clipEnd = clip.start + clip.duration;
  const cycle = Math.max(cycleBeats, Number.EPSILON);
  const sourceInBeats = (clip.sourceIn * bpm) / 60;
  const cyclesBefore = Math.max(
    0,
    Math.floor((sourceInBeats - beatOffset) / cycle)
  );
  const firstBeat = beatOffset + cyclesBefore * cycle;
  const startSeconds = arrangementBeatToSeconds(clip, bpm, firstBeat);
  if (startSeconds >= clipEnd) {
    return { startSeconds: clipEnd, endSeconds: clipEnd, pinned: true };
  }
  const endSeconds = arrangementBeatToSeconds(clip, bpm, firstBeat + cycle);
  return {
    startSeconds: Math.max(clip.start, startSeconds),
    endSeconds: Math.min(clipEnd, endSeconds),
    pinned: false,
  };
}

/**
 * A cell's beat offset after its bar has been dragged `deltaSeconds` along
 * the timeline: snapped to `step` beats (1, or 0.25 with Alt), never below 0.
 */
export function cellOffsetAfterDrag(
  originalOffset: number,
  deltaSeconds: number,
  beatSeconds: number,
  step: number
): number {
  const raw = originalOffset + deltaSeconds / beatSeconds;
  return Math.max(0, Math.round(raw / step) * step);
}

/** Whole beats, or quarter beats with Alt. */
function dragStep(fine: boolean): number {
  return fine ? 0.25 : 1;
}

function offsetText(beatOffset: number): string {
  return beatOffset === 0
    ? "starts with the grid"
    : `starts ${beatOffset} ${beatOffset === 1 ? "beat" : "beats"} after the grid`;
}

/**
 * One lane per cell with layers under the selected arrangement, its bar where
 * the cell's first cycle plays. Dragging a bar moves the cell's beat offset.
 */
export const TKA_ARRANGEMENT_LANES: ItemLanesUi = {
  icon: faTableCells,
  lanes(item, editor, drag) {
    if (item.kind !== "arrangement") return [];
    const { bpm, skipStartPlacement } = item.snapshot;
    const selectedCellId =
      editor.selectedItemId === item.id
        ? (tkaEditorOf(editor)?.wrapper.selectedCellId ?? null)
        : null;
    return visibleCells(item.snapshot)
      .filter((cell) => cell.layers.length > 0)
      .map((cell): ItemLane => {
        const dragged = drag?.laneId === cell.id;
        const beatOffset = dragged
          ? cellOffsetAfterDrag(
              cell.beatOffset,
              drag.deltaSeconds,
              arrangementBeatSeconds(bpm, item.speed),
              dragStep(drag.fine)
            )
          : cell.beatOffset;
        const span = cellLaneSpan(
          item,
          bpm,
          beatOffset,
          arrangementCellCycleBeats(cell, skipStartPlacement)
        );
        return {
          id: cell.id,
          label: arrangementCellLabel(cell),
          description: offsetText(beatOffset),
          startSeconds: span.startSeconds,
          endSeconds: span.endSeconds,
          pinned: span.pinned,
          selected: cell.id === selectedCellId,
          ...(dragged
            ? { guideSeconds: arrangementBeatToSeconds(item, bpm, beatOffset) }
            : {}),
          data: { "beat-offset": String(beatOffset) },
        };
      });
  },
  select(_item, laneId, editor) {
    tkaEditorOf(editor)?.wrapper.selectCell(laneId);
  },
  move(item, drag, editor) {
    if (item.kind !== "arrangement") return;
    const cell = visibleCells(item.snapshot).find(
      (entry) => entry.id === drag.laneId
    );
    if (!cell) return;
    const beatOffset = cellOffsetAfterDrag(
      cell.beatOffset,
      drag.deltaSeconds,
      arrangementBeatSeconds(item.snapshot.bpm, item.speed),
      dragStep(drag.fine)
    );
    if (beatOffset === cell.beatOffset) return;
    editor.edit((project, context) =>
      setArrangementCellOffset(project, item.id, cell.id, { beatOffset }, context)
    );
  },
};
