import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as CloudCellCache from "./pictograph-cloud-cache";

const knownCloudHashes = new Set<string>();
let renderMakesCellAvailable = true;
type RenderCellMock = (
  data: { letter?: string },
  stepNumber: number | undefined,
  isDark: boolean,
  options: unknown
) => Promise<string>;
const renderCell = vi.fn<RenderCellMock>(async (data) => {
  if (renderMakesCellAvailable) {
    knownCloudHashes.add(`hash-${data.letter ?? "cell"}`);
  }
  return "blob:fake";
});
vi.mock("$lib/shared/sequence-viewer/services/preview-cell-renderer", () => ({
  renderCell: (
    data: { letter?: string },
    stepNumber: number | undefined,
    isDark: boolean,
    options: unknown
  ) => renderCell(data, stepNumber, isDark, options),
}));

const deriveCloudCellHash = vi.fn(
  async (data: { letter?: string }) => `hash-${data.letter ?? "cell"}`
);
vi.mock("$lib/shared/render/services/cloud-cell-key", () => ({
  CANONICAL_CELL_SIZE: 480,
  CANONICAL_CARD_VISIBILITY: { showTKA: true },
  deriveCloudCellHash: (...args: unknown[]) =>
    deriveCloudCellHash(args[0] as { letter?: string }),
}));

const cloudDownload = vi
  .fn()
  .mockResolvedValue(new Blob(["ready"], { type: "image/webp" }));
vi.mock("$lib/shared/render/services/pictograph-cloud-cache", () => ({
  download: (...args: unknown[]) => cloudDownload(...args),
  isCellKnownAvailable: (hash: string) => knownCloudHashes.has(hash),
}));

vi.mock(
  "$lib/shared/pictograph/shared/services/start-position-deriver",
  () => ({
    startPositionDeriver: {
      getOrDeriveStartPosition: (sequence: { startPosition?: unknown }) =>
        sequence.startPosition ?? null,
    },
  })
);

globalThis.URL.revokeObjectURL = vi.fn();

import {
  _resetWarmStateForTest,
  IncompleteCellWarmError,
  warmSequenceCells,
} from "./warm-sequence-cells";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const sequence = {
  id: "s1",
  steps: [
    { letter: "A", motions: {} },
    { letter: "B", motions: {} },
  ],
  startPosition: { letter: "alpha", motions: {} },
} as unknown as SequenceData;

