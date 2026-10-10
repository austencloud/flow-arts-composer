/**
 * Real sequences for hub previews (Mandala Match's mandala, Read the
 * Performer's 3D rig). Pulled from the same TKA Level 1 catalog pool the
 * sequence games quiz from (catalog-loader; localStorage-warm after first
 * visit), so the hub shows real product content, not mockups.
 *
 * Resolves to [] on any failure — previews keep their reserved stage and
 * simply stay on the accent glow.
 */
import {
  getCachedCatalogs,
  loadCatalogs,
  loadCatalogSequencesPage,
} from "#lib/features/choreo-card/services/catalog-loader.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

let pool: Promise<SequenceData[]> | null = null;

function loadPool(): Promise<SequenceData[]> {
  pool ??= (async () => {
    const catalogs = getCachedCatalogs() ?? (await loadCatalogs());
    const candidates = catalogs.filter((c) => c.level === 1);
    for (const catalog of candidates.slice(0, 3)) {
      try {
        const page = await loadCatalogSequencesPage(catalog.id, 4);
        const withWords = page.sequences.filter(
          (s) => s.word && s.word.length > 0
        );
        if (withWords.length > 0) return withWords;
      } catch {
        // try the next catalog
      }
    }
    return [];
  })().catch(() => []);
  return pool;
}

/** One real sequence for a preview surface; index picks variety per card. */
export async function loadPreviewSequence(
  index = 0
): Promise<SequenceData | null> {
  const sequences = await loadPool();
  if (sequences.length === 0) return null;
  return sequences[index % sequences.length] ?? null;
}
