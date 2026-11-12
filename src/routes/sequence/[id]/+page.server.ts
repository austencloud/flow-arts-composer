import type { PageServerLoad } from "./$types";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  parseSequenceRouteId,
  decodeSequenceFromQR,
  decodeSequenceWithCompression,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  buildSequenceSeo,
  cleanSequenceText,
  toPositiveInteger,
  type SequenceRouteMeta,
} from "./sequence-seo";
import { readScanSequenceCode } from "#lib/shared/qr/services/scan-sequence-handoff.js";
import {
  emptySequenceMeta,
  firstTrustedThumbnail,
  loadPublishedMeta,
  PUBLISHED_META_TIMEOUT_MS,
} from "./published-meta";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";
import * as env from "$app/env/public";
import { isScannableShortCode } from "#lib/shared/qr/domain/physical-card.js";
import { fetchPublicShortCodeRecord } from "#lib/shared/qr/services/public-short-code-record-reader.js";
import { prepareScanViewerPayload } from "#lib/server/scan/scan-viewer-payload-preparer.js";
import {
  deriveShortCodeMeta,
  shortCodeRouteMeta,
  withSourceAttribution,
} from "./short-code-meta";

// Same project id the /q load and the client Firebase config use.
const PROJECT_ID = env.PUBLIC_FIREBASE_PROJECT_ID || "the-kinetic-alphabet";

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

interface PreparedShortCode {
  meta: SequenceRouteMeta;
  sequence: SequenceData | null;
}

/**
 * A shared link names its sequence by short code. The browser used to resolve
 * that code itself, which waited for the Firestore SDK to boot and then parsed
 * every pictograph dataframe to letter the steps: about ten seconds on a phone
 * before the stage drew. The record is public, so read and hydrate it here,
 * beside the link-preview lookup, and send the playable sequence with the page.
 *
 * The same record names the sequence for the link preview. Its author and
 * thumbnail come from the sequence the code was minted from when the code
 * lacks them; that read runs beside the hydration, not after it.
 * Any miss returns null and the browser keeps its full resolver.
 */
async function prepareShortCode(
  code: string,
  platformCredential: string | undefined
): Promise<PreparedShortCode | null> {
  if (!isScannableShortCode(code)) return null;
  try {
    const record = await fetchPublicShortCodeRecord(code, {
      projectId: PROJECT_ID,
      timeoutMs: PUBLISHED_META_TIMEOUT_MS,
    });
    if (!record) return null;
    const [sequence, meta] = await Promise.all([
      prepareScanViewerPayload(code, record).then(
        (prepared) => prepared?.sequence ?? null,
        (error: unknown) => {
          console.error(
            `[sequence-ssr] short-code preparation failed for "${code}":`,
            error instanceof Error ? error.message : error
          );
          return null;
        }
      ),
      withSourceAttribution(
        deriveShortCodeMeta(record),
        record,
        platformCredential
      ),
    ]);
    return { meta: shortCodeRouteMeta(meta, record, sequence), sequence };
  } catch (error) {
    console.error(
      `[sequence-ssr] short-code read failed for "${code}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export const load: PageServerLoad = async ({ params, url }) => {
  const fallback = createUnverifiedMeta(url);
  let meta = fallback;
  let preparedSequence: SequenceData | null = null;

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
      const credential = workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON;
      const [published, shortCode] = await Promise.all([
        loadPublishedMeta(parsed.legacyId, fallback, credential),
        prepareShortCode(parsed.legacyId, credential),
      ]);
      const resolvedPublished =
        published.source === "catalog" || published.source === "public";
      // A published record of the same id wins; otherwise the code names it.
      meta = !resolvedPublished && shortCode ? shortCode.meta : published;
      preparedSequence = shortCode?.sequence ?? null;
    }
  } catch {
    // A malformed route remains viewable as an error state and stays out of search.
  }

  return {
    meta,
    seo: buildSequenceSeo(params.id, meta),
    // Prototype: `?frame=1` server-renders the record's first frame while the
    // viewer loads. Read here so the server and the client agree.
    firstFrame: url.searchParams.get("frame") === "1",
    // A released catalog card plays its catalog record, never the code's copy.
    preparedSequence: meta.source === "catalog" ? null : preparedSequence,
  };
};
