/**
 * Sheet row planner.
 *
 * Lays an ordered list of sequences out as one CONTINUOUS flow of cells for a
 * choreo sheet: every step of every sequence is placed left-to-right, `columns`
 * per row, wrapping straight into the next row — the next sequence begins in the
 * very next cell, not on a fresh row. A 12-count then an 8-count at 8 columns
 * fills row 1 (8), row 2 cells 1-4 (seq 1 tail) + cells 5-8 (seq 2 head), etc.
 * Only the final row is padded with blank cells to square off the grid.
 *
 * Each cell carries its `sequenceId` and whether it's the first cell of its
 * sequence (`isSequenceStart`) — a sequence's run can begin mid-row, so
 * selection highlighting and break/separator marks are per-cell, not per-row.
 *
 * Preview and PDF both consume this output, so layout is identical in both.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GridJoin } from "@tka/tka-types";
import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { ChoreoSheetLayout } from "../domain/types/choreo-sheet";
import {
  getSheetPageLayout,
  pageChromePt,
  type SheetPageGeometry,
} from "../domain/sheet-page-layout";
import { bandKey, type CueMark, type NoteMark, type BandKey } from "../domain/types/choreo-sheet";

export interface SheetCell {
  step: StepData | null;
  isBlank: boolean;
  /** Owning sequence id, or null for a trailing blank pad cell. */
  sequenceId: string | null;
  /** True for the first cell of a sequence's run in the flow. */
  isSequenceStart: boolean;
  /**
   * The join the cell's sequence is drawn with (null for one grid and for
   * blank pad cells). Display-only; consumers stamp it on the step to draw.
   */
  join: GridJoin | null;
  /**
   * This cell's 0-based index in the ACT — the whole sheet played as one
   * sequence. `buildActSequence` is a literal in-order concatenation of every
   * row's steps, so this is exactly the index the act player reports while it
   * plays, and the sheet can highlight the pictograph being animated by
   * comparing the two. null for a blank pad cell.
   */
  actStepIndex: number | null;
}
export interface SheetRow {
  cells: SheetCell[];
}
export interface SheetPage {
  rows: SheetRow[];
}

export function planSheet(
  seqs: readonly SequenceData[],
  layout: ChoreoSheetLayout
): SheetPage[] {
  const { columns } = layout;
  const rowsPerPage = getSheetPageLayout(layout).rows;

  // 1. Flatten every sequence's steps into one continuous cell stream. The
  //    stream order IS the act's step order, so the running index doubles as
  //    each cell's act position.
  const cells: SheetCell[] = [];
  for (const seq of seqs) {
    const join = sequenceGridJoin(seq);
    seq.steps.forEach((step, i) => {
      cells.push({
        step,
        isBlank: false,
        sequenceId: seq.id,
        isSequenceStart: i === 0,
        join,
        actStepIndex: cells.length,
      });
    });
  }

  if (cells.length === 0) return [];

  // 2. Pad only the final row up to a full width, so the grid squares off.
  const remainder = cells.length % columns;
  if (remainder !== 0) {
    for (let i = remainder; i < columns; i++) {
      cells.push({
        step: null,
        isBlank: true,
        sequenceId: null,
        isSequenceStart: false,
        join: null,
        actStepIndex: null,
      });
    }
  }

  // 3. Chunk into rows of `columns`, paginate every `rowsPerPage` rows.
  const pages: SheetPage[] = [];
  let rows: SheetRow[] = [];
  for (let i = 0; i < cells.length; i += columns) {
    rows.push({ cells: cells.slice(i, i + columns) });
    if (rows.length === rowsPerPage) {
      pages.push({ rows });
      rows = [];
    }
  }
  if (rows.length) pages.push({ rows });
  return pages;
}

/**
 * A note with its column resolved against THIS layout. `count` is derived from
 * the note's absolute `stepIndex`, never stored — see `choreo-sheet.ts`.
 * `count: null` renders as a full-width bullet.
 */
export interface ResolvedNote extends NoteMark {
  count: number | null;
}

