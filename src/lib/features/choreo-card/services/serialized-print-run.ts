import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
import { getQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";
import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
import {
  PHYSICAL_CARD_ID_LENGTH,
  PHYSICAL_CARD_SCHEMA_VERSION,
  buildSerializedCardUrl,
  isPhysicalCardId,
  isPrintRunId,
  type AllocatedPhysicalCard,
  type PhysicalCardCompletionResult,
  type PhysicalCardIssueRequest,
  type PhysicalCardIssueResponse,
  type PhysicalCardOutputMode,
} from "#lib/shared/qr/domain/physical-card.js";
import type { CardSizeId } from "../domain/card-sizes";
import type { CardPair } from "./types";
import {
  getSerializedQrPlacement,
  renderSerializedCardFront,
  type SerializedQrPlacement,
} from "./serialized-card-front";
import {
  PRINT_SERVICE_PIXELS_PER_INCH,
  assertPlannedQrFits,
  homePrintPixelsPerInch,
  verifyPrintedQr,
} from "./print-qr-guard";

export interface PrepareSerializedPrintRunOptions {
  pairs: CardPair[];
  deckId: string;
  deckName: string;
  deckReleaseNumber: number | null;
  cardSize: CardSizeId;
  copies: number;
  groupByElement: boolean;
  outputMode: PhysicalCardOutputMode;
}

export interface PreparedSerializedPrintRun {
  printRunId: string;
  allocatedAt: string;
  complete(): Promise<void>;
  fail(): Promise<void>;
  renderFront(
    pair: CardPair,
    cardIndex: number,
    copyIndex: number
  ): Promise<HTMLCanvasElement>;
}


async function parseErrorResponse(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Fall through to a stable message when a proxy returned non-JSON.
  }
  return `${fallback} (${response.status})`;
}

function assertIssueResponse(
  value: unknown,
  expectedCount: number
): PhysicalCardIssueResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Physical-card issuance returned an invalid response");
  }
  const body = value as Partial<PhysicalCardIssueResponse>;
  if (
    body.schemaVersion !== PHYSICAL_CARD_SCHEMA_VERSION ||
    !isPrintRunId(body.printRunId) ||
    typeof body.allocatedAt !== "string" ||
    Number.isNaN(Date.parse(body.allocatedAt)) ||
    !Array.isArray(body.instances) ||
    body.instances.length !== expectedCount
  ) {
    throw new Error(
      "Physical-card issuance response did not match the request"
    );
  }

  for (const instance of body.instances) {
    if (
      !instance ||
      !isPhysicalCardId(instance.physicalCardId) ||
      !Number.isInteger(instance.cardIndex) ||
      !Number.isInteger(instance.copyIndex) ||
      typeof instance.shortCode !== "string"
    ) {
      throw new Error("Physical-card issuance returned a malformed identity");
    }
  }
  return body as PhysicalCardIssueResponse;
}

export async function finalizePhysicalCardPrintRun(
  printRunId: string,
  result: PhysicalCardCompletionResult
): Promise<void> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      printRunId,
      result,
    }),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await authedFetch("/api/physical-cards/complete", init);
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
    if (!response.ok) {
      if (attempt === 0 && response.status >= 500) {
        continue;
      }
      throw new Error(
        await parseErrorResponse(response, "Physical-card finalization failed")
      );
    }

    let body: { status?: unknown };
    try {
      body = (await response.json()) as { status?: unknown };
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
    if (body.status !== result) {
      throw new Error(
        "Physical-card finalization returned an invalid response"
      );
    }
    return;
  }
}

export function createPhysicalCardPrintRunFinalizer(
  printRunId: string,
  sendResult: (
    printRunId: string,
    result: PhysicalCardCompletionResult
  ) => Promise<void> = finalizePhysicalCardPrintRun
): Pick<PreparedSerializedPrintRun, "complete" | "fail"> {
  let finalization:
    | {
        result: PhysicalCardCompletionResult;
        promise: Promise<void>;
      }
    | undefined;

  async function finalize(result: PhysicalCardCompletionResult): Promise<void> {
    if (finalization) {
      if (finalization.result !== result) {
        throw new Error(
          `Print run is already finalized as ${finalization.result}`
        );
      }
      return finalization.promise;
    }

    const promise = sendResult(printRunId, result);
    finalization = { result, promise };
    try {
      await promise;
    } catch (error) {
      if (finalization?.promise === promise) {
        finalization = undefined;
      }
      throw error;
    }
  }

  return {
    complete: () => finalize("ready"),
    fail: () => finalize("failed"),
  };
}

function instanceKey(cardIndex: number, copyIndex: number): string {
  return `${cardIndex}:${copyIndex}`;
}

/**
 * Stand-in physical ID for sizing a QR before identities exist. Every issued
 * ID has this length, so the serialized payload has the same byte length and
 * therefore the same QR version.
 */
