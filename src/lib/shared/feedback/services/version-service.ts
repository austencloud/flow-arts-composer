/**
 * version-service
 *
 * Firestore operations for app versioning and release tracking.
 */

import {
  collection,
  query,
  getDocs,
  doc,
  updateDoc,
  where,
  serverTimestamp,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreList } from "#lib/shared/firestore/index.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

import type {
  AppVersion,
  VersionFeedbackItem,
  FeedbackSummary,
  ChangelogEntry,
} from "#lib/shared/feedback/domain/models/version-models.js";
import { PRE_RELEASE_VERSION } from "#lib/shared/feedback/domain/models/version-models.js";
import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { isFeedbackType } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { AppVersionSchema, FeedbackItemSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";

const VERSIONS_COLLECTION = "versions";
const FEEDBACK_COLLECTION = "feedback";

export async function getVersions(): Promise<AppVersion[]> {
  const raw = await firestoreList(
    VERSIONS_COLLECTION,
    AppVersionSchema,
    { orderBy: [{ field: "releasedAt", direction: "desc" }] },
  );
  // Map to AppVersion interface (strip Zod `id` that was injected by parseDoc)
  return raw.map((v) => ({
    version: v.version,
    releasedAt: v.releasedAt,
    releaseNotes: v.releaseNotes,
    feedbackCount: v.feedbackCount,
    feedbackSummary: v.feedbackSummary,
    changelogEntries: v.changelogEntries,
    highlights: v.highlights,
    contributorIds: v.contributorIds,
  }));
}

export async function getVersionFeedback(version: string): Promise<VersionFeedbackItem[]> {
  const firestore = await getFirestoreInstance();
  // Simple query - items with fixedInVersion are already archived
  const q = query(
    collection(firestore, FEEDBACK_COLLECTION),
    where("fixedInVersion", "==", version)
  );

  const snapshot = await getDocs(q);

  // Sort in memory to avoid needing a composite index
  const items = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      type: isFeedbackType(data["type"]) ? data["type"] : "general",
      title: data["title"] as string,
      description: truncateDescription(data["description"] as string),
      createdAt: data["createdAt"],
    };
  });

  // Sort by createdAt descending and strip the extra field
  items.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });

  return items.map(({ createdAt: _createdAt, ...rest }) => rest);
}

export async function getLatestVersion(): Promise<string | null> {
  const results = await firestoreList(
    VERSIONS_COLLECTION,
    AppVersionSchema,
    {
      orderBy: [{ field: "releasedAt", direction: "desc" }],
      limit: 1,
    },
  );

  return results[0]?.version ?? null;
}

export async function prepareRelease(
  version: string,
  changelogEntries?: ChangelogEntry[]
): Promise<void> {
  const firestore = await getFirestoreInstance();
  // 1. Get all completed feedback (ready for release)
  const q2 = query(
    collection(firestore, FEEDBACK_COLLECTION),
    where("status", "==", "completed")
  );

  const snapshot = await getDocs(q2);
  const completedDocs = snapshot.docs;

  // 2. Calculate summary counts
  const summary: FeedbackSummary = { bugs: 0, features: 0, general: 0 };

  completedDocs.forEach((docSnap) => {
    const type = isFeedbackType(docSnap.data()["type"])
      ? docSnap.data()["type"]
      : "general";
    if (type === "bug") summary.bugs++;
    else if (type === "feature") summary.features++;
    else summary.general++;
  });

  // 3. Batch update all feedback items: set version and move to archived
  const batch = writeBatch(firestore);

  completedDocs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      fixedInVersion: version,
      status: "archived",
      archivedAt: serverTimestamp(),
    });
  });

  // 4. Create version document with changelog entries
  const versionDoc: Record<string, unknown> = {
    version,
    feedbackCount: completedDocs.length,
    feedbackSummary: summary,
    releasedAt: serverTimestamp(),
  };

  // Only add changelog entries if provided
  if (changelogEntries && changelogEntries.length > 0) {
    versionDoc.changelogEntries = changelogEntries;
  }

  const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
  batch.set(versionRef, versionDoc);

  // 5. Commit the batch
  try {
    await batch.commit();
  } catch (error) {
    console.error("[version-service] Failed to prepare release:", error);
    toast.error("Failed to prepare release. Please try again.");
    throw error;
  }
}

