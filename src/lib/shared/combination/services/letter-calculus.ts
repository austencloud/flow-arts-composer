import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { placementGroup, seamEndOf, seamOf } from "./placement-groups";

export interface LetterEdge {
  readonly letter: Letter;
  readonly from: GridPlacementGroup;
  readonly to: GridPlacementGroup;
}

export interface IngredientEdges {
  readonly name: string;
  readonly edges: readonly LetterEdge[];
}

export interface WordCandidate {
  /** Display string of the CANONICAL (lexicographically-smallest) rotation. */
  readonly word: string;
  /**
   * The canonical rotation's letters, as an array — never re-split `word`
   * char-by-char to recover this. Dashed letters ("W-", "Σ-", ...) are two
   * characters wide and are not char-splittable; `letters` is the only safe
   * way to know how many actual TKA letters a word contains.
   */
  readonly letters: readonly Letter[];
  /**
   * `requireAllIngredients` mode: the full witness assignment — every
   * requested ingredient (by IDENTITY — its position in the `ingredients`
   * array, not its `name`; see N2 below), each backed by >=1 walk-edge
   * occurrence in a feasible exact-cover assignment (see
   * `findIngredientCoverWitness`). Display names are disambiguated when two
   * ingredients share a `name`: the first occurrence keeps the bare name,
   * later ones get " (2)", " (3)", ... appended.
   *
   * Default mode (no `requireAllIngredients`): the union of every ingredient
   * that could have supplied at least one edge occurrence in this walk. This
   * is NOT a verified cover — just the set of possible suppliers; a shared
   * edge counted here might not actually be assignable to every ingredient
   * listed if the walk doesn't have enough occurrences to go around (see I4).
   */
  readonly ingredients: readonly string[];
}

export interface EnumerateOptions {
  readonly maxLength: number;
  /** Only emit words that draw from EVERY ingredient (default false). */
  readonly requireAllIngredients?: boolean;
  /** Cap on distinct results returned (default 200). */
  readonly maxResults?: number;
  /**
   * DFS node budget, shared across every depth of the iterative-deepening
   * sweep (default 500_000) — bounds worst-case exponential blowup.
   */
  readonly searchBudget?: number;
}

export interface EnumerateResult {
  /**
   * Shortest-first, then lexicographic within a length — the N shortest
   * candidates, deterministically, regardless of ingredient array order.
   */
  readonly words: readonly WordCandidate[];
  /** True when the `maxResults` cap stopped collection before the space was exhausted. */
  readonly resultsTruncated: boolean;
  /**
   * True when `searchBudget` (the DFS node cap, shared across every depth of
   * the iterative-deepening sweep) stopped the search before the space was
   * exhausted.
   */
  readonly budgetExhausted: boolean;
  /**
   * True only when NEITHER cap fired — i.e. `words` is the complete,
   * exhaustive set of primitive hybrid words up to `maxLength`. This is
   * Layer 0's ONLY impossibility signal: `words.length === 0 &&
   * searchComplete` means genuinely impossible. An empty `words` with
   * `searchComplete: false` proves nothing — it means the search gave up
   * before finding anything, not that nothing exists.
   */
  readonly searchComplete: boolean;
}

/** Family edges of a concrete sequence's steps (skips steps missing placements). */
export function edgesFromSequence(seq: SequenceData): LetterEdge[] {
  const edges: LetterEdge[] = [];
  for (const step of seq.steps) {
    if (!step.letter) continue;
    const startSeam = seamOf(step);
    const endSeam = seamEndOf(step);
    if (!startSeam || !endSeam) continue;
    const from = placementGroup(startSeam);
    const to = placementGroup(endSeam);
    if (!from || !to) continue;
    edges.push({ letter: step.letter, from, to });
  }
  return edges;
}

// Primitivity (necklace aperiodicity) — enumeration layer, NOT display layer

/**
 * Reject any letter sequence that is itself a whole-number repetition of a
 * shorter prefix (GG, GGG, FLFL, ...) — only the shortest (primitive) closed
 * walk for a given edge-cycle is worth emitting as a candidate.
 *
 * This is a DIFFERENT layer from `simplifyRepeatedWord`
 * (`$lib/shared/foundation/utils/word-simplifier.ts`): that utility is
 * display-layer — it takes an already-decided, already-realized word (e.g. a
 * LOOP's full expanded letter string) and shortens it for human display
 * after the fact. This function is enumeration-layer — it decides which
 * closed walks are worth surfacing as search results AT ALL. "GGGG" never
 * becomes a hybrid-word candidate here because its primitive unit "G" already
 * covers the identical edge, once per period — not because a later display
 * step collapsed it.
 */
