import { getFunctionsInstance } from "#lib/shared/auth/firebase.js";

export interface PurgeOneCountResult {
  scanned: number;
  candidates: number;
  deleted: number;
  publicRemoved: number;
  sample: Array<{ id: string; ownerId: string; word: string }>;
}

/** Run the admin one-count purge. dryRun=true returns counts without deleting. */
export async function purgeOneCountSequences(
  dryRun: boolean
): Promise<PurgeOneCountResult> {
  const { httpsCallable } = await import("firebase/functions");
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ dryRun: boolean }, PurgeOneCountResult>(
    functions,
    "purgeOneCountSequences"
  );
  const res = await fn({ dryRun });
  return res.data;
}

/** Admin delete of any user's sequence (gallery right-click on someone else's card). */
export async function adminDeleteSequence(
  ownerId: string,
  sequenceId: string
): Promise<{ deleted: boolean; publicRemoved: boolean }> {
  const { httpsCallable } = await import("firebase/functions");
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<
    { ownerId: string; sequenceId: string },
    { deleted: boolean; publicRemoved: boolean }
  >(functions, "adminDeleteSequence");
  const res = await fn({ ownerId, sequenceId });
  return res.data;
}
