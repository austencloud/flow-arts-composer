import { describe, expect, it } from "vitest";
import {
  createPhysicalCardId,
  createPrintRunId,
  isDeviceId,
  isPhysicalCardId,
  isPrintRunId,
  isShortCode,
  PHYSICAL_CARD_ID_LENGTH,
  PRINT_RUN_ID_LENGTH,
  PHYSICAL_CARD_SCHEMA_VERSION,
  validateCardScanIngestRequest,
  validatePhysicalCardCompletionRequest,
  validatePhysicalCardIssueRequest,
  withPhysicalCardId,
} from "./physical-card";

function deterministicBytes(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < bytes.length; i++) bytes[i] = i;
  return bytes;
}

describe("physical card identity", () => {
  it("mints compact IDs from the URL-safe unambiguous alphabet", () => {
    const physicalCardId = createPhysicalCardId(deterministicBytes);
    const printRunId = createPrintRunId(deterministicBytes);

    expect(physicalCardId).toHaveLength(PHYSICAL_CARD_ID_LENGTH);
    expect(printRunId).toHaveLength(PRINT_RUN_ID_LENGTH);
    expect(isPhysicalCardId(physicalCardId)).toBe(true);
    expect(isPrintRunId(printRunId)).toBe(true);
    expect(/[0O1Il]/.test(physicalCardId)).toBe(false);
  });

  it("rejects malformed physical, shortcode, and device identities", () => {
    expect(isPhysicalCardId("too-short")).toBe(false);
    expect(isPhysicalCardId("000000000000")).toBe(false);
    expect(isShortCode("AB12")).toBe(true);
    expect(isShortCode("ab12")).toBe(false);
    expect(isShortCode("AB12345")).toBe(false);
    expect(isDeviceId("79312e84-8b18-4a43-bf8f-9cddc7816cf5")).toBe(true);
    expect(isDeviceId("browser-1")).toBe(false);
  });

  it("adds pid without losing prop or view parameters", () => {
    const physicalCardId = createPhysicalCardId(deterministicBytes);
    const result = new URL(
      withPhysicalCardId(
        "https://tka.run/q/AB12?bp=P&rp=S&vm=hsb",
        physicalCardId
      )
    );

    expect(result.pathname).toBe("/q/AB12");
    expect(result.searchParams.get("bp")).toBe("P");
    expect(result.searchParams.get("rp")).toBe("S");
    expect(result.searchParams.get("vm")).toBe("hsb");
    expect(result.searchParams.get("pid")).toBe(physicalCardId);
  });

  it("validates a bounded, index-stable issuance request", () => {
    const result = validatePhysicalCardIssueRequest({
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      exportKind: "home-print-pdf",
      outputMode: "fronts",
      deckId: "deck-7",
      deckName: "Deck #007",
      deckReleaseNumber: 7,
      cardSize: "poker",
      copies: 9,
      groupByElement: true,
      cards: [
        {
          cardIndex: 0,
          shortCode: "AB12",
          sequenceId: "sequence-1",
          word: "ABCD",
          printPosition: 1,
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects mismatched output semantics and spoofed card indexes", () => {
    const base = {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      exportKind: "home-print-pdf",
      outputMode: "zip",
      deckId: "deck-7",
      deckName: "Deck #007",
      deckReleaseNumber: null,
      cardSize: "poker",
      copies: 1,
      groupByElement: false,
      cards: [
        {
          cardIndex: 4,
          shortCode: "AB12",
          sequenceId: null,
          word: "ABCD",
          printPosition: 1,
        },
      ],
    };

    expect(validatePhysicalCardIssueRequest(base)).toEqual({
      ok: false,
      error: "Export kind and output mode do not match",
    });
    expect(
      validatePhysicalCardIssueRequest({
        ...base,
        outputMode: "fronts",
      })
    ).toEqual({
      ok: false,
      error: "cards[0].cardIndex must match its array position",
    });
  });

  it("requires print positions to form a unique bounded set", () => {
    const base = {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      exportKind: "home-print-pdf",
      outputMode: "fronts",
      deckId: "deck-7",
      deckName: "Deck #007",
      deckReleaseNumber: null,
      cardSize: "poker",
      copies: 1,
      groupByElement: false,
      cards: [
        {
          cardIndex: 0,
          shortCode: "AB12",
          sequenceId: null,
          word: "ABCD",
          printPosition: 1,
        },
        {
          cardIndex: 1,
          shortCode: "CD34",
          sequenceId: null,
          word: "EFGH",
          printPosition: 1,
        },
      ],
    };

    expect(validatePhysicalCardIssueRequest(base)).toEqual({
      ok: false,
      error: "cards[1].printPosition must be unique",
    });
    expect(
      validatePhysicalCardIssueRequest({
        ...base,
        cards: [base.cards[0], { ...base.cards[1], printPosition: 3 }],
      })
    ).toEqual({
      ok: false,
      error: "cards[1].printPosition must be between 1 and 2",
    });
  });

  it("accepts legacy scans without pid and rejects malformed device IDs", () => {
    expect(
      validateCardScanIngestRequest({
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        shortCode: "AB12",
        physicalCardId: null,
        deviceId: "79312e84-8b18-4a43-bf8f-9cddc7816cf5",
      }).ok
    ).toBe(true);

    expect(
      validateCardScanIngestRequest({
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        shortCode: "AB12",
        physicalCardId: null,
        deviceId: "fake-device",
      }).ok
    ).toBe(false);
  });

  it("accepts a scan of a legacy mixed-case shortcode but never mints one", () => {
    // Shape of the ~3,000 pre-uppercase codes still in `shortcodes`.
    const legacyScan = {
      schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
      shortCode: "07JPcN",
      physicalCardId: null,
      deviceId: "79312e84-8b18-4a43-bf8f-9cddc7816cf5",
    };

    expect(validateCardScanIngestRequest(legacyScan)).toEqual({
      ok: true,
      value: legacyScan,
    });
    expect(isShortCode("07JPcN")).toBe(false);
    expect(
      validateCardScanIngestRequest({ ...legacyScan, shortCode: "07JP/N" }).ok
    ).toBe(false);
    expect(
      validateCardScanIngestRequest({ ...legacyScan, shortCode: "07JPcNX" }).ok
    ).toBe(false);
  });

  it("validates terminal print-run results without accepting invented states", () => {
    const printRunId = createPrintRunId(deterministicBytes);
    expect(
      validatePhysicalCardCompletionRequest({
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        printRunId,
        result: "ready",
      })
    ).toEqual({
      ok: true,
      value: {
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        printRunId,
        result: "ready",
      },
    });
    expect(
      validatePhysicalCardCompletionRequest({
        schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
        printRunId,
        result: "issued",
      })
    ).toEqual({
      ok: false,
      error: "Invalid print run result",
    });
  });
});
