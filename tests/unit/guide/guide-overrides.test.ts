import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Firestore mocks (same shape as tests/unit/shared/firestore/firestore-crud.test.ts) ──
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockCollection = vi.fn((..._args: unknown[]) => "col-ref");
const mockDoc = vi.fn((..._args: unknown[]) => "doc-ref");
const mockQuery = vi.fn((...args: unknown[]) => args[0]);
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _isServerTimestamp: true }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

let mockIsAdmin = true;
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  isAdmin: () => mockIsAdmin,
  getEffectiveUserId: () => "test-uid",
}));

import {
  canEditGuide,
  loadOverrides,
  saveOverride,
  revertOverride,
  resetOverride,
  overrideStepsFor,
  overrideWordFor,
  hasOverride,
  hasRevisionsCached,
  refreshRevisionAvailability,
} from "../../../src/routes/(public)/guide/level-1/_data/guide-overrides.svelte";
import type { StepData } from "../../../src/lib/shared/foundation/domain/models/step-data";

// A minimal but representative StepData — round-tripping this through
// JSON.parse(JSON.stringify(...)) is the serialization contract this module
// relies on (Firestore rejects class instances / undefined).
function makeStep(stepNumber: number): StepData {
  return {
    id: `s-${stepNumber}`,
    letter: "A" as unknown as StepData["letter"],
    gridMode: "diamond" as unknown as StepData["gridMode"],
    startPlacement: "alpha1" as unknown as StepData["startPlacement"],
    endPlacement: "alpha3" as unknown as StepData["endPlacement"],
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
        color: "blue",
        propType: "staff",
        gridMode: "diamond",
      } as unknown as StepData["motions"]["blue"],
      right: {
        motionType: "pro",
        rotationDirection: "ccw",
        startLocation: "s",
        endLocation: "w",
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
        color: "red",
        propType: "staff",
        gridMode: "diamond",
      } as unknown as StepData["motions"]["red"],
    },
  } as unknown as StepData;
}

