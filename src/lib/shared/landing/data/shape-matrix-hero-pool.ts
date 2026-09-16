/**
 * Shape-Matrix Hero Pool (firebase-free)
 *
 * Supplies the home hero with sequences drawn from the full shape-matrix
 * possibility space. Nothing is baked per-sequence: the 22 base words load once
 * from a static JSON (`/data/hero/tnd-base-words.json`), the cell space is
 * ENUMERATED in code (buildFlowerAxis + applyFilter — pure), and each draw
 * CONSTRUCTS one realization at runtime via `applyVariationDescriptor` (turn
 * pattern + orientation + grid). This keeps the landing bundle Firebase-free —
 * the construction pipeline was split out of its firebase-tainted host modules
 * (see turn-pattern-apply.ts / reversal-transform-apply.ts / tnd-base-index.ts).
 *
 * Space: diamond×diamond ∪ box×box cells (never mixed — "diamond on box" is not
 * ready), across the turn ratios up to MAX_TURNS × 6 VTG modes. Every uniform
 * per-hand turn on a 4-beat rotated loop preserves closure by parity, so every
 * realization loop-closes; the closure gate stays as a safety net for any future
 * non-uniform descriptor. Each draw is then tiled REPEAT× (see below).
 *
 * The element indicator's TnD element is RE-DERIVED from the final played
 * geometry (post box + post rotation), never carried from the cell's nominal
 * mode — the element is not rotation-invariant for opposite-direction cells
 * (diamond quarter-opp rotates to box tog-opp), so carrying it would mislabel.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { CardVariation } from "$lib/features/choreo-card/domain/models/DeckRelease";
import { hydrateSequence } from "$lib/features/choreo-card/services/sequence-render-hydrator";
import {
  loadDiamondEdges,
  type CsvEdge,
} from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import {
  buildBaseIndex,
  resolveBase,
} from "$lib/shared/shape-matrix/services/tnd-base-index";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { rotateSequenceGeometry } from "$lib/shared/create/services/sequence-derived-fields";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import {
  buildFlowerAxis,
  type Flower,
} from "$lib/shared/shape-matrix/domain/flower-signature";
import { applyFilter } from "$lib/shared/shape-matrix/domain/filter-flower-axis";
import { MODE_ORDER } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { TURN_VALUES } from "$lib/features/choreo-card/domain/turn-pattern-parser";
import {
  Orientation,
  TnDMode,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { TND_BY_FAMILY, type TnDElement } from "$lib/features/choreo-card/domain/tnd-element";

const BASE_WORDS_URL = "/data/hero/tnd-base-words.json";

/** Max cells to try before giving up (returns null → caller uses a generated draw). */
const MAX_DRAWS = 16;

/** Turn ceiling for hero draws — caps per-hand turns so a draw stays readable at
 *  hero size. 1.5 keeps Level 3 (the 1.5-turn ratios) in play; higher ratios read
 *  as noise. */
const MAX_TURNS = 1.5;
const ALLOWED_TURNS = TURN_VALUES.filter((t) => t <= MAX_TURNS);

/** A matrix realization is a 4-beat rotated flower that closes back to its start
 *  pose; tiling it this many times gives an 8-beat play that reads as a full
 *  flower cycle without flashing by. */
const REPEAT = 2;

/** Derived TnD mode → element family id (pure; the tainted copies in
 *  deck-composer/browse-filter can't be imported on a firebase-free page). */
const TND_MODE_TO_FAMILY: Readonly<Record<TnDMode, string>> = {
  [TnDMode.SPLIT_SAME]: "split-same",
  [TnDMode.TOG_SAME]: "tog-same",
  [TnDMode.QUARTER_SAME]: "quarter-same",
  [TnDMode.SPLIT_OPP]: "split-opp",
  [TnDMode.TOG_OPP]: "tog-opp",
  [TnDMode.QUARTER_OPP]: "quarter-opp",
};

interface Cell {
  left: Flower;
  right: Flower;
  grid: "diamond" | "box";
}

interface PoolData {
  idx: Map<string, SequenceData>;
  edges: CsvEdge[];
  cells: Cell[];
}

let poolPromise: Promise<PoolData> | null = null;

async function loadPool(): Promise<PoolData> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const [wordsRaw, edges] = await Promise.all([
        fetch(BASE_WORDS_URL).then((r) => {
          if (!r.ok) throw new Error(`hero base words ${r.status}`);
          return r.json() as Promise<Record<string, unknown>[]>;
        }),
        loadDiamondEdges(),
      ]);
      const idx = buildBaseIndex(wordsRaw.map((w) => hydrateSequence(w)));

      const axis = buildFlowerAxis();
      const diamond = applyFilter(
        axis,
        { style: "all", turns: new Set(ALLOWED_TURNS), ori: "all", grid: "diamond" },
        true,
      );
      const box = applyFilter(
        axis,
        { style: "all", turns: new Set(ALLOWED_TURNS), ori: "all", grid: "box" },
        true,
      );
      const cells: Cell[] = [];
      for (const left of diamond) for (const right of diamond) cells.push({ left, right, grid: "diamond" });
      for (const left of box) for (const right of box) cells.push({ left, right, grid: "box" });

      return { idx, edges, cells };
    })().catch((e) => {
      // Reset so a transient failure (e.g. offline first paint) can retry on the
      // next draw instead of poisoning the promise for the whole session.
      poolPromise = null;
      throw e;
    });
  }
  return poolPromise;
}

