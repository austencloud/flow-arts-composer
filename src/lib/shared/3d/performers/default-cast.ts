import {
  CHARACTER_DEFINITIONS,
  DEFAULT_CHARACTER_ID,
  type CharacterDefinition,
  type CharacterId,
} from "../domain/character-model";

/**
 * Who a new performer is when nobody has chosen: one of four real-looking
 * people, picked by Austen on 2026-11-12 to replace the x-bot mannequin.
 *
 * The order alternates woman, man, woman, man, so any two neighbours are one
 * of each: a visitor's first performer and the next one added make a mixed
 * duet whichever of the four the visitor starts on.
 */
export const DEFAULT_CAST_IDS: readonly CharacterId[] = [
  "renderpeople-sophia",
  "renderpeople-manuel",
  "ch07", // Jade
  "rocketbox-male-adult-08", // Owen
];

/** The body every performer had before the cast. Still pickable by hand. */
export const RETIRED_DEFAULT_CHARACTER_ID: CharacterId = "x-bot";

/** Where in the cast this visitor starts, drawn once and kept. */
export const DEFAULT_CAST_START_KEY = "tka-default-cast-start";

/** Set once a returning visitor's saved mannequins have been recast. */
export const DEFAULT_CAST_ADOPTED_KEY = "tka-default-cast-adopted";

type CastStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): CastStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Storage access throws in some privacy modes.
    return null;
  }
}

/**
 * The cast this build can actually load. The cast changes over as one: while
 * any member is missing (a production build before the upload) every new
 * performer keeps the mannequin, rather than the whole site becoming Jade.
 */
export function defaultCastPool(
  definitions: readonly CharacterDefinition[] = CHARACTER_DEFINITIONS
): readonly CharacterId[] {
  const known = new Set(definitions.map(({ id }) => id));
  return DEFAULT_CAST_IDS.every((id) => known.has(id))
    ? DEFAULT_CAST_IDS
    : [DEFAULT_CHARACTER_ID];
}

function isFullCast(pool: readonly CharacterId[]): boolean {
  return pool.length === DEFAULT_CAST_IDS.length;
}

/**
 * This visitor's starting place in the cast. Random on the first visit, then
 * the same every time, so a preview tile and the viewer it opens show the
 * same person. Without storage (server render, tests) it starts at the top.
 */
export function defaultCastStart(
  storage: CastStorage | null = browserStorage(),
  random: () => number = Math.random
): number {
  if (!storage) return 0;
  try {
    const saved = Number.parseInt(storage.getItem(DEFAULT_CAST_START_KEY) ?? "", 10);
    if (Number.isInteger(saved) && saved >= 0 && saved < DEFAULT_CAST_IDS.length) {
      return saved;
    }
    const drawn = Math.floor(random() * DEFAULT_CAST_IDS.length);
    storage.setItem(DEFAULT_CAST_START_KEY, String(drawn));
    return drawn;
  } catch {
    return 0;
  }
}

/**
 * The character for a new performer: the first cast member, from this
 * visitor's starting place, that nobody on stage has yet. Past four
 * performers the cast repeats in the same order.
 */
export function pickDefaultCastCharacter(
  taken: readonly CharacterId[],
  pool: readonly CharacterId[] = defaultCastPool(),
  start: number = defaultCastStart()
): CharacterId {
  const used = new Set(taken);
  for (let step = 0; step < pool.length; step++) {
    const id = pool[(start + step) % pool.length]!;
    if (!used.has(id)) return id;
  }
  return pool[(start + taken.length) % pool.length]!;
}

/**
 * A returning visitor's saved cast still holds the mannequin, because it was
 * everyone's default. Recast those performers once, keeping every body the
 * visitor chose by hand. After this runs, a mannequin in the saved cast is a
 * choice and stays. Nothing happens, and nothing is marked, until this build
 * can load the whole cast.
 */
export function adoptDefaultCast(
  characterIds: readonly (CharacterId | undefined)[],
  pool: readonly CharacterId[] = defaultCastPool(),
  storage: CastStorage | null = browserStorage(),
  start: number = defaultCastStart(storage)
): (CharacterId | undefined)[] {
  if (!storage || !isFullCast(pool)) return [...characterIds];
  try {
    if (storage.getItem(DEFAULT_CAST_ADOPTED_KEY)) return [...characterIds];
    storage.setItem(DEFAULT_CAST_ADOPTED_KEY, "1");
  } catch {
    return [...characterIds];
  }

  const kept = characterIds.filter(
    (id): id is CharacterId => !!id && id !== RETIRED_DEFAULT_CHARACTER_ID
  );
  const assigned: CharacterId[] = [];
  return characterIds.map((id) => {
    if (id !== RETIRED_DEFAULT_CHARACTER_ID) return id;
    const next = pickDefaultCastCharacter([...kept, ...assigned], pool, start);
    assigned.push(next);
    return next;
  });
}
