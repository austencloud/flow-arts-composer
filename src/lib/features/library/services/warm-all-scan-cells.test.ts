import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/shared/navigation/services/sequence-hydrator", () => ({
  hydrateSequence: vi.fn(async (sequence) => sequence),
}));

vi.mock("$lib/shared/qr/services/scan-prop-resolver", () => ({
  resolveScanPropConfig: vi.fn(() => ({
    leftPropType: "poi",
    rightPropType: "fan",
    catDogMode: true,
  })),
}));

import {
  listAllShortCodes,
  startScanCellWarm,
  startScanQrBake,
} from "./warm-all-scan-cells";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const sequence = {
  id: "sequence-1",
  word: "AB",
  steps: [{ letter: "A", motions: {} }],
} as unknown as SequenceData;

describe("shortcode scan-cell backfill", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bakes the existing code only after both themes are verified", async () => {
    const events: string[] = [];
    const bakeQr = vi.fn(async () => {
      events.push("qr");
    });
    const result = await startScanQrBake(vi.fn(), {
      listCodes: async () => ["EXISTING"],
      resolveCode: async () => ({ sequence, record: null }),
      warmCells: async (_sequence, options) => {
        events.push(options.isDark ? "dark" : "light");
        return { total: 2, ready: 2, hashes: [], failures: [] };
      },
      bakeQr,
    }).promise;
    expect(events).toEqual(["dark", "light", "qr"]);
    expect(bakeQr).toHaveBeenCalledWith(sequence, "EXISTING", {
      leftPropType: "poi",
      rightPropType: "fan",
      catDogMode: true,
    });
    expect(result).toMatchObject({ done: 1, failed: 0, finished: true });
  });

  it("records failed QR publication for retry and continues the batch", async () => {
    const bakeQr = vi
      .fn()
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce(undefined);
    const result = await startScanQrBake(vi.fn(), {
      listCodes: async () => ["RETRY", "READY"],
      resolveCode: async () => ({ sequence, record: null }),
      warmCells: vi
        .fn()
        .mockResolvedValue({ total: 2, ready: 2, hashes: [], failures: [] }),
      bakeQr,
      concurrency: 1,
    }).promise;
    expect(result).toMatchObject({
      done: 2,
      total: 2,
      failed: 1,
      failedCodes: ["RETRY"],
      finished: true,
    });
  });

  it("never publishes QR readiness after a failed cell warm", async () => {
    const bakeQr = vi.fn();
    const result = await startScanQrBake(vi.fn(), {
      listCodes: async () => ["INCOMPLETE"],
      resolveCode: async () => ({ sequence, record: null }),
      warmCells: vi.fn().mockRejectedValue(new Error("missing cell")),
      bakeQr,
    }).promise;
    expect(bakeQr).not.toHaveBeenCalled();
    expect(result.failedCodes).toEqual(["INCOMPLETE"]);
  });

  it("lists Firestore document names without transferring shortcode payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          document: {
            name: "projects/tka/databases/(default)/documents/shortcodes/0017",
          },
        },
        { readTime: "2026-07-21T00:00:00Z" },
        {
          document: {
            name: "projects/tka/databases/(default)/documents/shortcodes/ABCD",
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAllShortCodes()).resolves.toEqual(["0017", "ABCD"]);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(request.method).toBe("POST");
    expect(body.structuredQuery.select).toEqual({
      fields: [{ fieldPath: "__name__" }],
    });
  });

  it("warms every QR record with exact props in both themes", async () => {
    const warmCells = vi.fn().mockResolvedValue({
      total: 2,
      ready: 2,
      hashes: [],
      failures: [],
    });
    const progress = vi.fn();

    const result = await startScanCellWarm(progress, {
      listCodes: async () => ["A001", "A002"],
      resolveCode: async () => ({
        sequence,
        record: { leftPropType: "poi" } as never,
      }),
      warmCells,
      concurrency: 1,
    }).promise;

    expect(result).toMatchObject({
      done: 2,
      total: 2,
      failed: 0,
      finished: true,
    });
    expect(warmCells).toHaveBeenCalledTimes(4);
    expect(warmCells).toHaveBeenNthCalledWith(
      1,
      sequence,
      expect.objectContaining({
        isDark: true,
        leftPropType: "poi",
        rightPropType: "fan",
        catDogMode: true,
        requireComplete: true,
      })
    );
    expect(warmCells).toHaveBeenNthCalledWith(
      2,
      sequence,
      expect.objectContaining({ isDark: false, requireComplete: true })
    );
  });

  it("counts an unresolved shortcode instead of silently dropping it", async () => {
    const result = await startScanCellWarm(vi.fn(), {
      listCodes: async () => ["BROKEN"],
      resolveCode: async () => ({ sequence: null, record: null }),
      warmCells: vi.fn(),
    }).promise;

    expect(result).toMatchObject({
      done: 1,
      total: 1,
      failed: 1,
      failedCodes: ["BROKEN"],
    });
  });

  it("keeps the existing 16-worker renderer fed during a full pass", async () => {
    const codes = Array.from({ length: 20 }, (_, index) => `C${index}`);
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const handle = startScanCellWarm(vi.fn(), {
      listCodes: async () => codes,
      resolveCode: async () => {
        active++;
        peak = Math.max(peak, active);
        await gate;
        active--;
        return { sequence, record: null };
      },
      warmCells: vi.fn().mockResolvedValue({
        total: 2,
        ready: 2,
        hashes: [],
        failures: [],
      }),
    });

    await vi.waitFor(() => expect(peak).toBe(16));
    release();
    await handle.promise;

    expect(peak).toBe(16);
  });
});
