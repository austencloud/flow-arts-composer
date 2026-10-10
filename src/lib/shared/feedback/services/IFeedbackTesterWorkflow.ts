import type { TesterConfirmationStatus } from "#lib/shared/feedback/domain/models/feedback-models.js";

/**
 * Interface for admin/tester workflow interactions.
 * Implementation lives in features/feedback; registered at app startup.
 */
export interface IFeedbackTesterWorkflow {
  sendAdminResponse(
    feedbackId: string,
    message: string,
    notifyTester?: boolean
  ): Promise<void>;

  submitTesterConfirmation(
    feedbackId: string,
    status: TesterConfirmationStatus,
    comment?: string
  ): Promise<void>;

  countPendingConfirmations(userId: string): Promise<number>;

  notifyTesterResolved(feedbackId: string, message?: string): Promise<void>;
}

let instance: IFeedbackTesterWorkflow | null = null;

/**
 * Register the FeedbackTesterWorkflow implementation.
 * Called from the composition root (di/index.ts) at app startup.
 */
export function registerFeedbackTesterWorkflow(
  impl: IFeedbackTesterWorkflow
): void {
  instance = impl;
}

/**
 * Get the registered FeedbackTesterWorkflow, or null if not yet registered.
 * Deferred registrations may not have fired yet during early boot.
 */
export function getFeedbackTesterWorkflow(): IFeedbackTesterWorkflow | null {
  return instance;
}
