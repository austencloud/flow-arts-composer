import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  TND_BASE_CATALOG_ID,
  buildTnDSeedClasses,
  getTnDFamilyOptions,
  buildTnDCards,
} from "#lib/features/choreo-card/services/deck-composer.js";
import { loadCatalogSequences } from "#lib/features/choreo-card/services/catalog-loader.js";
import { resolveDeckSequences } from "#lib/features/choreo-card/services/deck-variation.js";
import { loadDiamondEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { allTurnPatterns, groupCardsBySeed, type SeedMatrix } from "../domain/tnd-turn-patterns";

export interface ResolveTnDFamilyCardsOptions {
  /** Turn patterns to resolve (default: the full 7x7 grid). Pass ["0|0"] for a
   * cheap base-only pass (e.g. the gallery's alphabet band). */
  patterns?: readonly string[];
  /** Resolve only this seed's cards (e.g. the turn explorer opening one letter). */
  seedId?: string;
}

/**
 * For one TnD family (diamond), return its base seeds each with their resolved
 * turn grid as SequenceData. Mirrors the deck-releaser TnD compose path
 * (deck-composer + deck-variation) so the cards are exactly what production ships.
 * Resolution cost scales with patterns × seeds — scope via `options` instead of
 * resolving all 49 combos when only the base (or one seed) is needed.
 */
export async function resolveTnDFamilyCards(
  familyId: string,
  options: ResolveTnDFamilyCardsOptions = {},
): Promise<SeedMatrix[]> {
  const baseSeqs = await loadCatalogSequences(TND_BASE_CATALOG_ID);
  const seedClasses = buildTnDSeedClasses(baseSeqs);
  const families = getTnDFamilyOptions(seedClasses, ["diamond"]);
  const family = families.find((f) => f.familyId === familyId);
  if (!family) return [];

  const patterns = new Set(options.patterns ?? allTurnPatterns());
  let cards = buildTnDCards(families, new Set([familyId]), patterns, ["radial"]);
  if (options.seedId) cards = cards.filter((c) => c.sequenceId === options.seedId);
  if (cards.length === 0) return [];

  const baseByKey = new Map<string, SequenceData>();
  for (const s of baseSeqs) baseByKey.set(`${TND_BASE_CATALOG_ID}::${s.id}`, s);

  const edges = await loadDiamondEdges();
  const resolved = resolveDeckSequences(cards, baseByKey, edges);
  return groupCardsBySeed(cards, resolved);
}
