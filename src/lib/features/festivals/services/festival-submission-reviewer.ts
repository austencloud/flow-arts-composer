/**
 * Festival Submission Reviewer
 *
 * Handles the submission and moderation workflow for user-contributed festivals.
 * Submissions land in festivalSubmissions/{id} with status "pending".
 * Approving a submission creates a canonical Festival doc and deletes the submission.
 *
 * Path: festivalSubmissions/{submissionId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { FestivalSubmission } from "../domain/models/festival";
import { create as createFestival } from "./festival-repository";
import { trackFestivalSubmitted } from "../analytics/festival-events";

export async function getPending(): Promise<FestivalSubmission[]> {
  const db = await getFirestoreInstance();
  const ref = collection(db, "festivalSubmissions");
  const q = query(ref, where("moderationStatus", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FestivalSubmission));
}

/**
 * Approve a submission: create a canonical Festival doc, then remove the submission.
 * Returns the new festival's ID.
 */
export async function approve(submissionId: string): Promise<string> {
  const db = await getFirestoreInstance();
  const submissionRef = doc(db, "festivalSubmissions", submissionId);
  const submissionSnap = await getDoc(submissionRef);

  if (!submissionSnap.exists()) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const submission = submissionSnap.data() as FestivalSubmission;
  const now = Timestamp.now();

  const festivalId = await createFestival({
    name: submission.name,
    organizationId: "",
    organization: "",
    location: {
      city: submission.city,
      country: submission.country,
      venue: submission.venue,
      coordinates: { lat: 0, lng: 0 },
    },
    dates: submission.dates,
    applicationDeadline: undefined,
    applicationUrl: submission.applicationUrl,
    applicationContact: undefined,
    seekingInstructors: submission.seekingInstructors,
    seekingPerformers: submission.seekingPerformers,
    description: submission.description ?? "",
    websiteUrl: submission.websiteUrl,
    socialLinks: undefined,
    estimatedSize: undefined,
    region: "north-america",
    status: "upcoming",
    tags: submission.tags,
    source: "user-submitted",
    moderationStatus: "approved",
    createdAt: now,
    updatedAt: now,
  });

  await deleteDoc(submissionRef);
  return festivalId;
}

export async function reject(submissionId: string): Promise<void> {
  const db = await getFirestoreInstance();
  await deleteDoc(doc(db, "festivalSubmissions", submissionId));
}

export async function submit(
  submission: Omit<FestivalSubmission, "id" | "submittedAt" | "moderationStatus">
): Promise<string> {
  const db = await getFirestoreInstance();
  const ref = await addDoc(collection(db, "festivalSubmissions"), {
    ...submission,
    moderationStatus: "pending",
    submittedAt: serverTimestamp(),
  });
  trackFestivalSubmitted(ref.id);
  return ref.id;
}
