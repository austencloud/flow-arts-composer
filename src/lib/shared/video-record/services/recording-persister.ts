/**
 * Recording Persistence
 *
 * Manages storage and retrieval of recording metadata in Firestore.
 * Collection path: users/{userId}/recordings/{recordingId}
 */

import { getFirestoreInstance, getAuthSync } from "#lib/shared/auth/firebase.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
} from "firebase/firestore";
import type { RecordingMetadata } from "../domain/recording-metadata";

function getUserId(): string {
  const user = getAuthSync().currentUser;
  if (!user) {
    throw new Error("User must be authenticated to access recordings");
  }
  return user.uid;
}

function getRecordingsCollectionPath(userId: string): string {
  return `users/${userId}/recordings`;
}

function docToRecording(
  docData: Record<string, unknown>,
  recordingId: string
): RecordingMetadata {
  const recordedAtField = docData.recordedAt as
    | { toDate?: () => Date }
    | undefined;

  return {
    id: recordingId,
    userId: docData.userId as string,
    sequenceId: docData.sequenceId as string,
    videoUrl: docData.videoUrl as string,
    storagePath: docData.storagePath as string,
    duration: docData.duration as number,
    fileSize: docData.fileSize as number,
    mimeType: docData.mimeType as string,
    recordedAt: recordedAtField?.toDate?.() ?? new Date(),
    deviceType: docData.deviceType as "mobile" | "tablet" | "desktop" | undefined,
    thumbnailUrl: docData.thumbnailUrl as string | undefined,
    notes: docData.notes as string | undefined,
    metadata: (docData.metadata as Record<string, unknown>) ?? {},
  };
}

export async function saveRecording(recording: RecordingMetadata): Promise<void> {
  const firestore = await getFirestoreInstance();
  const userId = getUserId();
  const collectionPath = getRecordingsCollectionPath(userId);
  const docRef = doc(firestore, collectionPath, recording.id);

  const docData: Record<string, unknown> = {
    userId: recording.userId,
    sequenceId: recording.sequenceId,
    videoUrl: recording.videoUrl,
    storagePath: recording.storagePath,
    duration: recording.duration,
    fileSize: recording.fileSize,
    mimeType: recording.mimeType,
    recordedAt: serverTimestamp(),
    metadata: recording.metadata,
  };

  if (recording.deviceType !== undefined) {
    docData.deviceType = recording.deviceType;
  }
  if (recording.thumbnailUrl !== undefined) {
    docData.thumbnailUrl = recording.thumbnailUrl;
  }
  if (recording.notes !== undefined) {
    docData.notes = recording.notes;
  }

  try {
    await setDoc(docRef, docData);
  } catch (error) {
    console.error("[RecordingPersister] Failed to save recording:", error);
    toast.error("Failed to save recording. Please try again.");
    throw error;
  }
}

export async function getRecording(recordingId: string): Promise<RecordingMetadata | null> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const collectionPath = getRecordingsCollectionPath(userId);
    const docRef = doc(firestore, collectionPath, recordingId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return docToRecording(docSnap.data(), recordingId);
  } catch (error) {
    console.error("[RecordingPersister] Failed to get recording:", error);
    toast.error("Failed to load recording.");
    return null;
  }
}

export async function getRecordingsForSequence(
  sequenceId: string
): Promise<RecordingMetadata[]> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const collectionPath = getRecordingsCollectionPath(userId);
    const collectionRef = collection(firestore, collectionPath);

    const q = query(
      collectionRef,
      where("sequenceId", "==", sequenceId),
      orderBy("recordedAt", "desc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => docToRecording(doc.data(), doc.id));
  } catch (error) {
    console.error("[RecordingPersister] Failed to get recordings for sequence:", error);
    toast.error("Failed to load recordings.");
    return [];
  }
}

export async function getAllRecordings(limitCount = 50): Promise<RecordingMetadata[]> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const collectionPath = getRecordingsCollectionPath(userId);
    const collectionRef = collection(firestore, collectionPath);

    const q = query(
      collectionRef,
      orderBy("recordedAt", "desc"),
      firestoreLimit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => docToRecording(doc.data(), doc.id));
  } catch (error) {
    console.error("[RecordingPersister] Failed to get all recordings:", error);
    toast.error("Failed to load recordings.");
    return [];
  }
}

export async function deleteRecording(recordingId: string): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const collectionPath = getRecordingsCollectionPath(userId);
    const docRef = doc(firestore, collectionPath, recordingId);

    await deleteDoc(docRef);
  } catch (error) {
    console.error("[RecordingPersister] Failed to delete recording:", error);
    toast.error("Failed to delete recording. Please try again.");
    throw error;
  }
}

export async function deleteRecordingsForSequence(sequenceId: string): Promise<void> {
  try {
    const recordings = await getRecordingsForSequence(sequenceId);
    await Promise.all(recordings.map((r) => deleteRecording(r.id)));
  } catch (error) {
    console.error("[RecordingPersister] Failed to delete recordings for sequence:", error);
    toast.error("Failed to delete recordings. Please try again.");
    throw error;
  }
}
