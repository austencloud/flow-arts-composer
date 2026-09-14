/**
 * SequenceDataProvider - Unified sequence data loading
 *
 * Abstracts the complexity of loading sequence data from multiple sources:
 * - Local Dexie/IndexedDB (sequences created by the user)
 * - Firebase/Firestore (public sequences from the gallery)
 *
 * Components use this single module instead of juggling multiple loaders.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getSequenceRepository } from "$lib/shared/create/get-sequence-repository";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { getLoopDetector } from "$lib/shared/create/get-loop-detector";
import { hydrateSequence as hydrateSequenceSemantics } from "$lib/shared/navigation/services/sequence-hydrator";
import { cellPreWarmer } from "./cell-pre-warmer";

/** In-flight prefetch promises keyed by sequence identifier */
const prefetchCache = new Map<string, Promise<SequenceData>>();

/** Completed prefetch results keyed by sequence identifier */
const hydrationResults = new Map<string, SequenceData>();

/**
 * Check if a sequence has full motion data.
 * Lightweight gallery sequences only have metadata (word, thumbnailUrl, etc.)
 * but no steps array with motion information.
 */
function hasMotionData(sequence: SequenceData): boolean {
  return (
    Array.isArray(sequence.steps) &&
    sequence.steps.length > 0 &&
    sequence.steps.some((step) => step?.motions?.left && step?.motions?.right)
  );
}

/**
 * Ensure the sequence has a word property populated.
 * Derives from steps if necessary.
 */
function ensureWordPopulated(sequence: SequenceData): SequenceData {
  if (sequence.word) return sequence;

  const derivedWord =
    sequence.steps
      ?.filter((step) => !!step.letter)
      .map((step) => step.letter)
      .join("") || "";

  if (!derivedWord) return sequence;
  return { ...sequence, word: simplifyRepeatedWord(derivedWord) };
}

async function prepareForViewer(sequence: SequenceData): Promise<SequenceData> {
  return hydrateSequenceSemantics(ensureWordPopulated(sequence), {
    loopDetector: getLoopDetector(),
  });
}

export async function hydrateSequence(
  sequence: SequenceData
): Promise<SequenceData> {
  // Motion data alone is not viewer-ready. Compact links and older library
  // records can carry every motion while still lacking letters, positions,
  // word, grid mode, and LOOP classification.
  if (hasMotionData(sequence)) {
    return prepareForViewer(sequence);
  }

  const key = deriveCacheKey(sequence);

  // Check completed prefetch cache - instant return
  if (key) {
    const cached = hydrationResults.get(key);
    if (cached) {
      return cached;
    }

    // Check in-flight prefetch - await it instead of starting a new fetch
    const inFlight = prefetchCache.get(key);
    if (inFlight) {
      return inFlight;
    }
  }

  return hydrateSequenceInternal(sequence);
}

export function prefetch(sequence: SequenceData): void {
  const key = deriveCacheKey(sequence);
  if (!key) return;
  if (hydrationResults.has(key) || prefetchCache.has(key)) return;

  const promise = hydrateSequenceInternal(sequence).then((hydrated) => {
    hydrationResults.set(key, hydrated);

    // Chain cell pre-warming now that we have real step data
    if (hasMotionData(hydrated)) {
      cellPreWarmer.preWarmSequence(hydrated, "user-visible");
    }

    return hydrated;
  });

  prefetchCache.set(key, promise);
}

export function getCached(sequence: SequenceData): SequenceData | null {
  // Prefetch fills in metadata-only browse cards. A sequence with motions is
  // already the caller's document and may contain unsaved workspace edits under
  // the original collection ID. Never replace those edits with an ID-only hit.
  if (hasMotionData(sequence)) return null;

  const key = deriveCacheKey(sequence);
  if (!key) return null;
  return hydrationResults.get(key) ?? null;
}

/**
 * Derive a stable cache key from a sequence's identifier.
 */
function deriveCacheKey(sequence: SequenceData): string | null {
  return sequence.id || sequence.word || sequence.name || null;
}

/**
 * Core hydration logic - tries local repo then public loader.
 *
 * When the sequence has a unique ID, prefer ID-based lookup so we load
 * the exact variation the user clicked rather than an arbitrary match
 * for the same word.
 */
