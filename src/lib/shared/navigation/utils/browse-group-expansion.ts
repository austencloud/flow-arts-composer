import type { SectionGroup } from "../domain/types.js";

/** Add defaults for groups introduced after an existing sidebar preference. */
export function mergeBrowseGroupExpansion(
  stored: string | null,
  groups: SectionGroup[]
): string | null {
  let expanded: Record<string, unknown> = {};
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        expanded = parsed as Record<string, unknown>;
      }
    } catch {
      // A malformed old preference is replaced with the visible defaults.
    }
  }

  let changed = stored === null;
  for (const group of groups) {
    if (typeof expanded[group.id] !== "boolean") {
      expanded[group.id] = true;
      changed = true;
    }
  }
  return changed ? JSON.stringify(expanded) : null;
}
