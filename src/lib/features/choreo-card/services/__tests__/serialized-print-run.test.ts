import { beforeEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
import { PHYSICAL_CARD_SCHEMA_VERSION } from "#lib/shared/qr/domain/physical-card.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type * as PrintQrGuard from "../print-qr-guard";
import { PrintedQrError, verifyPrintedQr } from "../print-qr-guard";
import {
  getSerializedQrPlacement,
  renderSerializedCardFront,
} from "../serialized-card-front";
import {
  createPhysicalCardPrintRunFinalizer,
  finalizePhysicalCardPrintRun,
  prepareSerializedPrintRun,
} from "../serialized-print-run";
import type { CardPair } from "../types";

vi.mock("#lib/shared/auth/services/authed-fetch.js", () => ({
  authedFetch: vi.fn(),
}));
vi.mock("#lib/shared/qr/get-qr-code-generator.js", () => ({
  getQRCodeGenerator: vi.fn(),
}));
vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: vi.fn(),
}));
vi.mock("../print-qr-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof PrintQrGuard>()),
  verifyPrintedQr: vi.fn(),
}));
vi.mock("../serialized-card-front", () => ({
  getSerializedQrPlacement: vi.fn(),
  renderSerializedCardFront: vi.fn(),
}));

const PRINT_RUN_ID = "0123456789ABCDEFGHIJ";

describe("physical card print-run finalization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("posts the ready result through the authenticated boundary", async () => {
    vi.mocked(authedFetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "ready" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await finalizePhysicalCardPrintRun(PRINT_RUN_ID, "ready");

    expect(authedFetch).toHaveBeenCalledOnce();
    expect(authedFetch).toHaveBeenCalledWith(
      "/api/physical-cards/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
          printRunId: PRINT_RUN_ID,
          result: "ready",
        }),
      })
    );
  });

  it("coalesces matching calls and rejects a contradictory terminal result", async () => {
    const sendResult = vi.fn().mockResolvedValue(undefined);
    const finalizer = createPhysicalCardPrintRunFinalizer(
      PRINT_RUN_ID,
      sendResult
    );

    await Promise.all([finalizer.complete(), finalizer.complete()]);
    await expect(finalizer.fail()).rejects.toThrow(
      "Print run is already finalized as ready"
    );
    expect(sendResult).toHaveBeenCalledOnce();
    expect(sendResult).toHaveBeenCalledWith(PRINT_RUN_ID, "ready");
  });

  it("retries completion when the first response is lost", async () => {
    vi.mocked(authedFetch)
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ready" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    await expect(
      finalizePhysicalCardPrintRun(PRINT_RUN_ID, "ready")
    ).resolves.toBeUndefined();
    expect(authedFetch).toHaveBeenCalledTimes(2);
  });

  it("allows the same result to retry after a transport failure", async () => {
    const sendResult = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(undefined);
    const finalizer = createPhysicalCardPrintRunFinalizer(
      PRINT_RUN_ID,
      sendResult
    );

    await expect(finalizer.complete()).rejects.toThrow("network unavailable");
    await expect(finalizer.complete()).resolves.toBeUndefined();
    expect(sendResult).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful HTTP response with the wrong state", async () => {
    vi.mocked(authedFetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      finalizePhysicalCardPrintRun(PRINT_RUN_ID, "ready")
    ).rejects.toThrow(
      "Physical-card finalization returned an invalid response"
    );
  });
});

