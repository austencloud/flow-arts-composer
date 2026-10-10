import {
  hashString,
  mulberry32,
} from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

export interface FilmSeed {
  base: number;
  axes: Record<string, number>;
}

export interface FilmSeedInput {
  base?: number;
  axes?: Record<string, number>;
}

export function resolveFilmSeed(
  filmId: string,
  input?: FilmSeedInput
): FilmSeed {
  return {
    base: input?.base ?? hashString(filmId),
    axes: { ...(input?.axes ?? {}) },
  };
}

export function createAxisStream(
  seed: FilmSeed,
  sceneId: string,
  axis: string
): () => number {
  return mulberry32(axisSeedValue(seed, sceneId, axis));
}

export function axisSeedValue(
  seed: FilmSeed,
  sceneId: string,
  axis: string
): number {
  const salt = seed.axes[axis] ?? 0;
  return hashString(`${seed.base}\u0000${salt}\u0000${sceneId}\u0000${axis}`);
}

export function seededShuffle<T>(
  items: readonly T[],
  random: () => number
): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function seededPick<T>(
  items: readonly T[],
  random: () => number
): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}