export interface SheetBand {
  key: BandKey;
  sequenceId: string;
  rowInSequence: number;
  cells: SheetCell[]; // ≤ columns; short last row NOT cross-padded
  /**
   * Every cue anchored inside this band's step range, earliest first.
   * Usually 0 or 1 — but widening the pictograph size merges two rows into one
   * band, and both their cues are real. They stack in the rail rather than one
   * of them silently disappearing.
   */
  cues: CueMark[];
  notes: ResolvedNote[];
  isSequenceStart: boolean;
  firstStepIndex: number; // index of this band's first step WITHIN its sequence
  firstBeatIndex: number; // running step index across the sheet, for BPM prefill
  heightPt: number;
}
export interface SheetBandPage {
  bands: SheetBand[];
  pageIndex: number;
}
export interface BandPlanInput {
  sequences: readonly SequenceData[];
  geo: SheetPageGeometry;
  cues: readonly CueMark[];
  notes: readonly NoteMark[];
  /** Page 1 carries the title block when this is true, which is ~186pt the
   *  bands do not get. Defaults to true — that is the sheet's default. */
  showTitleBlock?: boolean;
}

// Base band height: pictograph row + note strip. Grows in
// half-line steps when a strip holds a full-width bullet + pinned rows that would
// exceed one line; kept simple here (bullets and pins each cost one line).
// Extra stacked cues (a merged band) cost a line each in the rail, which is only
// taller than the pictograph row once several pile up. The inter-band gutter is
// added by the paginator only BETWEEN bands, matching the preview and PDF.
function estimateBandHeight(
  geo: SheetPageGeometry,
  notes: readonly ResolvedNote[],
  cueCount: number
): number {
  const noteLines = notes.length === 0 ? 0 : Math.max(1, notes.length);
  const stripHeight = geo.stripBaseHeightPt > 0 ? Math.max(geo.stripBaseHeightPt, noteLines * geo.stripBaseHeightPt) : 0;
  const railHeight = cueCount > 1 ? cueCount * geo.railLineHeightPt : 0;
  return Math.max(geo.cellSizePt, railHeight) + stripHeight;
}

/**
 * Which row of its sequence a given absolute step falls on, at this layout.
 *
 * A step past the end of the sequence (an annotation left behind when the
 * sequence was shortened, or a legacy note whose column ran off a short last
 * row) clamps to the final row instead of vanishing — the annotation stays
 * visible as a bullet and the user can see it needs re-placing.
 */
function rowForStep(stepIndex: number, stepCount: number, columns: number): number {
  const lastRow = Math.max(0, Math.ceil(stepCount / columns) - 1);
  return Math.min(Math.floor(Math.max(0, stepIndex) / columns), lastRow);
}

/**
 * Build the ordered band list for a layout — chunking + annotation resolution,
 * WITHOUT pagination.
 *
 * Split out from `planBands` so the mobile reading view can consume the exact
 * same bands at its own column count without a second implementation of
 * chunking or annotation placement. That is the whole point: the page-chrome
 * bug in this module happened when a third surface grew its own layout math.
 * Reading view re-chunks at 4 columns and gets correct annotations for free,
 * because they address absolute steps rather than band-relative positions.
 */
