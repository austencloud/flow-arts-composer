import { describe, expect, it } from "vitest";

import { CHARACTER_PRESENTATION } from "../config/character-presentation";
import { DEFAULT_CHARACTER_ID } from "../domain/character-model";
import {
  adoptDefaultCast,
  DEFAULT_CAST_ADOPTED_KEY,
  DEFAULT_CAST_IDS,
  DEFAULT_CAST_START_KEY,
  defaultCastPool,
  defaultCastStart,
  pickDefaultCastCharacter,
} from "./default-cast";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

const castDefinitions = DEFAULT_CAST_IDS.map((id) => ({
  id,
  name: id,
  modelPath: `/${id}.glb`,
}));

describe("default cast", () => {
  it("is two women and two men, and any two neighbours are one of each", () => {
    const looks = DEFAULT_CAST_IDS.map((id) => CHARACTER_PRESENTATION[id]);
    expect(looks.filter((look) => look === "feminine")).toHaveLength(2);
    expect(looks.filter((look) => look === "masculine")).toHaveLength(2);
    for (let i = 0; i < looks.length; i++) {
      expect(looks[i]).not.toBe(looks[(i + 1) % looks.length]);
    }
  });

  it("keeps the mannequin until every member can load", () => {
    expect(defaultCastPool(castDefinitions)).toEqual(DEFAULT_CAST_IDS);
    // Production before the upload: only Jade is deployed.
    expect(defaultCastPool(castDefinitions.filter(({ id }) => id === "ch07"))).toEqual([
      DEFAULT_CHARACTER_ID,
    ]);
  });

  it("gives each new performer someone not already on stage", () => {
    const pool = DEFAULT_CAST_IDS;
    const taken: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      taken.push(pickDefaultCastCharacter(taken, pool, 2));
    }
    expect(new Set(taken).size).toBe(pool.length);
    expect(taken[0]).toBe(pool[2]);
    // A fifth performer starts the cast over.
    expect(pickDefaultCastCharacter(taken, pool, 2)).toBe(pool[2]);
  });

  it("draws the starting place once and keeps it", () => {
    const storage = memoryStorage();
    expect(defaultCastStart(storage, () => 0.6)).toBe(2);
    expect(storage.values.get(DEFAULT_CAST_START_KEY)).toBe("2");
    expect(defaultCastStart(storage, () => 0)).toBe(2);
    expect(defaultCastStart(null)).toBe(0);
  });

  it("recasts saved mannequins once and keeps hand-picked bodies", () => {
    const storage = memoryStorage();
    const saved = ["x-bot", "ch12", "x-bot"];
    const recast = adoptDefaultCast(saved, DEFAULT_CAST_IDS, storage, 0);
    expect(recast[1]).toBe("ch12");
    expect(recast[0]).toBe(DEFAULT_CAST_IDS[0]);
    expect(recast[2]).toBe(DEFAULT_CAST_IDS[1]);
    expect(storage.values.get(DEFAULT_CAST_ADOPTED_KEY)).toBe("1");
    // Chosen again after the switch, the mannequin stays.
    expect(adoptDefaultCast(["x-bot"], DEFAULT_CAST_IDS, storage, 0)).toEqual(["x-bot"]);
  });

  it("waits to recast until the whole cast can load", () => {
    const storage = memoryStorage();
    expect(adoptDefaultCast(["x-bot"], [DEFAULT_CHARACTER_ID], storage, 0)).toEqual(["x-bot"]);
    expect(storage.values.has(DEFAULT_CAST_ADOPTED_KEY)).toBe(false);
  });
});
