// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { CsvLoader } from "$lib/shared/foundation/services/data/csv-loader";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { MotionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

const emptyDataSet = {
  success: true,
  data: { diamondData: "diamond", boxData: "box" },
  sources: { diamond: "fetch" as const, box: "fetch" as const },
};

function successfulResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => "rows",
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Window & { csvData?: unknown }).csvData;
});

describe("CSV and motion-query initialization", () => {
  it("shares one cold CSV fetch across concurrent loader instances", async () => {
    const loader = new CsvLoader();
    loader.clearCache();
    const fetch = vi.fn(async () => successfulResponse());
    vi.stubGlobal("fetch", fetch);

    await Promise.all([loader.loadCsvData(), new CsvLoader().loadCsvData()]);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("clears a failed CSV initialization so a later attempt can recover", async () => {
    const loader = new CsvLoader();
    loader.clearCache();
    let offline = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (offline) throw new Error("offline");
        return successfulResponse();
      })
    );

    await expect(loader.loadCsvData()).rejects.toThrow("CSV loading failed");
    offline = false;
    await expect(loader.loadCsvData()).resolves.toMatchObject({
      diamondData: "rows",
      boxData: "rows",
    });
  });

  it("shares motion CSV initialization and retries it after a failure", async () => {
    let rejectFirst: ((reason: Error) => void) | null = null;
    const firstLoad = new Promise<typeof emptyDataSet>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const loadCSVDataSet = vi
      .fn<() => Promise<typeof emptyDataSet>>()
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValue(emptyDataSet);
    const parser = {
      parseCSV: vi.fn(() => ({ rows: [] })),
    };
    const pictographParser = {
      parseCSVRowToPictograph: vi.fn(),
    };
    const handler = new MotionQueryHandler(
      { loadCSVDataSet } as unknown as CsvLoader,
      parser,
      pictographParser as never
    );

    const first = handler.getNextOptionsForSequence([], GridMode.DIAMOND);
    const second = handler.getNextOptionsForSequence([], GridMode.DIAMOND);
    expect(loadCSVDataSet).toHaveBeenCalledTimes(1);

    rejectFirst!(new Error("temporary failure"));
    await expect(first).rejects.toThrow("Failed to load CSV data");
    await expect(second).rejects.toThrow("Failed to load CSV data");

    await expect(
      handler.getNextOptionsForSequence([], GridMode.DIAMOND)
    ).resolves.toEqual([]);
    expect(loadCSVDataSet).toHaveBeenCalledTimes(2);
  });
});
