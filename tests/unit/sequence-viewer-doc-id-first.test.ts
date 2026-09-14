import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
import { loopDetector } from "$lib/shared/create/services/loop-detector";
import { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import { loadByIdentifier } from "$lib/shared/sequence-viewer/services/sequence-data-provider";

// A legacy word: the id under which the library document is stored, and the
// stem of a bundled PNG the Create-module importer knows how to read.
const WORD = "DCKΨ-";

const stepWithMotion = {
  id: "1-D",
  stepNumber: 1,
  letter: "D",
  duration: 1,
  blueMotionData: { motionType: "pro", startLocation: "n", endLocation: "e" },
  redMotionData: { motionType: "anti", startLocation: "s", endLocation: "w" },
};

const persistence = vi.hoisted(() => ({
  loadSequence: vi.fn(),
  saveSequence: vi.fn(),
  loadAllSequences: vi.fn(),
}));
vi.mock("$lib/shared/persistence/services/dexie-persistence-service", () => persistence);

const localRepository = vi.hoisted(() => ({ getSequence: vi.fn() }));
vi.mock("$lib/shared/create/get-sequence-repository", () => ({
  getSequenceRepository: () => localRepository,
}));

const browseLoader = vi.hoisted(() => ({ loadFullSequenceData: vi.fn() }));
vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: () => browseLoader,
}));
vi.mock("$lib/shared/sequence-viewer/services/cell-pre-warmer", () => ({
  cellPreWarmer: { preWarmSequence: vi.fn() },
}));

function repositoryWithImporter(importFromPNG: ReturnType<typeof vi.fn>) {
  return new SequenceRepository(
    { createSequence: vi.fn(), updateStep: vi.fn() } as never,
    { processReversals: (sequence) => sequence },
    { importFromPNG } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  registerLoopDetector(loopDetector);
  persistence.loadSequence.mockResolvedValue(null);
});

describe("SequenceRepository.getSequence PNG fallback", () => {
  it("still imports the bundled PNG by default when the store misses", async () => {
    const importFromPNG = vi.fn().mockResolvedValue({
      id: "e0d2c0d2-0000-4000-8000-000000000001",
      word: WORD,
      steps: [stepWithMotion],
    });
    const sequence = await repositoryWithImporter(importFromPNG).getSequence(WORD);

    expect(importFromPNG).toHaveBeenCalledWith(WORD);
    expect(sequence?.word).toBe(WORD);
    expect(persistence.saveSequence).toHaveBeenCalledOnce();
  });

  it("reports a plain miss when the caller keeps the PNG for its own last resort", async () => {
    const importFromPNG = vi.fn();
    const sequence = await repositoryWithImporter(importFromPNG).getSequence(WORD, {
      importFromPng: false,
    });

    expect(sequence).toBeNull();
    expect(importFromPNG).not.toHaveBeenCalled();
    expect(persistence.saveSequence).not.toHaveBeenCalled();
  });
});

describe("loadByIdentifier", () => {
  it("returns the document stored under the id, not a PNG copy minted under a new one", async () => {
    localRepository.getSequence.mockResolvedValue(null);
    browseLoader.loadFullSequenceData.mockImplementation(
      async (_word: string, id?: string) =>
        id === WORD ? { id: WORD, word: WORD, name: WORD, steps: [stepWithMotion] } : null
    );

    const sequence = await loadByIdentifier(WORD);

    expect(localRepository.getSequence).toHaveBeenCalledWith(WORD, {
      importFromPng: false,
    });
    expect(sequence?.id).toBe(WORD);
  });
});
