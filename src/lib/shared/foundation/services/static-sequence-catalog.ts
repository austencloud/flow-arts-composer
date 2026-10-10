import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { normalizeLegacySequence } from "@tka/tka-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasMotionPair(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["motions"])) return false;
  const motions = value["motions"];
  return (
    (isRecord(motions["left"]) && isRecord(motions["right"])) ||
    (isRecord(motions["blue"]) && isRecord(motions["red"]))
  );
}

/**
 * Catalog previews must use the exact baked sequence the rest of TKA uses.
 * If an entry disappears or loses its motion data, callers get a real failure
 * instead of a plausible-looking replacement with different choreography.
 */
export function selectStaticSequence(
  payload: unknown,
  sequenceId: string
): SequenceData | null {
  if (!Array.isArray(payload)) return null;

  const candidate = payload.find(
    (entry) => isRecord(entry) && entry["id"] === sequenceId
  );
  if (!isRecord(candidate) || !Array.isArray(candidate["steps"])) return null;
  if (
    candidate["steps"].length === 0 ||
    !candidate["steps"].every(hasMotionPair)
  ) {
    return null;
  }

  return normalizeLegacySequence(candidate) as unknown as SequenceData;
}

export async function loadStaticSequence(
  catalogUrl: string,
  sequenceId: string,
  fetcher: typeof fetch = fetch
): Promise<SequenceData> {
  const response = await fetcher(catalogUrl);
  if (!response.ok) {
    throw new Error(`Sequence catalog returned ${response.status}`);
  }

  const sequence = selectStaticSequence(await response.json(), sequenceId);
  if (!sequence) {
    throw new Error(`Sequence ${sequenceId} is missing or malformed`);
  }
  return sequence;
}
