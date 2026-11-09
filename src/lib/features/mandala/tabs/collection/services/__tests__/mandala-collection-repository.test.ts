import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedMandala } from "../../domain/mandala-collection-types";
import { prepareMandalaRevision } from "../../domain/mandala-revision";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  set: vi.fn(),
  commit: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: firestore.getDoc,
  serverTimestamp: () => "now",
  writeBatch: () => ({ set: firestore.set, commit: firestore.commit }),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: async () => ({}),
}));
vi.mock("#lib/shared/collections/firebase-collection-repository.js", () => ({
  createFirebaseCollectionRepository: () => ({
    load: async () => [],
    save: async () => undefined,
    remove: async () => undefined,
  }),
}));

const { createMandalaCollectionRepository } = await import(
  "../mandala-collection-repository"
);

async function mandala(): Promise<CollectedMandala> {
  return prepareMandalaRevision({
    id: "m1",
    name: "Bloom",
    steps: [],
    variant: "both",
    leftPropType: "staff",
    rightPropType: "staff",
    createdAt: 123,
  });
}

const writtenPaths = () =>
  firestore.set.mock.calls.map(([ref]) => (ref as { path: string }).path);

describe("saving a mandala's revision", () => {
  beforeEach(() => {
    firestore.set.mockClear();
    firestore.commit.mockClear();
  });

  it("writes a look this mandala has never had", async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => false });
    await createMandalaCollectionRepository().save("u1", await mandala());
    expect(writtenPaths()).toHaveLength(2);
    expect(writtenPaths()[1]).toContain("/revisions/v1_");
  });

  // The rules allow rewriting a revision only with identical data. Returning to
  // an earlier look carries a new timestamp, so writing it again would be denied
  // and take the work document down with it.
  it("leaves an existing revision alone when returning to an earlier look", async () => {
    firestore.getDoc.mockResolvedValue({ exists: () => true });
    const entry = await mandala();
    await createMandalaCollectionRepository().save("u1", {
      ...entry,
      currentRevisionCreatedAt: 999,
    });
    expect(writtenPaths()).toEqual(["users/u1/mandala-collection/m1"]);
    expect(firestore.commit).toHaveBeenCalledOnce();
  });
});
