import { beforeEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "$lib/shared/auth/services/authed-fetch";
import { PHYSICAL_CARD_SCHEMA_VERSION } from "$lib/shared/qr/domain/physical-card";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
import { PrintedQrError } from "../print-qr-guard";
import { getSerializedQrPlacement } from "../serialized-card-front";
import {
  createPhysicalCardPrintRunFinalizer,
  finalizePhysicalCardPrintRun,
  prepareSerializedPrintRun,
} from "../serialized-print-run";
import type { CardPair } from "../types";

vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn(),
}));
vi.mock("$lib/shared/qr/get-qr-code-generator", () => ({
  getQRCodeGenerator: vi.fn(),
}));
vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: vi.fn(),
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
