import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";

const fake = vi.hoisted(() => ({
  uid: null as string | null,
  local: [] as Composition[],
  cloud: new Map<string, Composition[]>(),
  pulls: [] as string[],
  pushes: [] as { uid: string; id: string; name: string }[],
  failPull: false,
  failEveryPull: false,
  warnings: [] as string[],
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({
    showWarning: (message: string) => fake.warnings.push(message),
  }),
}));
vi.mock("#lib/features/compose/analytics/compose-events.js", () => ({
  trackCompositionDeleted: () => {},
  trackCompositionFavoriteChanged: () => {},
  trackCompositionSaved: () => {},
}));
vi.mock(
  "#lib/features/compose/services/dexie-composition-repository.js",
  () => ({
    getCompositions: vi.fn(async () => [...fake.local]),
    getLegacyCompositions: vi.fn(async () =>
      fake.local.filter((c) => !c.ownerId)
    ),
    getCompositionForOwner: vi.fn(
      async (id: string, uid: string) =>
        fake.local.find((c) => c.id === id && c.ownerId === uid) ?? null
    ),
    saveComposition: vi.fn(async (c: Composition) => {
      fake.local = fake.local.filter((entry) => entry.id !== c.id).concat(c);
      return c;
    }),
    deleteComposition: vi.fn(async (id: string) => {
      fake.local = fake.local.filter((c) => c.id !== id);
    }),
    toggleFavorite: vi.fn(async () => true),
  })
);
vi.mock(
  "#lib/features/compose/services/firebase-composition-repository.js",
  () => ({
    getUserId: () => fake.uid,
    getCompositions: vi.fn(async (uid: string) => {
      fake.pulls.push(uid);
      if (fake.failPull || fake.failEveryPull) {
        fake.failPull = false;
        throw new Error("offline");
      }
      return fake.cloud.get(uid) ?? [];
    }),
    saveComposition: vi.fn(async (c: Composition, uid: string) => {
      fake.pushes.push({ uid, id: c.id, name: c.name });
    }),
    deleteComposition: vi.fn(async () => {}),
    updateFavorite: vi.fn(async () => {}),
  })
);

import { CompositionSyncer } from "#lib/features/compose/services/composition-syncer.js";

function composition(
  id: string,
  ownerId?: string,
  updated = "2026-01-01T00:00:00Z"
): Composition {
  return {
    id,
    ownerId,
    name: id,
    layout: { rows: 1, cols: 1 },
    cells: [],
    createdAt: new Date(updated),
    updatedAt: new Date(updated),
    creator: "austen",
    isFavorite: false,
  };
}

beforeEach(() => {
  fake.uid = null;
  fake.local = [];
  fake.cloud.clear();
  fake.pulls = [];
  fake.pushes = [];
  fake.failPull = false;
  fake.failEveryPull = false;
  fake.warnings = [];
});

describe("composition sync ownership", () => {
  it("switches accounts without exposing or uploading another account's local work", async () => {
    fake.uid = "A";
    fake.local = [composition("A-local", "A"), composition("legacy")];
    fake.cloud.set("A", []);
    fake.cloud.set("B", [composition("B-cloud")]);
    const syncer = new CompositionSyncer();
    expect((await syncer.getCompositions()).map((c) => c.id)).toEqual([
      "A-local",
    ]);
    fake.uid = "B";
    expect((await syncer.getCompositions()).map((c) => c.id)).toEqual([
      "B-cloud",
    ]);
    expect(fake.pushes).toEqual([{ uid: "A", id: "A-local", name: "A-local" }]);
    expect((await syncer.getLegacyCompositions()).map((c) => c.id)).toEqual([
      "legacy",
    ]);
  });

  it("retries a failed pull and pushes a newer local edit over older cloud data", async () => {
    fake.uid = "A";
    fake.failPull = true;
    fake.local = [composition("shared", "A", "2026-01-03T00:00:00Z")];
    fake.cloud.set("A", [
      { ...composition("shared", "A", "2026-01-02T00:00:00Z"), name: "old" },
    ]);
    const syncer = new CompositionSyncer();
    await syncer.getCompositions();
    expect(fake.pulls).toEqual(["A"]);
    await syncer.getCompositions();
    expect(fake.pulls).toEqual(["A", "A"]);
    expect(fake.pushes).toEqual([{ uid: "A", id: "shared", name: "shared" }]);
  });

  it("warns once while the cloud keeps refusing, and again after it recovers", async () => {
    fake.uid = "A";
    fake.failEveryPull = true;
    const syncer = new CompositionSyncer();
    await syncer.getCompositions();
    await syncer.getCompositions();
    await syncer.getCompositions();
    expect(fake.pulls).toEqual(["A", "A", "A"]);
    expect(fake.warnings).toHaveLength(1);

    fake.failEveryPull = false;
    await syncer.getCompositions();
    syncer.invalidateSync();
    fake.failEveryPull = true;
    await syncer.getCompositions();
    expect(fake.warnings).toHaveLength(2);
  });
});
