import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  firestoreList: vi.fn(),
  firestoreSet: vi.fn(),
  firestoreDelete: vi.fn(),
  getDocs: vi.fn(),
  getVisibleOwnerProfiles: vi.fn(),
  queryArgs: [] as unknown[][],
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ group: id })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: harness.getDocs,
  serverTimestamp: vi.fn(() => "__SERVER_TS__"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  limit: vi.fn((count: number) => ({ limit: count })),
  orderBy: vi.fn((field: string, direction?: string) => ({
    orderBy: field,
    direction,
  })),
  query: vi.fn((...args: unknown[]) => {
    harness.queryArgs.push(args);
    return args;
  }),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    where: field,
    op,
    value,
  })),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("$lib/shared/firestore", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreList: harness.firestoreList,
  firestoreSet: harness.firestoreSet,
  firestoreDelete: harness.firestoreDelete,
}));

vi.mock("$lib/shared/community/services/user-repository", () => ({
  getVisibleOwnerProfiles: harness.getVisibleOwnerProfiles,
}));

import {
  createSetup,
  deleteSetup,
  loadCommunity,
  loadPersonal,
  renameSetup,
  updateSetup,
} from "../favorite-config-repository";
import type { SavedGeneratorSetup } from "../../domain/models/favorite-config";

const NOW = new Date("2026-09-18T12:00:00Z");
const CONFIG = { level: 2 } as unknown as SavedGeneratorSetup["config"];
const A_SETUP = {
  id: "s1",
  name: "Setup 1",
  config: CONFIG,
  startEndOptions: null,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies SavedGeneratorSetup;

function communityDoc(
  ownerId: string | null,
  id: string,
  data: Record<string, unknown>
) {
  return {
    id,
    ref: { parent: { parent: ownerId ? { id: ownerId } : null } },
    data: () => data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.queryArgs.length = 0;
  harness.getVisibleOwnerProfiles.mockResolvedValue(new Map());
});

describe("loadPersonal", () => {
  it("lists the owner's setups ordered by createdAt", async () => {
    harness.firestoreList.mockResolvedValue([
      { id: "s1", name: "One", config: { level: 1 }, createdAt: NOW },
    ]);

    const setups = await loadPersonal("u1");

    expect(harness.firestoreList).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      expect.anything(),
      { orderBy: [{ field: "createdAt" }] }
    );
    expect(setups.map((setup) => setup.id)).toEqual(["s1"]);
  });
});

describe("writes", () => {
  it("creates a setup as public", async () => {
    harness.firestoreSet.mockResolvedValue("new-id");

    const created = await createSetup("u1", {
      name: "Setup 1",
      config: CONFIG,
      startEndOptions: null,
    });

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      null,
      expect.objectContaining({ name: "Setup 1", isPublic: true }),
      expect.objectContaining({ trackOffline: true })
    );
    expect(created.id).toBe("new-id");
  });

  it("keeps a renamed setup public", async () => {
    await renameSetup("u1", "s1", "Renamed");

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      { name: "Renamed", isPublic: true },
      expect.objectContaining({ merge: true })
    );
  });

  it("keeps an updated setup public", async () => {
    await updateSetup("u1", A_SETUP);

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      expect.objectContaining({ config: CONFIG, isPublic: true }),
      expect.objectContaining({ merge: true })
    );
  });

  it("deletes the setup doc", async () => {
    await deleteSetup("u1", "s1");

    expect(harness.firestoreDelete).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      expect.objectContaining({ trackOffline: true })
    );
  });
});

describe("loadCommunity", () => {
  it("queries public setups newest first", async () => {
    harness.getDocs.mockResolvedValue({ docs: [] });

    await loadCommunity(7);

    expect(harness.queryArgs[0]).toEqual([
      { group: "generatorSetups" },
      { where: "isPublic", op: "==", value: true },
      { orderBy: "createdAt", direction: "desc" },
      { limit: 7 },
    ]);
  });

  it("maps docs with visible owners and drops the rest", async () => {
    harness.getDocs.mockResolvedValue({
      docs: [
        communityDoc("austen", "s1", {
          name: "VTG 1:1",
          config: { level: 3 },
          startEndOptions: null,
          isPublic: true,
          createdAt: { toDate: () => NOW },
        }),
        communityDoc("hidden", "s2", {
          name: "Hidden owner",
          config: { level: 1 },
          isPublic: true,
        }),
        communityDoc(null, "root", {
          name: "No parent user",
          config: {},
          isPublic: true,
        }),
      ],
    });
    harness.getVisibleOwnerProfiles.mockResolvedValue(
      new Map([
        ["austen", { displayName: "Austen Cloud", photoURL: "https://x/a.png" }],
      ])
    );

    const setups = await loadCommunity();

    expect(harness.getVisibleOwnerProfiles).toHaveBeenCalledWith([
      "austen",
      "hidden",
    ]);
    expect(setups).toEqual([
      expect.objectContaining({
        setupId: "s1",
        userId: "austen",
        displayName: "Austen Cloud",
        avatar: "https://x/a.png",
        name: "VTG 1:1",
        createdAt: NOW,
      }),
    ]);
  });

  it("rejects read failures instead of returning an empty list", async () => {
    harness.getDocs.mockRejectedValue(new Error("permission-denied"));

    await expect(loadCommunity()).rejects.toThrow("permission-denied");
  });
});
