/**
 * PoiImageLibrary
 *
 * Per-user repository for uploaded POV pattern images. Follows the same
 * Firebase Storage + Firestore pattern as ScreenshotUploader: lazy-import
 * firebase/storage and firebase/firestore so they stay out of the main
 * chunk, scope everything under `users/{userId}/poi-images/...`, and
 * use a content hash as the stable document ID for dedup.
 */

import type { PoiImageLibraryEntry } from "../domain/poi-image-library-entry";
import { getEffectiveUserId } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  getStorageInstance,
  getFirestoreInstance,
} from "#lib/shared/auth/firebase.js";

export async function upload(
  file: File,
  source: "upload-zone" | "timeline-drop",
): Promise<PoiImageLibraryEntry | null> {
  const userId = getEffectiveUserId();
  if (!userId) return null;

  const id = await hashFile(file);

  const firestore = await getFirestoreInstance();
  const { doc, getDoc, setDoc } = await import("firebase/firestore");
  const docRef = doc(firestore, `users/${userId}/poi-images/${id}`);

  // Dedup check - identical uploads collide on the content hash, so
  // we can skip the Storage round-trip entirely for a repeat upload.
  const existing = await getDoc(docRef);
  if (existing.exists()) {
    return existing.data() as PoiImageLibraryEntry;
  }

  // Pixel dimensions for the metadata doc (cheap via createImageBitmap)
  let width = 0;
  let height = 0;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    // Bitmap decode failure shouldn't block the upload - we still want
    // the binary saved. Width/height will just be 0 in the doc.
  }

  // Upload binary to Storage
  const storage = await getStorageInstance();
  const { ref, uploadBytes, getDownloadURL } = await import(
    "firebase/storage"
  );
  const ext = extFromContentType(file.type) ?? "bin";
  const storagePath = `users/${userId}/poi-images/${id}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const storageUrl = await getDownloadURL(storageRef);

  // Write the Firestore metadata doc
  const entry: PoiImageLibraryEntry = {
    id,
    name: file.name.replace(/\.[^.]+$/, ""),
    originalFileName: file.name,
    storageUrl,
    sizeBytes: file.size,
    width,
    height,
    contentType: file.type,
    uploadedAt: Date.now(),
    source,
  };
  await setDoc(docRef, entry);
  return entry;
}

export function subscribe(
  onChange: (entries: PoiImageLibraryEntry[]) => void,
): () => void {
  const userId = getEffectiveUserId();
  if (!userId) {
    // Guest fallback - emit an empty list and hand back a noop teardown.
    onChange([]);
    return () => {
      /* noop */
    };
  }

  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  (async () => {
    try {
      const firestore = await getFirestoreInstance();
      const { collection, onSnapshot, query, orderBy } = await import(
        "firebase/firestore"
      );
      if (cancelled) return;
      const q = query(
        collection(firestore, `users/${userId}/poi-images`),
        orderBy("uploadedAt", "desc"),
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const entries: PoiImageLibraryEntry[] = [];
          snap.forEach((d) =>
            entries.push(d.data() as PoiImageLibraryEntry),
          );
          onChange(entries);
        },
        (error) => {
          console.warn(
            "[PoiImageLibrary] onSnapshot error:",
            error,
          );
        },
      );
    } catch (error) {
      console.warn(
        "[PoiImageLibrary] Failed to subscribe to library:",
        error,
      );
    }
  })();

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

/** Fetch a single library entry by id. Returns null for guests or a miss. */
export async function getEntry(
  id: string,
): Promise<PoiImageLibraryEntry | null> {
  const userId = getEffectiveUserId();
  if (!userId) return null;
  const firestore = await getFirestoreInstance();
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(
    doc(firestore, `users/${userId}/poi-images/${id}`),
  );
  return snapshot.exists()
    ? (snapshot.data() as PoiImageLibraryEntry)
    : null;
}

export async function rename(id: string, name: string): Promise<void> {
  const userId = getEffectiveUserId();
  if (!userId) return;
  const firestore = await getFirestoreInstance();
  const { doc, updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(firestore, `users/${userId}/poi-images/${id}`), {
    name,
  });
}

export async function deleteEntry(id: string): Promise<void> {
  const userId = getEffectiveUserId();
  if (!userId) return;

  // Firestore doc first - it's the source of truth. If the Storage
  // cleanup later fails we're left with an orphaned binary, which is
  // acceptable (the Firestore doc is gone so the UI won't show it).
  const firestore = await getFirestoreInstance();
  const { doc, getDoc, deleteDoc } = await import("firebase/firestore");
  const docRef = doc(firestore, `users/${userId}/poi-images/${id}`);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return;
  const entry = snapshot.data() as PoiImageLibraryEntry;
  await deleteDoc(docRef);

  // Best-effort Storage cleanup
  try {
    const storage = await getStorageInstance();
    const { ref, deleteObject } = await import("firebase/storage");
    const ext = extFromContentType(entry.contentType) ?? "bin";
    await deleteObject(
      ref(storage, `users/${userId}/poi-images/${id}.${ext}`),
    );
  } catch {
    // Orphan acceptable - Firestore is the source of truth
  }
}

export async function loadAsImageData(entry: PoiImageLibraryEntry): Promise<ImageData> {
  const response = await fetch(entry.storageUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Unable to acquire 2D canvas context for image decode");
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
}

/**
 * First 16 bytes of a SHA-256 digest, rendered as 32 hex chars. 128 bits
 * of collision resistance is far more than we need for a personal library.
 */
async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

function extFromContentType(ct: string): string | null {
  if (ct === "image/png") return "png";
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/bmp") return "bmp";
  if (ct === "image/webp") return "webp";
  return null;
}
