/**
 * Canonical T&D pool — the defined Timing & Direction alphabet as FIRST-CLASS
 * gallery citizens. Every base seed (word "AAAA" etc.) and every one of its
 * 7x7 blue|red turn combinations becomes a normal SequenceData in the browse
 * pool: searchable, filterable, sortable, and word-collapsed by the grid into
 * one card whose variation picker holds the 49 turn combos — exactly like any
 * community word with saved variations. No special container, no special modal.
 *
 * Born 2022-03-27 (when the system came to Austen). Level comes from the
 * canonical difficulty calculator reading each combo's real steps — NOT a
 * blanket rule. A hardcoded "turned = level 2" shipped level-3 combos (half
 * turns end non-radial) wearing stored level 2, so the drill's Level 2 fan
 * card was fronted by a sequence whose printed badge said 3.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { updateSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { TND_ELEMENTS } from "#lib/features/choreo-card/domain/tnd-element.js";
import { resolveTnDFamilyCards } from "#lib/features/lab/vtg-lab/services/resolve-tnd-family-cards.js";
import {
  buildTnDSeedClasses,
  getTnDFamilyOptions,
} from "#lib/features/choreo-card/services/deck-composer.js";
import { loadTndBaseWords } from "#lib/features/choreo-card/services/tnd-base-word-snapshot.js";
import { calculateDifficultyLevel } from "#lib/shared/browse/services/sequence-difficulty-calculator.js";
import { processReversals } from "#lib/shared/create/services/reversal-detector.js";
import { transformSequence } from "#lib/features/choreo-card/services/reversal-seed-service.js";
import { loadDiamondEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { getReversalPattern } from "#lib/features/choreo-card/domain/reversal-patterns.js";
import type { ResolvedReversalPattern } from "#lib/features/choreo-card/domain/reversal-transform.js";

/** Reserved author for the defined T&D alphabet, so it is filterable and
 *  isolatable from user-submitted community sequences. */
export const CANONICAL_TND_AUTHOR = "T&D Alphabet";

/** The day the Timing & Direction system was conceived. */
const TND_BIRTHDAY = new Date("2022-03-27T00:00:00Z");

/** Filename-safe turn token ("1.5|0" → "1p5-0"). Lexicographic order of these
 * tokens matches ascending turn order ("0" < "0p5" < "1" < "1p5" < ... < "3"),
 * so the variation picker's id-tiebreak sort walks the grid low-to-high with
 * 0|0 (the representative card) first. */
function safeTurn(pattern: string): string {
  return pattern.replace(/\|/g, "-").replace(/\./g, "p");
}

let poolPromise: Promise<readonly SequenceData[]> | null = null;
let basePoolPromise: Promise<readonly SequenceData[]> | null = null;

/**
 * Resolve the full canonical pool (all six families × all 49 turn patterns).
 * Cached for the session — the defined alphabet is immutable. Rejection clears
 * the cache so a transient failure (offline catalog fetch) retries next load.
 */
