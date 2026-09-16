/**
 * cellKey → hydrated SequenceData.
 *
 * SpiroAnim's transcription records what each cell DOES — letter, start and end
 * position, per-hand turns — but not the motions themselves. Those live in
 * TKA's own pictograph dataframes, so the resolver recovers each step by
 * looking up `(letter, startPlacement, endPlacement)` there and then hands the
 * result to the canonical owners: `applyPendingTurnsToOption` for turns,
 * `propagateOrientationsForHand` for the orientation chain, and
 * `hydrateSequence` for letters, positions, word, LOOP, placement and grid
 * mode. Nothing the hydrator owns is derived here.
 *
 * ## Choosing the row
 *
 * `(letter, startPlacement, endPlacement)` addresses exactly one dataframe row
 * for every step in this corpus except the six one-pro-one-anti letters
 * (C, F, I, L, O, R), where two rows differ only in which hand carries the anti
 * motion. Every one of those pairs is a pure blue↔red swap — verified across
 * all 96 ambiguous keys — so the choice is a hand-role assignment, not a
 * different pictograph.
 *
 * It is resolved by rotation-direction constancy: within one cell a hand keeps
 * a single rotation direction from first step to last. That holds for all 144
 * hand-cells of `eightstep-72-base.json`, SpiroAnim's own compiled geometry, and
 * it settles all 1,200 transcription cells that contain at least one
 * unambiguous step — with zero conflicts and no residual ambiguity.
 *
 * The other 384 cells (words IIII, CCCC, LFLF, FLFL, RORO, OROR) have no
 * unambiguous step to anchor on. Both readings there are the same animation
 * with the two props' colors exchanged, and the transcription does not record
 * which prop is which, so the resolver takes the reading whose blue hand turns
 * clockwise. Deterministic, and honest about what the source data does not say.
 */

import { formatCellKey, parseCellKey } from "../domain/cell-key";
import {
  effectiveOrientation,
  rotatePositionName,
  rotationStepsFor,
} from "../domain/orientation-rotation";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { applyPendingTurnsToOption } from "$lib/shared/create/services/apply-turns-to-motion";
import { propagateOrientationsForHand } from "$lib/shared/create/services/orientation-propagation";
import { convertToStep } from "$lib/features/create/generate/shared/services/step-converter";
import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";

/**
 * One step as SpiroAnim transcribed it. Turns are recorded per prop colour —
 * blue is TKA's left hand, red its right — and may be quarter values: the
 * even-denominator and two-cycle ratios turn 0.25, 0.5, 0.75 or 1.5 per step.
 */
export interface TranscriptionStep {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  swapped: boolean;
  blueTurns: number;
  redTurns: number;
}

/** One cell of SpiroAnim's VTG / QTR / 8-Step catalogues. */
export interface TranscriptionEntry {
  concept: string;
  reference: string;
  speedRatio?: string;
  isAnti?: boolean;
  shape: string;
  word: string;
  steps: TranscriptionStep[];
  /** qtr only — his quarter-spacing builder's `quarters` option (1 or 2). */
  quarters?: number;
  /** 8stp only — his eight-step builder's `reversePlane` option. */
  reversePlane?: boolean;
}

export interface ResolvedCell {
  sequence: SequenceData;
  /** Powers the route's provenance line; never shown to the sequence viewer. */
  entry: TranscriptionEntry;
}

interface IndexedRow {
  pictograph: PictographData;
  gridMode: GridMode;
}

let rowIndexPromise: Promise<Map<string, IndexedRow[]>> | null = null;

/**
 * Diamond and Box in one index, keyed by `(letter, startPlacement, endPlacement)`.
 *
 * A cell's declared shape is SpiroAnim's word for its own grid, not a promise
 * about which dataframe holds the pictograph: 144 cells labelled `box` resolve
 * wholly against the Diamond frame. No cell draws from both frames, so the
 * frame the rows come from IS the sequence's grid mode.
 */
