import { getSequencePersister } from "../get-sequence-persister.js";
import type { DraftVersion } from "./draft-types.js";

export const deviceDraftModes = ["construct", "generate", "assemble"] as const;
export type DeviceDraftMode = (typeof deviceDraftModes)[number];

export interface DeviceDraft {
  id: string;
  mode: DeviceDraftMode;
  latest: DraftVersion;
  versions: DraftVersion[];
}

/** A session owns its versions, even when two drafts contain the same sequence. */
export function groupDeviceDrafts(versions: DraftVersion[]): DeviceDraft[] {
  const drafts = new Map<string, DeviceDraft>();
  for (const version of [...versions].sort((a, b) => b.savedAt - a.savedAt)) {
    if (!deviceDraftModes.includes(version.mode as DeviceDraftMode)) continue;
    const workspace = version.workspace;
    if (
      !workspace.currentSequence?.steps.length &&
      !workspace.selectedStartPlacement &&
      !workspace.hasStartPlacement
    )
      continue;
    const id = `${version.mode}:${version.sessionId}`;
    const existing = drafts.get(id);
    if (existing) {
      if (!existing.versions.some((saved) => saved.id === version.id)) {
        existing.versions.push(version);
      }
    } else {
      drafts.set(id, {
        id,
        mode: version.mode as DeviceDraftMode,
        latest: version,
        versions: [version],
      });
    }
  }
  return [...drafts.values()];
}

export async function listDeviceDrafts(): Promise<DeviceDraft[]> {
  const persister = getSequencePersister();
  // Leaving Create flushes pending edits. Wait for those writes before listing.
  await persister.waitForPendingSaves();
  return groupDeviceDrafts(
    (
      await Promise.all(
        deviceDraftModes.map((mode) => persister.listDrafts(mode))
      )
    ).flat()
  );
}

export function draftResumePath(version: DraftVersion): string {
  return `/create/${version.mode}?draft=${encodeURIComponent(version.id)}`;
}
