/**
 * ImageStager
 *
 * Uploads feedback images to a temporary staging path in Firebase Storage
 * as soon as they're attached. Uses uploadBytesResumable() for byte-level
 * progress and supports cancellation when images are removed.
 *
 * Staging path: feedback-staging/{userId}/{timestamp}_{filename}
 * A scheduled Cloud Function cleans up orphaned files after 30 minutes.
 */

import { getStorageInstance } from "#lib/shared/auth/firebase.js";
import type { StagedUploadHandle, StagedProgressCallback } from "#lib/shared/feedback/domain/feedback-contract-types.js";
import type { UploadTask } from 'firebase/storage';

export function stageImage(
  file: File,
  userId: string,
  onProgress: StagedProgressCallback
): StagedUploadHandle {
  const timestamp = Date.now();
  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `feedback-staging/${userId}/${timestamp}_${sanitizedFilename}`;

  let cancelled = false;
  let uploadTask: UploadTask | null = null;

  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  (async () => {
    try {
      const { ref, uploadBytesResumable, getDownloadURL, deleteObject } =
        await import("firebase/storage");
      const storage = await getStorageInstance();
      const storageRef = ref(storage, storagePath);

      uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          if (cancelled) return;
          onProgress({
            status: "uploading",
            fraction: snapshot.bytesTransferred / snapshot.totalBytes,
            storagePath,
          });
        },
        (error) => {
          if (cancelled) return;
          onProgress({ status: "failed", fraction: 0, storagePath });
          reject(error);
        },
        async () => {
          if (cancelled) {
            try {
              await deleteObject(storageRef);
            } catch {
              /* best effort */
            }
            reject(new Error("Upload cancelled"));
            return;
          }
          try {
            const downloadUrl = await getDownloadURL(storageRef);
            onProgress({
              status: "uploaded",
              fraction: 1,
              downloadUrl,
              storagePath,
            });
            resolve(downloadUrl);
          } catch (error) {
            onProgress({ status: "failed", fraction: 0, storagePath });
            reject(error);
          }
        }
      );
    } catch (error) {
      onProgress({ status: "failed", fraction: 0, storagePath });
      reject(error);
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      uploadTask?.cancel();
    },
    storagePath,
  };
}

export async function deleteStaged(storagePath: string): Promise<void> {
  try {
    const { ref, deleteObject } = await import("firebase/storage");
    const storage = await getStorageInstance();
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error) {
    // Best effort - file may already be gone or never fully uploaded
    console.warn(
      "[ImageStager] Failed to delete staged file:",
      storagePath,
      error
    );
  }
}
