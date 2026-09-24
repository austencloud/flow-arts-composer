/**
 * Identity contract for serialized physical Choreo Card artwork.
 *
 * A physicalCardId identifies one distinct artwork slot emitted by a print
 * export. It does not claim that a printer produced exactly one piece of paper:
 * reprinting the same downloaded file necessarily reproduces the same ID.
 */

const PHYSICAL_CARD_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PRINT_RUN_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const PHYSICAL_CARD_ID_LENGTH = 12;
export const PRINT_RUN_ID_LENGTH = 20;
export const PHYSICAL_CARD_SCHEMA_VERSION = 1 as const;

const PHYSICAL_CARD_ID_PATTERN =
  /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/;
const PRINT_RUN_ID_PATTERN = /^[0-9A-Za-z]{20}$/;
const SHORT_CODE_PATTERN = /^[0-9A-Z]{4,6}$/;
// Codes minted today are uppercase base36, and only those go on new print
// runs. About 3,000 older shortcodes (13% on 2026-09-23, none on a deck card)
// use mixed case and still resolve on /q, so a scan of one is still a scan.
const SCANNABLE_SHORT_CODE_PATTERN = /^[0-9A-Za-z]{4,6}$/;
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PhysicalCardExportKind = "home-print-pdf" | "print-service-zip";
export type PhysicalCardOutputMode = "fronts" | "combined" | "zip";

export interface PhysicalCardIssueCard {
  cardIndex: number;
  shortCode: string;
  sequenceId: string | null;
  word: string;
  /** One-based position in this exported artwork set. Deck manifests may use a
   *  different authored order when print grouping is enabled. */
  printPosition: number;
}

export interface PhysicalCardIssueRequest {
  schemaVersion: typeof PHYSICAL_CARD_SCHEMA_VERSION;
  exportKind: PhysicalCardExportKind;
  outputMode: PhysicalCardOutputMode;
  deckId: string;
  deckName: string;
  deckReleaseNumber: number | null;
  cardSize: string;
  copies: number;
  groupByElement: boolean;
  cards: PhysicalCardIssueCard[];
}

export interface AllocatedPhysicalCard {
  physicalCardId: string;
  cardIndex: number;
  copyIndex: number;
  shortCode: string;
}

export interface PhysicalCardIssueResponse {
  schemaVersion: typeof PHYSICAL_CARD_SCHEMA_VERSION;
  printRunId: string;
  allocatedAt: string;
  instances: AllocatedPhysicalCard[];
}

export type PhysicalCardCompletionResult = "ready" | "failed";

export interface PhysicalCardCompletionRequest {
  schemaVersion: typeof PHYSICAL_CARD_SCHEMA_VERSION;
  printRunId: string;
  result: PhysicalCardCompletionResult;
}

export interface CardScanIngestRequest {
  schemaVersion: typeof PHYSICAL_CARD_SCHEMA_VERSION;
  shortCode: string;
  physicalCardId: string | null;
  deviceId: string;
}

export interface CardScanIngestResponse {
  recorded: boolean;
  duplicate: boolean;
  scanKind: "serialized" | "legacy";
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const MAX_ISSUE_CARDS = 250;
const MAX_COPIES = 100;
const MAX_PHYSICAL_IDENTITIES = 2_000;

function boundedString(
  value: unknown,
  field: string,
  maxLength: number,
  allowEmpty = false
): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const normalized = value.trim();
  if (!allowEmpty && normalized.length === 0) {
    return { ok: false, error: `${field} is required` };
  }
  if (normalized.length > maxLength) {
    return {
      ok: false,
      error: `${field} must be at most ${maxLength} characters`,
    };
  }
  return { ok: true, value: normalized };
}

