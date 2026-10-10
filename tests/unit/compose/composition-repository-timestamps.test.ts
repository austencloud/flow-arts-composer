import { describe, expect, it, vi } from "vitest";
import type { Composition } from "$lib/shared/animation-engine/domain/compose-types";

const fake = vi.hoisted(() => ({ stored: null as Composition | null }));
vi.mock("$lib/shared/persistence/database/tka-database", () => ({
  db: { compositions: {
    get: vi.fn(async () => fake.stored),
    put: vi.fn(async (value: Composition) => { fake.stored = value; }),
  } },
}));

import { saveComposition } from "$lib/features/compose/services/dexie-composition-repository";

describe("composition local timestamps", () => {
  it("preserves remote edit time during cloud hydration for later conflict decisions", async () => {
    const remoteTime = new Date("2026-01-02T00:00:00Z");
    const composition: Composition = { id: "cloud", ownerId: "A", name: "cloud",
      layout: { rows: 1, cols: 1 }, cells: [], createdAt: remoteTime,
      updatedAt: remoteTime, creator: "austen", isFavorite: false };
    const saved = await saveComposition(composition, { preserveUpdatedAt: true });
    expect(saved.updatedAt).toEqual(remoteTime);
    expect(fake.stored?.updatedAt).toEqual(remoteTime);
  });
});