async function hydrateSequenceInternal(
  sequence: SequenceData
): Promise<SequenceData> {
  if (hasMotionData(sequence)) {
    return prepareForViewer(sequence);
  }

  // Try ID-based lookup first (returns the exact variation)
  if (sequence.id) {
    try {
      const localById = await getSequenceRepository().getSequence(sequence.id);
      if (localById && hasMotionData(localById)) {
        return prepareForViewer(localById);
      }
    } catch {
      // ID lookup failed, continue to word-based fallback
    }
  }

  // Fall back to word-based lookup (may return a different variation)
  const identifier = sequence.word || sequence.id;
  if (!identifier) {
    return ensureWordPopulated(sequence);
  }

  // Try local repository by word name
  try {
    const localSequence = await getSequenceRepository().getSequence(identifier);
    if (localSequence && hasMotionData(localSequence)) {
      return prepareForViewer(localSequence);
    }
  } catch {
    // Local lookup failed, continue to next source
  }

  // Try public loader (Firebase sequences). The id goes along when there is
  // one: this branch exists to honour the "prefer the exact variation" intent
  // above, and dropping the id here was what reduced it to a word match.
  try {
    const publicSequence = await getBrowseLoader().loadFullSequenceData(
      identifier,
      sequence.id || undefined
    );
    if (publicSequence && hasMotionData(publicSequence)) {
      return prepareForViewer(publicSequence);
    }
  } catch {
    // Public lookup failed
  }

  // Return original if all hydration attempts failed
  return prepareForViewer(sequence);
}

/**
 * The spellings a sequence id may have been handed out under.
 *
 * Theta is always uppercase Θ in TKA canon, and /admin/migrate-theta rewrote
 * every stored word and name to say so. It could not touch document ids, which
 * Firestore will not rename in place - so 70 sequences still answer to a
 * lowercase θ in their id while their word reads Θ. Both spellings are live in
 * URLs and shortcode records, and they will stay live through any migration of
 * those ids. A lookup that misses tries the other case before giving up.
 */
function thetaSpellings(identifier: string): readonly string[] {
  const swapped = identifier.includes("θ")
    ? identifier.replace(/θ/g, "Θ")
    : identifier.replace(/Θ/g, "θ");
  return swapped === identifier ? [identifier] : [identifier, swapped];
}

export interface LoadByIdentifierOptions {
  /**
   * Whether a miss on the exact document may fall through to a public lookup
   * by word. Defaults to true for the callers that really do hold a word (a
   * sync session, an inbox card). The /sequence route passes false: an address
   * is a short code or a document id, and letting the bare word resolve there
   * teaches people that words are URLs when the serialized code is the only
   * form that stays stable across variations of the same word.
   */
  wordFallback?: boolean;
}

export async function loadByIdentifier(
  identifier: string,
  options: LoadByIdentifierOptions = {}
): Promise<SequenceData | null> {
  const wordFallback = options.wordFallback ?? true;
  // Try the local store first - but only the stored document. The repository's
  // legacy-PNG fallback synthesizes a copy under a new random id on every call,
  // and every word that has a bundled PNG also has a real Firestore document
  // with the word as its id. Taking the copy here meant /sequence/DCKΨ- never
  // reached that document, so anything keyed on the sequence id - performance
  // videos, beat maps, library actions - looked up a uuid that exists nowhere.
  // The PNG remains the route's last resort in SequenceViewerPage, after the
  // public index and the signed-in library have both missed.
  try {
    const localSequence = await getSequenceRepository().getSequence(
      identifier,
      { importFromPng: false }
    );
    if (localSequence && hasMotionData(localSequence)) {
      return prepareForViewer(localSequence);
    }
  } catch (error) {
    console.debug("[SequenceDataProvider] Local lookup failed:", error);
  }

  // Try public loader, asking for the exact document before falling back to the
  // word.
  //
  // The identifier reaching this function comes from a route like
  // /sequence/<id>, where it is a document id - and a public document's `name`
  // is under no obligation to match it. `publicSequences/X-BΦ-θ-` is named
  // "X-BΦ-Θ-", one Greek theta apart, and 278 of the 565 documents in the
  // public index differ from their id by more than a letter case. Passing the
  // id as a word alone rendered every one of those permalinks as "This
  // sequence isn't available" while the document sat in the index.
  //
  // The word lookup still runs second, for the callers that really do hold a
  // word rather than an id.
  try {
    const loader = getBrowseLoader();
    let publicSequence: SequenceData | null = null;
    for (const candidate of thetaSpellings(identifier)) {
      publicSequence = await loader.loadFullSequenceData(identifier, candidate);
      if (publicSequence) break;
    }
    if (wordFallback) {
      publicSequence ??= await loader.loadFullSequenceData(identifier);
    }
    if (publicSequence) {
      return prepareForViewer(publicSequence);
    }
  } catch (error) {
    console.debug("[SequenceDataProvider] Public lookup failed:", error);
  }

  return null;
}