export function validatePhysicalCardIssueRequest(
  input: unknown
): ValidationResult<PhysicalCardIssueRequest> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be an object" };
  }
  const body = input as Record<string, unknown>;
  if (body.schemaVersion !== PHYSICAL_CARD_SCHEMA_VERSION) {
    return { ok: false, error: "Unsupported physical-card schema version" };
  }
  if (
    body.exportKind !== "home-print-pdf" &&
    body.exportKind !== "print-service-zip"
  ) {
    return { ok: false, error: "Invalid export kind" };
  }
  if (
    body.outputMode !== "fronts" &&
    body.outputMode !== "combined" &&
    body.outputMode !== "zip"
  ) {
    return { ok: false, error: "Invalid output mode" };
  }
  if (
    (body.exportKind === "print-service-zip") !==
    (body.outputMode === "zip")
  ) {
    return { ok: false, error: "Export kind and output mode do not match" };
  }

  const deckId = boundedString(body.deckId, "deckId", 100);
  if (!deckId.ok) return deckId;
  const deckName = boundedString(body.deckName, "deckName", 160);
  if (!deckName.ok) return deckName;
  if (
    body.deckReleaseNumber !== null &&
    (!Number.isInteger(body.deckReleaseNumber) ||
      (body.deckReleaseNumber as number) <= 0)
  ) {
    return { ok: false, error: "deckReleaseNumber must be null or positive" };
  }
  if (body.cardSize !== "poker" && body.cardSize !== "tarot") {
    return { ok: false, error: "Invalid card size" };
  }
  if (
    !Number.isInteger(body.copies) ||
    (body.copies as number) < 1 ||
    (body.copies as number) > MAX_COPIES
  ) {
    return {
      ok: false,
      error: `copies must be an integer from 1 to ${MAX_COPIES}`,
    };
  }
  if (typeof body.groupByElement !== "boolean") {
    return { ok: false, error: "groupByElement must be boolean" };
  }
  if (
    !Array.isArray(body.cards) ||
    body.cards.length === 0 ||
    body.cards.length > MAX_ISSUE_CARDS
  ) {
    return {
      ok: false,
      error: `cards must contain 1 to ${MAX_ISSUE_CARDS} entries`,
    };
  }
  if (body.cards.length * (body.copies as number) > MAX_PHYSICAL_IDENTITIES) {
    return {
      ok: false,
      error: `A print run may allocate at most ${MAX_PHYSICAL_IDENTITIES} identities`,
    };
  }

  const cards: PhysicalCardIssueCard[] = [];
  const printPositions = new Set<number>();
  for (let index = 0; index < body.cards.length; index++) {
    const raw = body.cards[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `cards[${index}] must be an object` };
    }
    const card = raw as Record<string, unknown>;
    if (card.cardIndex !== index) {
      return {
        ok: false,
        error: `cards[${index}].cardIndex must match its array position`,
      };
    }
    if (!isShortCode(card.shortCode)) {
      return { ok: false, error: `cards[${index}].shortCode is invalid` };
    }
    const sequenceId =
      card.sequenceId === null
        ? { ok: true as const, value: null }
        : boundedString(card.sequenceId, `cards[${index}].sequenceId`, 160);
    if (!sequenceId.ok) return sequenceId;
    const word = boundedString(card.word, `cards[${index}].word`, 160);
    if (!word.ok) return word;
    if (
      !Number.isInteger(card.printPosition) ||
      (card.printPosition as number) < 1 ||
      (card.printPosition as number) > body.cards.length
    ) {
      return {
        ok: false,
        error: `cards[${index}].printPosition must be between 1 and ${body.cards.length}`,
      };
    }
    const printPosition = card.printPosition as number;
    if (printPositions.has(printPosition)) {
      return {
        ok: false,
        error: `cards[${index}].printPosition must be unique`,
      };
    }
    printPositions.add(printPosition);

    cards.push({
      cardIndex: index,
      shortCode: card.shortCode,
      sequenceId: sequenceId.value,
      word: word.value,
      printPosition,
    });
  }

  return {
    ok: true,
    value: {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      exportKind: body.exportKind,
      outputMode: body.outputMode,
      deckId: deckId.value,
      deckName: deckName.value,
      deckReleaseNumber: body.deckReleaseNumber as number | null,
      cardSize: body.cardSize,
      copies: body.copies as number,
      groupByElement: body.groupByElement,
      cards,
    },
  };
}

