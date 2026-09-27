import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireFullFirebaseUser } from "$lib/server/auth/requireFullFirebaseUser";
import {
  getFirestoreRest,
  readFirestoreInteger,
  readFirestoreString,
  toFirestoreFields,
  type FirestoreDocument,
  type FirestoreWrite,
} from "$lib/server/firestore/firestore-rest";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { getDeckReleaseManifestPath } from "$lib/shared/library/data/firestore-paths";
import {
  createPhysicalCardId,
  createPrintRunId,
  PHYSICAL_CARD_SCHEMA_VERSION,
  validatePhysicalCardIssueRequest,
  type AllocatedPhysicalCard,
  type PhysicalCardIssueCard,
  type PhysicalCardIssueResponse,
} from "$lib/shared/qr/domain/physical-card";

const MAX_REQUEST_BYTES = 256_000;
const MAX_COMMIT_WRITES = 450;
const SHORTCODE_MASK = [
  "payloadTitle",
  "payloadWord",
  "sequenceName",
  "sequence",
  "sourceSequenceId",
  "sequenceId",
] as const;

type ResolvedIssueCard = PhysicalCardIssueCard;

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const lane = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => lane())
  );
  return results;
}

function createDocumentWrite(
  name: string,
  data: Record<string, unknown>
): FirestoreWrite {
  return {
    update: {
      name,
      fields: toFirestoreFields(data),
    },
    currentDocument: { exists: false },
  };
}

function updateDocumentWrite(
  name: string,
  data: Record<string, unknown>
): FirestoreWrite {
  return {
    update: {
      name,
      fields: toFirestoreFields(data),
    },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { exists: true },
  };
}

function responseForError(error: unknown): Response {
  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : status === 500
        ? "issuance_failed"
        : "request_rejected";
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "Could not allocate physical card identities";

  if (status >= 500) {
    console.error("[physical-card-issue] failed:", error);
  }
  return json({ error: message, code }, { status });
}

