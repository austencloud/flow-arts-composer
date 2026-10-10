/**
 * video-curator-loader
 *
 * Loads video curator data from Firestore.
 */
import type { ShowcaseVideo, VideoCategory, UserProfile } from "../types";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";

const DEFAULT_CATEGORIES: VideoCategory[] = [
  { id: "demonstration", label: "Demonstration", color: "#06b6d4" },
  { id: "tutorial", label: "Tutorial", color: "#3b82f6" },
  { id: "composition", label: "Composition", color: "#10b981" },
];

const DEFAULT_QUICK_PERFORMERS: UserProfile[] = [
  { id: "PBp3GSBO6igCKPwJyLZNmVEmamI3", displayName: "Austen Cloud" },
  { id: "40ovmSoxdRNouOIeQrhDFSwkDEX2", displayName: "Sky Guys Quest" },
];

export async function loadVideos(): Promise<ShowcaseVideo[]> {
  const { collection, getDocs, orderBy, query } = await import("firebase/firestore");
  const db = await getFirestoreInstance();

  const q = query(
    collection(db, "showcaseVideos"),
    orderBy("instagramDate", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    // Migrate legacy single performer to performers array
    let performers = data.performers || [];
    if (performers.length === 0 && data.performerId && data.performerName) {
      performers = [{ id: data.performerId, displayName: data.performerName }];
    }
    // Migrate legacy single sequence to linkedSequences array
    let linkedSequences = data.linkedSequences || [];
    if (linkedSequences.length === 0 && data.sequenceId && data.sequenceWord) {
      linkedSequences = [{
        id: data.sequenceId,
        word: data.sequenceWord,
        thumbnail: null,
        ownerName: "",
      }];
    }
    return {
      shortcode: doc.id,
      videoUrl: data.videoUrl,
      instagramDate: data.instagramDate?.toDate() || null,
      fileSize: data.fileSize || 0,
      category: data.category || null,
      tags: data.tags || [],
      featured: data.featured || false,
      approved: data.approved || false,
      linkedSequences,
      title: data.title || null,
      description: data.description || null,
      performers,
      excluded: data.excluded || false,
      crop: data.crop || undefined,
      snip: data.snip || undefined,
    } as ShowcaseVideo;
  });
}

export async function loadCategories(): Promise<VideoCategory[]> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const db = await getFirestoreInstance();

    const docRef = doc(db, "config", "videoCategories");
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data.categories && Array.isArray(data.categories)) {
        return data.categories;
      }
    }
    return DEFAULT_CATEGORIES;
  } catch (e) {
    console.warn("Failed to load categories, using defaults:", e);
    return DEFAULT_CATEGORIES;
  }
}

export async function loadQuickPerformers(): Promise<UserProfile[]> {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const db = await getFirestoreInstance();

    const docRef = doc(db, "config", "quickPerformers");
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data.performers && Array.isArray(data.performers)) {
        return data.performers;
      }
    }
    return DEFAULT_QUICK_PERFORMERS;
  } catch (e) {
    console.warn("Failed to load quick performers, using defaults:", e);
    return DEFAULT_QUICK_PERFORMERS;
  }
}
