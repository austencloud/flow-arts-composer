import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockStartAfter = vi.fn();

// vi.mock factories are hoisted above all other top-level code in this file,
// so the class must be declared INSIDE the factory (a top-level `class`
// declaration referenced from the factory hits the TDZ — "Cannot access
// 'X' before initialization" — because the factory runs before the class
// statement does). Real firebase/firestore exports FieldValue as a class, and
// serverTimestamp()/increment()/arrayUnion()/deleteField() all return
// instances of it (see @firebase/firestore dist:
// ServerTimestampFieldValueImpl extends FieldValue, etc). firestore-helpers.ts's
// stripUndefined() passes anything that is not a plain object through untouched,
// which is what keeps these sentinels intact — a mock CLASS (not an object
// literal) is what keeps that branch real.
vi.mock("firebase/firestore", () => {
  class MockFieldValue {
    readonly _isServerTimestamp: boolean;
    constructor() {
      this._isServerTimestamp = true;
    }
  }
  return {
    collection: (...args: unknown[]) => mockCollection(...args),
    doc: (...args: unknown[]) => mockDoc(...args),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
    addDoc: (...args: unknown[]) => mockAddDoc(...args),
    deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
    onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    where: (...args: unknown[]) => mockWhere(...args),
    orderBy: (...args: unknown[]) => mockOrderBy(...args),
    limit: (...args: unknown[]) => mockLimit(...args),
    startAfter: (...args: unknown[]) => mockStartAfter(...args),
    serverTimestamp: () => new MockFieldValue(),
    FieldValue: MockFieldValue,
  };
});

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: vi.fn(async (fn: () => Promise<unknown>, _name?: string) => fn()),
}));

const mockReportErrorTelemetry = vi.fn();
vi.mock("#lib/shared/error/services/error-telemetry-reporter.js", () => ({
  reportErrorTelemetry: (...args: unknown[]) => mockReportErrorTelemetry(...args),
}));

import {
  firestoreGet,
  firestoreList,
  firestoreSet,
  firestoreDelete,
} from "../../../../src/lib/shared/firestore/firestore-crud";
import { trackWrite } from "#lib/shared/offline/state/sync-status-state.svelte.js";

const TestSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(),
});

describe("firestoreGet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns validated data for existing doc", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: "abc",
      data: () => ({ name: "Test", count: 5 }),
    });

    const result = await firestoreGet("items", "abc", TestSchema);
    expect(result).toEqual({ id: "abc", name: "Test", count: 5 });
  });

  it("returns null for missing doc", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await firestoreGet("items", "missing", TestSchema);
    expect(result).toBeNull();
  });

  it("returns null and warns on validation failure", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockDoc.mockReturnValue("doc-ref");
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: "bad",
      data: () => ({ name: 123, count: "not-a-number" }),
    });

    const result = await firestoreGet("items", "bad", TestSchema);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Validation failed"),
      expect.any(Array),
    );
    warnSpy.mockRestore();
  });
});

