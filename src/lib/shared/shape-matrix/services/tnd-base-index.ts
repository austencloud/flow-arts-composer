import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { handSwapSequence } from "$lib/shared/create/services/sequence-transforms";
import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { normalizeLegacySequence } from "@tka/tka-types";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

/**
 * Pure base-word index for shape-matrix realizations (firebase-free).
 *
 * Resolves a cell's VTG-mode realization to its canonical base WORD. Split out
 * of `build-realization-sequence.ts` so the firebase-free landing hero pool can
 * build the index from statically-baked base words, while the app path keeps
 * loading them from Firestore via `loadBaseIndex` (which re-exports these).
 *
 * The l1-tnd-motions base catalog stores 22 four-beat WORDS, not single letters:
 * same-direction words are 1-letter (AAAA), opposite-direction words are 2-letter
 * (JDJD = split-opp, DJDJ = tog-opp). Mapping each word to its VTG mode (from the
 * seeder's familyId, scripts/seed-tnd-deck.ts) lets a realization resolve by
 * (mode, style pair) instead of by letter — a letter lookup silently dropped
 * every opposite-direction mode because "D" never matched the "DJDJ" key.
 */
const WORD_MODE: Record<string, VtgMode> = {
  AAAA: "SS",
  BBBB: "SS",
  CCCC: "SS",
  GGGG: "TS",
  HHHH: "TS",
  IIII: "TS",
  SSSS: "QS",
  TTTT: "QS",
  UUUU: "QS",
  VVVV: "QS",
  JDJD: "SO",
  KEKE: "SO",
  LFLF: "SO",
  DJDJ: "TO",
  EKEK: "TO",
  FLFL: "TO",
  MPMP: "QO",
  NQNQ: "QO",
  OROR: "QO",
  PMPM: "QO",
  QNQN: "QO",
  RORO: "QO",
};

/** Per-hand style pair of a base word's first step. null if unreadable. */
function stylePairOf(
  seq: SequenceData
): { left: string; right: string } | null {
  const m = seq.steps?.[0]?.motions;
  const b = m?.left?.motionType;
  const r = m?.right?.motionType;
  return b && r ? { left: b, right: r } : null;
}

/**
 * Index base words by `${mode}|${leftStyle}|${rightStyle}`. Pure over the loaded
 * sequences so it is unit-testable without the catalog. Modes/styles are read
 * from the real sequences — only the word→mode map is static (and canonical).
 *
 * Most modes seed only ONE of the two mixed-style orders (e.g. tog-opp's FLFL
 * is left=anti/right=pro; no left=pro/right=anti word exists). A raw hands-swapped
 * lookup used to cover the missing order, but it handed each hand the OTHER
 * hand's style: a left prospin cell played the antispin word on the left, so the
 * left prop visibly traced the wrong flower (the "isolation plays antispin"
 * shape-matrix bug, 2026-07-19). Instead, the second pass fills each missing
 * order with the seeded twin hand-swapped, so every hand keeps its own style.
 * Seeded words win: swaps only fill keys no real word claimed.
 */
export function buildBaseIndex(
  seqs: SequenceData[]
): Map<string, SequenceData> {
  const keyed: {
    mode: VtgMode;
    pair: { left: string; right: string };
    seq: SequenceData;
  }[] = [];
  for (const raw of seqs) {
    const s = normalizeLegacySequence(raw);
    const mode = WORD_MODE[stripWordNotation(s.word ?? "").toUpperCase()];
    if (!mode) continue;
    const pair = stylePairOf(s);
    if (!pair) continue;
    keyed.push({ mode, pair, seq: s });
  }
  const idx = new Map<string, SequenceData>();
  for (const k of keyed) {
    const key = `${k.mode}|${k.pair.left}|${k.pair.right}`;
    if (!idx.has(key)) idx.set(key, k.seq);
  }
  for (const k of keyed) {
    if (k.pair.left === k.pair.right) continue; // symmetric pair swaps onto its own key
    const key = `${k.mode}|${k.pair.right}|${k.pair.left}`;
    if (!idx.has(key)) idx.set(key, handSwapSequence(k.seq));
  }
  return idx;
}

/**
 * Resolve the base word for a (mode, leftStyle, rightStyle). Every realizable
 * style order is present in the index directly (mixed orders that lack a seeded
 * word are filled with hand-swapped twins at build time), so there is no
 * fallback here — a miss means the mode genuinely has no word for this pair.
 */
export function resolveBase(
  idx: Map<string, SequenceData>,
  mode: VtgMode,
  leftStyle: string,
  rightStyle: string
): SequenceData | null {
  return idx.get(`${mode}|${leftStyle}|${rightStyle}`) ?? null;
}