function isPrimitiveWord(letters: readonly Letter[]): boolean {
  const n = letters.length;
  for (let d = 1; d < n; d++) {
    if (n % d !== 0) continue;
    let matches = true;
    for (let i = d; i < n; i++) {
      if (letters[i] !== letters[i % d]) {
        matches = false;
        break;
      }
    }
    if (matches) return false;
  }
  return true;
}

function compareLetterArrays(
  a: readonly Letter[],
  b: readonly Letter[]
): number {
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/** The lexicographically-smallest rotation — the deterministic canonical form. */
function canonicalRotation(letters: readonly Letter[]): Letter[] {
  let best: readonly Letter[] = letters;
  for (let i = 1; i < letters.length; i++) {
    const rotated = [...letters.slice(i), ...letters.slice(0, i)];
    if (compareLetterArrays(rotated, best) < 0) best = rotated;
  }
  return [...best];
}

// Exact ingredient cover (bipartite matching) — I4

/**
 * Does there exist an assignment of each used edge-occurrence to ONE of its
 * owners such that every ingredient in `requiredIngredients` is assigned
 * >=1 occurrence? Returns the witness ingredient set (sorted, deterministic)
 * on success, or `null` when infeasible.
 *
 * This is bipartite-matching feasibility (Kuhn's algorithm): left nodes are
 * required ingredients, right nodes are walk occurrences, an edge exists
 * when an occurrence's owner set contains that ingredient. Feasible iff a
 * matching exists that saturates every ingredient. Bounds are tiny in
 * practice (<=13 ingredients, <=8 occurrences at maxLength 8), so a plain
 * augmenting-path search is more than fast enough — no need for
 * Hopcroft-Karp here.
 *
 * A union-of-owners check ("does every ingredient appear SOMEWHERE in the
 * walk's owner sets") is NOT sufficient and was the I4 bug: two ingredients
 * sharing one identical edge both "appear" in that edge's owner set, but a
 * walk that uses the edge only ONCE cannot actually credit both of them —
 * there's only one occurrence to assign.
 *
 * Generic over the identity type `T` on purpose: the production pipeline
 * keys ownership by ingredient INDEX (`number`) so two ingredients sharing a
 * `name` stay distinct (N2) — but this function is exported and exercised
 * directly with plain `string` identities too, independent of whether the
 * resulting word would ever pass `isPrimitiveWord` (I5) in the full pipeline.
 */
export function findIngredientCoverWitness<T>(
  occurrenceOwners: readonly ReadonlySet<T>[],
  requiredIngredients: readonly T[]
): readonly T[] | null {
  const ingredients = [...requiredIngredients].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  // occurrenceAssignedTo[occIdx] = index into `ingredients` currently holding
  // this occurrence, or -1 when unclaimed.
  const occurrenceAssignedTo: number[] = new Array(
    occurrenceOwners.length
  ).fill(-1);

  const tryAssign = (ingredientIdx: number, visited: boolean[]): boolean => {
    for (let occIdx = 0; occIdx < occurrenceOwners.length; occIdx++) {
      if (visited[occIdx]) continue;
      if (!occurrenceOwners[occIdx]!.has(ingredients[ingredientIdx]!)) continue;
      visited[occIdx] = true;
      const currentHolder = occurrenceAssignedTo[occIdx]!;
      if (currentHolder === -1 || tryAssign(currentHolder, visited)) {
        occurrenceAssignedTo[occIdx] = ingredientIdx;
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < ingredients.length; i++) {
    const visited: boolean[] = new Array(occurrenceOwners.length).fill(false);
    if (!tryAssign(i, visited)) return null;
  }
  return ingredients;
}

// Display-name disambiguation — N2

/**
 * Identity is by ARRAY POSITION, never by `name` — two ingredients can share
 * a `name` and must stay distinct internally (a shared name is a display
 * collision, not an identity collision: two hybrid cards can legitimately
 * both be called "Card B"). This builds the display string per index,
 * appending " (2)", " (3)", ... to every name after its first occurrence.
 *
 * Exported because `WordCandidate.ingredients` speaks these strings and
 * nothing else: a caller that wants to ask "did this word draw on ingredient
 * #1?" has to know what #1 is CALLED, and re-deriving that convention at the
 * call site is exactly the drift that would silently break the combinator
 * facade's both-cards filter the day someone combines a card with itself.
 */
export function ingredientDisplayNames(
  ingredients: readonly IngredientEdges[]
): string[] {
  const seenCount = new Map<string, number>();
  return ingredients.map((ing) => {
    const count = (seenCount.get(ing.name) ?? 0) + 1;
    seenCount.set(ing.name, count);
    return count === 1 ? ing.name : `${ing.name} (${count})`;
  });
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

interface EdgeDef {
  readonly letter: Letter;
  readonly to: GridPlacementGroup;
  /** Ingredient INDICES that offer this exact (letter, from, to) edge. */
  readonly owners: ReadonlySet<number>;
}

/**
 * Enumerate primitive (aperiodic) closed walks in the placement-family graph
 * whose edges are drawn from the ingredients, returning the SHORTEST
 * candidates first (iterative deepening — N1): every closure of length 1 is
 * collected and sorted before length 2 is even attempted, and so on up to
 * `maxLength`. This makes the returned list — and where `maxResults` cuts it
 * off — fully deterministic and independent of ingredient array order,
 * which a single flat DFS to `maxLength` could not guarantee (a length-8
 * degenerate could sort ahead of a length-1 word depending on which branch
 * the DFS happened to explore first).
 *
 * `searchBudget` bounds the TOTAL DFS nodes visited across every depth of the
 * sweep, not just the deepest one. Because each level re-walks the same
 * shallow prefixes iterative-deepening always does, the total cost across
 * all depths is a small constant multiple of the deepest level alone —
 * empirically ~1.15x, given this graph's measured ~8.6x growth per added
 * depth (geometric series 1/(1 - 1/8.6) ≈ 1.15) — so one shared budget still
 * behaves like "the depth-`maxLength` budget," not "8x more work."
 *
 * Word-level sieve only: necessary, not sufficient — Layer 1 (seam-graph
 * search) decides realizability against concrete card material (placement
 * INSTANCES: alpha3 vs alpha5).
 *
 * API-fitness note: placement FAMILY is invariant under every spatial/color
 * variant a hybrid card could apply. Verified against
 * `circular-placement-maps.ts`'s `HALF_PLACEMENT_MAP` (180°) and
 * `QUARTER_PLACEMENT_MAP_CW`/`_CCW` (90°) — every entry maps a placement to
 * another placement in the SAME family (alpha->alpha, beta->beta, each gamma
 * half to itself, etc.); there are zero cross-family maps in that file, and
 * mirroring/color-swap don't touch family membership either. So this sieve
 * correctly prefilters at the WORD level (which letter sequences could ever
 * close a loop, drawing from which ingredients) — variant choice (rotation,
 * mirror, color swap) is Layer 1's job, not this one's.
 *
 * Prior art (never-hand-roll accounting): sequence-engine's
 * `LetterPlacementInfo` (sequence-engine-types.ts) and the spell tab's
 * `LetterTransitionGraph` (features/create/spell/services/letter-transition-graph.ts)
 * walk letters over placement groups, but both are limited to alpha/beta/gamma
 * and are generation-bound (no ingredient attribution, no closed-walk
 * enumeration over a chosen edge multiset). Layer 0 needs all 7 families +
 * per-ingredient provenance, hence a new module. Consolidation deliberately
 * deferred.
 */
export function enumerateHybridWords(
  ingredients: readonly IngredientEdges[],
  options: EnumerateOptions
): EnumerateResult {
  const { maxLength, requireAllIngredients = false } = options;
  const maxResults = options.maxResults ?? 200;
  const searchBudget = options.searchBudget ?? 500_000;

  // N4 fast-fail: a closed walk of length L has at most L edge occurrences,
  // and exact cover needs one DISTINCT occurrence per required ingredient.
  // If there are more required ingredients than the longest walk we'll ever
  // build, cover is provably impossible — no search needed, and this is a
  // genuine exhaustive proof, not "gave up": searchComplete is true.
  if (requireAllIngredients && ingredients.length > maxLength) {
    return {
      words: [],
      resultsTruncated: false,
      budgetExhausted: false,
      searchComplete: true,
    };
  }

  // Deduplicated edge index, bucketed by `from` group (avoids an O(E) scan
  // per step of every walk). Owners are keyed by ARRAY INDEX (N2) so two
  // ingredients sharing a `name` never collapse into one identity.
  const edgeMap = new Map<
    string,
    {
      letter: Letter;
      from: GridPlacementGroup;
      to: GridPlacementGroup;
      owners: Set<number>;
    }
  >();
  ingredients.forEach((ing, idx) => {
    for (const edge of ing.edges) {
      const key = `${edge.letter}|${edge.from}|${edge.to}`;
      const existing = edgeMap.get(key);
      if (existing) existing.owners.add(idx);
      else
        edgeMap.set(key, {
          letter: edge.letter,
          from: edge.from,
          to: edge.to,
          owners: new Set([idx]),
        });
    }
  });
  const edgesByFrom = new Map<GridPlacementGroup, EdgeDef[]>();
  for (const def of edgeMap.values()) {
    const bucket = edgesByFrom.get(def.from);
    if (bucket) bucket.push(def);
    else edgesByFrom.set(def.from, [def]);
  }

  const displayNames = ingredientDisplayNames(ingredients);
  const requiredIndices = ingredients.map((_, idx) => idx);

  let nodesVisited = 0;
  let budgetExhausted = false;
  let resultsTruncated = false;
  const finalWords: WordCandidate[] = [];

  // Shared mutable path state, mutated via push/pop during each level's DFS —
  // avoids an array copy per recursive step. Every value stored into a level
  // map is a fresh copy taken synchronously before the caller pops, so
  // nothing here aliases into a later-mutated array.
  const letters: Letter[] = [];
  const occurrenceOwners: ReadonlySet<number>[] = [];

  const recordIfValid = (levelMap: Map<string, WordCandidate>): void => {
    if (letters.length < 1) return;
    // N5 cheap-first ordering: primitivity (cheap) before canonicalization,
    // and canonicalization + dedup BEFORE the Kuhn matching call (the most
    // expensive check) — a duplicate necklace we've already recorded this
    // level never touches the matcher a second time.
    if (!isPrimitiveWord(letters)) return;

    const canonical = canonicalRotation(letters);
    const canonicalKey = canonical.join(" ");
    if (levelMap.has(canonicalKey)) return;

    let ingredientsField: readonly string[];
    if (requireAllIngredients) {
      const witness = findIngredientCoverWitness(
        occurrenceOwners,
        requiredIndices
      );
      if (!witness) return;
      ingredientsField = witness.map((idx) => displayNames[idx]!);
    } else {
      const suppliers = new Set<number>();
      for (const owners of occurrenceOwners)
        for (const idx of owners) suppliers.add(idx);
      ingredientsField = [...suppliers].map((idx) => displayNames[idx]!).sort();
    }

    levelMap.set(canonicalKey, {
      word: canonical.join(""),
      letters: canonical,
      ingredients: ingredientsField,
    });
  };

  /**
   * DFS to depth EXACTLY `targetLength`, recording a closure only at the
   * leaf. Returns `null` when the shared node budget ran out mid-level —
   * that level's partial results are discarded (all-or-nothing per level),
   * since a partial level can't be sorted/complete and would break the
   * shortest-first-then-lexicographic determinism N1 requires.
   */
  const collectLevel = (targetLength: number): WordCandidate[] | null => {
    const levelMap = new Map<string, WordCandidate>();
    let levelBudgetExceeded = false;

    const walk = (
      start: GridPlacementGroup,
      current: GridPlacementGroup,
      depth: number
    ): void => {
      if (levelBudgetExceeded) return;
      nodesVisited++;
      if (nodesVisited > searchBudget) {
        levelBudgetExceeded = true;
        return;
      }

      if (depth === targetLength) {
        if (current === start) recordIfValid(levelMap);
        return;
      }

      const outgoing = edgesByFrom.get(current);
      if (!outgoing) return;
      for (const edge of outgoing) {
        if (levelBudgetExceeded) return;
        letters.push(edge.letter);
        occurrenceOwners.push(edge.owners);
        walk(start, edge.to, depth + 1);
        letters.pop();
        occurrenceOwners.pop();
      }
    };

    for (const start of edgesByFrom.keys()) {
      if (levelBudgetExceeded) break;
      walk(start, start, 0);
    }

    return levelBudgetExceeded ? null : [...levelMap.values()];
  };

  outer: for (let length = 1; length <= maxLength; length++) {
    // Same N4 reasoning, applied per level: a length-L walk can't cover more
    // than L distinct required ingredients, so skip levels that are
    // provably too short rather than spending budget discovering that.
    if (requireAllIngredients && ingredients.length > length) continue;

    const levelResults = collectLevel(length);
    if (levelResults === null) {
      budgetExhausted = true;
      break;
    }

    levelResults.sort((a, b) =>
      a.word < b.word ? -1 : a.word > b.word ? 1 : 0
    );
    for (const candidate of levelResults) {
      if (finalWords.length >= maxResults) {
        resultsTruncated = true;
        break outer;
      }
      finalWords.push(candidate);
    }
  }

  return {
    words: finalWords,
    resultsTruncated,
    budgetExhausted,
    searchComplete: !resultsTruncated && !budgetExhausted,
  };
}
