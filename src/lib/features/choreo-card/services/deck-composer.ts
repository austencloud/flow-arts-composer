import type { Catalog } from "../domain/models/Catalog";
import type { CardFooter, DeckReleaseCard, StepCountWeight } from "../domain/models/DeckRelease";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { applyBoxMode, type StartOriMode } from "./deck-variation";
import { TND_BY_FAMILY } from "../domain/tnd-element";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { tokenizeWord } from "$lib/shared/pictograph/tka-glyph/utils/word-tokenizer";
import { getLetterType } from "$lib/shared/foundation/domain/models/letter";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
import { TURN_VALUES } from "../domain/turn-pattern-parser";

type GridModeKey = "diamond" | "box";

/** Canonical zero-turn TnD base catalog; all turn-grid cells derive from it. */
export const TND_BASE_CATALOG_ID = "l1-tnd-motions";

export interface PoolEntry {
  sequenceId: string;
  sourceCatalogId: string;
  stepCount: number;
  word: string;
  /** Start-placement id parsed from the enumerated seqId prefix (`${startPos}_${seedWord}`). */
  startPlacement: string;
}

export interface CatalogPoolFilter {
  sliceTypes: Set<'halved' | 'quartered'>;
  /** Optional loop-type narrowing. Absent ⇒ all loop types in the catalog set. */
  loopTypes?: Set<string>;
  /** Optional level narrowing. Absent ⇒ all levels. */
  levels?: Set<number>;
  /** Optional start-placement id subset (applied per pool entry). Absent/empty ⇒ any. */
  startPlacementIds?: Set<string>;
}

function isZeroTurnCatalog(catalog: Catalog): boolean {
  if (!catalog.turnPattern) return false;
  const m = catalog.turnPattern.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) === 0 : false;
}

function containsType6(word: string): boolean {
  const tokens = tokenizeWord(word);
  return tokens.some((token) => {
    try {
      return getLetterType(token as Letter) === LetterType.TYPE6;
    } catch {
      return false;
    }
  });
}

export function buildSequencePool(catalogs: Catalog[], filter?: CatalogPoolFilter): Map<number, PoolEntry[]> {
  const pool = new Map<number, PoolEntry[]>();

  const posFilter = filter?.startPlacementIds && filter.startPlacementIds.size > 0 ? filter.startPlacementIds : null;

  for (const catalog of catalogs) {
    if (catalog.collection !== "LOOPs") continue;
    if (filter?.sliceTypes && !filter.sliceTypes.has(catalog.sliceType)) continue;
    if (filter?.loopTypes && !filter.loopTypes.has(catalog.loopType)) continue;
    if (filter?.levels && !filter.levels.has(catalog.level)) continue;
    const stepCount = catalog.stepCount;
    const zeroTurn = isZeroTurnCatalog(catalog);
    if (!pool.has(stepCount)) pool.set(stepCount, []);
    const bucket = pool.get(stepCount)!;

    for (const family of catalog.families) {
      for (const seqId of family.sequenceIds) {
        if (zeroTurn && containsType6(seqId)) continue;
        const startPlacement = seqId.split("_")[0] ?? "";
        if (posFilter && !posFilter.has(startPlacement)) continue;
        bucket.push({
          sequenceId: seqId,
          sourceCatalogId: catalog.id,
          stepCount,
          word: seqId,
          startPlacement,
        });
      }
    }
  }

  return pool;
}

export interface CatalogSourceSummary {
  sliceType: 'halved' | 'quartered';
  catalogCount: number;
  sequenceCount: number;
}

export function getCatalogSourceSummaries(catalogs: Catalog[]): CatalogSourceSummary[] {
  const map = new Map<string, { catalogCount: number; sequenceCount: number }>();
  for (const catalog of catalogs) {
    if (catalog.collection !== "LOOPs") continue;
    const entry = map.get(catalog.sliceType) ?? { catalogCount: 0, sequenceCount: 0 };
    entry.catalogCount++;
    entry.sequenceCount += catalog.totalSequences;
    map.set(catalog.sliceType, entry);
  }
  return Array.from(map.entries()).map(([sliceType, stats]) => ({
    sliceType: sliceType as 'halved' | 'quartered',
    ...stats,
  }));
}

export function getAvailableWeights(pool: Map<number, PoolEntry[]>): StepCountWeight[] {
  const weights: StepCountWeight[] = [];
  const defaultWeights: Record<number, number> = { 16: 40, 8: 25, 12: 20, 4: 15 };

  for (const [stepCount, entries] of pool) {
    if (entries.length === 0) continue;
    weights.push({
      stepCount,
      weight: defaultWeights[stepCount] ?? 10,
      available: entries.length,
    });
  }

  weights.sort((a, b) => b.stepCount - a.stepCount);
  return weights;
}

