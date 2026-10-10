import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { getSequenceRepository } from "#lib/shared/create/get-sequence-repository.js";
import type { MandalaPrimitiveRef } from "../domain/sticker-types";

const cache = $state<Record<string, MandalaPaths>>({});
const inFlight = new Map<string, Promise<MandalaPaths | null>>();

export function getPrimitivePaths(shapeHash: string): MandalaPaths | null {
  return cache[shapeHash] ?? null;
}

export async function loadPrimitivePaths(
  ref: MandalaPrimitiveRef
): Promise<MandalaPaths | null> {
  if (cache[ref.shapeHash]) return cache[ref.shapeHash]!;
  const existing = inFlight.get(ref.shapeHash);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (!ref.representativeSequenceId) return null;
      const seq = await getSequenceRepository().getSequence(
        ref.representativeSequenceId
      );
      if (!seq?.steps) return null;
      const paths = calculateMandalaGeometry(seq.steps);
      cache[ref.shapeHash] = paths;
      return paths;
    } catch (err) {
      console.error(
        `[mandala-paths-cache] load failed for ${ref.representativeSequenceId}:`,
        err
      );
      return null;
    } finally {
      inFlight.delete(ref.shapeHash);
    }
  })();

  inFlight.set(ref.shapeHash, promise);
  return promise;
}

export function cachePrimitivePaths(
  shapeHash: string,
  paths: MandalaPaths
): void {
  cache[shapeHash] = paths;
}

export function clearMandalaPathsCache(): void {
  for (const k of Object.keys(cache)) delete cache[k];
  inFlight.clear();
}
