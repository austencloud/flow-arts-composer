import type { PageServerLoad } from "./$types";
import * as env from "$app/env/public";
import { parseCloudflareGeo } from "#lib/shared/presence/domain/models/presence-models.js";
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import { fetchPublicShortCodeRecord } from "#lib/shared/qr/services/public-short-code-record-reader.js";
import {
  isInlineEncoded,
  parsePropsFromURL,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import {
  prepareScanViewerPayload,
  type PreparedScanViewerPayload,
} from "#lib/server/scan/scan-viewer-payload-preparer.js";
import { getFirestoreRest } from "#lib/server/firestore/firestore-rest.js";
import { readPhysicalCardPropsWithin } from "#lib/server/physical-cards/physical-card-props.js";
import { physicalCardIdNeedingProps } from "#lib/shared/qr/services/physical-card-props.js";
import { requestCf, workerEnv } from "#lib/server/cloudflare/worker-env.js";

// The project id lives in the public env; the value below is the same one the
// client Firebase config uses (src/lib/shared/auth/firebase.ts) and only
// applies when the deploy environment doesn't define the var.
const PROJECT_ID = env.PUBLIC_FIREBASE_PROJECT_ID || "the-kinetic-alphabet";

// SSR renders with or without meta — it must never hang on a slow lookup.
const LOOKUP_TIMEOUT_MS = 2500;

interface ShortCodeMeta {
  word: string | null;
  payloadKind: "word" | "solo";
  authoredHand: "left" | "right" | null;
  creator: string | null;
  thumbnailUrl: string | null;
  deckId: string | null;
  deckName: string | null;
  leftPropType: string | null;
  rightPropType: string | null;
}

const EMPTY_META: ShortCodeMeta = {
  word: null,
  payloadKind: "word",
  authoredHand: null,
  creator: null,
  thumbnailUrl: null,
  deckId: null,
  deckName: null,
  leftPropType: null,
  rightPropType: null,
};

function readString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function deriveMeta(record: ShortCodeData | null): ShortCodeMeta {
  if (!record) return EMPTY_META;
  const values = record as unknown as Record<string, unknown>;
  const payloadKind =
    readString(values, "payloadKind") === "solo" ? "solo" : "word";
  const authoredHandValue = readString(values, "authoredHand");
  const authoredHand =
    authoredHandValue === "left" || authoredHandValue === "right"
      ? authoredHandValue
      : null;

  return {
    // Schema-3 solos carry a human title, never a fabricated TKA word.
    // Schema-2 words and legacy records retain the historical fallbacks.
    word:
      (payloadKind === "solo"
        ? readString(values, "payloadTitle")
        : readString(values, "payloadWord")) ??
      readString(values, "word") ??
      readString(values, "sequenceName"),
    payloadKind,
    authoredHand,
    creator: readString(values, "ownerDisplayName"),
    thumbnailUrl: readString(values, "thumbnailUrl"),
    deckId: readString(values, "deckId"),
    deckName: readString(values, "deckName"),
    leftPropType:
      readString(values, "leftPropType") ?? readString(values, "bluePropType"),
    rightPropType:
      readString(values, "rightPropType") ?? readString(values, "redPropType"),
  };
}

function stripPreparedPayload(
  record: ShortCodeData | null,
  prepared: PreparedScanViewerPayload | null
): ShortCodeData | null {
  if (!record || !prepared) return record;

  // The hydrated sequence now carries the payload. Keep the small attribution
  // envelope for analytics and later actions, but do not serialize a duplicate
  // 30–100 KB embedded sequence into the HTML.
  const {
    sequenceData: _sequenceData,
    soloData: _soloData,
    ...clientRecord
  } = record;
  return clientRecord;
}

export const load: PageServerLoad = async ({ params, request, url }) => {
  const cf = requestCf(request);
  const geo = parseCloudflareGeo(request.headers, cf) ?? {
    country: null,
    city: null,
    lat: null,
    lng: null,
  };

  let meta: ShortCodeMeta = EMPTY_META;
  let record: ShortCodeData | null = null;
  let prepared: PreparedScanViewerPayload | null = null;

  // A serialized card's QR carries only code + pid; its props are on the
  // physical card record. Read it beside the shortcode lookup, not after it.
  const physicalCardId = physicalCardIdNeedingProps(
    params.code,
    url.searchParams
  );
  const physicalCardPropsLookup = physicalCardId
    ? readPhysicalCardPropsWithin(
        () => getFirestoreRest(workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON),
        params.code,
        physicalCardId,
        LOOKUP_TIMEOUT_MS
      )
    : Promise.resolve(null);

  if (!isInlineEncoded(params.code)) {
    try {
      record = await fetchPublicShortCodeRecord(params.code, {
        projectId: PROJECT_ID,
        timeoutMs: LOOKUP_TIMEOUT_MS,
      });
      meta = deriveMeta(record);
    } catch (error) {
      // Non-fatal: the page still renders and the client resolver takes over.
      // But it must never be silent again — the empty catch that used to live
      // here hid a total, permanent attribution outage. console.error survives
      // the production build; console.log/debug/info are stripped (vite.config).
      console.error(
        `[q-ssr] shortcode lookup failed for "${params.code}":`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const physicalCardProps = await physicalCardPropsLookup;

  try {
    // Strongest first: the printed URL, then this card's record, then the
    // shared shortcode record (inside the preparer), then the sequence.
    prepared = await prepareScanViewerPayload(
      params.code,
      record,
      parsePropsFromURL(url.searchParams),
      physicalCardProps
    );
  } catch (error) {
    // Non-fatal: legacy/user-doc records retain the browser resolver. A broken
    // self-contained payload is visible in server logs instead of silently
    // regressing every scanner to a blank screen.
    console.error(
      `[q-ssr] scan payload preparation failed for "${params.code}":`,
      error instanceof Error ? error.message : error
    );
  }

  return {
    geo,
    meta,
    record: stripPreparedPayload(record, prepared),
    preparedSequence: prepared?.sequence ?? null,
    preparedPropConfig: prepared?.propConfig ?? null,
    physicalCardProps,
  };
};