/**
 * LOOP deck-size math. Orientation + grid registers each duplicate every base
 * card (a card emitted once per selected register × grid mode), so a target deck
 * size is hit by composing `base` cards and letting the enumeration fan them back
 * up. `effective` is the true output count — it equals `target` when `target`
 * divides evenly by the axis multiplier, otherwise the nearest reachable size.
 * Single source of truth for both the draw label and the compose loop.
 */
export function loopDrawCounts(
  target: number,
  oriCount: number,
  gridCount: number,
): { base: number; effective: number; multiplier: number } {
  const multiplier = Math.max(1, oriCount * gridCount);
  const base = Math.max(1, Math.round(target / multiplier));
  return { base, effective: base * multiplier, multiplier };
}

export function composeDeck(
  pool: Map<number, PoolEntry[]>,
  weights: StepCountWeight[],
  totalCards: number,
  footer: CardFooter = { center: "The Kinetic Alphabet" },
  rng: () => number = Math.random,
): DeckReleaseCard[] {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight === 0) return [];

  const targets = new Map<number, number>();
  let remaining = totalCards;
  const saturated = new Set<number>();

  for (const w of weights) {
    const ideal = Math.round((totalCards * w.weight) / totalWeight);
    const available = pool.get(w.stepCount)?.length ?? 0;
    const clamped = Math.min(ideal, available);
    targets.set(w.stepCount, clamped);
    remaining -= clamped;
    if (clamped === available) saturated.add(w.stepCount);
  }

  while (remaining > 0) {
    const unsaturated = weights.filter(
      (w) => !saturated.has(w.stepCount) && (targets.get(w.stepCount) ?? 0) < (pool.get(w.stepCount)?.length ?? 0)
    );
    if (unsaturated.length === 0) break;

    const subWeight = unsaturated.reduce((s, w) => s + w.weight, 0);
    let distributed = 0;
    for (const w of unsaturated) {
      const current = targets.get(w.stepCount) ?? 0;
      const available = pool.get(w.stepCount)?.length ?? 0;
      const extra = Math.min(
        Math.round((remaining * w.weight) / subWeight),
        available - current,
      );
      targets.set(w.stepCount, current + extra);
      distributed += extra;
      if (current + extra === available) saturated.add(w.stepCount);
    }
    remaining -= distributed;
    if (distributed === 0) break;
  }

  const selected: PoolEntry[] = [];

  for (const [stepCount, count] of targets) {
    const bucket = pool.get(stepCount);
    if (!bucket || count === 0) continue;
    selected.push(...fisherYatesSample(bucket, count, rng));
  }

  shuffle(selected, rng);

  return selected.map((entry, i) => ({
    sequenceId: entry.sequenceId,
    sourceCatalogId: entry.sourceCatalogId,
    stepCount: entry.stepCount,
    word: entry.word,
    position: i + 1,
    footer,
  }));
}

export function swapCard(
  cards: DeckReleaseCard[],
  index: number,
  pool: Map<number, PoolEntry[]>,
  rng: () => number = Math.random,
): DeckReleaseCard[] {
  const card = cards[index];
  if (!card) return cards;

  const bucket = pool.get(card.stepCount);
  if (!bucket) return cards;

  const usedIds = new Set(cards.map((c) => c.sequenceId));
  const available = bucket.filter((e) => !usedIds.has(e.sequenceId));
  if (available.length === 0) return cards;

  const replacement = available[Math.floor(rng() * available.length)]!;
  const updated = [...cards];
  updated[index] = {
    sequenceId: replacement.sequenceId,
    sourceCatalogId: replacement.sourceCatalogId,
    stepCount: replacement.stepCount,
    word: replacement.word,
    position: card.position,
    footer: card.footer,
  };
  return updated;
}

