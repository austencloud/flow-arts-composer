import type { PostProject } from "./post-project";

export function takeDisplayLabel(project: PostProject, takeId: string): string {
  const take = project.takes.find((entry) => entry.id === takeId);
  if (!take) return "";
  let sharedLabel: string | undefined;
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.kind !== "video" || item.takeId !== takeId) continue;
      const label = item.label || take.label;
      // One recording can supply differently named cuts. Only a shared name
      // can represent the recording in Videos without hiding that distinction.
      if (sharedLabel !== undefined && sharedLabel !== label) return take.label;
      sharedLabel = label;
    }
  }
  return sharedLabel ?? take.label;
}
