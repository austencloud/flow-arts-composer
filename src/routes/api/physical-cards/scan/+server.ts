import { json } from "@sveltejs/kit";
import type { RequestEvent, RequestHandler } from "./$types";
import { getOptionalFirebaseUser } from "$lib/server/auth/getOptionalFirebaseUser";
import { createScanEventId } from "$lib/server/physical-cards/scan-event-identity";
import {
  scanPreflightResponse,
  withScanCors,
} from "$lib/server/physical-cards/scan-cors";
import {
  FirestoreRestError,
  getFirestoreRest,
  hashPrivateValue,
  readFirestoreBoolean,
  readFirestoreInteger,
  readFirestoreString,
  toFirestoreFields,
  type FirestoreDocument,
  type FirestoreWrite,
} from "$lib/server/firestore/firestore-rest";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { parseCloudflareGeo } from "$lib/shared/presence/domain/models/presence-models";
import {
  PHYSICAL_CARD_SCHEMA_VERSION,
  validateCardScanIngestRequest,
  type CardScanIngestResponse,
} from "$lib/shared/qr/domain/physical-card";

const SHORTCODE_MASK = [
  "deckId",
  "deckName",
  "leftPropType",
  "rightPropType",
  "bluePropType",
  "redPropType",
  "catDogMode",
] as const;
const PHYSICAL_CARD_MASK = [
  "shortCode",
  "printRunId",
  "deckId",
  "deckName",
  "deckReleaseNumber",
  "sequenceId",
  "sequenceWord",
  "cardIndex",
  "copyIndex",
  "printPosition",
] as const;

function createScanEventWrite(
  name: string,
  data: Record<string, unknown>
): FirestoreWrite {
  return {
    update: {
      name,
      fields: toFirestoreFields(data),
    },
    updateTransforms: [
      {
        fieldPath: "timestamp",
        setToServerValue: "REQUEST_TIME",
      },
    ],
    currentDocument: { exists: false },
  };
}

function scanCounterTransform(
  document: string,
  dailyBucket: string | null
): FirestoreWrite {
  const fieldTransforms: Array<Record<string, unknown>> = [
    {
      fieldPath: "scanCount",
      increment: { integerValue: "1" },
    },
    {
      fieldPath: "lastScannedAt",
      setToServerValue: "REQUEST_TIME",
    },
  ];
  if (dailyBucket) {
    fieldTransforms.push({
      // Date keys contain hyphens, so the nested field segment must be quoted.
      fieldPath: `dailyScans.\`${dailyBucket}\``,
      increment: { integerValue: "1" },
    });
  }

  return {
    transform: {
      document,
      fieldTransforms,
    },
    currentDocument: { exists: true },
  };
}

