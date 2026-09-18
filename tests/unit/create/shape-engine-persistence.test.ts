// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  SHAPE_ENGINE_STORAGE_KEY,
  SHAPE_ENGINE_LEGACY_STORAGE_KEY,
  createShapeEnginePersistence,
} from "$lib/features/create/shape-engine/shape-engine-persistence";

const snapshot = (level: number) =>
  ({ level }) as unknown as Parameters<
    ReturnType<typeof createShapeEnginePersistence>["persist"]
  >[0];

describe("createShapeEnginePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("restores the current key", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 2 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 2 });
  });

  it("falls back to the Toys-era key when the current key is empty", () => {
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 3 });
  });

  it("prefers the current key over the legacy key", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 2 })
    );
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 2 });
  });

  it("rejects a snapshot with an unknown level", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 9 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    localStorage.setItem(SHAPE_ENGINE_STORAGE_KEY, "{not json");
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("writes the current key and drops the legacy key on persist", () => {
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    persistence.persist(snapshot(4));
    expect(
      JSON.parse(localStorage.getItem(SHAPE_ENGINE_STORAGE_KEY) ?? "")
    ).toEqual({ level: 4 });
    expect(localStorage.getItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("swallows storage failures on persist", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    } as unknown as Storage;
    const persistence = createShapeEnginePersistence(throwing);
    expect(() => persistence.persist(snapshot(1))).not.toThrow();
  });
});
