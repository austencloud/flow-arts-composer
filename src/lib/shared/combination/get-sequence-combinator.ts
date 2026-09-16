/**
 * The combination engine's public seam.
 *
 * Two questions, two methods, deliberately different in cost and in what they
 * prove:
 *
 *   - `candidateWords` is the Layer 0 preview — pure letter calculus over
 *     placement FAMILIES. Synchronous, milliseconds, and only ever NECESSARY:
 *     a word listed here spells a closed loop in the family graph, which does
 *     not mean concrete card material can realize it (alpha3 and alpha5 are
 *     both "alpha" to this layer, and only one of them may be where the card
 *     actually is). It answers "what could these two cards possibly spell?",
 *     which is what a picker panel wants before anyone commits to a search.
 *   - `findCombinations` is the Layer 1 search — the real answer, over real
 *     steps and real seams, and the only thing that returns a performable
 *     sequence.
 *
 * Mirrors the `shared/comparison` getter convention (a lazily-created
 * singleton, no DI container).
 */

import { rosterConfirmedBases } from "./domain/base-sequence-registry";
import type {
  CombinationSearchReport,
  CombinatorOptions,
} from "./domain/types";
import {
  edgesFromSequence,
  enumerateHybridWords,
  ingredientDisplayNames,
  type EnumerateResult,
  type IngredientEdges,
} from "./services/letter-calculus";
import {
  createRuntimeAmbientProvider,
  snapshotAmbientStats,
  type RuntimeAmbientProvider,
  type RuntimeAmbientStats,
} from "./services/runtime-ambient-provider";
import { findCombinations } from "./services/sequence-combinator";

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

/**
 * Longest word `candidateWords` looks for by default.
 *
 * Five for BREVITY, not because six is out of reach. Measured at this
 * ingredient shape (two cards plus the eleven roster bases, 2026-08-04): the
 * complete length-<=5 set is 3,916 words in ~11ms, and length <=6 is 19,397
 * words in ~70ms — six sweeps completely too, `searchComplete: true`, with the
 * node budget nowhere near spent. The binding constraint at both depths is
 * `maxResults`, never `searchBudget`.
 *
 * So this is a product choice: a preview panel that offers five-letter shapes
 * is a list someone reads, and 19,397 candidates is a list nobody does. Raise
 * `maxLength` to 6 deliberately when a caller genuinely wants the long tail —
 * it stays honest, it just stops being a preview. (An earlier version of this
 * comment claimed the budget made six impossible. It was inherited from a
 * measurement taken at a different ingredient shape and is simply false here.)
 */
export const DEFAULT_MAX_WORD_LENGTH = 5;

/**
 * Result cap for the preview enumeration.
 *
 * NOT a display size — the both-cards filter runs afterwards, so this cap has
 * to clear the whole UNFILTERED sweep or it silently eats answers. The
 * enumerator emits shortest-first and truncates mid-level, and the words that
 * draw on both cards are the rarer ones, so they are exactly what a low cap
 * cuts.
 *
 * Measured at length <=5 (2026-08-04), complete set 3,916 words in ~11ms:
 *
 *   | cap   | GGGG+HHHH both-cards | FALG+GGGG | complete? |
 *   |-------|----------------------|-----------|-----------|
 *   | 200   | 3                    | 20        | no        |
 *   | 2,000 | 129                  | 423       | no        |
 *   | 4,000 | 204                  | 637       | YES       |
 *
 * 2,000 looked adequate because it happened to be complete at length <=4 (814
 * words) — at length 5 it drops ~34-37% of the both-cards words on every pair
 * measured, without the caller being able to tell which ones.
 *
 * RE-MEASURED 2026-08-05, after quarter-same (SS/TT) joined the confirmed
 * roster. Two more confirmed bases grew the same length-<=5 space from 3,916
 * to between 9,001 and 10,000 — roughly 2.5x — and 4,000 began reporting
 * `searchComplete: false`. Bisected:
 *
 *   | cap    | complete? |
 *   |--------|-----------|
 *   | 8,000  | no        |
 *   | 9,000  | no        |
 *   | 10,000 | YES       |
 *
 * The filtered both-cards answers were IDENTICAL at every cap from 4,000 to
 * 200,000 (204 and 637), so the truncation cost no both-cards word here — it
 * cost the honesty of the `searchComplete` flag, which is the part callers
 * reason about.
 *
 * 16,384 restores completeness with headroom. Two caveats, both real:
 *
 *   1. This number is a function of ROSTER SIZE, and the roster is still
 *      incomplete — both Type 3 sequences and the Type 4 are not entered yet
 *      (see base-sequence-registry). Adding them will grow the space again and
 *      this cap will need re-measuring, not re-guessing.
 *   2. The redesign spec deletes this cap entirely: "no caps, no truncation
 *      banner — the box is declared and the search inside it finishes."
 *      Exhaustive search is cheap (2,057,344 walks in 8s, single-threaded), so
 *      the cap was never protecting against a real limit. Treat this value as
 *      a stopgap with an expiry date, not a tuned constant.
 */
