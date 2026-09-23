import type { PageServerLoad } from "./$types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  parseSequenceRouteId,
  decodeSequenceFromQR,
  decodeSequenceWithCompression,
} from "$lib/shared/navigation/services/sequence-encoder";
import { getFirestoreRest } from "$lib/server/firestore/firestore-rest";
import {
  buildSequenceSeo,
  cleanSequenceText,
  toPositiveInteger,
  type SequenceRouteMeta,
} from "./sequence-seo";
import {
  canonicalSequenceId,
  emptySequenceMeta,
  firstTrustedThumbnail,
  isSafeFirestoreDocumentId,
  listReleaseManifests,
  resolvePublishedMeta,
} from "./published-meta";

function createUnverifiedMeta(url: URL): SequenceRouteMeta {
  return {
    ...emptySequenceMeta(),
    word: cleanSequenceText(url.searchParams.get("word"), 120),
    creator: cleanSequenceText(url.searchParams.get("creator"), 120),
    difficulty: cleanSequenceText(url.searchParams.get("difficulty"), 40),
  };
}

async function loadPublishedMeta(
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

function buildInlineMeta(
  decoded: SequenceData,
  fallback: SequenceRouteMeta
): SequenceRouteMeta {
  return {
    ...fallback,
    word:
      cleanSequenceText(decoded.word, 120) ??
      cleanSequenceText(decoded.name, 120) ??
      fallback.word,
    creator:
      cleanSequenceText(decoded.ownerDisplayName, 120) ?? fallback.creator,
    stepCount: Array.isArray(decoded.steps)
      ? toPositiveInteger(decoded.steps.length)
      : null,
    thumbnailUrl: firstTrustedThumbnail(decoded),
    source: "inline",
  };
}

export const load: PageServerLoad = async ({ params, url, platform }) => {
  const fallback = createUnverifiedMeta(url);
  let meta = fallback;

  try {
    const parsed = parseSequenceRouteId(params.id);

    if (parsed.inlineQr) {
      // A legacy self-contained QR payload carries its own compression
      // envelope. It is never a Firestore document id - base45 emits `/`, which
      // no document id may contain - so resolving it would spend a collection
      // read on a lookup that cannot hit.
      try {
        meta = buildInlineMeta(
          await decodeSequenceFromQR(parsed.inlineQr),
          fallback
        );
      } catch {
        meta = { ...fallback, source: "inline" };
      }
    } else if (parsed.encoded) {
      try {
        meta = buildInlineMeta(
          decodeSequenceWithCompression(parsed.encoded),
          fallback
        );
      } catch {
        meta = { ...fallback, source: "inline" };
      }
    } else if (parsed.legacyId) {
      meta = await loadPublishedMeta(
        parsed.legacyId,
        fallback,
        platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
      );
    }
  } catch {
    // A malformed route remains viewable as an error state and stays out of search.
  }

  return {
    meta,
    seo: buildSequenceSeo(params.id, meta),
  };
};