function fisherYatesSample<T>(arr: T[], count: number, rng: () => number = Math.random): T[] {
  const copy = [...arr];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

// TnD deck helpers

export interface TnDSequenceEntry {
  sequenceId: string;
  sourceCatalogId: string;
  turnRatio: string;
  turnPattern: string;
  /** The grid mode this entry's element was computed for. */
  gridMode: GridModeKey;
}

export interface TnDFamilyOption {
  familyId: string;
  label: string;
  sequenceCount: number;
  entries: readonly TnDSequenceEntry[];
}

/**
 * One base seed's computed TnD family per grid mode. The element is NOT
 * rotation-invariant: a diamond quarter-opp seed (MP) becomes box tog-opp, so the
 * family is recomputed from the box-transformed geometry via the deriver — never
 * carried over from the diamond catalog grouping. `null` = the seed is not a
 * rotating-shift Type-1 in that grid (no TnD).
 */
export interface TnDSeedClass {
  seedId: string;
  sourceCatalogId: string;
  diamond: string | null;
  box: string | null;
}

const TND_MODE_TO_FAMILY: Readonly<Record<TnDMode, string>> = {
  [TnDMode.SPLIT_SAME]: "split-same",
  [TnDMode.SPLIT_OPP]: "split-opp",
  [TnDMode.TOG_SAME]: "tog-same",
  [TnDMode.TOG_OPP]: "tog-opp",
  [TnDMode.QUARTER_SAME]: "quarter-same",
  [TnDMode.QUARTER_OPP]: "quarter-opp",
};

/** Canonical family display order (mirrors TND_ELEMENTS). */
const FAMILY_ORDER = [
  "split-same",
  "tog-same",
  "quarter-same",
  "split-opp",
  "tog-opp",
  "quarter-opp",
];

/**
 * Classify a base seed in a single grid by deriving the element from the first
 * rotating-shift step's geometry (box-transformed first when grid === "box").
 */
export function classifyTnDSeedForGrid(
  seq: SequenceData,
  grid: GridModeKey
): string | null {
  const transformed = grid === "box" ? applyBoxMode(seq, "box") : seq;
  for (const step of transformed.steps) {
    if (step.isBlank) continue;
    const { tndMode } = deriveTnDFromPictograph(step);
    if (tndMode) return TND_MODE_TO_FAMILY[tndMode];
  }
  return null;
}

/** Classify every base seed for both grids once (selection-independent). */
export function buildTnDSeedClasses(seqs: SequenceData[]): TnDSeedClass[] {
  return seqs.map((seq) => ({
    seedId: seq.id,
    sourceCatalogId: TND_BASE_CATALOG_ID,
    diamond: classifyTnDSeedForGrid(seq, "diamond"),
    box: classifyTnDSeedForGrid(seq, "box"),
  }));
}

/**
 * Extract the LOOP word from a base-seed id (`tnd-<family>-<word>` → `<word>`).
 * The word is always the final hyphen segment even though the family id itself
 * contains a hyphen (e.g. `quarter-opp` → id `tnd-quarter-opp-mpmp`).
 */
function seedWordOf(sequenceId: string): string {
  return sequenceId.split("-").pop() ?? sequenceId;
}

/**
 * Drop redundant mirror-half seeds within one (grid, family) bucket.
 *
 * Opposite-direction compounds are seeded as mirror pairs (MPMP/PMPM, DJDJ/JDJD,
 * …). In a given grid both halves can collapse onto the SAME family: in diamond
 * MPMP and PMPM are both quarter-opp; in box DJDJ and JDJD are both quarter-opp.
 * They are the same hand-path shape mirrored, so only one canonical seed belongs
 * per grid — the other half exists to populate whichever family it lands in under
 * the OTHER grid (e.g. PMPM is the box split-opp seed; JDJD is the diamond
 * split-opp seed), and that role is preserved because dedup is keyed by gridMode.
 *
 * A mirror pair shares a letter multiset; the canonical keeper is the seed whose
 * word sorts first — the non-reversed original (MP over PM, DJ over JD). This
 * matches the standard diamond-gamma start (gamma11 MP/NQ/OR, not gamma9 PM/QN/RO)
 * and the box keep-DJ/drop-JD rule. Same-direction families (single-letter words)
 * never collide and pass through untouched.
 */
function dedupeMirrorHalfSeeds(entries: TnDSequenceEntry[]): TnDSequenceEntry[] {
  const keep = new Map<string, TnDSequenceEntry>();
  for (const e of entries) {
    const word = seedWordOf(e.sequenceId);
    const letterKey = [...new Set(word.split(""))].sort().join("");
    const mapKey = `${e.gridMode}::${letterKey}`;
    const cur = keep.get(mapKey);
    if (!cur || word < seedWordOf(cur.sequenceId)) keep.set(mapKey, e);
  }
  return [...keep.values()];
}

/**
 * Group the seed classes into family options for the currently-selected grid
 * modes. A seed contributes one (seed × grid) entry to whichever family it lands
 * in per grid — so with both grids selected MP appears under Quarter-Opp (diamond)
 * and Tog-Opp (box). Family + count are always computed, never the static catalog.
 * Mirror-half duplicates that collapse onto the same family in a grid are pruned
 * (see `dedupeMirrorHalfSeeds`) so each grid keeps only its canonical seed.
 */
export function getTnDFamilyOptions(
  seedClasses: TnDSeedClass[],
  grids: GridModeKey[] = ["diamond"]
): TnDFamilyOption[] {
  const activeGrids = grids.length > 0 ? grids : (["diamond"] as GridModeKey[]);
  const byFamily = new Map<string, TnDSequenceEntry[]>();

  for (const sc of seedClasses) {
    for (const grid of activeGrids) {
      const familyId = grid === "box" ? sc.box : sc.diamond;
      if (!familyId) continue;
      if (!byFamily.has(familyId)) byFamily.set(familyId, []);
      byFamily.get(familyId)!.push({
        sequenceId: sc.seedId,
        sourceCatalogId: sc.sourceCatalogId,
        turnRatio: "1:1",
        turnPattern: "0|0",
        gridMode: grid,
      });
    }
  }

  return [...byFamily.entries()]
    .map(([familyId, entries]) => {
      const deduped = dedupeMirrorHalfSeeds(entries);
      return {
        familyId,
        label: TND_BY_FAMILY[familyId]?.name ?? familyId,
        sequenceCount: deduped.length,
        entries: deduped,
      };
    })
    .sort(
      (a, b) => FAMILY_ORDER.indexOf(a.familyId) - FAMILY_ORDER.indexOf(b.familyId)
    );
}

export function tndFooter(familyId: string, _turnRatio: string): CardFooter {
  const theme = TND_BY_FAMILY[familyId];
  return theme
    ? { center: theme.name, iconPath: theme.iconPath }
    : { center: familyId };
}

export interface TnDTurnPatternOption {
  turnPattern: string;
  label: string;
  sequenceCount: number;
}

function formatTurn(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * The full 7×7 turn grid. `selectedFamilyBaseSeqs` is the count of base sequences
 * across currently-selected families; each cell contributes that many cards
 * (cartesian), so the per-cell count reflects the live family selection.
 */
export function getTnDTurnPatternOptions(selectedFamilyBaseSeqs: number): TnDTurnPatternOption[] {
  const opts: TnDTurnPatternOption[] = [];
  for (const left of TURN_VALUES) {
    for (const right of TURN_VALUES) {
      const tp = `${formatTurn(left)}|${formatTurn(right)}`;
      opts.push({ turnPattern: tp, label: tp, sequenceCount: selectedFamilyBaseSeqs });
    }
  }
  return opts;
}

export function buildTnDCards(
  tndFamilies: TnDFamilyOption[],
  selectedFamilies: Set<string>,
  selectedTurnPatterns?: Set<string>,
  startOriModes: StartOriMode[] = ["radial"],
): DeckReleaseCard[] {
  const patterns = selectedTurnPatterns ? [...selectedTurnPatterns] : [];
  if (patterns.length === 0) return [];
  // Full enumeration: every (seed × grid) entry × each pattern × each register.
  // The grid mode is baked into each family entry by getTnDFamilyOptions, so the
  // card's family/footer match the grid-correct computed element.
  const registers = startOriModes.length > 0 ? startOriModes : (["radial"] as StartOriMode[]);
  const cards: DeckReleaseCard[] = [];
  for (const fam of tndFamilies) {
    if (!selectedFamilies.has(fam.familyId)) continue;
    for (const pattern of patterns) {
      for (const entry of fam.entries) {
        for (const mode of registers) {
          cards.push({
            sequenceId: entry.sequenceId,
            sourceCatalogId: entry.sourceCatalogId,
            stepCount: 4,
            word: entry.sequenceId,
            position: 0,
            variation: {
              turnPattern: pattern,
              turnLabel: pattern,
              ...(mode !== "radial" ? { startOriMode: mode } : {}),
              ...(entry.gridMode !== "diamond" ? { gridMode: entry.gridMode } : {}),
            },
            footer: tndFooter(fam.familyId, entry.turnRatio),
          });
        }
      }
    }
  }
  return cards;
}

export function prunePool(
  pool: Map<number, PoolEntry[]>,
  excludeIds: Set<string>,
  exemptStepCounts?: Set<number>,
): void {
  for (const [stepCount, entries] of pool) {
    if (exemptStepCounts?.has(stepCount)) continue;
    pool.set(stepCount, entries.filter(e => !excludeIds.has(e.sequenceId)));
  }
}