export async function updateReleaseNotes(
  version: string,
  releaseNotes: string
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
    await updateDoc(versionRef, { releaseNotes });
  } catch (error) {
    console.error("[version-service] Failed to update release notes:", error);
    toast.error("Failed to update release notes. Please try again.");
    throw error;
  }
}

export async function updateChangelogEntries(
  version: string,
  changelogEntries: ChangelogEntry[]
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
    await updateDoc(versionRef, { changelogEntries });
  } catch (error) {
    console.error(
      "[version-service] Failed to update changelog entries:",
      error
    );
    toast.error("Failed to update changelog. Please try again.");
    throw error;
  }
}

export async function updateChangelogEntry(
  version: string,
  index: number,
  updatedEntry: ChangelogEntry
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
  const versionDoc = await getDoc(versionRef);

  if (!versionDoc.exists()) {
    throw new Error(`Version ${version} not found`);
  }

  const data = versionDoc.data();
  const changelogEntries =
    (data["changelogEntries"] as ChangelogEntry[]) || [];

  if (index < 0 || index >= changelogEntries.length) {
    throw new Error(`Invalid changelog entry index: ${index}`);
  }

  // Update the specific entry
  changelogEntries[index] = updatedEntry;

  try {
    await updateDoc(versionRef, { changelogEntries });
  } catch (error) {
    console.error(
      "[version-service] Failed to update changelog entry:",
      error
    );
    toast.error("Failed to update changelog entry. Please try again.");
    throw error;
  }
}

export async function addChangelogEntry(
  version: string,
  entry: ChangelogEntry
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
  const versionDoc = await getDoc(versionRef);

  if (!versionDoc.exists()) {
    throw new Error(`Version ${version} not found`);
  }

  const data = versionDoc.data();
  const changelogEntries =
    (data["changelogEntries"] as ChangelogEntry[]) || [];

  changelogEntries.push(entry);

  try {
    await updateDoc(versionRef, { changelogEntries });
  } catch (error) {
    console.error("[version-service] Failed to add changelog entry:", error);
    toast.error("Failed to add changelog entry. Please try again.");
    throw error;
  }
}

export async function updateEntryContributors(
  version: string,
  index: number,
  contributorIds: string[]
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
  const versionDoc = await getDoc(versionRef);

  if (!versionDoc.exists()) {
    throw new Error(`Version ${version} not found`);
  }

  const data = versionDoc.data();
  const changelogEntries =
    (data["changelogEntries"] as ChangelogEntry[]) || [];

  if (index < 0 || index >= changelogEntries.length) {
    throw new Error(`Invalid changelog entry index: ${index}`);
  }

  // Update the specific entry's contributor list
  const existing = changelogEntries[index]!;
  changelogEntries[index] = {
    ...existing,
    contributorIds: contributorIds.length > 0 ? contributorIds : undefined,
  };

  // Recompute the version-level contributor list as the union of all entries
  const allContributorIds = new Set<string>();
  for (const entry of changelogEntries) {
    if (entry.contributorIds) {
      for (const id of entry.contributorIds) {
        allContributorIds.add(id);
      }
    }
  }

  const versionContributorIds =
    allContributorIds.size > 0 ? [...allContributorIds] : undefined;

  try {
    await updateDoc(versionRef, {
      changelogEntries,
      ...(versionContributorIds
        ? { contributorIds: versionContributorIds }
        : { contributorIds: [] }),
    });
  } catch (error) {
    console.error(
      "[version-service] Failed to update entry contributors:",
      error
    );
    toast.error("Failed to update contributors. Please try again.");
    throw error;
  }
}

export async function deleteChangelogEntry(version: string, index: number): Promise<void> {
  const firestore = await getFirestoreInstance();
  const versionRef = doc(firestore, VERSIONS_COLLECTION, version);
  const versionDoc = await getDoc(versionRef);

  if (!versionDoc.exists()) {
    throw new Error(`Version ${version} not found`);
  }

  const data = versionDoc.data();
  const changelogEntries =
    (data["changelogEntries"] as ChangelogEntry[]) || [];

  if (index < 0 || index >= changelogEntries.length) {
    throw new Error(`Invalid changelog entry index: ${index}`);
  }

  changelogEntries.splice(index, 1);

  try {
    await updateDoc(versionRef, { changelogEntries });
  } catch (error) {
    console.error(
      "[version-service] Failed to delete changelog entry:",
      error
    );
    toast.error("Failed to delete changelog entry. Please try again.");
    throw error;
  }
}