describe("warmSequenceCells", () => {
  beforeEach(() => {
    _resetWarmStateForTest();
    vi.clearAllMocks();
    knownCloudHashes.clear();
    renderMakesCellAvailable = true;
    cloudDownload.mockResolvedValue(null);
  });

  it("verifies start and every step under the exact canonical prop pair", async () => {
    const result = await warmSequenceCells(sequence, {
      isDark: true,
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
      requireComplete: true,
    });

    expect(result).toMatchObject({ total: 3, ready: 3, failures: [] });
    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(cloudDownload).toHaveBeenCalledTimes(3);
    expect(cloudDownload.mock.calls).toEqual([
      ["hash-alpha", { probeUnknown: false, signal: undefined }],
      ["hash-A", { probeUnknown: false, signal: undefined }],
      ["hash-B", { probeUnknown: false, signal: undefined }],
    ]);
    const options = renderCell.mock.calls[0]![3] as {
      size: number;
      leftPropType: PropType;
      rightPropType: PropType;
      catDogModeEnabled: boolean;
      uploadCanonical: boolean;
    };
    expect(options).toMatchObject({
      size: 480,
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogModeEnabled: true,
      uploadCanonical: true,
    });
  });

  it("accepts a known canonical object without transferring its bytes", async () => {
    knownCloudHashes.add("hash-alpha");
    knownCloudHashes.add("hash-A");
    knownCloudHashes.add("hash-B");

    const result = await warmSequenceCells(sequence, {
      requireComplete: true,
    });

    expect(result).toMatchObject({ total: 3, ready: 3, failures: [] });
    expect(cloudDownload).not.toHaveBeenCalled();
    expect(renderCell).not.toHaveBeenCalled();
  });

  it("prepares a fresh browser's unknown cells without speculative GET requests", async () => {
    const cache = await vi.importActual<typeof CloudCellCache>(
      "./pictograph-cloud-cache"
    );
    cache._resetForTest();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);
    cloudDownload.mockImplementation(cache.download);
    try {
      const result = await warmSequenceCells(sequence, {
        requireComplete: true,
      });
      expect(result).toMatchObject({ total: 3, ready: 3, failures: [] });
      expect(renderCell).toHaveBeenCalledTimes(3);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      cloudDownload.mockReset().mockResolvedValue(null);
      cache._resetForTest();
      vi.unstubAllGlobals();
    }
  });

  it("warms the participating hand only for solo choreography", async () => {
    const soloSequence = {
      ...sequence,
      steps: [
        {
          letter: null,
          motions: {
            left: { isVisible: true },
            right: { isVisible: false },
          },
        },
      ],
    } as unknown as SequenceData;

    await warmSequenceCells(soloSequence);

    const options = renderCell.mock.calls[0]![3] as {
      showLeftMotion: boolean;
      showRightMotion: boolean;
    };
    expect(options).toMatchObject({
      showLeftMotion: true,
      showRightMotion: false,
    });
  });

  it("reports individual failures in best-effort mode", async () => {
    renderCell.mockRejectedValueOnce(new Error("boom"));
    const result = await warmSequenceCells(sequence);
    expect(result.total).toBe(3);
    expect(result.ready).toBe(2);
    expect(result.failures).toEqual([{ cell: "start", reason: "boom" }]);
  });

  it("refuses strict completion when rendering does not produce an available object", async () => {
    renderMakesCellAvailable = false;
    await expect(
      warmSequenceCells(sequence, { requireComplete: true })
    ).rejects.toBeInstanceOf(IncompleteCellWarmError);
  });

  it("renders each verified hash once across concurrent sequences and later calls", async () => {
    await Promise.all([
      warmSequenceCells(sequence, { requireComplete: true }),
      warmSequenceCells(sequence, { requireComplete: true }),
    ]);

    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(cloudDownload).toHaveBeenCalledTimes(3);

    await warmSequenceCells(sequence, { requireComplete: true });

    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(cloudDownload).toHaveBeenCalledTimes(3);
  });

  it("stops a cancelled strict warm without converting it to an incomplete result", async () => {
    const controller = new AbortController();
    let resolveProbe!: (blob: Blob | null) => void;
    cloudDownload.mockImplementationOnce(
      () =>
        new Promise<Blob | null>((resolve) => {
          resolveProbe = resolve;
        })
    );
    const warming = warmSequenceCells(sequence, {
      requireComplete: true,
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(cloudDownload).toHaveBeenCalledOnce());
    controller.abort();
    resolveProbe(new Blob(["ready"], { type: "image/webp" }));

    await expect(warming).rejects.toMatchObject({ name: "AbortError" });
    expect(renderCell).not.toHaveBeenCalled();
  });

  it("retries a hash after strict verification fails", async () => {
    let failedHashAvailable = false;
    renderCell.mockImplementation(async (data: { letter?: string }) => {
      const hash = `hash-${data.letter ?? "cell"}`;
      if (hash !== "hash-alpha" || failedHashAvailable) {
        knownCloudHashes.add(hash);
      }
      return "blob:fake";
    });

    await expect(
      warmSequenceCells(sequence, { requireComplete: true })
    ).rejects.toBeInstanceOf(IncompleteCellWarmError);

    failedHashAvailable = true;
    await warmSequenceCells(sequence, { requireComplete: true });

    // The two hashes that became available remain reusable; only the failed
    // hash renders again after its transient upload failure.
    expect(renderCell).toHaveBeenCalledTimes(4);
    expect(cloudDownload).toHaveBeenCalledTimes(4);
  });
});