function fmtTurn(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function oriToOrientation(o: "in" | "out"): Orientation {
  return o === "in" ? Orientation.IN : Orientation.OUT;
}

/** Key identifying a start pose by its two hands' start locations (what rotation
 *  actually moves). Two poses with the same key are the same grid position. */
function startLocKey(sp: StartPlacementData | undefined | null): string | null {
  const b = sp?.motions?.left?.startLocation;
  const r = sp?.motions?.right?.startLocation;
  return b && r ? `${b}|${r}` : null;
}

/**
 * Rotate a realization so its start pose matches `targetKey`, using only 90°
 * steps (even 45° counts) so the cell's grid identity (diamond/box) is preserved
 * — an odd 45° step would toggle it. Returns null when no quarter-rotation of
 * this realization lands on the target (e.g. wrong position family).
 */
function rotateToStartKey(seq: SequenceData, targetKey: string): SequenceData | null {
  for (const steps of [0, 2, 4, 6]) {
    const rotated = steps === 0 ? seq : rotateSequenceGeometry(seq, steps);
    if (startLocKey(rotated.startPlacement) === targetKey) return rotated;
  }
  return null;
}

/**
 * Tile a closed loop `times` times into one longer sequence. A realization
 * closes back to its start pose (turnLoopClosed), so copy k+1's first step
 * begins exactly where copy k's last step ended — the tiled play chains
 * seamlessly. Step numbers renumber and ids get a per-copy suffix so nothing
 * downstream keys two steps to the same id.
 */
function tileClosedLoop(seq: SequenceData, times: number): SequenceData {
  const steps: (typeof seq.steps)[number][] = [];
  for (let k = 0; k < times; k++) {
    for (const s of seq.steps) {
      steps.push({ ...s, id: `${s.id}-r${k}`, stepNumber: steps.length + 1 });
    }
  }
  return {
    ...seq,
    steps,
    sequenceLength: steps.length,
    word: (seq.word ?? "").repeat(times),
  };
}

/** Re-derive the TnD element from the final played geometry (first visible step). */
function elementOf(seq: SequenceData): TnDElement | null {
  const step = seq.steps.find((s) => !s.isBlank) ?? seq.steps[0];
  if (!step) return null;
  const { tndMode } = deriveTnDFromPictograph(step as never);
  if (!tndMode) return null;
  const family = TND_MODE_TO_FAMILY[tndMode];
  return family ? (TND_BY_FAMILY[family] ?? null) : null;
}

export interface MatrixDraw {
  sequence: SequenceData;
  element: TnDElement;
  /**
   * Which grid the realization was built on. The caller chains the NEXT draw to
   * this one's start position, and the generated draw path only ever runs in
   * diamond — handing it a box start position asks for a path that does not
   * exist. See hero-act.svelte.ts.
   */
  grid: "diamond" | "box";
}

/**
 * Draw one shape-matrix realization. Picks a random cell + mode, constructs the
 * realization, and re-derives its element. When `chainStartPlacement` is given,
 * rotates the result (90° steps) so it starts where the previous sequence ended;
 * a draw that can't reach that position is skipped, and if none can, returns null
 * so the caller falls back to a generated draw rather than teleporting.
 */
export async function drawMatrixRealization(opts?: {
  chainStartPlacement?: StartPlacementData | null;
  random?: () => number;
}): Promise<MatrixDraw | null> {
  if (typeof window === "undefined") return null; // client-only (fetch)

  let pool: PoolData;
  try {
    pool = await loadPool();
  } catch {
    return null; // couldn't load base words/edges — caller uses a generated draw
  }
  const { idx, edges, cells } = pool;
  if (cells.length === 0) return null;
  const random = opts?.random ?? Math.random;
  const targetKey = opts?.chainStartPlacement
    ? startLocKey(opts.chainStartPlacement)
    : null;

  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const cell = cells[Math.floor(random() * cells.length)];
    const mode = MODE_ORDER[Math.floor(random() * MODE_ORDER.length)];
    if (!cell || !mode) continue;
    // The pool filter caps turns at MAX_TURNS, which already excludes the "fl"
    // float flowers; this narrows Flower to its rotating variant so the turn
    // and orientation formatters below see the types they accept.
    if (cell.left.style === "float" || cell.right.style === "float") continue;

    const base = resolveBase(idx, mode, cell.left.style, cell.right.style);
    if (!base) continue;

    const descriptor: CardVariation = {
      turnPattern: `${fmtTurn(cell.left.turns)}|${fmtTurn(cell.right.turns)}`,
      gridMode: cell.grid,
      startOriPair: {
        left: oriToOrientation(cell.left.ori),
        right: oriToOrientation(cell.right.ori),
      },
    };

    let sequence: SequenceData;
    let turnLoopClosed: boolean;
    try {
      ({ sequence, turnLoopClosed } = applyVariationDescriptor(base, descriptor, edges));
    } catch {
      continue;
    }
    if (!turnLoopClosed) continue;

    if (targetKey) {
      const rotated = rotateToStartKey(sequence, targetKey);
      if (!rotated) continue; // this cell can't reach the chain target — try another
      sequence = rotated;
    }

    const element = elementOf(sequence);
    if (!element) continue;

    // Repeat the 4-beat flower so it holds the stage like a 16-count draw, then
    // plain-ify (strip any reactive proxies) before handing to the player.
    const tiled = tileClosedLoop(sequence, REPEAT);
    return {
      sequence: JSON.parse(JSON.stringify(tiled)) as SequenceData,
      element,
      grid: cell.grid,
    };
  }

  return null;
}