/**
 * Seed v0.1.0 with human-readable changelog entries
 * Call this once to populate the initial changelog
 */
export async function seedV010Changelog(): Promise<void> {
  const firestore = await getFirestoreInstance();
  const changelogEntries: ChangelogEntry[] = [
    // Bug Fixes
    {
      category: "fixed",
      text: "Sequences now load correctly when you open them from the gallery",
    },
    {
      category: "fixed",
      text: "The app no longer freezes when switching between modules",
    },
    {
      category: "fixed",
      text: "Your progress is now saved properly when you close the app",
    },
    // New Features
    {
      category: "added",
      text: "You can now see version history and release notes right here!",
    },
    {
      category: "added",
      text: "Submit feedback directly from the app - tap the Feedback tab",
    },
    {
      category: "added",
      text: "Track the status of your submitted feedback",
    },
    {
      category: "added",
      text: "Get notified when your reported issues are fixed",
    },
    // Improvements
    {
      category: "improved",
      text: "Navigation is smoother and more responsive",
    },
    { category: "improved", text: "The app loads faster on first visit" },
    {
      category: "improved",
      text: "Better error messages when something goes wrong",
    },
  ];

  const versionRef = doc(firestore, VERSIONS_COLLECTION, "0.1.0");
  try {
    await updateDoc(versionRef, {
      changelogEntries,
      releaseNotes:
        "The first official beta release! This version introduces the feedback system so you can help us make the app better.",
    });
  } catch (error) {
    console.error("[version-service] Failed to seed changelog:", error);
    toast.error("Failed to seed changelog. Please try again.");
    throw error;
  }
}

export async function getCompletedCount(): Promise<number> {
  const items = await firestoreList<FeedbackItem>(
    FEEDBACK_COLLECTION,
    FeedbackItemSchema,
    { where: [{ field: "status", op: "==", value: "completed" }] },
  );
  return items.length;
}

export async function getCompletedFeedback(): Promise<VersionFeedbackItem[]> {
  const items = await firestoreList<FeedbackItem>(
    FEEDBACK_COLLECTION,
    FeedbackItemSchema,
    { where: [{ field: "status", op: "==", value: "completed" }] },
  );

  // Sort by createdAt descending (Zod already converted timestamps to Dates)
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    description: truncateDescription(item.description),
  }));
}

// Legacy alias
export async function getUnversionedArchivedCount(): Promise<number> {
  return getCompletedCount();
}

export async function tagExistingAsPreRelease(): Promise<number> {
  const firestore = await getFirestoreInstance();
  // Get all archived feedback without a version
  const q = query(
    collection(firestore, FEEDBACK_COLLECTION),
    where("status", "==", "archived")
  );

  const snapshot = await getDocs(q);

  // Filter to unversioned items
  const unversionedDocs = snapshot.docs.filter((docSnap) => {
    const data = docSnap.data();
    return !data["fixedInVersion"];
  });

  if (unversionedDocs.length === 0) {
    return 0;
  }

  // Calculate summary
  const summary: FeedbackSummary = { bugs: 0, features: 0, general: 0 };

  unversionedDocs.forEach((docSnap) => {
    const type = isFeedbackType(docSnap.data()["type"])
      ? docSnap.data()["type"]
      : "general";
    if (type === "bug") summary.bugs++;
    else if (type === "feature") summary.features++;
    else summary.general++;
  });

  // Batch update
  const batch = writeBatch(firestore);

  unversionedDocs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      fixedInVersion: PRE_RELEASE_VERSION,
    });
  });

  // Create pre-release version document
  const versionRef = doc(firestore, VERSIONS_COLLECTION, PRE_RELEASE_VERSION);
  batch.set(versionRef, {
    version: PRE_RELEASE_VERSION,
    releaseNotes: "Initial feedback collected during early development.",
    feedbackCount: unversionedDocs.length,
    feedbackSummary: summary,
    releasedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    console.error("[version-service] Failed to tag pre-release items:", error);
    toast.error("Failed to tag pre-release items. Please try again.");
    throw error;
  }

  return unversionedDocs.length;
}

function truncateDescription(
  description: string,
  maxLength: number = 100
): string {
  if (description.length <= maxLength) {
    return description;
  }

  const truncated = description.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