async function getRowIndex(): Promise<Map<string, IndexedRow[]>> {
  rowIndexPromise ??= (async () => {
    const index = new Map<string, IndexedRow[]>();
    for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
      const variations =
        await letterQueryHandler.getAllPictographVariations(gridMode);
      for (const pictograph of variations) {
        if (
          !pictograph.letter ||
          !pictograph.startPlacement ||
          !pictograph.endPlacement
        )
          continue;
        const key = rowKey(
          String(pictograph.letter),
          String(pictograph.startPlacement),
          String(pictograph.endPlacement)
        );
        const bucket = index.get(key);
        if (bucket) bucket.push({ pictograph, gridMode });
        else index.set(key, [{ pictograph, gridMode }]);
      }
    }
    return index;
  })();
  return rowIndexPromise;
}

function rowKey(
  letter: string,
  startPlacement: string,
  endPlacement: string
): string {
  return `${letter}|${startPlacement}|${endPlacement}`;
}

function rotationOf(row: IndexedRow, hand: HandSide): RotationDirection | null {
  return row.pictograph.motions?.[hand]?.rotationDirection ?? null;
}

/**
 * Pick one dataframe row per step. Returns null if any step has no row at all —
 * a missing pictograph is a data problem, and inventing one would be worse than
 * the route's honest "no bridge entry" card.
 */
function chooseRows(
  entry: TranscriptionEntry,
  index: Map<string, IndexedRow[]>
): IndexedRow[] | null {
  const candidates = entry.steps.map((step) =>
    index.get(rowKey(step.letter, step.startPlacement, step.endPlacement))
  );
  if (candidates.some((bucket) => !bucket || bucket.length === 0)) return null;
  const buckets = candidates as IndexedRow[][];

  const anchor = buckets.find((bucket) => bucket.length === 1)?.[0];
  const leftDirection = anchor
    ? rotationOf(anchor, HandSide.LEFT)
    : RotationDirection.CLOCKWISE;
  const rightDirection = anchor ? rotationOf(anchor, HandSide.RIGHT) : null;

  return buckets.map((bucket) => {
    if (bucket.length === 1) return bucket[0]!;
    const matching = bucket.filter(
      (row) =>
        rotationOf(row, HandSide.LEFT) === leftDirection &&
        (rightDirection === null ||
          rotationOf(row, HandSide.RIGHT) === rightDirection)
    );
    // One match is the shipped case for all 8,640 steps of the corpus. The
    // fallback keeps a future cell resolvable rather than throwing; it is
    // deterministic, and the resolver sweep would catch it going wrong.
    return matching.length === 1 ? matching[0]! : bucket[0]!;
  });
}

function buildSteps(entry: TranscriptionEntry, rows: IndexedRow[]): StepData[] {
  const steps = rows.map((row, i) => {
    const transcribed = entry.steps[i]!;
    const left = row.pictograph.motions?.[HandSide.LEFT];
    const right = row.pictograph.motions?.[HandSide.RIGHT];
    // Every motion in this corpus is a shift (pro or anti), which carries its
    // own rotation direction; the explicit directions only matter to dash and
    // static hands, which never appear here.
    const withTurns = applyPendingTurnsToOption(
      row.pictograph,
      transcribed.blueTurns,
      transcribed.redTurns,
      left?.rotationDirection ?? RotationDirection.CLOCKWISE,
      right?.rotationDirection ?? RotationDirection.CLOCKWISE
    );
    // The letter is cleared on purpose: the hydrator re-derives it from the
    // motions, so a wrong row shows up as a wrong word instead of being masked
    // by the letter we copied in.
    return { ...convertToStep(withTurns, i + 1, row.gridMode), letter: null };
  });

  const withLeft = propagateOrientationsForHand(
    steps,
    HandSide.LEFT,
    Orientation.IN
  );
  return propagateOrientationsForHand(withLeft, HandSide.RIGHT, Orientation.IN);
}

function matchesKey(
  entry: TranscriptionEntry,
  key: ReturnType<typeof parseCellKey>
): boolean {
  if (!key) return false;
  return (
    formatCellKey({
      concept: entry.concept as "vtg" | "qtr" | "8stp",
      reference: entry.reference,
      speedRatio: entry.speedRatio ?? "1:1",
      shape: entry.shape,
      isAnti: entry.isAnti === true,
    }) === formatCellKey(key)
  );
}

