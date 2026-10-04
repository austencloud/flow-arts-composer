import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Keeps every open tab of one post on the same copy. A tab that saves tells
 * the others, and a tab coming back into view reads this device's saved copy,
 * so no tab is left editing an older version that would later be saved over
 * newer work.
 */
export interface PostTabSync {
  /** Tells the other tabs about a save this tab just made. */
  announce(project: PostProject): void;
  dispose(): void;
}

export function createPostTabSync(
  sequenceId: string,
  adopt: (project: PostProject) => void,
  readSaved: () => PostProject | null
): PostTabSync {
  const tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(`tka:post-studio:tabs:${sequenceId}`);
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { tabId?: unknown; project?: unknown };
    if (data?.tabId === tabId || typeof data?.project !== "string") return;
    try {
      adopt(JSON.parse(data.project) as PostProject);
    } catch {
      // A garbled message changes nothing; the next save or focus catches up.
    }
  };
  const catchUp = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    )
      return;
    const saved = readSaved();
    if (saved) adopt(saved);
  };
  channel?.addEventListener("message", onMessage);
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", catchUp);
  if (typeof window !== "undefined") window.addEventListener("focus", catchUp);
  return {
    announce(project) {
      // Sent as text: an editor's project may be a reactive proxy, which a
      // channel cannot copy.
      channel?.postMessage({ tabId, project: JSON.stringify(project) });
    },
    dispose() {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", catchUp);
      if (typeof window !== "undefined")
        window.removeEventListener("focus", catchUp);
    },
  };
}