const CANDIDATE_WORD_MAX_RESULTS = 16384;

export interface SequenceCombinator {
  /**
   * Every closed alternating walk over the two cards — or a structural proof
   * that none exists. See `CombinationSearchReport`; note that `impossible` is
   * always relative to the liberties and the ambient run cap the search ran
   * under, and the report carries `ambientRunCap` so a caller can say so.
   *
   * **Ambient material is auto-wired.** Unless the caller passes
   * `allowAmbient: false` or supplies its own `ambientProvider`, this reaches
   * for `createRuntimeAmbientProvider` over the live pictograph dataset — the
   * difference between "AAAA and HHHH cannot meet" and Austen's AAAAΨHHΦ.
   *
   * `allowAmbient: false` is the opt-out; passing `ambientProvider: undefined`
   * is NOT one, and re-auto-wires exactly as omitting the key would.
   *
   * When the dataset is not available (SSR before hydration, a unit test that
   * never bootstrapped the CSVs), the options pass through UNTOUCHED rather
   * than carrying a provider that would throw — a failing provider makes the
   * engine mark its pool incomplete and withdraw its impossibility claim, so
   * silently attaching a doomed one would degrade every report on a machine
   * that simply has no data yet. The report says which happened:
   * `ambientUnavailable: true` means the auto-wire was wanted and could not be
   * made, as opposed to never having been attempted.
   */
  findCombinations(
    cardA: SequenceData,
    cardB: SequenceData,
    options?: CombinatorOptions
  ): Promise<CombinationSearchReport>;

  /**
   * Layer 0 preview: the shortest hybrid words the two cards and the ambient
   * roster could spell together, filtered to those drawing on BOTH cards.
   *
   * **The filter runs AFTER enumeration, and it is an over-approximation in
   * default mode.** `WordCandidate.ingredients` is the set of ingredients that
   * COULD have supplied at least one of the word's edges, not a verified cover
   * — two ingredients offering the identical (letter, from, to) edge both
   * appear even when the word contains only one occurrence to go around. So a
   * listed word definitely uses edges both cards offer; it is not proof that
   * both cards are indispensable to it. Layer 1 is what settles that.
   *
   * The flags come back exactly as the enumerator set them, describing the
   * UNFILTERED sweep — `searchComplete` means the length-bounded space was
   * swept, not that the filtered list is complete in some other sense. Nothing
   * is re-sorted here: the enumerator's shortest-first, lexicographic-within-a-
   * length order is already the deterministic one.
   */
  candidateWords(
    cardA: SequenceData,
    cardB: SequenceData,
    maxLength?: number
  ): EnumerateResult;

  /**
   * Counters from the auto-wired ambient provider — how many seams were asked
   * about, how much material the dataset offered, and what was rejected and
   * why. Null when no provider has been created for that grid mode yet (no
   * ambient search has run, or the dataset never answered).
   *
   * A frozen SNAPSHOT, but of CUMULATIVE totals: one provider serves every
   * search for its grid mode for the life of the process, so these are
   * per-process figures, not per-search ones. Subtract two snapshots to scope
   * them to one search.
   *
   * The counter worth watching is `labelMismatches` — the engine drops
   * mismatched material and warns only once per search, so without this it is
   * the kind of failure that costs real bridges quietly.
   */
  ambientStats(gridMode?: GridMode): RuntimeAmbientStats | null;
}

/** Display name for a card ingredient — simplified per `simplified-word-display`. */
function ingredientName(sequence: SequenceData, fallback: string): string {
  const simplified = simplifyRepeatedWord(sequence.word ?? "");
  return simplified.length > 0 ? simplified : fallback;
}

