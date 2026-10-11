import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getDoc: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  getDoc: h.getDoc,
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  collection: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: vi.fn(),
}));

vi.mock("#lib/shared/error/services/error-telemetry-reporter.js", () => ({
  reportErrorTelemetry: vi.fn(),
}));

const { firestoreGet, firestoreGetDetailed } = await import(
  "../../../../src/lib/shared/firestore/firestore-crud"
);

const schema = {
  safeParse(data: unknown) {
    const d = data as { id?: string; name?: unknown };
    return typeof d?.name === "string"
      ? ({ success: true, data: d } as const)
      : ({ success: false, error: { issues: ["name must be a string"] } } as const);
  },
};

function snapshot(opts: {
  exists: boolean;
  fromCache: boolean;
  data?: Record<string, unknown>;
}) {
  return {
    id: "s1",
    exists: () => opts.exists,
    data: () => opts.data ?? {},
    metadata: { fromCache: opts.fromCache, hasPendingWrites: false },
  };
}

describe("firestoreGetDetailed", () => {
  beforeEach(() => h.getDoc.mockReset());

  it("a server-confirmed miss is absent", async () => {
    h.getDoc.mockResolvedValue(snapshot({ exists: false, fromCache: false }));
    expect(await firestoreGetDetailed("users/u/sequences", "s1", schema)).toEqual({
      status: "absent",
    });
  });

  it("a cache-only miss is unknown, NOT absent", async () => {
    // The cold-load case: Firestore answered from a local cache that has never
    // seen this document. Reporting that as absent is what deleted six live
    // sequences off a restored Choreo sheet.
    h.getDoc.mockResolvedValue(snapshot({ exists: false, fromCache: true }));
    expect(await firestoreGetDetailed("users/u/sequences", "s1", schema)).toEqual({
      status: "unknown",
    });
  });

  it("a present document that fails its schema is invalid, not absent", async () => {
    h.getDoc.mockResolvedValue(
      snapshot({ exists: true, fromCache: false, data: { name: 42 } })
    );
    const out = await firestoreGetDetailed("users/u/sequences", "s1", schema);
    expect(out.status).toBe("invalid");
  });

  it("a valid document is found, and carries the id", async () => {
    h.getDoc.mockResolvedValue(
      snapshot({ exists: true, fromCache: true, data: { name: "AΘ-SX-" } })
    );
    const out = await firestoreGetDetailed("users/u/sequences", "s1", schema);
    expect(out).toMatchObject({ status: "found", data: { id: "s1", name: "AΘ-SX-" } });
  });
});

describe("firestoreGet stays lenient", () => {
  beforeEach(() => h.getDoc.mockReset());

  it("maps every non-found outcome to null, as its callers expect", async () => {
    for (const snap of [
      snapshot({ exists: false, fromCache: false }),
      snapshot({ exists: false, fromCache: true }),
      snapshot({ exists: true, fromCache: false, data: { name: 42 } }),
    ]) {
      h.getDoc.mockResolvedValue(snap);
      expect(await firestoreGet("users/u/sequences", "s1", schema)).toBeNull();
    }
  });
});
