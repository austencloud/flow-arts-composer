import {
  fromFirestoreFields,
  type FirestoreFields,
} from "$lib/shared/firestore/firestore-value-codec";
import type { ShortCodeData } from "./types";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const DEFAULT_PROJECT_ID = "the-kinetic-alphabet";

// Complete resolver/attribution shape, excluding write-only counters such as
// dailyScans and lastScannedAt. `encoded` plus `sequenceData` are both retained:
// legacy blobs need the embedded data to restore fields their wire format did
// not preserve.
const RECORD_FIELD_PATHS = [
  "sequence",
  "sequenceId",
  "ownerId",
  "encoderHash",
  "createdAt",
  "createdBy",
  "scanCount",
  "sequenceName",
  "payloadWord",
  "payloadStepCount",
  "payloadSchemaVersion",
  "payloadKind",
  "payloadTitle",
  "payloadContentHash",
  "authoredHand",
  "sourceSoloPropId",
  "soloData",
  "sourceSequenceId",
  "sourceProjectionRevision",
  "sequenceData",
  "encoded",
  "encodedFidelity",
  "encodedLossReason",
  "payloadDigest",
  "deckId",
  "deckName",
  "leftPropType",
  "rightPropType",
  "bluePropType",
  "redPropType",
  "catDogMode",
  "thumbnailUrl",
  "ownerDisplayName",
] as const;

interface PublicShortCodeReadOptions {
  projectId?: string;
  timeoutMs?: number;
}

/**
 * Read one world-readable shortcode through Firestore's REST transport.
 *
 * This is the canonical server/native fallback when the browser Firestore SDK
 * has not established its transport. It deliberately returns null for unknown
 * or malformed public records and throws only for transport/server failures so
 * the caller can continue its broader fallback ladder.
 */
export async function fetchPublicShortCodeRecord(
  code: string,
  options: PublicShortCodeReadOptions = {}
): Promise<ShortCodeData | null> {
  const mask = RECORD_FIELD_PATHS.map(
    (path) => `mask.fieldPaths=${encodeURIComponent(path)}`
  ).join("&");
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID;
  const url =
    `${FIRESTORE_HOST}/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/shortcodes/${encodeURIComponent(code)}?${mask}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 2_500),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Firestore REST returned ${response.status} ${response.statusText}`
    );
  }

  const doc = (await response.json()) as { fields?: FirestoreFields };
  const decoded = fromFirestoreFields(doc.fields ?? {});

  return typeof decoded["sequence"] === "string"
    ? (decoded as unknown as ShortCodeData)
    : null;
}