const PLACEHOLDER_PHYSICAL_CARD_ID = "2".repeat(PHYSICAL_CARD_ID_LENGTH);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function prepareSerializedPrintRun(
  options: PrepareSerializedPrintRunOptions
): Promise<PreparedSerializedPrintRun> {
  if (options.pairs.length === 0) {
    throw new Error("Cannot allocate an empty print run");
  }
  const copies = Math.max(1, Math.floor(options.copies));
  if (options.outputMode === "zip" && copies !== 1) {
    throw new Error("Print-service ZIP runs require exactly one artwork copy");
  }

  const shortCodeManager = getShortCodeManager();
  // The printed URL carries only the code and the physical ID. The props still
  // go to the shortcode so a newly minted code records them, but the scan reads
  // this card's props from its physical-card record.
  const shortCodes: string[] = await Promise.all(
    options.pairs.map(async (pair) => {
      const meta = pair.renderMeta;
      if (!meta) {
        throw new Error(
          `Card "${pair.label}" is missing its print render provenance`
        );
      }
      const leftPropType = meta.options.leftPropType;
      const rightPropType = meta.options.rightPropType;
      const result = await shortCodeManager.createShortCode(meta.sequence, {
        leftPropType,
        rightPropType,
        catDogMode:
          leftPropType && rightPropType
            ? leftPropType !== rightPropType
            : undefined,
        deckId: options.deckId,
        deckName: options.deckName,
      });
      return result.code;
    })
  );

  // Refuse the run before any physical identity is issued when a card's QR
  // cell is too small to print a scannable serialized code.
  const pixelsPerInchFor = (front: HTMLCanvasElement): number =>
    options.outputMode === "zip"
      ? PRINT_SERVICE_PIXELS_PER_INCH
      : homePrintPixelsPerInch(front, options.cardSize);
  const placements: SerializedQrPlacement[] = options.pairs.map(
    (pair, cardIndex) => {
      const meta = pair.renderMeta!;
      const placement = getSerializedQrPlacement(meta.sequence, meta.options);
      if (!placement) {
        throw new Error(`Card "${pair.label}" has no QR cell to serialize`);
      }
      assertPlannedQrFits(
        pair.label,
        buildSerializedCardUrl(
          shortCodes[cardIndex]!,
          PLACEHOLDER_PHYSICAL_CARD_ID
        ),
        placement.size,
        pixelsPerInchFor(pair.front)
      );
      return placement;
    }
  );

  const request: PhysicalCardIssueRequest = {
    schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
    exportKind:
      options.outputMode === "zip" ? "print-service-zip" : "home-print-pdf",
    outputMode: options.outputMode,
    deckId: options.deckId,
    deckName: options.deckName,
    deckReleaseNumber: options.deckReleaseNumber,
    cardSize: options.cardSize,
    copies,
    groupByElement: options.groupByElement,
    cards: options.pairs.map((pair, cardIndex) => {
      const { sequence, options: renderOptions } = pair.renderMeta!;
      return {
        cardIndex,
        shortCode: shortCodes[cardIndex]!,
        sequenceId: sequence.id ?? null,
        word: sequence.word ?? sequence.name ?? pair.label,
        printPosition: cardIndex + 1,
        leftPropType: renderOptions.leftPropType ?? null,
        rightPropType: renderOptions.rightPropType ?? null,
      };
    }),
  };

  const response = await authedFetch("/api/physical-cards/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(response, "Physical-card issuance failed")
    );
  }
  const issuance = assertIssueResponse(
    await response.json(),
    options.pairs.length * copies
  );

  const instances = new Map<string, AllocatedPhysicalCard>();
  for (const instance of issuance.instances) {
    if (
      instance.cardIndex < 0 ||
      instance.cardIndex >= options.pairs.length ||
      instance.copyIndex < 0 ||
      instance.copyIndex >= copies ||
      instance.shortCode !== shortCodes[instance.cardIndex]
    ) {
      throw new Error("Physical-card issuance returned an unknown print slot");
    }
    const key = instanceKey(instance.cardIndex, instance.copyIndex);
    if (instances.has(key)) {
      throw new Error("Physical-card issuance returned a duplicate print slot");
    }
    instances.set(key, instance);
  }

  const qrGenerator = getQRCodeGenerator();
  const finalizer = createPhysicalCardPrintRunFinalizer(issuance.printRunId);

  return {
    printRunId: issuance.printRunId,
    allocatedAt: issuance.allocatedAt,
    ...finalizer,
    async renderFront(pair, cardIndex, copyIndex) {
      const meta = pair.renderMeta;
      if (!meta) {
        throw new Error(`Card "${pair.label}" has no render provenance`);
      }
      const instance = instances.get(instanceKey(cardIndex, copyIndex));
      if (!instance) {
        throw new Error(
          `No physical identity was allocated for card ${cardIndex + 1}, copy ${copyIndex + 1}`
        );
      }
      const serializedUrl = buildSerializedCardUrl(
        shortCodes[cardIndex]!,
        instance.physicalCardId
      );
      let front: HTMLCanvasElement;
      try {
        front = await renderSerializedCardFront(
          pair.front,
          meta.sequence,
          meta.options,
          serializedUrl,
          qrGenerator
        );
      } catch (error) {
        throw new Error(
          `Card "${pair.label}": its QR code failed to render (${errorMessage(error)})`
        );
      }
      await verifyPrintedQr(front, {
        label: pair.label,
        placement: placements[cardIndex]!,
        pixelsPerInch: pixelsPerInchFor(front),
        expectedPayload: serializedUrl,
      });
      return front;
    },
  };
}
