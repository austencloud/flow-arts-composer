import type { PostProject } from "../domain/post-project";
import {
  projectDraftRecord,
  resolvePostStudioDraft,
} from "./post-project-backup";

const ENDPOINT = "/_local/post-studio-drafts";
const PREFIXES = [
  "tka:post-studio:project:v2:",
  "tka:post-studio:take-timing:v1:",
];

export interface PostDraftRecord {
  key: string;
  value: string;
}

/** Read only this editor's drafts; unrelated browser data never enters a backup. */
export function readPostDraftRecords(): PostDraftRecord[] {
  const records: PostDraftRecord[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    const value = localStorage.getItem(key);
    if (value !== null) records.push({ key, value });
  }
  return records;
}

/** Local dev servers share one disk archive across browser origins and worktrees. */
export async function loadPostDraft(sequenceId: string): Promise<{
  project: PostProject | null;
  diskAvailable: boolean;
  error: string | null;
}> {
  let records: PostDraftRecord[] = [];
  let error: string | null = null;
  try {
    records = readPostDraftRecords();
  } catch {
    error =
      "Browser storage is unavailable. Keep this editor open until a backup is saved.";
  }
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (response.status === 404) {
      return {
        project: resolvePostStudioDraft(sequenceId, records),
        diskAvailable: false,
        error,
      };
    }
    if (!response.ok)
      throw new Error("Could not read saved drafts from this computer.");
    const saved = await response.json();
    if (!Array.isArray(saved.records))
      throw new Error("The draft archive returned an invalid response.");
    return {
      project: resolvePostStudioDraft(sequenceId, [
        ...records,
        ...saved.records,
      ]),
      diskAvailable: true,
      error,
    };
  } catch (cause) {
    return {
      project: resolvePostStudioDraft(sequenceId, records),
      diskAvailable: true,
      error:
        cause instanceof Error
          ? cause.message
          : "Could not read the draft archive.",
    };
  }
}

export async function savePostDraft(project: PostProject): Promise<void> {
  const body = JSON.stringify({ records: [projectDraftRecord(project)] });
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // The browser caps keepalive requests at 64 KiB. Large posts remain in
    // browser storage while the normal request completes.
    keepalive: new TextEncoder().encode(body).length < 60_000,
  });
  if (!response.ok)
    throw new Error(
      "The disk backup failed. Keep this editor open and download a backup."
    );
}

/** Serialize writes so an older request cannot finish after the newest edit. */
export function createPostDraftAutosave(
  save: (project: PostProject) => Promise<void>,
  onStatus: (saving: boolean, error: string | null) => void
) {
  let queued: PostProject | null = null;
  let latest: PostProject | null = null;
  let running = false;
  let disposed = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    while (queued) {
      const project = queued;
      queued = null;
      let error: string | null = null;
      try {
        await save(project);
      } catch (cause) {
        error =
          cause instanceof Error
            ? cause.message
            : "Could not save the disk backup.";
      }
      if (!queued && !disposed) onStatus(false, error);
    }
    running = false;
  }

  function submit(project: PostProject): void {
    latest = project;
    queued = project;
    if (!disposed) onStatus(true, null);
    void drain();
  }

  return {
    submit,
    retry: () => {
      if (latest) submit(latest);
    },
    dispose: () => {
      disposed = true;
    },
  };
}