function boundedCoordinate(
  value: number | null,
  minimum: number,
  maximum: number
): number | null {
  return value !== null &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function isAlreadyRecorded(error: unknown): boolean {
  return (
    error instanceof FirestoreRestError &&
    (error.status === 409 ||
      error.responseBody.includes("ALREADY_EXISTS") ||
      error.responseBody.includes("FAILED_PRECONDITION"))
  );
}

function invalidCard(message: string, code: string, status = 400): Response {
  return json({ error: message, code }, { status });
}

// The installed app posts from its own origin; see scan-cors.ts.
export const OPTIONS: RequestHandler = ({ request }) =>
  scanPreflightResponse(request);

export const POST: RequestHandler = async (event) =>
  withScanCors(event.request, await ingestScan(event));

async function ingestScan(event: RequestEvent): Promise<Response> {
  // Apply the coarse edge limit before parsing. Invalid JSON must not be a free
  // path around abuse controls.
  const ipBlocked = await withRateLimit(event, RATE_LIMITS.GENERAL, "ip");
  if (ipBlocked) return ipBlocked;

  let rawBody: unknown;
  try {
    rawBody = await event.request.json();
  } catch {
    return invalidCard("Invalid JSON body", "invalid_json");
  }
  const validation = validateCardScanIngestRequest(rawBody);
  if (!validation.ok) {
    return invalidCard(validation.error, "invalid_request");
  }
  const request = validation.value;

  // Device is the primary actor key. A high-ceiling IP guard is only the
  // secondary botnet brake, so a festival Wi-Fi NAT does not collapse every
  // legitimate scanner into the same tight quota.
  const deviceHash = await hashPrivateValue(request.deviceId);
  const deviceBlocked = await withRateLimit(
    event,
    RATE_LIMITS.CARD_SCAN,
    "key",
    deviceHash
  );
  if (deviceBlocked) return deviceBlocked;

  try {
    const firestore = getFirestoreRest(
      event.platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
    );
    const shortCodeDocument = await firestore.getDocument(
      `shortcodes/${request.shortCode}`,
      SHORTCODE_MASK
    );
    if (!shortCodeDocument) {
      return invalidCard(
        "This card code does not exist",
        "unknown_short_code",
        404
      );
    }

    let physicalCardDocument: FirestoreDocument | null = null;
    let printRunId: string | null = null;
    if (request.physicalCardId) {
      physicalCardDocument = await firestore.getDocument(
        `physicalCards/${request.physicalCardId}`,
        PHYSICAL_CARD_MASK
      );
      if (!physicalCardDocument) {
        return invalidCard(
          "This physical card identity does not exist",
          "unknown_physical_card",
          404
        );
      }
      if (
        readFirestoreString(physicalCardDocument, "shortCode") !==
        request.shortCode
      ) {
        return invalidCard(
          "This physical card identity does not belong to that code",
          "card_code_mismatch"
        );
      }

      printRunId = readFirestoreString(physicalCardDocument, "printRunId");
      if (!printRunId) {
        return invalidCard(
          "This physical card has no print run",
          "missing_print_run"
        );
      }
      const runDocument = await firestore.getDocument(
        `cardPrintRuns/${printRunId}`,
        ["status"]
      );
      if (
        !runDocument ||
        readFirestoreString(runDocument, "status") !== "ready"
      ) {
        return invalidCard(
          "This physical card export is incomplete",
          "card_not_ready",
          409
        );
      }
    }

    const cf = (event.platform as { cf?: Record<string, unknown> } | undefined)
      ?.cf;
    // Scan provenance trusts only Cloudflare's request metadata. Visitor
    // headers are excluded because a direct caller can forge them.
    const parsedGeo = cf ? parseCloudflareGeo(new Headers(), cf) : null;
    const country = parsedGeo?.country?.slice(0, 8) ?? null;
    const city = parsedGeo?.city?.slice(0, 120) ?? null;
    const lat = boundedCoordinate(parsedGeo?.lat ?? null, -90, 90);
    const lng = boundedCoordinate(parsedGeo?.lng ?? null, -180, 180);
    const scanKind = request.physicalCardId ? "serialized" : "legacy";
    const day = new Date().toISOString().slice(0, 10);
    const eventId = await createScanEventId({
      shortCode: request.shortCode,
      physicalCardId: request.physicalCardId,
      deviceHash,
      day,
      city,
      country,
    });
    const scanner = await getOptionalFirebaseUser(event);
    const source = physicalCardDocument ?? shortCodeDocument;

    const eventName = firestore.documentName(
      `shortcodes/${request.shortCode}/scanEvents/${eventId}`
    );
    const writes: FirestoreWrite[] = [
      createScanEventWrite(eventName, {
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        scanKind,
        shortCode: request.shortCode,
        printId: request.physicalCardId,
        physicalCardId: request.physicalCardId,
        printRunId,
        country,
        city,
        lat,
        lng,
        locationPrecision: city ? "city" : country ? "country" : "unknown",
        deviceHash,
        userId: scanner?.uid ?? null,
        deckId:
          readFirestoreString(source, "deckId") ??
          readFirestoreString(shortCodeDocument, "deckId"),
        deckName:
          readFirestoreString(source, "deckName") ??
          readFirestoreString(shortCodeDocument, "deckName"),
        deckReleaseNumber: physicalCardDocument
          ? readFirestoreInteger(physicalCardDocument, "deckReleaseNumber")
          : null,
        sequenceId: physicalCardDocument
          ? readFirestoreString(physicalCardDocument, "sequenceId")
          : null,
        sequenceWord: physicalCardDocument
          ? readFirestoreString(physicalCardDocument, "sequenceWord")
          : null,
        cardIndex: physicalCardDocument
          ? readFirestoreInteger(physicalCardDocument, "cardIndex")
          : null,
        copyIndex: physicalCardDocument
          ? readFirestoreInteger(physicalCardDocument, "copyIndex")
          : null,
        printPosition: physicalCardDocument
          ? readFirestoreInteger(physicalCardDocument, "printPosition")
          : null,
        leftPropType:
          readFirestoreString(shortCodeDocument, "leftPropType") ??
          readFirestoreString(shortCodeDocument, "bluePropType"),
        rightPropType:
          readFirestoreString(shortCodeDocument, "rightPropType") ??
          readFirestoreString(shortCodeDocument, "redPropType"),
        catDogMode: readFirestoreBoolean(shortCodeDocument, "catDogMode"),
      }),
      scanCounterTransform(
        firestore.documentName(`shortcodes/${request.shortCode}`),
        day
      ),
    ];
    if (request.physicalCardId) {
      writes.push(
        scanCounterTransform(
          firestore.documentName(`physicalCards/${request.physicalCardId}`),
          null
        )
      );
    }

    try {
      await firestore.commit(writes);
    } catch (error) {
      if (isAlreadyRecorded(error)) {
        const duplicateResponse: CardScanIngestResponse = {
          recorded: false,
          duplicate: true,
          scanKind,
        };
        return json(duplicateResponse);
      }
      throw error;
    }

    const response: CardScanIngestResponse = {
      recorded: true,
      duplicate: false,
      scanKind,
    };
    return json(response, { status: 201 });
  } catch (error) {
    console.error("[physical-card-scan] ingest failed:", error);
    return json(
      {
        error: "The scan could not be recorded",
        code: "scan_ingest_failed",
      },
      { status: 500 }
    );
  }
}