export function loadCanonicalTnDSequences(): Promise<readonly SequenceData[]> {
  if (!poolPromise) {
    poolPromise = resolvePool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/** Resolve only the 19 zero-turn representatives used by Learning Letters. */
export function loadCanonicalTnDBaseSequences(): Promise<
  readonly SequenceData[]
> {
  if (!basePoolPromise) {
    basePoolPromise = resolveBasePool().catch((err) => {
      basePoolPromise = null;
      throw err;
    });
  }
  return basePoolPromise;
}

async function resolveBasePool(): Promise<readonly SequenceData[]> {
  const snapshots = await loadTndBaseWords();
  const byId = new Map(snapshots.map((sequence) => [sequence.id, sequence]));
  const families = getTnDFamilyOptions(buildTnDSeedClasses(snapshots), [
    "diamond",
  ]);

  return families.flatMap((family) =>
    family.entries.flatMap((entry) => {
      const sequence = byId.get(entry.sequenceId);
      if (!sequence) return [];
      return [
        updateSequenceData(sequence, {
          author: CANONICAL_TND_AUTHOR,
          dateAdded: TND_BIRTHDAY,
          birthday: TND_BIRTHDAY,
          metadata: { ...sequence.metadata, familyId: family.familyId },
        }),
      ];
    })
  );
}

async function resolvePool(): Promise<readonly SequenceData[]> {
  const out: SequenceData[] = [];
  // Sequential per family: each call shares the same cached base catalog, and
  // the resolution work is CPU-bound — parallelism buys nothing but jank.
  for (const element of TND_ELEMENTS) {
    const matrices = await resolveTnDFamilyCards(element.familyId);
    for (const matrix of matrices) {
      for (const [pattern, seq] of matrix.byTurn) {
        const tagged = updateSequenceData(seq, {
          // byTurn variants share the seed's id — tag per combo so engine
          // dedupe and the (word, id)-keyed thumbnail cache see 49 sequences.
          id: `${matrix.seedId}__t_${safeTurn(pattern)}`,
          author: CANONICAL_TND_AUTHOR,
          dateAdded: TND_BIRTHDAY,
          birthday: TND_BIRTHDAY,
          // Same calculator that prints the card's difficulty badge — stored
          // level and printed badge can never disagree. Whole turns resolve
          // radial (level 2); half turns end non-radial (level 3).
          level: calculateDifficultyLevel([...(seq.steps ?? [])]),
          // The resolver is the family authority. Stamping its result keeps
          // downstream deck views independent of older catalog metadata.
          metadata: { ...seq.metadata, familyId: element.familyId },
        });
        // Re-derive reversal dots from the turn-applied motions. The canonical
        // display policy re-derives reversal flags on every hydrate, but these
        // pool sequences bypass the hydrate pipeline and the viewer trusts baked
        // flags (getStepData returns steps verbatim). Without this a continuous
        // card (all pro cw, zero reversals) renders spurious dots from stale
        // seed flags.
        out.push(processReversals(tagged));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Book reversal variants (collection-scoped — NOT the main gallery)
// ---------------------------------------------------------------------------

/** The "Classic Book Variations" deck (manifest #009) is the T&D alphabet at
 * turn 1|1 with the book reversal pattern (PPPP — both props reverse every
 * step) applied. */
const BOOK_TURN = "1|1";

const BOOK_PATTERN: ResolvedReversalPattern = (() => {
  const def = getReversalPattern("book");
  if (!def)
    throw new Error('reversal pattern "book" missing from REVERSAL_PATTERNS');
  // Both hands reverse an even number of times over PPPP → clean loop.
  return {
    id: def.id,
    label: def.label,
    sequence: def.sequence,
    isNamed: true,
    isCleanLoop: true,
  };
})();

let bookPromise: Promise<readonly SequenceData[]> | null = null;

/**
 * The 19 book-reversal variants of the base T&D seeds (turn 1|1). Generated
 * client-side from the same catalog as {@link loadCanonicalTnDSequences} by
 * applying the book reversal transform. Author/family-tagged and stamped
 * `reversalPattern: "book"`, so a rule of AUTHOR "T&D Alphabet" +
 * REVERSAL_PATTERN "book" selects exactly these. Injected ONLY into the Book
 * collection's engine (never the main gallery), so it adds zero gallery flood.
 */
export function loadCanonicalBookVariations(): Promise<
  readonly SequenceData[]
> {
  if (!bookPromise) {
    bookPromise = resolveBookPool().catch((err) => {
      bookPromise = null;
      throw err;
    });
  }
  return bookPromise;
}

async function resolveBookPool(): Promise<readonly SequenceData[]> {
  const edges = await loadDiamondEdges();
  const out: SequenceData[] = [];
  for (const element of TND_ELEMENTS) {
    const matrices = await resolveTnDFamilyCards(element.familyId);
    for (const matrix of matrices) {
      const base = matrix.byTurn.get(BOOK_TURN);
      if (!base) continue;
      // transformSequence flips pro↔anti + cw↔ccw on reversed hands, re-derives
      // letters, recomputes the orientation chain, and stamps reversalPattern.
      const book = transformSequence(base, BOOK_PATTERN, edges);
      const tagged = updateSequenceData(book, {
        id: `${matrix.seedId}__t_${safeTurn(BOOK_TURN)}__book`,
        author: CANONICAL_TND_AUTHOR,
        dateAdded: TND_BIRTHDAY,
        birthday: TND_BIRTHDAY,
        level: calculateDifficultyLevel([...(book.steps ?? [])]),
        reversalPattern: "book",
      });
      // Book = a reversal every step, so dots SHOULD render here (unlike the
      // continuous decks) — processReversals derives them from the flipped spins.
      out.push(processReversals(tagged));
    }
  }
  return out;
}
