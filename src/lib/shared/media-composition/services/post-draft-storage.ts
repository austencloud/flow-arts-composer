import type { PostProject } from "../domain/post-project";
import { auth } from "$lib/shared/auth/firebase";
import { legacyPostOwner } from "./post-project-store";
import {
  projectDraftRecord,
  resolvePostStudioDraft,
} from "./post-project-backup";

const ENDPOINT = "/_local/post-studio-drafts";
const LOAD_DEADLINE_MS = 10_000;
const PREFIXES = [
  "tka:post-studio:project:v2:",
  "tka:post-studio:take-timing:v1:",
];

export interface PostDraftRecord {
  key: string;
  value: string;
}

/** A new post has no media to protect until it contains a take or an item. */
export function isEmptyPostProject(project: PostProject): boolean {
  return (
    project.takes.length === 0 &&
    project.tracks.every((track) => track.items.length === 0)
  );
}

export function shouldSubmitPostDraft(
  project: PostProject,
  revision: number
): boolean {
  return revision > 0 || !isEmptyPostProject(project);
}

function recordsForSequence(
  sequenceId: string,
  records: readonly PostDraftRecord[]
): PostDraftRecord[] {
  return records.filter(
    (record) =>
      typeof record.key === "string" &&
      typeof record.value === "string" &&
      (record.key === `${PREFIXES[0]}${sequenceId}` ||
        record.key.startsWith(`${PREFIXES[1]}${sequenceId}:`))
  );
}

/** Read only this editor's drafts; unrelated browser data never enters a backup. */
export function readPostDraftRecords(): PostDraftRecord[] {
  const records: PostDraftRecord[] = [];
  const owner = legacyPostOwner();
  const uid =
    auth.currentUser && !auth.currentUser.isAnonymous
      ? auth.currentUser.uid
      : null;
  const guestAfterClaim = !!owner && owner !== uid;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      !key ||
      key.startsWith(`${PREFIXES[0]}account:`) ||
      (guestAfterClaim && !key.startsWith(`${PREFIXES[0]}guest:`)) ||
      (!guestAfterClaim && key.startsWith(`${PREFIXES[0]}guest:`)) ||
      !PREFIXES.some((prefix) => key.startsWith(prefix))
    )
      continue;
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
  if (
    legacyPostOwner() &&
    legacyPostOwner() !==
      (auth.currentUser?.isAnonymous ? null : auth.currentUser?.uid)
  )
    return {
      project: resolvePostStudioDraft(
        sequenceId,
        readPostDraftRecords().filter(
          (record) => record.key === `${PREFIXES[0]}guest:${sequenceId}`
        )
      ),
      diskAvailable: false,
      error: null,
    };
  let records: PostDraftRecord[] = [];
  let error: string | null = null;
  const browserRecords = (): PostDraftRecord[] => {
    try {
      records = recordsForSequence(sequenceId, readPostDraftRecords());
    } catch {
      error =
        "Browser storage is unavailable. Keep this editor open until a backup is saved.";
    }
    return records;
  };
  browserRecords();
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const archive = (async () => {
      const query = new URLSearchParams({ sequenceId });
      const response = await fetch(`${ENDPOINT}?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 404) return { response, saved: null };
      if (!response.ok)
        throw new Error("Could not read saved drafts from this computer.");
      const saved: unknown = await response.json();
      if (
        !saved ||
        typeof saved !== "object" ||
        !("records" in saved) ||
        !Array.isArray(saved.records)
      )
        throw new Error("The draft archive returned an invalid response.");
      return { response, saved: { records: saved.records } };
    })();
    const { response, saved } = await Promise.race([
      archive,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          controller.abort();
          reject(
            new Error("Reading the draft archive timed out after 10 seconds.")
          );
        }, LOAD_DEADLINE_MS);
      }),
    ]);
    if (response.status === 404) {
      return {
        project: resolvePostStudioDraft(sequenceId, browserRecords()),
        diskAvailable: false,
        error,
      };
    }
    return {
      project: resolvePostStudioDraft(sequenceId, [
        ...browserRecords(),
        ...recordsForSequence(sequenceId, saved!.records),
      ]),
      diskAvailable: true,
      error,
    };
  } catch (cause) {
    return {
      project: resolvePostStudioDraft(sequenceId, browserRecords()),
      diskAvailable: true,
      error:
        cause instanceof Error
          ? cause.message
          : "Could not read the draft archive.",
    };
  } finally {
    clearTimeout(deadline);
  }
}

export async function savePostDraft(project: PostProject): Promise<void> {
  await savePostDraftRecords([projectDraftRecord(project)]);
}

/** Writes draft records to the dev server's draft folder. */
export async function savePostDraftRecords(
  records: readonly PostDraftRecord[]
): Promise<void> {
  const body = JSON.stringify({ records });
  const post = (keepalive: boolean) =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive,
    });
  // Keepalive lets a save finish after the tab closes, but the browser caps
  // the keepalive bytes a page has in flight at 64 KiB. Large posts, and a
  // keepalive post turned away because an earlier one is still out, go as
  // a normal request while the draft stays in browser storage.
  const keepalive = new TextEncoder().encode(body).length < 60_000;
  let response: Response;
  try {
    response = await post(keepalive);
  } catch (cause) {
    if (!keepalive) throw cause;
    response = await post(false);
  }
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
