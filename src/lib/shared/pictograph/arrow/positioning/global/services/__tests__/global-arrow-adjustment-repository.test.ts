import { describe, expect, it, vi } from "vitest";
import type { Timestamp } from "firebase/firestore";
import {
  generateAdjustmentKeyString,
  type GlobalAdjustmentKey,
  type GlobalArrowAdjustment,
  type GlobalArrowAdjustmentInput,
} from "../../domain/global-arrow-adjustment";
import type { GlobalArrowAdjustmentPersister } from "../global-arrow-adjustment-persister";
import { GlobalArrowAdjustmentRepository } from "../global-arrow-adjustment-repository";

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { user: { email: "austencloud@gmail.com" } },
}));

function key(arrowKey: string): GlobalAdjustmentKey {
  return {
    placementFrame: "canonical",
    oriKey: "from_layer1",
    letter: "A",
    turnsTuple: "(0, 0)",
    arrowKey,
  };
}

const docId = (arrowKey: string) => generateAdjustmentKeyString(key(arrowKey));

function nudge(arrowKey: string, x: number, y: number): GlobalArrowAdjustment {
  return {
    ...key(arrowKey),
    adjustmentX: x,
    adjustmentY: y,
    updatedAt: {} as Timestamp,
    updatedBy: "test",
  };
}

// Stands in for the Firestore collection: saves and deletes echo back through
// the subscription, the way Firestore's snapshot listener reports them.
function fakeCollection(initial: GlobalArrowAdjustment[]) {
  const docs = new Map(
    initial.map((doc) => [generateAdjustmentKeyString(doc), doc])
  );
  let onAdd: (adjustment: GlobalArrowAdjustment) => void = () => {};
  let onRemove: (keyString: string) => void = () => {};

  const add = (doc: GlobalArrowAdjustment) => {
    docs.set(generateAdjustmentKeyString(doc), doc);
    onAdd(doc);
  };
  const remove = (keyString: string) => {
    if (docs.delete(keyString)) onRemove(keyString);
  };

  const persister = {
    loadAll: async () => [...docs.values()],
    subscribe: (addHandler: typeof onAdd, removeHandler: typeof onRemove) => {
      onAdd = addHandler;
      onRemove = removeHandler;
      return () => {};
    },
    save: async (input: GlobalArrowAdjustmentInput) =>
      add({
        ...input,
        updatedAt: {} as Timestamp,
        updatedBy: "test",
      } as GlobalArrowAdjustment),
    delete: async (keyString: string) => remove(keyString),
  };

  return {
    docs,
    add,
    remove,
    persister: persister as unknown as GlobalArrowAdjustmentPersister,
  };
}

async function repoOver(docs: GlobalArrowAdjustment[]) {
  const collection = fakeCollection(docs);
  const repo = new GlobalArrowAdjustmentRepository(collection.persister);
  await repo.initialize();
  return { repo, collection };
}

// Staff on both hands reads the no-prop layer, where the January nudges live.
function lookup(repo: GlobalArrowAdjustmentRepository, arrowKey: string) {
  return (
    repo.getAdjustmentCascading(key(arrowKey), "staff", "staff")?.adjustment ??
    null
  );
}

describe("GlobalArrowAdjustmentRepository: nudges saved under blue/red", () => {
  it("serves blue as the left arrow and red as the right arrow", async () => {
    const { repo } = await repoOver([
      nudge("blue", 120, -110),
      nudge("red", -70, -40),
    ]);

    expect(lookup(repo, "left")).toEqual({ x: 120, y: -110 });
    expect(lookup(repo, "right")).toEqual({ x: -70, y: -40 });
  });

  it.each([
    {
      first: "the hand-named nudge",
      docs: [nudge("left", 5, 6), nudge("blue", 120, -110)],
    },
    {
      first: "the old nudge",
      docs: [nudge("blue", 120, -110), nudge("left", 5, 6)],
    },
  ])(
    "prefers the nudge saved under the hand name when $first loads first",
    async ({ docs }) => {
      const { repo } = await repoOver(docs);

      expect(lookup(repo, "left")).toEqual({ x: 5, y: 6 });
    }
  );

  it("falls back to the old nudge only once the hand-named one is gone", async () => {
    const { repo, collection } = await repoOver([nudge("left", 5, 6)]);

    collection.add(nudge("blue", 120, -110));
    expect(lookup(repo, "left")).toEqual({ x: 5, y: 6 });

    collection.remove(docId("left"));
    expect(lookup(repo, "left")).toEqual({ x: 120, y: -110 });
  });

  it("saving over an old nudge replaces it, so a later reset cannot bring it back", async () => {
    const { repo, collection } = await repoOver([nudge("blue", 120, -110)]);

    await repo.saveAdjustment({
      ...key("left"),
      adjustmentX: 5,
      adjustmentY: 6,
    });
    expect([...collection.docs.keys()]).toEqual([docId("left")]);
    expect(lookup(repo, "left")).toEqual({ x: 5, y: 6 });

    await repo.deleteAdjustment(key("left"));
    expect(collection.docs.size).toBe(0);
    expect(lookup(repo, "left")).toBeNull();
  });

  it("resetting an old nudge deletes its stored copy", async () => {
    const { repo, collection } = await repoOver([nudge("red", -70, -40)]);

    await repo.deleteAdjustment(key("right"));

    expect(collection.docs.size).toBe(0);
    expect(lookup(repo, "right")).toBeNull();
  });

  it("reverting an old history entry saves it under the hand name", async () => {
    const { repo, collection } = await repoOver([]);

    await repo.saveAdjustment({
      ...key("blue"),
      adjustmentX: 1,
      adjustmentY: 2,
    });

    expect([...collection.docs.keys()]).toEqual([docId("left")]);
  });
});
