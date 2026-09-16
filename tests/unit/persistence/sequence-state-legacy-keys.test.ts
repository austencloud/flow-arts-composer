import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  loadCurrentSequenceState,
  migrateLegacySequenceStateBlob,
} from "$lib/shared/persistence/services/dexie-persistence-service";

const STORAGE_KEY = "tka-construct-sequence-state-v1";

function seed(blob: Record<string, unknown>) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ timestamp: Date.now(), ...blob })
  );
}

describe("sequence state legacy key migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("migrateLegacySequenceStateBlob (pure function)", () => {
    it("copies hasStartPosition/selectedStartPosition onto the new keys when absent", () => {
      const migrated = migrateLegacySequenceStateBlob({
        hasStartPosition: true,
        selectedStartPosition: { placement: "alpha" },
      }) as Record<string, unknown>;

      expect(migrated.hasStartPlacement).toBe(true);
      expect(migrated.selectedStartPlacement).toEqual({ placement: "alpha" });
    });

    it("never overwrites an already-present new-spelling value", () => {
      const migrated = migrateLegacySequenceStateBlob({
        hasStartPlacement: false,
        hasStartPosition: true,
        selectedStartPlacement: { placement: "beta" },
        selectedStartPosition: { placement: "alpha" },
      }) as Record<string, unknown>;

      expect(migrated.hasStartPlacement).toBe(false);
      expect(migrated.selectedStartPlacement).toEqual({ placement: "beta" });
    });

    it("passes non-object values through untouched", () => {
      expect(migrateLegacySequenceStateBlob(null)).toBeNull();
      expect(migrateLegacySequenceStateBlob("x")).toBe("x");
      expect(migrateLegacySequenceStateBlob([1, 2])).toEqual([1, 2]);
    });
  });

  describe("loadCurrentSequenceState", () => {
    it("honors a pre-rename blob instead of clearing it", async () => {
      seed({
        currentSequence: null,
        hasStartPosition: true,
        selectedStartPosition: { placement: "alpha" },
        activeBuildSection: "construct",
      });

      const state = await loadCurrentSequenceState("construct");

      expect(state).not.toBeNull();
      expect(state?.hasStartPlacement).toBe(true);
      expect(state?.selectedStartPlacement).toMatchObject({
        placement: "alpha",
      });
      // The stored blob must not have been cleared by validation failure.
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it("prefers the new spelling when both are present", async () => {
      seed({
        currentSequence: null,
        hasStartPlacement: false,
        hasStartPosition: true,
        selectedStartPlacement: { placement: "gamma11" },
        selectedStartPosition: { placement: "alpha" },
        activeBuildSection: "construct",
      });

      const state = await loadCurrentSequenceState("construct");

      expect(state?.hasStartPlacement).toBe(false);
      expect(state?.selectedStartPlacement).toMatchObject({
        placement: "gamma11",
      });
    });

    it("still clears a blob that stays invalid after migration", async () => {
      seed({
        currentSequence: null,
        // No hasStartPlacement and no hasStartPosition boolean at all.
        activeBuildSection: "construct",
      });

      const state = await loadCurrentSequenceState("construct");

      expect(state).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