export function validateCardScanIngestRequest(
  input: unknown
): ValidationResult<CardScanIngestRequest> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be an object" };
  }
  const body = input as Record<string, unknown>;
  if (body.schemaVersion !== PHYSICAL_CARD_SCHEMA_VERSION) {
    return { ok: false, error: "Unsupported physical-card schema version" };
  }
  if (!isScannableShortCode(body.shortCode)) {
    return { ok: false, error: "Invalid short code" };
  }
  if (body.physicalCardId !== null && !isPhysicalCardId(body.physicalCardId)) {
    return { ok: false, error: "Invalid physical card ID" };
  }
  if (!isDeviceId(body.deviceId)) {
    return { ok: false, error: "Invalid device ID" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      shortCode: body.shortCode,
      physicalCardId: body.physicalCardId,
      deviceId: body.deviceId,
    },
  };
}

export function validatePhysicalCardCompletionRequest(
  input: unknown
): ValidationResult<PhysicalCardCompletionRequest> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be an object" };
  }
  const body = input as Record<string, unknown>;
  if (body.schemaVersion !== PHYSICAL_CARD_SCHEMA_VERSION) {
    return { ok: false, error: "Unsupported physical-card schema version" };
  }
  if (!isPrintRunId(body.printRunId)) {
    return { ok: false, error: "Invalid print run ID" };
  }
  if (body.result !== "ready" && body.result !== "failed") {
    return { ok: false, error: "Invalid print run result" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      printRunId: body.printRunId,
      result: body.result,
    },
  };
}

function randomId(
  length: number,
  alphabet: string,
  fillRandomValues: (bytes: Uint8Array) => Uint8Array
): string {
  // Rejection sampling avoids modulo bias because neither alphabet length
  // divides 256. IDs are public identifiers, but uniform allocation also keeps
  // collision probability predictable.
  const maxAccepted = Math.floor(256 / alphabet.length) * alphabet.length;
  let result = "";

  while (result.length < length) {
    const bytes = fillRandomValues(new Uint8Array(length - result.length + 8));
    for (const byte of bytes) {
      if (byte >= maxAccepted) continue;
      result += alphabet[byte % alphabet.length];
      if (result.length === length) break;
    }
  }

  return result;
}

function cryptoRandomValues(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

export function createPhysicalCardId(
  fillRandomValues: (bytes: Uint8Array) => Uint8Array = cryptoRandomValues
): string {
  return randomId(
    PHYSICAL_CARD_ID_LENGTH,
    PHYSICAL_CARD_ALPHABET,
    fillRandomValues
  );
}

export function createPrintRunId(
  fillRandomValues: (bytes: Uint8Array) => Uint8Array = cryptoRandomValues
): string {
  return randomId(PRINT_RUN_ID_LENGTH, PRINT_RUN_ALPHABET, fillRandomValues);
}

export function isPhysicalCardId(value: unknown): value is string {
  return typeof value === "string" && PHYSICAL_CARD_ID_PATTERN.test(value);
}

export function isPrintRunId(value: unknown): value is string {
  return typeof value === "string" && PRINT_RUN_ID_PATTERN.test(value);
}

export function isShortCode(value: unknown): value is string {
  return typeof value === "string" && SHORT_CODE_PATTERN.test(value);
}

/** Any existing shortcode a scan can carry, including legacy mixed-case ones. */
export function isScannableShortCode(value: unknown): value is string {
  return typeof value === "string" && SCANNABLE_SHORT_CODE_PATTERN.test(value);
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

export function withPhysicalCardId(
  shortUrl: string,
  physicalCardId: string
): string {
  if (!isPhysicalCardId(physicalCardId)) {
    throw new Error("Invalid physical card ID");
  }

  const url = new URL(shortUrl);
  url.searchParams.set("pid", physicalCardId);
  return url.toString();
}
