/**
 * Which sequences have a loop clip. One small JSON document per renderer
 * version, fetched once per page and shared by every surface that asks.
 *
 * This is the pilot's discovery path. The long-term home for a clip's
 * address is the sequence's own public record, written when the clip is
 * rendered at publish time; an index that lists every clip does not scale
 * past a few hundred entries and will be retired when that lands.
 */

import {
  LOOP_CLIP_RENDERER_VERSION,
  loopClipIndexKey,
  loopClipUrl,
  type LoopClipIndex,
} from "./loop-clip-spec";

let pending: Promise<LoopClipIndex | null> | null = null;

function isIndex(value: unknown): value is LoopClipIndex {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopClipIndex>;
  return (
    typeof candidate.rendererVersion === "number" &&
    !!candidate.clips &&
    typeof candidate.clips === "object"
  );
}

/**
 * The published index, or null when there is none (or the fetch failed).
 * A failure is remembered for the page: a wall must not retry a missing
 * document on every tile.
 */
export function loadLoopClipIndex(
  fetchImpl: typeof fetch = fetch
): Promise<LoopClipIndex | null> {
  pending ??= (async () => {
    try {
      const response = await fetchImpl(loopClipUrl(loopClipIndexKey()), {
        cache: "default",
        credentials: "omit",
      });
      if (!response.ok) return null;
      const json: unknown = await response.json();
      if (!isIndex(json)) return null;
      if (json.rendererVersion !== LOOP_CLIP_RENDERER_VERSION) return null;
      return json;
    } catch {
      return null;
    }
  })();
  return pending;
}

/** The playable URL for a sequence, or null when no clip is listed. */
export function loopClipUrlFor(
  index: LoopClipIndex | null,
  sequenceId: string | null | undefined
): string | null {
  if (!index || !sequenceId) return null;
  const entry = index.clips[sequenceId];
  return entry ? loopClipUrl(entry.key) : null;
}

/** Tests only: forget the memoised fetch. */
export function resetLoopClipIndexForTests(): void {
  pending = null;
}