/**
 * The reading the five-field key addresses.
 *
 * The transcription carries two axes the key does not: `quarters` (qtr) and
 * `reversePlane` (8stp). SpiroAnim's own link builder emits the canonical
 * reading of each cell — `quarters: 1`, `reversePlane: false` — and that is the
 * one `cell-catalogue.json` records, so the bridge addresses it too.
 */
function isCanonicalReading(entry: TranscriptionEntry): boolean {
  if (entry.quarters !== undefined && entry.quarters !== 1) return false;
  if (entry.reversePlane !== undefined && entry.reversePlane !== false)
    return false;
  return true;
}

/**
 * The transcription was captured at pattern orientation -90, and the key
 * requests some other view — 0 (SpiroAnim's default) when it carries no `o`
 * token. Rotate every step's positions clockwise before the dataframe lookup
 * so the resolved pictographs show what SpiroAnim actually renders. Turns are
 * per-hand scalars and survive rotation unchanged. Null when any position
 * cannot be rotated — unresolvable, never a guess.
 */
function withRequestedOrientation(
  entry: TranscriptionEntry,
  clockwiseSteps: number
): TranscriptionEntry | null {
  if (clockwiseSteps === 0) return entry;
  const rotated: TranscriptionStep[] = [];
  for (const step of entry.steps) {
    const startPlacement = rotatePositionName(
      step.startPlacement,
      clockwiseSteps
    );
    const endPlacement = rotatePositionName(step.endPlacement, clockwiseSteps);
    if (!startPlacement || !endPlacement) return null;
    rotated.push({ ...step, startPlacement, endPlacement });
  }
  return { ...entry, steps: rotated };
}

/**
 * Resolve a cellKey against the transcription. Returns null — never throws and
 * never guesses — for a malformed key, an unknown cell, or a cell whose steps
 * have no pictograph.
 *
 * The transcription is passed in rather than imported: it is 3,312 entries, and
 * a static import would put all of it in the app's main chunk. The route
 * dynamic-imports it.
 */
export async function resolveCell(
  key: string,
  transcription: readonly TranscriptionEntry[]
): Promise<ResolvedCell | null> {
  const parsed = parseCellKey(key);
  if (!parsed) return null;

  const entry = transcription.find(
    (candidate) =>
      isCanonicalReading(candidate) && matchesKey(candidate, parsed)
  );
  if (!entry) return null;

  const oriented = withRequestedOrientation(entry, rotationStepsFor(parsed));
  if (!oriented) return null;

  const index = await getRowIndex();
  const rows = chooseRows(oriented, index);
  if (!rows || rows.length === 0) return null;

  const built = createSequenceData({
    // `word` stays the full expanded string the hydrator derives; `name` is the
    // display/save field, so it carries the smallest form of a repeating word
    // (every cell in this catalogue repeats by construction).
    name: simplifyRepeatedWord(entry.word),
    steps: buildSteps(oriented, rows),
    gridMode: rows[0]!.gridMode,
    metadata: {
      source: "spiroanim-bridge",
      cellKey: formatCellKey(parsed),
      concept: entry.concept,
      reference: entry.reference,
      ...(parsed.concept === "8stp"
        ? {}
        : { spiroanimOrientation: effectiveOrientation(parsed) }),
      attribution:
        parsed.concept === "8stp"
          ? "8-Step Concepts and handpaths by Gage DeMello; transcribed from Mentive's SpiroAnim (@rbgirard)"
          : parsed.concept === "vtg"
            ? "Vulcan Tech Gospel by Noel Yee; transcribed from Mentive's SpiroAnim (@rbgirard)"
            : "Quarter Spacing catalog transcribed from Mentive's SpiroAnim (@rbgirard)",
    },
  });

  const sequence = await hydrateSequence(built, { loopDetector });
  return { sequence, entry };
}