describe("firestoreList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns validated docs, skipping invalid ones", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockQuery.mockReturnValue("query-ref");
    mockCollection.mockReturnValue("col-ref");
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "1", data: () => ({ name: "Good", count: 1 }) },
        { id: "2", data: () => ({ name: 999, count: 2 }) }, // invalid name
        { id: "3", data: () => ({ name: "Also Good", count: 3 }) },
      ],
    });

    const result = await firestoreList("items", TestSchema);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "1", name: "Good", count: 1 });
    expect(result[1]).toEqual({ id: "3", name: "Also Good", count: 3 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("passes where/orderBy/limit constraints", async () => {
    mockQuery.mockReturnValue("query-ref");
    mockCollection.mockReturnValue("col-ref");
    mockGetDocs.mockResolvedValue({ docs: [] });

    await firestoreList("items", TestSchema, {
      where: [{ field: "count", op: ">", value: 5 }],
      orderBy: [{ field: "count", direction: "desc" }],
      limit: 10,
    });

    expect(mockWhere).toHaveBeenCalledWith("count", ">", 5);
    expect(mockOrderBy).toHaveBeenCalledWith("count", "desc");
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});

describe("firestoreSet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates doc with auto-id when id is null", async () => {
    mockCollection.mockReturnValue("col-ref");
    mockAddDoc.mockResolvedValue({ id: "new-id" });

    const result = await firestoreSet("items", null, { name: "New" } as Record<string, unknown>);
    expect(result).toBe("new-id");
    expect(mockAddDoc).toHaveBeenCalledWith("col-ref", expect.objectContaining({ name: "New" }));
  });

  it("updates existing doc with given id", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockSetDoc.mockResolvedValue(undefined);

    await firestoreSet("items", "existing", { name: "Updated" } as Record<string, unknown>);
    expect(mockSetDoc).toHaveBeenCalledWith("doc-ref", expect.objectContaining({ name: "Updated" }));
  });

  it("uses merge option when specified", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockSetDoc.mockResolvedValue(undefined);

    await firestoreSet("items", "existing", { name: "Merged" } as Record<string, unknown>, { merge: true });
    expect(mockSetDoc).toHaveBeenCalledWith(
      "doc-ref",
      expect.objectContaining({ name: "Merged" }),
      { merge: true },
    );
  });

  it("adds timestamps", async () => {
    mockCollection.mockReturnValue("col-ref");
    mockAddDoc.mockResolvedValue({ id: "new" });

    await firestoreSet("items", null, { name: "Stamped" } as Record<string, unknown>);
    const docData = mockAddDoc.mock.calls[0][1];
    expect(docData.createdAt).toEqual({ _isServerTimestamp: true });
    expect(docData.updatedAt).toEqual({ _isServerTimestamp: true });
  });

  it("strips undefined values", async () => {
    mockCollection.mockReturnValue("col-ref");
    mockAddDoc.mockResolvedValue({ id: "clean" });

    await firestoreSet("items", null, { name: "Clean", extra: undefined } as Record<string, unknown>);
    const docData = mockAddDoc.mock.calls[0][1];
    expect("extra" in docData).toBe(false);
  });

  it("wraps in trackWrite when trackOffline is true", async () => {
    mockCollection.mockReturnValue("col-ref");
    mockAddDoc.mockResolvedValue({ id: "tracked" });

    await firestoreSet("items", null, { name: "Tracked" } as Record<string, unknown>, {
      trackOffline: true,
      repoName: "test-repo",
    });
    expect(trackWrite).toHaveBeenCalledWith(expect.any(Function), "test-repo");
  });
});

describe("firestoreDelete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the document", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockDeleteDoc.mockResolvedValue(undefined);

    await firestoreDelete("items", "to-delete");
    expect(mockDeleteDoc).toHaveBeenCalledWith("doc-ref");
  });

  it("wraps in trackWrite when trackOffline is true", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockDeleteDoc.mockResolvedValue(undefined);

    await firestoreDelete("items", "to-delete", {
      trackOffline: true,
      repoName: "test-repo",
    });
    expect(trackWrite).toHaveBeenCalledWith(expect.any(Function), "test-repo");
  });
});

describe("error telemetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("firestoreGet reports telemetry and re-throws on error", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockGetDoc.mockRejectedValue(new Error("permission-denied"));

    await expect(firestoreGet("items", "abc", TestSchema)).rejects.toThrow("permission-denied");
    expect(mockReportErrorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Firestore get failed"),
        severity: "warning",
        context: expect.objectContaining({
          module: "firestore",
          action: "get",
          additionalData: { path: "items/abc" },
        }),
      }),
    );
  });

  it("firestoreGet calls custom onError instead of telemetry", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockGetDoc.mockRejectedValue(new Error("custom-error"));
    const customOnError = vi.fn();

    await expect(
      firestoreGet("items", "abc", TestSchema, { onError: customOnError }),
    ).rejects.toThrow("custom-error");
    expect(customOnError).toHaveBeenCalledWith(expect.any(Error));
    expect(mockReportErrorTelemetry).not.toHaveBeenCalled();
  });

  it("firestoreSet reports telemetry on error", async () => {
    mockCollection.mockReturnValue("col-ref");
    mockAddDoc.mockRejectedValue(new Error("quota-exceeded"));

    await expect(
      firestoreSet("items", null, { name: "Fail" } as Record<string, unknown>),
    ).rejects.toThrow("quota-exceeded");
    expect(mockReportErrorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          action: "set",
          additionalData: { path: "items/(auto)" },
        }),
      }),
    );
  });

  it("firestoreDelete reports telemetry on error", async () => {
    mockDoc.mockReturnValue("doc-ref");
    mockDeleteDoc.mockRejectedValue(new Error("not-found"));

    await expect(firestoreDelete("items", "gone")).rejects.toThrow("not-found");
    expect(mockReportErrorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          action: "delete",
          additionalData: { path: "items/gone" },
        }),
      }),
    );
  });

  it("firestoreList reports telemetry on error", async () => {
    mockQuery.mockReturnValue("query-ref");
    mockCollection.mockReturnValue("col-ref");
    mockGetDocs.mockRejectedValue(new Error("unavailable"));

    await expect(firestoreList("items", TestSchema)).rejects.toThrow("unavailable");
    expect(mockReportErrorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          action: "list",
          additionalData: { path: "items" },
        }),
      }),
    );
  });
});
