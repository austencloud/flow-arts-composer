/**
 * Persists video curator data to Firestore
 */
import type { VideoUpdateData } from "./types";
import type { VideoCategory, UserProfile } from "../types";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";

export async function saveCategories(categories: VideoCategory[]): Promise<void> {
  const { doc, setDoc } = await import("firebase/firestore");
  const db = await getFirestoreInstance();

  await setDoc(doc(db, "config", "videoCategories"), {
    categories,
    updatedAt: new Date(),
  });
}

export async function saveQuickPerformers(performers: UserProfile[]): Promise<void> {
  const { doc, setDoc } = await import("firebase/firestore");
  const db = await getFirestoreInstance();

  await setDoc(doc(db, "config", "quickPerformers"), {
    performers: performers.map((p) => ({ id: p.id, displayName: p.displayName })),
    updatedAt: new Date(),
  });
}

export async function updateVideo(shortcode: string, updates: VideoUpdateData): Promise<void> {
  const { doc, updateDoc, deleteField } = await import("firebase/firestore");
  const db = await getFirestoreInstance();

  // Convert null values to deleteField() for clean data
  const firestoreUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    firestoreUpdates[key] = value === null ? deleteField() : value;
  }

  await updateDoc(doc(db, "showcaseVideos", shortcode), firestoreUpdates);
}

export async function toggleFeatured(shortcode: string, newValue: boolean): Promise<void> {
  const { doc, updateDoc } = await import("firebase/firestore");
  const db = await getFirestoreInstance();

  // When featuring a video, also mark it as approved (required for landing page query)
  const updates: Record<string, boolean> = { featured: newValue };
  if (newValue) {
    updates.approved = true;
  }

  await updateDoc(doc(db, "showcaseVideos", shortcode), updates);
}
