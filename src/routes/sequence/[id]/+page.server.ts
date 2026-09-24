import type { PageServerLoad } from "./$types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  parseSequenceRouteId,
  decodeSequenceFromQR,
  decodeSequenceWithCompression,
} from "$lib/shared/navigation/services/sequence-encoder";
import {
  buildSequenceSeo,
  cleanSequenceText,
  toPositiveInteger,
  type SequenceRouteMeta,
} from "./sequence-seo";
import { readScanSequenceCode } from "$lib/shared/qr/services/scan-sequence-handoff";
import {
  emptySequenceMeta,
  firstTrustedThumbnail,
  loadPublishedMeta,
} from "./published-meta";

function createUnverifiedMeta(url: URL): SequenceRouteMeta {
  return {
    ...emptySequenceMeta(),
    word: cleanSequenceText(url.searchParams.get("word"), 120),
    creator: cleanSequenceText(url.searchParams.get("creator"), 120),
    difficulty: cleanSequenceText(url.searchParams.get("difficulty"), 40),
  };
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
    } else if (
      parsed.legacyId &&
      !readScanSequenceCode(params.id, url.searchParams)
    ) {
      // A `/q` scan handoff skips this lookup: the scan page already decoded
      // the sequence and passed it to the viewer, a shortcode never has
      // release metadata, and the visit is not a crawl target. Waiting on
      // Firestore here held every scanned card on a loading screen.
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
