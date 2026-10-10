import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Composition } from "$lib/shared/animation-engine/domain/compose-types";

const fake = vi.hoisted(() => ({
  uid: "account-a",
  owned: [] as Composition[], legacy: [] as Composition[],
  project: new Map<string, unknown>(),
  saved: [] as unknown[], backedUp: [] as unknown[],
  reads: 0, legacyReads: 0,
  draftRead: null as (() => Promise<unknown>) | null,
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  auth: { currentUser: { get uid() { return fake.uid; }, isAnonymous: false } },
}));
vi.mock("$lib/features/compose/services/composition-syncer", () => ({
  compositionSyncer: {
    getCompositions: vi.fn(async () => fake.owned),
    getLegacyCompositions: vi.fn(async () => { fake.legacyReads++; return fake.legacy; }),
    getComposition: vi.fn(async (id: string) => { fake.reads++; return fake.owned.find((c) => c.id === id) ?? null; }),
  },
}));
vi.mock("$lib/features/post/services/post-workspace-projects", () => ({
  rememberPostSequence: (sequence: { id: string }) => {
    localStorage.setItem(`tka:post:sequence:v1::account:${fake.uid}${sequence.id}`, JSON.stringify(sequence));
  },
}));
vi.mock("$lib/shared/media-composition/services/post-project-store", () => ({
  legacyPostOwner: () => null,
  loadPostProject: (id: string) => fake.project.get(id) ?? null,
  savePostProject: (project: { sequenceId: string }) => {
    fake.saved.push(project);
    fake.project.set(project.sequenceId, project);
    return { ok: true };
  },
}));
vi.mock("$lib/shared/media-composition/services/post-draft-storage", () => ({
  loadPostDraft: async () => fake.draftRead ? fake.draftRead() : { project: null, error: null },
  savePostDraft: async (project: unknown) => { fake.backedUp.push(project); },
}));
vi.mock("$lib/shared/media-composition/domain/post-arrangement-item", () => ({
  createArrangementProject: (snapshot: unknown, sequenceId: string) => ({ snapshot, sequenceId }),
}));

import {
  createStudioArrangement, listStudioArrangements, openCompositionInStudio,
} from "$lib/features/post/services/studio-arrangement-projects";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function composition(id: string): Composition {
  return {
    id, name: "Saved arrangement", layout: { rows: 2, cols: 2 },
    cells: [{ id: "cell-0-0", type: "single", mediaType: "animation",
      sequences: [{ id: "original-sequence", name: "Original", word: "test",
        steps: [{}], thumbnails: [], isFavorite: false, isCircular: false,
        tags: [], metadata: {} } as never], trailSettings: {} as never }],
    createdAt: new Date(), updatedAt: new Date(), creator: "austen", isFavorite: false,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  fake.uid = "account-a"; fake.owned = []; fake.legacy = [];
  fake.project.clear(); fake.saved = []; fake.backedUp = [];
  fake.reads = 0; fake.legacyReads = 0; fake.draftRead = null;
});

describe("Studio arrangement projects", () => {
  it("lists owned and unclaimed legacy separately, importing only a local copy", async () => {
    fake.owned = [composition("owned")];
    fake.legacy = [composition("legacy")];
    const listed = await listStudioArrangements();
    expect(listed.owned).toEqual(fake.owned);
    expect(listed.legacy).toEqual(fake.legacy);
    const id = await openCompositionInStudio("legacy", { legacy: true });
    expect(id).toBe("studio-arrangement:legacy");
    expect(fake.reads).toBe(0);
    expect(fake.saved).toHaveLength(1);
    expect(fake.backedUp).toHaveLength(1);
    const snapshot = (fake.saved[0] as { snapshot: { cells: { layers: { sequence: { id: string } }[] }[] } }).snapshot;
    expect(snapshot.cells[0]?.layers[0]?.sequence.id).toBe("original-sequence");
    expect(fake.legacy[0]?.id).toBe("legacy");
  });

  it("reopens an existing draft without replacing later edits", async () => {
    fake.owned = [composition("owned")];
    const id = await openCompositionInStudio("owned");
    fake.project.set(id, { sequenceId: id, edited: true });
    expect(await openCompositionInStudio("owned")).toBe(id);
    expect(fake.saved).toHaveLength(1);
    expect(fake.reads).toBe(1);
  });

  it("rejects an account change before writing an imported project", async () => {
    fake.owned = [composition("owned")];
    fake.draftRead = async () => {
      fake.uid = "account-b";
      return { project: null, error: null };
    };
    await expect(openCompositionInStudio("owned")).rejects.toThrow("account changed");
    expect(fake.saved).toHaveLength(0);
  });

  it("creates an isolated arrangement with a new source ID", async () => {
    const sequence = composition("source").cells[0]!.sequences[0]!;
    const id = await createStudioArrangement(sequence, "My scene");
    expect(id).toMatch(/^studio-arrangement:/);
    const snapshot = (fake.saved[0] as { snapshot: { cells: { layers: { sequence: { id: string } }[] }[] } }).snapshot;
    expect(snapshot.cells[0]?.layers[0]?.sequence.id).toBe("original-sequence");
    expect(fake.backedUp).toHaveLength(1);
  });
});
