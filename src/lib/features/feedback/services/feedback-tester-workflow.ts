/**
 * FeedbackTesterWorkflowService
 *
 * Handles admin-tester interactions: responses, confirmations, and notifications.
 */

import {
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreList } from "#lib/shared/firestore/index.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

import type { FeedbackItem, AdminResponse, TesterConfirmation, TesterConfirmationStatus, FeedbackStatus, } from "#lib/shared/feedback/domain/models/feedback-models.js";
import { FeedbackItemSchema } from "#lib/shared/feedback/domain/models/feedback-schemas.js";
import type { FeedbackNotification } from "#lib/shared/feedback/domain/models/notification-models.js";
import type { IFeedbackTesterWorkflow } from "#lib/shared/feedback/services/IFeedbackTesterWorkflow.js";
import * as notificationTriggerService from "#lib/features/feedback/services/notification-trigger-service.js";
import { getFeedback } from "#lib/shared/feedback/services/feedback-querier.js";

const COLLECTION_NAME = "feedback";

export class FeedbackTesterWorkflowService implements IFeedbackTesterWorkflow {
  constructor() {}

  async sendAdminResponse(
    feedbackId: string,
    message: string,
    notifyTester: boolean = true
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const user = authState.user;
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const feedback = await getFeedback(feedbackId);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    const adminResponse: AdminResponse = {
      message,
      respondedAt: new Date(),
      respondedBy: user.uid,
    };

    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);
    await updateDoc(docRef, {
      adminResponse,
      updatedAt: serverTimestamp(),
    });

    if (notifyTester) {
      await this.createNotification(
        feedback.userId,
        feedbackId,
        feedback.title,
        "feedback-response",
        message
      );
    }
  }

  async submitTesterConfirmation(
    feedbackId: string,
    status: TesterConfirmationStatus,
    comment?: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const testerConfirmation: TesterConfirmation = {
      status,
      respondedAt: new Date(),
      ...(comment && { comment }),
    };

    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);

    // Determine new status based on confirmation
    const newStatus: FeedbackStatus =
      status === "confirmed"
        ? "archived"
        : status === "needs-work"
          ? "in-progress"
          : "in-review";

    await updateDoc(docRef, {
      testerConfirmation,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  }

  async countPendingConfirmations(userId: string): Promise<number> {
    const items = await firestoreList<FeedbackItem>(
      COLLECTION_NAME,
      FeedbackItemSchema,
      {
        where: [
          { field: "userId", op: "==", value: userId },
          { field: "status", op: "==", value: "in-review" },
        ],
      },
    );

    // Count items where testerConfirmation is pending or doesn't exist
    return items.filter((item) => {
      const confirmation = item.testerConfirmation;
      return !confirmation || confirmation.status === "pending";
    }).length;
  }

  async notifyTesterResolved(
    feedbackId: string,
    message?: string
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const feedback = await getFeedback(feedbackId);
    if (!feedback) return;

    await this.createNotification(
      feedback.userId,
      feedbackId,
      feedback.title,
      "feedback-resolved",
      message ||
        "Your feedback has been addressed! Please confirm if it works for you."
    );

    // Initialize tester confirmation as pending
    const docRef = doc(firestore, COLLECTION_NAME, feedbackId);
    await updateDoc(docRef, {
      "testerConfirmation.status": "pending",
      updatedAt: serverTimestamp(),
    });
  }

  private async createNotification(
    userId: string,
    feedbackId: string,
    feedbackTitle: string,
    type: FeedbackNotification["type"],
    message: string
  ): Promise<void> {
    const admin = authState.user;
    if (!admin) return;

    await notificationTriggerService.createFeedbackNotification(
      userId,
      type,
      feedbackId,
      feedbackTitle,
      message,
      admin.uid,
      admin.displayName || admin.email || "Admin"
    );
  }
}

// Export singleton instance
export const feedbackTesterWorkflowService =
  new FeedbackTesterWorkflowService();