/**
 * Is the pictograph dataset actually answering?
 *
 * Memoized per grid mode, and the memo is dropped on a negative answer — but
 * be clear about what that does and does not buy, because the obvious reading
 * is wrong. **The handler LATCHES a failed load, so a later retry through it
 * cannot succeed:**
 *
 *   - `CsvLoader.loadCSVDataSet` never throws on a failed fetch; it catches and
 *     returns `{ success: false, data: undefined }`
 *     (`foundation/services/data/csv-loader.ts:79`).
 *   - `MotionQueryHandler.ensureInitialized` reads that as
 *     `csvData.data?.diamondData || ""`, parses the empty string into empty row
 *     arrays, and sets `this.isInitialized = true` REGARDLESS
 *     (`pictograph/shared/services/motion-query-handler.ts:33,55`). Its own
 *     try/catch only guards a parse crash, which a load failure is not.
 *   - So every later `queryMotions` short-circuits on `isInitialized` and
 *     returns `[]` forever. Not slow — permanently empty.
 *
 * Dropping the memo therefore costs a cheap re-probe and buys nothing on its
 * own; it is kept because it is honest about WHERE the latch lives (upstream,
 * not here) and because it starts working the moment the handler learns to
 * invalidate. The real fix is upstream: `ensureInitialized` should leave
 * `isInitialized` false when `csvData.success` is false, so a later call
 * retries the load. Until then the graceful degradation below —
 * `ambientUnavailable: true`, no provider attached, search still runs on card
 * material — is the whole of the recovery story, and the honest thing to
 * report to a user is "bridge vocabulary unavailable this session".
 */
const datasetReady = new Map<GridMode, Promise<boolean>>();

function datasetAnswers(gridMode: GridMode): Promise<boolean> {
  const known = datasetReady.get(gridMode);
  if (known) return known;

  const probe = motionQueryHandler
    .queryMotions({ gridMode })
    .then((rows) => rows.length > 0)
    .catch(() => false)
    .then((ready) => {
      if (!ready) datasetReady.delete(gridMode);
      return ready;
    });

  datasetReady.set(gridMode, probe);
  return probe;
}

/**
 * One provider per grid mode, reused across searches so its per-seam cache
 * survives them. Seams repeat heavily — the same beta5 is asked about by every
 * card that visits it, in every search — and the dataset it reads is static.
 */
const providers = new Map<GridMode, RuntimeAmbientProvider>();

async function ambientProviderFor(
  gridMode: GridMode
): Promise<RuntimeAmbientProvider | null> {
  if (!(await datasetAnswers(gridMode))) return null;

  const existing = providers.get(gridMode);
  if (existing) return existing;

  const created = createRuntimeAmbientProvider(gridMode);
  providers.set(gridMode, created);
  return created;
}

let instance: SequenceCombinator | null = null;

export function getSequenceCombinator(): SequenceCombinator {
  if (instance) return instance;

  instance = {
    async findCombinations(cardA, cardB, options = {}) {
      const wantsAutoWiring =
        options.allowAmbient !== false && !options.ambientProvider;
      if (!wantsAutoWiring) return findCombinations(cardA, cardB, options);

      const gridMode = cardA.gridMode ?? GridMode.DIAMOND;
      const ambientProvider = await ambientProviderFor(gridMode);
      if (ambientProvider) {
        return findCombinations(cardA, cardB, { ...options, ambientProvider });
      }

      // Wanted a bridge vocabulary, could not get one. The search still runs
      // on card material; the report has to say the difference between that
      // and a caller who never asked (see `ambientUnavailable`).
      const report = await findCombinations(cardA, cardB, options);
      return { ...report, ambientUnavailable: true };
    },

    candidateWords(cardA, cardB, maxLength = DEFAULT_MAX_WORD_LENGTH) {
      const ingredients: IngredientEdges[] = [
        {
          name: ingredientName(cardA, "card A"),
          edges: edgesFromSequence(cardA),
        },
        {
          name: ingredientName(cardB, "card B"),
          edges: edgesFromSequence(cardB),
        },
        ...rosterConfirmedBases().map((base) => ({
          name: base.word,
          edges: base.edges,
        })),
      ];

      const result = enumerateHybridWords(ingredients, {
        maxLength,
        maxResults: CANDIDATE_WORD_MAX_RESULTS,
      });

      // The two cards are ingredients 0 and 1 by construction; ask the
      // enumerator what it CALLS them rather than guessing, so combining a
      // card with itself (identical display words -> "G" and "G (2)") still
      // filters correctly.
      const [cardAName, cardBName] = ingredientDisplayNames(ingredients);
      return {
        ...result,
        words: result.words.filter(
          (candidate) =>
            candidate.ingredients.includes(cardAName!) &&
            candidate.ingredients.includes(cardBName!)
        ),
      };
    },

    ambientStats(gridMode = GridMode.DIAMOND) {
      const provider = providers.get(gridMode);
      return provider ? snapshotAmbientStats(provider.stats) : null;
    },
  };

  return instance;
}

/**
 * Drop the module-private caches — the singleton, the dataset probes and the
 * per-grid-mode providers.
 *
 * For tests only, and needed because all three are deliberately
 * process-lifetime: a suite that wants to observe a first-call path (an
 * unavailable dataset, a fresh stats counter) cannot otherwise get back to one
 * after any earlier test has warmed them.
 */
export function __resetForTests(): void {
  instance = null;
  datasetReady.clear();
  providers.clear();
}
