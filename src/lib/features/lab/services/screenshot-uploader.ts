/**
 * screenshot-uploader
 *
 * Uploads screenshot PNGs to Firebase Storage and writes metadata to Firestore.
 * Storage path: screenshots/{userId}/{routeLabel}_{deviceSlug}_{timestamp}.png
 * Firestore path: users/{userId}/screenshots/{docId}
 *
 * Follows the upload pattern from ProfilePictureManager.
 */

import type { UploadScreenshotParams, ScreenshotMetadata } from "./types";
import {
  getStorageInstance,
  getFirestoreInstance,
  getAuthSync,
} from "#lib/shared/auth/firebase.js";

export async function uploadScreenshot(params: UploadScreenshotParams): Promise<ScreenshotMetadata> {
  const auth = getAuthSync();
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error("Must be authenticated to upload screenshots");
  }

  const { ref, uploadBytes, getDownloadURL } = await import(
    "firebase/storage"
  );
  const {
    collection,
    addDoc,
    serverTimestamp,
    Timestamp,
  } = await import("firebase/firestore");

  const storage = await getStorageInstance();
  const firestore = await getFirestoreInstance();

  const timestamp = Date.now();
  const storagePath = `screenshots/${userId}/${params.routeLabel}_${params.deviceSlug}_${timestamp}.png`;
  const storageRef = ref(storage, storagePath);

  // Upload to Storage
  await uploadBytes(storageRef, params.blob, {
    contentType: "image/png",
    customMetadata: {
      userId,
      routeLabel: params.routeLabel,
      module: params.module,
      deviceSlug: params.deviceSlug,
      capturedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);

  // Write Firestore metadata doc
  const now = new Date();
  const docData = {
    filename: params.filename,
    storagePath,
    downloadUrl,
    routeLabel: params.routeLabel,
    module: params.module,
    deviceSlug: params.deviceSlug,
    deviceCategory: params.deviceCategory,
    deviceName: params.deviceName,
    width: params.width,
    height: params.height,
    tagIds: [],
    capturedAt: Timestamp.fromDate(now),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const collectionRef = collection(
    firestore,
    `users/${userId}/screenshots`
  );
  const docRef = await addDoc(collectionRef, docData);

  return {
    id: docRef.id,
    filename: params.filename,
    storagePath,
    downloadUrl,
    routeLabel: params.routeLabel,
    module: params.module,
    deviceSlug: params.deviceSlug,
    deviceCategory: params.deviceCategory,
    deviceName: params.deviceName,
    width: params.width,
    height: params.height,
    tagIds: [],
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
