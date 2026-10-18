import type { DraftVersion } from "./draft-types.js";

function visibleKey(version: DraftVersion): string {
  const { currentSequence, selectedStartPlacement, hasStartPlacement } =
    version.workspace;
  return JSON.stringify([
    currentSequence?.steps ?? [],
    selectedStartPlacement ?? currentSequence?.startPlacement ?? null,
    hasStartPlacement,
  ]);
}

/**
 * Storage keeps saves apart when only their undo history differs, but a person
 * choosing a version sees the sequence. Show each sequence once, newest first.
 */
export function distinctVisibleVersions(
  versions: DraftVersion[]
): DraftVersion[] {
  const seen = new Set<string>();
  return [...versions]
    .sort((a, b) => b.savedAt - a.savedAt)
    .filter((version) => {
      const key = visibleKey(version);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
