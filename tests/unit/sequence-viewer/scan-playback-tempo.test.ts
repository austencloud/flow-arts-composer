import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  initialScanPlaybackBpm,
  loadSavedScanPlaybackBpm,
  maxAdditionalTurns,
  recommendedScanPlaybackBpm,
  saveScanPlaybackBpm,
  type ScanPlaybackStorage,
} from "#lib/shared/sequence-viewer/services/scan-playback-tempo.js";

type Turns = number | "fl";

function sequence(...turnPairs: Array<readonly [Turns, Turns]>) {
  return {
    steps: turnPairs.map(([leftTurns, rightTurns]) => ({
      motions: {
        left: { turns: leftTurns },
        right: { turns: rightTurns },
      },
    })),
  } as unknown as Pick<SequenceData, "steps">;
}

class MemoryStorage implements ScanPlaybackStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("scan playback tempo", () => {
  it("finds the largest numeric turn count across both props and ignores floats", () => {
    expect(maxAdditionalTurns(sequence([0, "fl"], [1.5, 2.5]))).toBe(2.5);
  });

  it("ignores turns on an invisible placeholder motion", () => {
    const withPlaceholder = {
      steps: [
        {
          motions: {
            left: { turns: 6, isVisible: false },
            right: { turns: 2, isVisible: true },
          },
        },
      ],
    } as unknown as Pick<SequenceData, "steps">;

    expect(maxAdditionalTurns(withPlaceholder)).toBe(2);
  });

  it.each([
    { turns: 0, bpm: 60 },
    { turns: 1, bpm: 60 },
    { turns: 1.5, bpm: 40 },
    { turns: 2, bpm: 30 },
    { turns: 2.5, bpm: 25 },
    { turns: 3, bpm: 20 },
    { turns: 6, bpm: 20 },
  ])("maps a $turns-turn sequence to $bpm BPM", ({ turns, bpm }) => {
    expect(recommendedScanPlaybackBpm(sequence([turns, 0]))).toBe(bpm);
  });

  it("restores a saved user tempo before applying the turn-aware recommendation", () => {
    const storage = new MemoryStorage();
    const highTurnSequence = sequence([3, 3]);

    expect(initialScanPlaybackBpm("card-a", highTurnSequence, storage)).toBe(
      20
    );

    saveScanPlaybackBpm("card-a", 95, storage);

    expect(initialScanPlaybackBpm("card-a", highTurnSequence, storage)).toBe(
      95
    );
    expect(initialScanPlaybackBpm("card-b", highTurnSequence, storage)).toBe(
      20
    );
  });

  it("keeps preferences separate without exposing the raw scan code in storage", () => {
    const storage = new MemoryStorage();

    saveScanPlaybackBpm("first-card", 30, storage);
    saveScanPlaybackBpm("second-card", 120, storage);

    expect(loadSavedScanPlaybackBpm("first-card", storage)).toBe(30);
    expect(loadSavedScanPlaybackBpm("second-card", storage)).toBe(120);
    expect(
      [...storage.values.keys()].every((key) => !key.includes("card"))
    ).toBe(true);
  });

  it("ignores corrupt or engine-invalid saved values", () => {
    const storage = new MemoryStorage();

    saveScanPlaybackBpm("card-a", 999, storage);
    expect(loadSavedScanPlaybackBpm("card-a", storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    saveScanPlaybackBpm("card-a", 15, storage);
    const [key] = storage.values.keys();
    storage.values.set(key!, "not-a-tempo");

    expect(initialScanPlaybackBpm("card-a", sequence([2, 0]), storage)).toBe(
      30
    );
  });

  it("falls back cleanly when browser storage is unavailable", () => {
    const storage: ScanPlaybackStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(initialScanPlaybackBpm("card-a", sequence([3, 0]), storage)).toBe(
      20
    );
    expect(() => saveScanPlaybackBpm("card-a", 45, storage)).not.toThrow();
  });
});