export const POST: RequestHandler = async (event) => {
  try {
    const caller = await requireFullFirebaseUser(event);
    const blocked = await withRateLimit(
      event,
      RATE_LIMITS.CARD_ISSUE,
      "user",
      caller.uid
    );
    if (blocked) return blocked;

    const contentLength = Number(
      event.request.headers.get("content-length") ?? 0
    );
    if (contentLength > MAX_REQUEST_BYTES) {
      return json(
        { error: "Issuance request is too large", code: "request_too_large" },
        { status: 413 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await event.request.json();
    } catch {
      return json(
        { error: "Invalid JSON body", code: "invalid_json" },
        { status: 400 }
      );
    }
    const validation = validatePhysicalCardIssueRequest(rawBody);
    if (!validation.ok) {
      return json(
        { error: validation.error, code: "invalid_request" },
        { status: 400 }
      );
    }
    const request = validation.value;
    if (request.outputMode === "zip" && request.copies !== 1) {
      return json(
        {
          error: "Print-service ZIP runs allocate one artwork slot per card",
          code: "invalid_request",
        },
        { status: 400 }
      );
    }

    const firestore = getFirestoreRest(
      event.platform?.env?.FIREBASE_SERVICE_ACCOUNT_JSON
    );
    const codeDocuments = new Map<string, FirestoreDocument>();
    const uniqueCodes = [
      ...new Set(request.cards.map((card) => card.shortCode)),
    ];
    await mapWithConcurrency(uniqueCodes, 12, async (shortCode) => {
      const document = await firestore.getDocument(
        `shortcodes/${shortCode}`,
        SHORTCODE_MASK
      );
      if (!document) {
        throw Object.assign(
          new Error(`Short code ${shortCode} does not exist`),
          { status: 400, code: "unknown_short_code" }
        );
      }
      codeDocuments.set(shortCode, document);
    });

    const resolvedCards: ResolvedIssueCard[] = request.cards.map((card) => {
      const document = codeDocuments.get(card.shortCode)!;
      return {
        ...card,
        // The shortcode payload is authoritative when it carries provenance.
        // Request values remain the compatibility fallback for legacy codes.
        sequenceId:
          readFirestoreString(document, "sourceSequenceId") ??
          readFirestoreString(document, "sequenceId") ??
          card.sequenceId,
        word:
          readFirestoreString(document, "payloadTitle") ??
          readFirestoreString(document, "payloadWord") ??
          readFirestoreString(document, "sequenceName") ??
          readFirestoreString(document, "sequence") ??
          card.word,
      };
    });

    let deckId = request.deckId;
    let deckName = request.deckName;
    let deckProvenance: "export-claim" | "verified-release-reference" =
      "export-claim";
    if (request.deckReleaseNumber !== null) {
      const releaseDocument = await firestore.getDocument(
        getDeckReleaseManifestPath(request.deckReleaseNumber),
        ["deckNumber", "name", "cardCount"]
      );
      if (!releaseDocument) {
        throw Object.assign(
          new Error("Released deck manifest does not exist"),
          {
            status: 400,
            code: "unknown_deck_release",
          }
        );
      }
      if (
        readFirestoreInteger(releaseDocument, "deckNumber") !==
          request.deckReleaseNumber ||
        readFirestoreInteger(releaseDocument, "cardCount") !==
          request.cards.length
      ) {
        throw Object.assign(
          new Error("Export does not match the released deck manifest"),
          { status: 400, code: "deck_release_mismatch" }
        );
      }

      deckId = `release:${request.deckReleaseNumber}`;
      deckName =
        readFirestoreString(releaseDocument, "name") ?? request.deckName;
      deckProvenance = "verified-release-reference";
    }

    const printRunId = createPrintRunId();
    const allocatedAt = new Date();
    const physicalIds = new Set<string>();
    const instances: AllocatedPhysicalCard[] = [];
    for (const card of resolvedCards) {
      for (let copyIndex = 0; copyIndex < request.copies; copyIndex++) {
        let physicalCardId = createPhysicalCardId();
        while (physicalIds.has(physicalCardId)) {
          physicalCardId = createPhysicalCardId();
        }
        physicalIds.add(physicalCardId);
        instances.push({
          physicalCardId,
          cardIndex: card.cardIndex,
          copyIndex,
          shortCode: card.shortCode,
        });
      }
    }

    const runName = firestore.documentName(`cardPrintRuns/${printRunId}`);
    const writes: FirestoreWrite[] = [
      createDocumentWrite(runName, {
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        status: "allocating",
        issuanceEra: "serialized-v1",
        identitySemantics: "serialized-artwork-slot",
        createdAt: allocatedAt,
        allocatedAt: null,
        completedAt: null,
        allocatedByUserId: caller.uid,
        exportKind: request.exportKind,
        outputMode: request.outputMode,
        cardSize: request.cardSize,
        requestedCopies: request.copies,
        sourceCardCount: request.cards.length,
        identityCount: instances.length,
        groupByElement: request.groupByElement,
        deckId,
        deckName,
        deckReleaseNumber: request.deckReleaseNumber,
        deckProvenance,
        // These are intentionally explicit unknowns. A fulfillment or event
        // integration can enrich them without changing identity semantics.
        originEventId: null,
        orderId: null,
        recipientUserId: null,
      }),
    ];

    for (const instance of instances) {
      const card = resolvedCards[instance.cardIndex]!;
      writes.push(
        createDocumentWrite(
          firestore.documentName(`physicalCards/${instance.physicalCardId}`),
          {
            schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
            issuanceEra: "serialized-v1",
            identitySemantics: "serialized-artwork-slot",
            allocatedAt,
            allocatedByUserId: caller.uid,
            printRunId,
            physicalCardId: instance.physicalCardId,
            shortCode: instance.shortCode,
            cardIndex: instance.cardIndex,
            copyIndex: instance.copyIndex,
            printPosition: card.printPosition,
            sequenceId: card.sequenceId,
            sequenceWord: card.word,
            // The printed QR carries only code and pid; a scan reads the
            // card's props from here. URL bp/rp on older cards still win.
            leftPropType: card.leftPropType,
            rightPropType: card.rightPropType,
            deckId,
            deckName,
            deckReleaseNumber: request.deckReleaseNumber,
            deckProvenance,
            exportKind: request.exportKind,
            outputMode: request.outputMode,
            originEventId: null,
            orderId: null,
            recipientUserId: null,
            scanCount: 0,
            lastScannedAt: null,
          }
        )
      );
    }

    let runCreated = false;
    try {
      for (let start = 0; start < writes.length; start += MAX_COMMIT_WRITES) {
        await firestore.commit(writes.slice(start, start + MAX_COMMIT_WRITES));
        if (start === 0) runCreated = true;
      }
      await firestore.commit([
        updateDocumentWrite(runName, {
          status: "allocated",
          allocatedAt,
        }),
      ]);
    } catch (error) {
      if (runCreated) {
        await firestore
          .commit([
            updateDocumentWrite(runName, {
              status: "failed",
              completedAt: new Date(),
            }),
          ])
          .catch((statusError) => {
            console.error(
              `[physical-card-issue] could not mark run ${printRunId} failed:`,
              statusError
            );
          });
      }
      throw error;
    }

    const response: PhysicalCardIssueResponse = {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      printRunId,
      allocatedAt: allocatedAt.toISOString(),
      instances,
    };
    return json(response, { status: 201 });
  } catch (error) {
    return responseForError(error);
  }
};
