/**
 * Released-card metadata over the Firestore REST API, shared by the
 * `/sequence/[id]` page loader and `/sitemap.xml` so both make the same
 * indexability decision from the same data. Lives beside `+page.server.ts`
 * because SvelteKit only allows its reserved exports from that file.
 *
 * The admin SDK (`$lib/server/firebaseAdmin`) reads `process.env` directly,
 * which Cloudflare Pages never populates — the service-account secret lives
 * on `event.platform.env` for a request. Callers pass that credential to
 * `getFirestoreRest`, which falls back to `$env/dynamic/private` (and, in
 * local dev only, `serviceAccountKey.json`) the way the physical card scan
 * endpoint already does.
 */
import {
  fromFirestoreFields,
  getFirestoreRest,
  type FirestoreDocument,
  type FirestoreRest,
} from "$lib/server/firestore/firestore-rest";
import {
  cleanSequenceText,
  toPositiveInteger,
  toTrustedThumbnailUrl,
  type SequenceRouteMeta,
} from "./sequence-seo";

export type FirestoreRecord = Record<string, unknown>;

interface ReleasedSequenceMatch {
  catalogId: string | null;
  deckName: string | null;
  deckNumber: number | null;
  stepCount: number | null;
}

export function firstTrustedThumbnail(record: {
  thumbnails?: unknown;
}): string | null {
  const thumbnails = Array.isArray(record.thumbnails) ? record.thumbnails : [];
  for (const thumbnail of thumbnails) {
    const trustedUrl = toTrustedThumbnailUrl(thumbnail);
    if (trustedUrl) return trustedUrl;
  }
  return null;
}

function readStepCount(
  record: FirestoreRecord,
  releasedStepCount: number | null
): number | null {
  const steps = Array.isArray(record.steps) ? record.steps.length : null;
  return (
    toPositiveInteger(steps) ??
    toPositiveInteger(record.sequenceLength) ??
    releasedStepCount
  );
}

function readDifficulty(record: FirestoreRecord): string | null {
  const level = toPositiveInteger(record.level);
  return (
    cleanSequenceText(record.difficultyLevel, 40) ??
    (level !== null ? String(level) : null)
  );
}

/**
 * Per-step TKA letters, in sequence order, for the crawlable letter list on
 * a curated card page. A decoded/inline sequence never carries per-step
 * letters (the motion decoder always writes `letter: null`), so this only
 * ever populates from a real catalog/public Firestore record.
 */
function readLetters(record: FirestoreRecord): string[] | null {
  const steps = Array.isArray(record.steps) ? record.steps : null;
  if (!steps || steps.length === 0) return null;

  const letters: string[] = [];
  for (const step of steps) {
    const letter = cleanSequenceText(
      (step as FirestoreRecord | null)?.letter,
      4
    );
    if (letter) letters.push(letter);
  }

  return letters.length > 0 ? letters : null;
}

function buildResolvedMeta(
  record: FirestoreRecord,
  source: "catalog" | "public",
  release: ReleasedSequenceMatch | null
): SequenceRouteMeta {
  return {
    word:
      cleanSequenceText(record.word, 120) ??
      cleanSequenceText(record.name, 120),
    creator:
      cleanSequenceText(record.ownerDisplayName, 120) ??
      cleanSequenceText(record.author, 120),
    difficulty: readDifficulty(record),
    stepCount: readStepCount(record, release?.stepCount ?? null),
    thumbnailUrl: firstTrustedThumbnail(record),
    source,
    curated: release !== null,
    catalogId: source === "catalog" ? (release?.catalogId ?? null) : null,
    deckName: release?.deckName ?? null,
    deckNumber: release?.deckNumber ?? null,
    letters: readLetters(record),
  };
}

function getReleasedMatches(
  manifests: readonly FirestoreRecord[],
  sequenceId: string
): ReleasedSequenceMatch[] {
  const matches: ReleasedSequenceMatch[] = [];

  for (const manifest of manifests) {
    const cards = Array.isArray(manifest.sequences) ? manifest.sequences : [];

    for (const rawCard of cards) {
      if (!rawCard || typeof rawCard !== "object") continue;
      const card = rawCard as FirestoreRecord;
      if (card.sequenceId !== sequenceId) continue;

      matches.push({
        catalogId: cleanSequenceText(card.sourceCatalogId, 180),
        deckName: cleanSequenceText(manifest.name, 160),
        deckNumber: toPositiveInteger(manifest.deckNumber),
        stepCount: toPositiveInteger(card.stepCount),
      });
    }
  }

  return matches.sort(
    (left, right) =>
      (left.deckNumber ?? Number.MAX_SAFE_INTEGER) -
      (right.deckNumber ?? Number.MAX_SAFE_INTEGER)
  );
}