describe("guide-overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = true;
  });

  describe("canEditGuide", () => {
    it("reflects the admin auth flag", () => {
      mockIsAdmin = true;
      expect(canEditGuide()).toBe(true);
      mockIsAdmin = false;
      expect(canEditGuide()).toBe(false);
    });
  });

  describe("serialization round-trip", () => {
    it("loadOverrides deserializes plain-JSON steps back into renderable StepData", async () => {
      const strip = [makeStep(0), makeStep(1)];
      const serialized = JSON.parse(JSON.stringify(strip));
      mockGetDocs.mockResolvedValue({
        forEach: (cb: (d: unknown) => void) =>
          cb({ id: "t1l-djii", data: () => ({ steps: serialized, word: "DJII" }) }),
      });

      const map = await loadOverrides();
      const result = map.get("t1l-djii");
      expect(result).toEqual(strip);
      expect(overrideStepsFor("t1l-djii")).toEqual(strip);
      expect(overrideWordFor("t1l-djii")).toBe("DJII");
      expect(hasOverride("t1l-djii")).toBe(true);
    });

    it("saveOverride writes plain-JSON (no class instances / undefined) to Firestore", async () => {
      const strip = [makeStep(0), makeStep(1)];
      // No existing doc — snapshotRevision sees "not found".
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockGetDocs.mockResolvedValue({ docs: [] }); // prune sees zero revisions
      mockAddDoc.mockResolvedValue({ id: "rev-1" });
      mockSetDoc.mockResolvedValue(undefined);

      await saveOverride("t1l-djii", strip, "DJII");

      expect(mockSetDoc).toHaveBeenCalledWith(
        "doc-ref",
        expect.objectContaining({
          steps: JSON.parse(JSON.stringify(strip)),
          word: "DJII",
          updatedBy: "test-uid",
        }),
      );
      const written = mockSetDoc.mock.calls[0][1];
      expect(() => JSON.stringify(written)).not.toThrow();
      expect(JSON.stringify(written)).not.toContain("undefined");
      expect(overrideStepsFor("t1l-djii")).toEqual(strip);
    });

    it("saveOverride throws (and does not write) when the caller is not admin", async () => {
      mockIsAdmin = false;
      await expect(saveOverride("t1l-djii", [makeStep(0)])).rejects.toThrow(/not authorized/i);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe("revision cap / prune", () => {
    it("prunes the oldest revisions once the cap (20) is exceeded", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockAddDoc.mockResolvedValue({ id: "new-rev" });
      mockSetDoc.mockResolvedValue(undefined);

      // 21 existing revisions (oldest → newest); saveOverride should delete the
      // single oldest one to hold the cap at 20.
      const docs = Array.from({ length: 21 }, (_, i) => ({
        ref: `rev-ref-${i}`,
        data: () => ({ steps: null, savedAt: i }),
      }));
      mockGetDocs.mockResolvedValue({ docs });

      await saveOverride("t1l-djii", [makeStep(0)]);

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      expect(mockDeleteDoc).toHaveBeenCalledWith("rev-ref-0");
    });

    it("does not prune when at or under the cap", async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockAddDoc.mockResolvedValue({ id: "new-rev" });
      mockSetDoc.mockResolvedValue(undefined);
      mockGetDocs.mockResolvedValue({
        docs: Array.from({ length: 5 }, (_, i) => ({ ref: `rev-${i}`, data: () => ({}) })),
      });

      await saveOverride("t1l-djii", [makeStep(0)]);

      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });
  });

  describe("revert semantics", () => {
    it("pops the latest revision's steps back into the override doc", async () => {
      const priorSteps = JSON.parse(JSON.stringify([makeStep(0), makeStep(1)]));
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ ref: "latest-rev-ref", data: () => ({ steps: priorSteps, word: "OLD" }) }],
      });
      mockSetDoc.mockResolvedValue(undefined);
      mockDeleteDoc.mockResolvedValue(undefined);

      const ok = await revertOverride("t1l-djii");

      expect(ok).toBe(true);
      expect(mockSetDoc).toHaveBeenCalledWith(
        "doc-ref",
        expect.objectContaining({ steps: priorSteps, word: "OLD" }),
      );
      expect(mockDeleteDoc).toHaveBeenCalledWith("latest-rev-ref");
      expect(overrideStepsFor("t1l-djii")).toEqual(priorSteps);
    });

    it("reverting to the authored pseudo-revision (steps: null) deletes the override doc", async () => {
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ ref: "latest-rev-ref", data: () => ({ steps: null }) }],
      });
      // refreshRevisionAvailability's follow-up query (after delete).
      mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      mockDeleteDoc.mockResolvedValue(undefined);

      const ok = await revertOverride("t1l-djii");

      expect(ok).toBe(true);
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockDeleteDoc).toHaveBeenCalledWith("doc-ref"); // the override doc
      expect(mockDeleteDoc).toHaveBeenCalledWith("latest-rev-ref"); // the consumed revision
      expect(hasOverride("t1l-djii")).toBe(false);
    });

    it("returns false when there is nothing to revert to", async () => {
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

      const ok = await revertOverride("t1l-nothing");

      expect(ok).toBe(false);
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });

    it("revertOverride throws when the caller is not admin", async () => {
      mockIsAdmin = false;
      await expect(revertOverride("t1l-djii")).rejects.toThrow(/not authorized/i);
    });
  });

  describe("resetOverride", () => {
    it("deletes the override doc and clears the cached map entry", async () => {
      mockDeleteDoc.mockResolvedValue(undefined);
      // Seed the cache via a prior successful save so there's something to clear.
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockGetDocsForSave();
      mockAddDoc.mockResolvedValue({ id: "r" });
      mockSetDoc.mockResolvedValue(undefined);
      await saveOverride("t1l-reset-me", [makeStep(0)]);
      expect(hasOverride("t1l-reset-me")).toBe(true);

      await resetOverride("t1l-reset-me");

      expect(mockDeleteDoc).toHaveBeenCalledWith("doc-ref");
      expect(hasOverride("t1l-reset-me")).toBe(false);
    });

    function mockGetDocsForSave() {
      mockGetDocs.mockResolvedValue({ docs: [] });
    }

    it("resetOverride throws when the caller is not admin", async () => {
      mockIsAdmin = false;
      await expect(resetOverride("t1l-djii")).rejects.toThrow(/not authorized/i);
    });
  });

  describe("hasRevisionsCached / refreshRevisionAvailability", () => {
    it("caches whether a revert target exists for a key", async () => {
      expect(hasRevisionsCached("t1l-fresh")).toBe(false);
      mockGetDocs.mockResolvedValue({ empty: false, docs: [{ ref: "x" }] });

      const has = await refreshRevisionAvailability("t1l-fresh");

      expect(has).toBe(true);
      expect(hasRevisionsCached("t1l-fresh")).toBe(true);
    });
  });
});