describe("physical card print-run QR preflight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("refuses a card whose QR cell is too small before issuing identities", async () => {
    vi.mocked(getShortCodeManager).mockReturnValue({
      createShortCode: vi.fn().mockResolvedValue({
        code: "K7QM",
        url: "https://tka.run/K7QM?bp=staff&rp=staff",
      }),
    } as unknown as ReturnType<typeof getShortCodeManager>);
    // The eight-step catalog column leaves a 121 px QR slot.
    vi.mocked(getSerializedQrPlacement).mockReturnValue({
      x: 600,
      y: 600,
      size: 121,
    });
    const pair: CardPair = {
      front: { width: 822, height: 1122 } as HTMLCanvasElement,
      back: { width: 1644, height: 2244 } as HTMLCanvasElement,
      label: "ABCDEFGH",
      renderMeta: {
        sequence: { id: "eight", word: "ABCDEFGH" } as SequenceData,
        options: { includeStartPlacement: true },
      },
    };

    const run = prepareSerializedPrintRun({
      pairs: [pair],
      deckId: "deck-1",
      deckName: "Deck 001",
      deckReleaseNumber: 1,
      cardSize: "poker",
      copies: 1,
      groupByElement: false,
      outputMode: "zip",
    });

    await expect(run).rejects.toBeInstanceOf(PrintedQrError);
    await expect(run).rejects.toThrow(
      'Card "ABCDEFGH": its QR code would print'
    );
    expect(authedFetch).not.toHaveBeenCalled();
  });
});

describe("physical card print-run identity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("records the card's props at issue and prints only the code and ID", async () => {
    const physicalCardId = "k7Qm2XpR9aBc";
    vi.mocked(getShortCodeManager).mockReturnValue({
      createShortCode: vi.fn().mockResolvedValue({
        code: "K7QM",
        url: "https://tka.run/K7QM?bp=staff&rp=bigdoublecontactball",
      }),
    } as unknown as ReturnType<typeof getShortCodeManager>);
    // The four-step row leaves a 251 px QR slot.
    vi.mocked(getSerializedQrPlacement).mockReturnValue({
      x: 500,
      y: 700,
      size: 251,
    });
    vi.mocked(authedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: PHYSICAL_CARD_SCHEMA_VERSION,
          printRunId: PRINT_RUN_ID,
          allocatedAt: "2026-09-23T12:00:00.000Z",
          instances: [
            { physicalCardId, cardIndex: 0, copyIndex: 0, shortCode: "K7QM" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const printedFront = { width: 822, height: 1122 } as HTMLCanvasElement;
    vi.mocked(renderSerializedCardFront).mockResolvedValue(printedFront);
    const pair: CardPair = {
      front: { width: 822, height: 1122 } as HTMLCanvasElement,
      back: { width: 1644, height: 2244 } as HTMLCanvasElement,
      label: "ABCD",
      renderMeta: {
        sequence: { id: "four", word: "ABCD" } as SequenceData,
        options: {
          includeStartPlacement: true,
          leftPropType: PropType.STAFF,
          rightPropType: PropType.BIGDOUBLECONTACTBALL,
        },
      },
    };

    const run = await prepareSerializedPrintRun({
      pairs: [pair],
      deckId: "deck-1",
      deckName: "Deck 001",
      deckReleaseNumber: 1,
      cardSize: "poker",
      copies: 1,
      groupByElement: false,
      outputMode: "zip",
    });

    const issueBody = JSON.parse(
      vi.mocked(authedFetch).mock.calls[0]![1]!.body as string
    );
    expect(issueBody.cards).toEqual([
      expect.objectContaining({
        shortCode: "K7QM",
        leftPropType: "staff",
        rightPropType: "bigdoublecontactball",
      }),
    ]);

    await expect(run.renderFront(pair, 0, 0)).resolves.toBe(printedFront);
    const serializedUrl = `HTTPS://TKA.RUN/K7QM?pid=${physicalCardId}`;
    expect(renderSerializedCardFront).toHaveBeenCalledWith(
      pair.front,
      pair.renderMeta!.sequence,
      pair.renderMeta!.options,
      serializedUrl,
      undefined
    );
    expect(verifyPrintedQr).toHaveBeenCalledWith(
      printedFront,
      expect.objectContaining({ expectedPayload: serializedUrl })
    );
  });
});
