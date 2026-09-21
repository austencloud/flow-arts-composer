import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const known = new Set<string>();
  const remote = new Set<string>();
  return {
    known,
    remote,
    deriveHash: vi.fn(
      async (data: { letter: string }) => `hash-${data.letter}`
    ),
    download: vi.fn(async (hash: string) => {
      if (!remote.has(hash)) return null;
      known.add(hash);
      return new Blob(["cell"]);
    }),
    renderCell: vi.fn(),
  };
});

vi.mock("$lib/shared/render/services/cloud-cell-key", () => ({
  CANONICAL_CELL_SIZE: 200,
  CANONICAL_CARD_VISIBILITY: {},
  deriveCloudCellHash: mocks.deriveHash,
}));
vi.mock("$lib/shared/render/services/pictograph-cloud-cache", () => ({
  isCellKnownAvailable: (hash: string) => mocks.known.has(hash),
  download: mocks.download,
}));
vi.mock("$lib/shared/sequence-viewer/services/preview-cell-renderer", () => ({
  renderCell: mocks.renderCell,
}));
vi.mock(
  "$lib/shared/pictograph/shared/services/start-placement-deriver",
  () => ({
    startPlacementDeriver: { getOrDeriveStartPlacement: () => undefined },
  })
);
vi.mock("$lib/shared/choreo-card/services/step-durations", () => ({
  detectMixedDurations: () => false,
}));
vi.mock("$lib/shared/foundation/services/sequence-motion-profile", () => ({
  getSequenceMotionVisibility: () => ({
    showLeftMotion: true,
    showRightMotion: true,
  }),
}));

import {
  IncompleteCellWarmError,
  _resetWarmStateForTest,
  warmSequenceCells,
} from "$lib/shared/render/services/warm-sequence-cells";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function sequence(letters: string): SequenceData {
  return {
    id: "warm-test",
    word: letters,
    steps: [...letters].map((letter) => ({ letter, motions: {} })),
  } as unknown as SequenceData;
}

beforeEach(() => {
  _resetWarmStateForTest();
  mocks.known.clear();
  mocks.remote.clear();
  vi.clearAllMocks();
  mocks.renderCell.mockImplementation(async (data: { letter: string }) => {
    mocks.known.add(`hash-${data.letter}`);
    return "data:image/webp;base64,cell";
  });
});

afterEach(() => vi.restoreAllMocks());

describe("foreground canonical cell warming", () => {
  it("uses the public object for an unknown local hash without rendering", async () => {
    mocks.remote.add("hash-A");

    await expect(
      warmSequenceCells(sequence("A"), {
        requireComplete: true,
        foreground: true,
      })
    ).resolves.toMatchObject({ ready: 1, hashes: ["hash-A"] });

    expect(mocks.download).toHaveBeenCalledWith(
      "hash-A",
      expect.objectContaining({ probeUnknown: true })
    );
    expect(mocks.renderCell).not.toHaveBeenCalled();
  });

  it("keeps at most four foreground cells active and preserves input order", async () => {
    let active = 0;
    let peak = 0;
    mocks.renderCell.mockImplementation(async (data: { letter: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      mocks.known.add(`hash-${data.letter}`);
      return "data:image/webp;base64,cell";
    });

    await expect(
      warmSequenceCells(sequence("ABCDE"), {
        requireComplete: true,
        foreground: true,
      })
    ).resolves.toMatchObject({
      ready: 5,
      hashes: ["hash-A", "hash-B", "hash-C", "hash-D", "hash-E"],
    });

    expect(peak).toBe(4);
  });

  it("keeps background warming serial", async () => {
    let active = 0;
    let peak = 0;
    mocks.renderCell.mockImplementation(async (data: { letter: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      mocks.known.add(`hash-${data.letter}`);
      return "data:image/webp;base64,cell";
    });

    await warmSequenceCells(sequence("ABCDE"), { requireComplete: true });

    expect(peak).toBe(1);
  });

  it("does not claim QR readiness when a missing object fails to publish", async () => {
    mocks.renderCell.mockResolvedValue("data:image/webp;base64,cell");

    await expect(
      warmSequenceCells(sequence("A"), {
        requireComplete: true,
        foreground: true,
      })
    ).rejects.toMatchObject({
      name: "IncompleteCellWarmError",
      result: expect.objectContaining({ ready: 0 }),
    } satisfies Partial<IncompleteCellWarmError>);
  });

  it("does not schedule a fifth foreground cell after cancellation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.renderCell.mockImplementation(async (data: { letter: string }) => {
      await gate;
      mocks.known.add(`hash-${data.letter}`);
      return "data:image/webp;base64,cell";
    });
    const controller = new AbortController();
    const warming = warmSequenceCells(sequence("ABCDE"), {
      requireComplete: true,
      foreground: true,
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(mocks.renderCell).toHaveBeenCalledTimes(4));
    controller.abort();
    release();

    await expect(warming).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.renderCell).toHaveBeenCalledTimes(4);
  });
});
