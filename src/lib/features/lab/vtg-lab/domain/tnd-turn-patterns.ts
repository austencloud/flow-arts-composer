import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CardFooter } from "#lib/features/choreo-card/domain/models/DeckRelease.js";
import type { ResolvedDeckSequence } from "#lib/features/choreo-card/services/deck-variation.js";
import { TURN_VALUES } from "#lib/features/choreo-card/domain/turn-pattern-parser.js";

/** Matches deck-composer's formatTurn: integers bare, halves as X.0/X.5. */
function formatTurn(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The full 7x7 = 49 blue|red turn patterns. */
export function allTurnPatterns(): string[] {
  const out: string[] = [];
  for (const left of TURN_VALUES) {
    for (const right of TURN_VALUES) {
      out.push(`${formatTurn(left)}|${formatTurn(right)}`);
    }
  }
  return out;
}

/** A base seed plus its resolved sequence per turn pattern. */
export interface SeedMatrix {
  seedId: string;
  word: string;
  footer: CardFooter;
  byTurn: Map<string, SequenceData>;
}

/** Minimal card shape this grouping needs (subset of DeckReleaseCard). */
export interface GroupableCard {
  sequenceId: string;
  word: string;
  footer: CardFooter;
  variation?: { turnPattern?: string };
}

/**
 * Zip cards to their positionally-resolved sequences (resolveDeckSequences
 * preserves order and never drops when bases are present), then bucket by seed
 * id and turn pattern. Seed order follows first appearance in `cards`.
 */
export function groupCardsBySeed(
  cards: GroupableCard[],
  resolved: ResolvedDeckSequence[],
): SeedMatrix[] {
  const bySeed = new Map<string, SeedMatrix>();
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const res = resolved[i];
    // Invariant: resolveDeckSequences preserves card order and only drops a card
    // when its base is missing — which cannot happen here (every card's base is in
    // baseByKey). So resolved[i] always pairs with cards[i]. If a future change to
    // resolveDeckSequences ever drops cards, this guard would silently misalign the
    // rest; keep the one-base-per-card invariant intact upstream.
    if (!res) continue;
    let entry = bySeed.get(card.sequenceId);
    if (!entry) {
      entry = { seedId: card.sequenceId, word: card.word, footer: card.footer, byTurn: new Map() };
      bySeed.set(card.sequenceId, entry);
    }
    const tp = card.variation?.turnPattern ?? "0|0";
    entry.byTurn.set(tp, res.sequence);
  }
  return [...bySeed.values()];
}