export function isSafeFirestoreDocumentId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1_500 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/")
  );
}

/**
 * The canonical spelling of a sequence id.
 *
 * Theta is always uppercase in TKA canon. Seventy published sequences were
 * created before that was enforced and carried a lowercase theta in their
 * document id until the ids were migrated; their permalinks are already out in
 * the world and keep arriving. No live document carries a lowercase theta any
 * more, so an incoming one can only be a legacy URL - rewriting it here lets
 * those links keep their real title, description, and card image instead of
 * falling through to the generic unverified meta.
 */
export function canonicalSequenceId(sequenceId: string): string {
  return sequenceId.replace(/θ/g, "Θ");
}

/** Meta with nothing resolved: never indexable. */
export function emptySequenceMeta(): SequenceRouteMeta {
  return {
    word: null,
    creator: null,
    difficulty: null,
    stepCount: null,
    thumbnailUrl: null,
    source: "unknown",
    curated: false,
    catalogId: null,
    deckName: null,
    deckNumber: null,
    letters: null,
  };
}

export async function listReleaseManifests(
  firestore: FirestoreRest
): Promise<FirestoreRecord[]> {
  // Currently 5 manifest docs (2026-09-23); a generous single page avoids
  // pagination bookkeeping for a collection that grows one doc per deck
  // release.
  const page = await firestore.listDocuments("deckReleases/counter/manifests", {
    pageSize: 200,
  });
  return page.documents.map((doc) => fromFirestoreFields(doc.fields ?? {}));
}

/**
 * Resolves one sequence against already-fetched release manifests: the
 * released catalog record first, then its public copy. Pass `publicDoc` when
 * it was prefetched; leave it undefined to fetch it only on a catalog miss.
 * Firestore errors propagate; callers decide how to degrade.
 */
export async function resolvePublishedMeta(
  firestore: FirestoreRest,
  manifests: readonly FirestoreRecord[],
  sequenceId: string,
  fallback: SequenceRouteMeta,
  publicDoc?: FirestoreDocument | null
): Promise<SequenceRouteMeta> {
  const releases = getReleasedMatches(manifests, sequenceId);

  for (const release of releases) {
    if (!release.catalogId || !isSafeFirestoreDocumentId(release.catalogId)) {
      continue;
    }

    const catalogDoc = await firestore.getDocument(
      `catalogs/${release.catalogId}/sequences/${sequenceId}`
    );

    if (catalogDoc) {
      return buildResolvedMeta(
        fromFirestoreFields(catalogDoc.fields ?? {}),
        "catalog",
        release
      );
    }
  }

  const publicRecord =
    publicDoc === undefined
      ? await firestore.getDocument(`publicSequences/${sequenceId}`)
      : publicDoc;

  if (publicRecord) {
    return buildResolvedMeta(
      fromFirestoreFields(publicRecord.fields ?? {}),
      "public",
      releases[0] ?? null
    );
  }

  if (releases[0]) {
    return {
      ...fallback,
      curated: true,
      deckName: releases[0].deckName,
      deckNumber: releases[0].deckNumber,
    };
  }

  return fallback;
}

/**
 * One sequence id's crawlable metadata, or `fallback` when it is not a safe
 * document id or Firestore fails. Used by the page loader, the embed page,
 * and `/oembed`.
 */
export async function loadPublishedMeta(
  requestedId: string,
  fallback: SequenceRouteMeta,
  platformCredential?: string
): Promise<SequenceRouteMeta> {
  const sequenceId = canonicalSequenceId(requestedId);
  if (!isSafeFirestoreDocumentId(sequenceId)) return fallback;

  try {
    const firestore = getFirestoreRest(platformCredential);
    const [publicDoc, manifests] = await Promise.all([
      firestore.getDocument(`publicSequences/${sequenceId}`),
      listReleaseManifests(firestore),
    ]);
    return await resolvePublishedMeta(
      firestore,
      manifests,
      sequenceId,
      fallback,
      publicDoc
    );
  } catch (error) {
    // Non-fatal: the viewer can still resolve inline, short-code, and
    // signed-in library data. But it must not be silent again — a swallowed
    // failure here is exactly how every released card went noindex in
    // production with no trace.
    console.error(
      `[sequence-seo] loadPublishedMeta failed for "${sequenceId}":`,
      error instanceof Error ? error.message : error
    );
  }

  return fallback;
}
