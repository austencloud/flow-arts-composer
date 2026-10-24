/**
 * Word closure reachability
 *
 * Where can a word, spelled from a given start placement, leave its last
 * step? The beam search answers that one lane at a time and can run out of
 * luck; this answers it for every lane at once from the placement data, so a
 * LOOP whose closing placement no lane can reach is reported as infeasible
 * instead of rerolled.
 *
 * It follows the same moves the beam search makes, without its style
 * constraints or turns, so it only ever reaches more than the search can:
 * each letter goes direct or after the bridge letters the transition graph
 * offers, and the seed may end on a closing bridge toward the first letter's
 * next pass (see BeamSearch.appendClosingBridge). An empty answer is a proof;
 * a non-empty one is only a chance.
 */

import type { IVariationProvider } from "../data/IVariationProvider.js";
import type { ITransitionGraph } from "../../core/transition-graph/ITransitionGraph.js";

export interface WordClosureReach {
  /** Placements the word's last letter can end at. */
  letterEnds: Set<string>;
  /** Required end placements some lane reaches, last letter or closing bridge. */
  closingEnds: Set<string>;
}

export function reachWordClosure(
  letters: readonly string[],
  startPlacement: string,
  requiredEnds: ReadonlySet<string>,
  provider: IVariationProvider,
  gridMode: string,
  graph: ITransitionGraph
): WordClosureReach {
  const endsOf = (letter: string, from: ReadonlySet<string>): Set<string> => {
    const ends = new Set<string>();
    for (const placement of from) {
      for (const v of provider.getVariations(letter, placement, gridMode)) {
        ends.add(v.endPlacement);
      }
    }
    return ends;
  };

  // The bridge chains the search tries between two letters: each single
  // bridge letter, or the graph's one multi-letter path when there is none.
  const chainsBetween = (from: string, to: string): string[][] => {
    const singles = graph.findAllBridgeOptions(from, to);
    if (singles.length > 0) return singles.map((letter) => [letter]);
    const path = graph.findBridgeLetters(from, to);
    return path.length > 0 ? [path] : [];
  };

  const bridged = (
    from: ReadonlySet<string>,
    chain: readonly string[]
  ): Set<string> =>
    chain.reduce<Set<string>>(
      (at, letter) => endsOf(letter, at),
      new Set(from)
    );

  let frontier = endsOf(letters[0]!, new Set([startPlacement]));
  for (let i = 1; i < letters.length; i++) {
    const letter = letters[i]!;
    const next = endsOf(letter, frontier);
    for (const chain of chainsBetween(letters[i - 1]!, letter)) {
      for (const end of endsOf(letter, bridged(frontier, chain))) next.add(end);
    }
    frontier = next;
  }

  const closingEnds = new Set(
    [...frontier].filter((end) => requiredEnds.has(end))
  );
  const lastLetter = letters[letters.length - 1]!;
  const firstLetter = letters[0]!;
  for (const chain of chainsBetween(lastLetter, firstLetter)) {
    for (const end of bridged(frontier, chain)) {
      if (
        requiredEnds.has(end) &&
        provider.getVariations(firstLetter, end, gridMode).length > 0
      ) {
        closingEnds.add(end);
      }
    }
  }

  return { letterEnds: frontier, closingEnds };
}
