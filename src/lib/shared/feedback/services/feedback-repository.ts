/**
 * FeedbackRepository
 *
 * Facade for feedback operations. Delegates to focused modules:
 * - feedback-submission-service: submit, upload, messaging
 * - feedback-querier: load, get, user queries
 * - FeedbackStatusManager: status updates, defer, delete
 * - FeedbackTesterWorkflow: admin/tester interactions
 * - feedback-subscriber: real-time subscriptions
 *
 * This facade maintains backwards compatibility with the original API.
 */

import type { Unsubscribe } from "firebase/firestore";

import type {
  FeedbackItem,
  FeedbackFormData,
  FeedbackFilterOptions,
  FeedbackProgressCallback,
  FeedbackStatus,
  TesterConfirmationStatus,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

// Import focused services
import * as feedbackSubmissionModule from "#lib/shared/feedback/services/feedback-submission-service.js";
import * as feedbackQuerierModule from "#lib/shared/feedback/services/feedback-querier.js";
import {
  feedbackStatusService,
  type FeedbackStatusManager,
} from "#lib/shared/feedback/services/feedback-status-manager.js";
import {
  getFeedbackTesterWorkflow,
  type IFeedbackTesterWorkflow,
} from "#lib/shared/feedback/services/IFeedbackTesterWorkflow.js";
import * as feedbackSubscriberModule from "#lib/shared/feedback/services/feedback-subscriber.js";

export class FeedbackRepository {
  constructor(
    private readonly statusService: FeedbackStatusManager = feedbackStatusService,
  ) {}

  private get testerWorkflow(): IFeedbackTesterWorkflow {
    const wf = getFeedbackTesterWorkflow();
    if (!wf) {
      throw new Error(
        "FeedbackTesterWorkflow not yet registered. " +
          "This method requires deferred registrations to have completed."
      );
    }
    return wf;
  }


  async submitFeedback(
    formData: FeedbackFormData,
    capturedModule: string,
    capturedTab: string,
    images?: File[],
    onProgress?: FeedbackProgressCallback,
    stagedImagePaths?: string[]
  ): Promise<string> {
    return feedbackSubmissionModule.submitFeedback(
      formData,
      capturedModule,
      capturedTab,
      images,
      onProgress,
      stagedImagePaths
    );
  }


  async loadFeedback(
    filters: FeedbackFilterOptions,
    pageSize: number,
    lastDocId?: string
  ): Promise<{
    items: FeedbackItem[];
    lastDocId: string | null;
    hasMore: boolean;
  }> {
    return feedbackQuerierModule.loadFeedback(filters, pageSize, lastDocId);
  }

  async loadUserFeedback(
    userId: string,
    pageSize: number,
    lastDocId?: string
  ): Promise<{
    items: FeedbackItem[];
    lastDocId: string | null;
    hasMore: boolean;
  }> {
    return feedbackQuerierModule.loadUserFeedback(userId, pageSize, lastDocId);
  }

  async getFeedback(feedbackId: string): Promise<FeedbackItem | null> {
    return feedbackQuerierModule.getFeedback(feedbackId);
  }


  async updateStatus(
    feedbackId: string,
    status: FeedbackStatus
  ): Promise<void> {
    return this.statusService.updateStatus(feedbackId, status);
  }

  async deferFeedback(
    feedbackId: string,
    deferredUntil: Date,
    notes: string
  ): Promise<void> {
    return this.statusService.deferFeedback(feedbackId, deferredUntil, notes);
  }

  async deleteFeedback(feedbackId: string): Promise<void> {
    return this.statusService.deleteFeedback(feedbackId);
  }

  async updateFeedback(
    feedbackId: string,
    updates: Partial<
      Pick<FeedbackItem, "type" | "title" | "description" | "priority" | "assignedTo" | "assignedToName">
    >
  ): Promise<void> {
    return this.statusService.updateFeedback(feedbackId, updates);
  }

  async updateUserFeedback(
    feedbackId: string,
    updates: Partial<Pick<FeedbackItem, "type" | "description">>,
    appendMode: boolean = false
  ): Promise<FeedbackItem> {
    return this.statusService.updateUserFeedback(
      feedbackId,
      updates,
      appendMode
    );
  }

  async deleteUserFeedback(feedbackId: string): Promise<void> {
    return this.statusService.deleteUserFeedback(feedbackId);
  }


  async sendAdminResponse(
    feedbackId: string,
    message: string,
    notifyTester: boolean = true
  ): Promise<void> {
    return this.testerWorkflow.sendAdminResponse(
      feedbackId,
      message,
      notifyTester
    );
  }

  async submitTesterConfirmation(
    feedbackId: string,
    status: TesterConfirmationStatus,
    comment?: string
  ): Promise<void> {
    return this.testerWorkflow.submitTesterConfirmation(
      feedbackId,
      status,
      comment
    );
  }

  async countPendingConfirmations(userId: string): Promise<number> {
    return this.testerWorkflow.countPendingConfirmations(userId);
  }

  async notifyTesterResolved(
    feedbackId: string,
    message?: string
  ): Promise<void> {
    return this.testerWorkflow.notifyTesterResolved(feedbackId, message);
  }


  subscribeToFeedback(
    onUpdate: (items: FeedbackItem[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return feedbackSubscriberModule.subscribeToFeedback(onUpdate, onError);
  }

  subscribeToUserFeedback(
    userId: string,
    onUpdate: (items: FeedbackItem[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    return feedbackSubscriberModule.subscribeToUserFeedback(userId, onUpdate, onError);
  }
}

// Export singleton instance (maintains backwards compatibility)
export const feedbackService = new FeedbackRepository();