export function buildBands(input: BandPlanInput): SheetBand[] {
  const { sequences, geo, cues, notes } = input;
  const columns = geo.columns;

  // Every annotation resolves from its absolute step against THIS layout.
  // Nothing is stored band-relative, so changing `columns` simply re-derives the
  // placement — a note keeps addressing the same step at every pictograph size.
  const stepCounts = new Map(sequences.map((s) => [s.id, (s.steps ?? []).length]));

  // Resolution is per SEQUENCE (an annotation belongs to the sequence), while
  // band identity is per ROSTER ROW. A roster listing the same sequence twice
  // therefore shows its annotations on both occurrences — they describe that
  // sequence, so both are true — without the two rows sharing a render key.
  const cuesBySequence = new Map<string, CueMark[]>();
  for (const c of cues) {
    if (!stepCounts.has(c.sequenceId)) continue; // cue for a sequence no longer on the sheet
    const list = cuesBySequence.get(c.sequenceId) ?? [];
    list.push(c);
    cuesBySequence.set(c.sequenceId, list);
  }

  const notesBySequence = new Map<string, NoteMark[]>();
  for (const n of notes) {
    if (!stepCounts.has(n.sequenceId)) continue; // note for a sequence no longer on the sheet
    const list = notesBySequence.get(n.sequenceId) ?? [];
    list.push(n);
    notesBySequence.set(n.sequenceId, list);
  }

  // 1. Row-aligned bands: each sequence chunked into rows of `columns`.
  const bands: SheetBand[] = [];
  let beatIndex = 0;
  for (const [rosterIndex, seq] of sequences.entries()) {
    const steps = seq.steps ?? [];
    const join = sequenceGridJoin(seq);
    const stepCount = steps.length;
    const seqCues = cuesBySequence.get(seq.id) ?? [];
    const seqNotes = notesBySequence.get(seq.id) ?? [];

    for (let row = 0, s = 0; s < steps.length; row++, s += columns) {
      const slice = steps.slice(s, s + columns);
      const key = bandKey(rosterIndex, seq.id, row);
      const bandCues = seqCues
        .filter((c) => rowForStep(c.stepIndex, stepCount, columns) === row)
        .sort((a, b) => a.stepIndex - b.stepIndex);
      const bandNotes = seqNotes
        .filter((n) => rowForStep(n.stepIndex, stepCount, columns) === row)
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((n) => {
          // Pin under the step's column, but only while the step is real and
          // pinning was asked for; anything else reads as a full-width bullet.
          const inRange = n.stepIndex >= 0 && n.stepIndex < stepCount;
          return { ...n, count: n.pinned && inRange ? n.stepIndex - row * columns + 1 : null };
        });
      const cells: SheetCell[] = slice.map((step, i) => ({
        step,
        isBlank: false,
        sequenceId: seq.id,
        isSequenceStart: row === 0 && i === 0,
        join,
        // `firstBeatIndex` is already the running step index across the sheet,
        // which is exactly the act's step numbering.
        actStepIndex: beatIndex + s + i,
      }));
      bands.push({
        key,
        sequenceId: seq.id,
        rowInSequence: row,
        cells,
        cues: bandCues,
        notes: bandNotes,
        isSequenceStart: row === 0,
        firstStepIndex: s,
        firstBeatIndex: beatIndex + s,
        heightPt: estimateBandHeight(geo, bandNotes, bandCues.length),
      });
    }
    beatIndex += steps.length;
  }

  return bands;
}

export function planBands(input: BandPlanInput): SheetBandPage[] {
  const { geo } = input;
  const bands = buildBands(input);

  // 2. Height-packed pagination. The budget is the grid area MINUS the chrome
  //    that page carries — the title block on page 1, the running header after.
  //    Budgeting the full page height is what pushed the last band off the
  //    bottom of a portrait sheet.
  const showTitleBlock = input.showTitleBlock ?? true;
  const budgetFor = (pageIndex: number) =>
    geo.usableHeightPt - pageChromePt(pageIndex, showTitleBlock);

  const pages: SheetBandPage[] = [];
  let current: SheetBand[] = [];
  let used = 0;
  let pageIndex = 0;
  let budget = budgetFor(0);
  for (const band of bands) {
    const gap = current.length > 0 ? geo.interBandGutterPt : 0;
    if (current.length > 0 && used + gap + band.heightPt > budget) {
      pages.push({ bands: current, pageIndex: pageIndex++ });
      current = [];
      used = 0;
      budget = budgetFor(pageIndex);
    }
    const appliedGap = current.length > 0 ? geo.interBandGutterPt : 0;
    current.push(band);
    used += appliedGap + band.heightPt;
  }
  if (current.length) pages.push({ bands: current, pageIndex: pageIndex++ });
  return pages;
}
