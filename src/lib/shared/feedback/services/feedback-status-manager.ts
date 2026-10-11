/**
 * FeedbackStatusManager
 *
 * Handles feedback status updates, deferrals, and deletions.
 */

import {
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreDelete } from "#lib/shared/firestore/index.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

import type { FeedbackItem, FeedbackStatus, StatusHistoryEntry, } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { generateTitleFromDescription } from "./feedback-submission-service";
import { getFeedback } from "./feedback-querier";

const COLLECTION_NAME = "feedback";

export class FeedbackStatusManager {
  constructor() {}

  async updateStatus(
    feedbackId: string,
    status: FeedbackStatus
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);

    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error("Feedback not found");
    }
    const data = snap.data();
    const currentStatus = (data["status"] as FeedbackStatus) ?? "new";
    const currentHistory = (data["statusHistory"] as StatusHistoryEntry[]) ?? [];

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (status === "archived") {
      updateData["archivedAt"] = serverTimestamp();
    }

    const shouldRecord = this.shouldRecordStatusChange(
      currentHistory,
      currentStatus,
      status
    );

    if (shouldRecord) {
      const newEntry: StatusHistoryEntry = {
        status,
        timestamp: new Date(),
        fromStatus: currentStatus,
      };
      const updatedHistory = [...currentHistory, newEntry];
      updateData["statusHistory"] = updatedHistory;
    }

    await updateDoc(docRef, updateData);
  }

  private shouldRecordStatusChange(
    history: StatusHistoryEntry[] = [],
    fromStatus: FeedbackStatus,
    toStatus: FeedbackStatus
  ): boolean {
    if (history.length === 0) return true;

    const lastEntry = history[history.length - 1];
    if (!lastEntry) return true;

    const isSameTransition =
      lastEntry.fromStatus === fromStatus && lastEntry.status === toStatus;
    if (!isSameTransition) return true;

    const now = new Date();
    const timeSinceLastEntry = now.getTime() - lastEntry.timestamp.getTime();
    const DEBOUNCE_MS = 60 * 1000;

    return timeSinceLastEntry >= DEBOUNCE_MS;
  }

  async deferFeedback(
    feedbackId: string,
    deferredUntil: Date,
    notes: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);
    await updateDoc(docRef, {
      status: "archived",
      deferredUntil: Timestamp.fromDate(deferredUntil),
      adminNotes: notes,
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async deleteFeedback(feedbackId: string): Promise<void> {
    await firestoreDelete(COLLECTION_NAME, feedbackId);
  }

  async updateFeedback(
    feedbackId: string,
    updates: Partial<
      Pick<FeedbackItem, "type" | "title" | "description" | "priority" | "assignedTo" | "assignedToName">
    >
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);

    const updateData: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.type !== undefined) updateData["type"] = updates.type;
    if (updates.title !== undefined) updateData["title"] = updates.title;
    if (updates.description !== undefined)
      updateData["description"] = updates.description;
    if (updates.priority !== undefined)
      updateData["priority"] = updates.priority || null;
    if (updates.assignedTo !== undefined)
      updateData["assignedTo"] = updates.assignedTo || null;
    if (updates.assignedToName !== undefined)
      updateData["assignedToName"] = updates.assignedToName || null;

    await updateDoc(docRef, updateData);
  }

  async updateUserFeedback(
    feedbackId: string,
    updates: Partial<Pick<FeedbackItem, "type" | "description">>,
    appendMode: boolean = false
  ): Promise<FeedbackItem> {
    const firestore = await getFirestoreInstance();
    const user = authState.user;
    if (!user) {
      throw new Error("User must be authenticated to update feedback");
    }

    const feedback = await getFeedback(feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    if (feedback.userId !== user.uid) {
      throw new Error("You can only edit your own feedback");
    }

    const editableStatuses = ["new", "in-progress", "in-review"];
    if (!editableStatuses.includes(feedback.status)) {
      throw new Error(
        "Cannot edit feedback that has been completed or archived"
      );
    }

    if (feedback.status !== "new" && !appendMode) {
      throw new Error(
        "Can only add notes to feedback that is already being processed"
      );
    }

    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);
    const updateData: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    if (feedback.status === "new") {
      if (updates.type !== undefined) {
        updateData["type"] = updates.type;
      }
      if (updates.description !== undefined) {
        updateData["description"] = updates.description;
        updateData["title"] =
          generateTitleFromDescription(
            updates.description
          );
      }
    } else {
      if (updates.description?.trim()) {
        const timestamp = new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const appendedNote = `\n\n---\n**User update (${timestamp}):**\n${updates.description.trim()}`;
        updateData["description"] = feedback.description + appendedNote;
      }
    }

    await updateDoc(docRef, updateData);

    const updatedDoc = await getDoc(docRef);
    const { mapDocToFeedbackItem } = await import("#lib/shared/feedback/services/feedback-document-mapper.js");
    return mapDocToFeedbackItem(
      updatedDoc.id,
      updatedDoc.data()!
    );
  }

  async deleteUserFeedback(feedbackId: string): Promise<void> {
    const user = authState.user;
    if (!user) {
      throw new Error("User must be authenticated to delete feedback");
    }

    const feedback = await getFeedback(feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    if (feedback.userId !== user.uid) {
      throw new Error("You can only delete your own feedback");
    }

    if (feedback.status !== "new") {
      throw new Error("Cannot delete feedback that is already being processed");
    }

    await firestoreDelete(COLLECTION_NAME, feedbackId);
  }
}

// Export singleton instance
export const feedbackStatusService = new FeedbackStatusManager();
