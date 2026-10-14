import { describe, expect, it, vi } from "vitest";
import {
  annotatePublishPermissionError,
  publishOperation,
  PublishPermissionError,
  type PublishOperation,
} from "#lib/shared/library/services/publish-permission-error.js";
import type { AppError } from "#lib/shared/error/domain/error-models.js";

const mocks = vi.hoisted(() => ({
  history: [] as AppError[],
  submitFeedback: vi.fn().mockResolvedValue("report-id"),
}));
vi.mock("#lib/shared/error/state/error-state.svelte.js", () => ({
  getErrorHistory: () => mocks.history,
  showError: vi.fn(),
  dismissError: vi.fn(),
  clearErrorHistory: vi.fn(),
}));
vi.mock("#lib/shared/error/state/error-toast-state.svelte.js", () => ({
  showErrorToast: vi.fn(),
}));
vi.mock("#lib/shared/feedback/services/feedback-repository.js", () => ({
  feedbackService: { submitFeedback: mocks.submitFeedback },
}));
import { ErrorHandler } from "#lib/shared/application/services/error-handler.js";

const operation: PublishOperation = {
  step: "read-hash-claim",
  path: "publicSequenceHashes/{claimId}",
  operation: "get",
};

describe("publish permission annotation", () => {
  it.each(["permission-denied", "firestore/permission-denied"])(
    "preserves classification and cause for %s without copying arbitrary messages",
    async (code) => {
      const cause = Object.assign(new Error("another user's data"), { code });
      const error = await publishOperation(operation, () =>
        Promise.reject(cause)
      ).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(PublishPermissionError);
      expect(error).toMatchObject({ code: "permission-denied", cause });
      expect((error as Error).message).toContain(
        "read-hash-claim: get publicSequenceHashes/{claimId}"
      );
      expect((error as Error).message).not.toContain("another user's data");
    }
  );

  it("preserves non-permission errors and successful results", async () => {
    const offline = Object.assign(new Error("offline"), {
      code: "unavailable",
    });
    await expect(
      publishOperation(operation, () => Promise.reject(offline))
    ).rejects.toBe(offline);
    await expect(publishOperation(operation, async () => 42)).resolves.toBe(42);
  });

  it("does not mislabel a denied transaction read as a commit failure", () => {
    const original = new PublishPermissionError(
      new Error(),
      [operation],
      "operation"
    );
    expect(
      annotatePublishPermissionError(original, [], "transaction-commit")
    ).toBe(original);
  });

  it("carries the annotation through the existing auto-report Technical Details field", async () => {
    const error = new PublishPermissionError(
      new Error("private payload"),
      [operation],
      "operation"
    );
    mocks.history = [
      {
        id: "error-id",
        message: "Couldn't publish your sequence",
        technicalDetails: error.message,
        severity: "error",
        context: { module: "library", action: "publish-sequence" },
        timestamp: new Date("2026-10-14T00:00:00Z"),
        reportable: true,
      },
    ];
    await expect(new ErrorHandler().reportBug("error-id")).resolves.toBe(
      "report-id"
    );
    const report = mocks.submitFeedback.mock.calls.at(-1)![0].description;
    expect(report).toContain("## Auto-generated Bug Report");
    expect(report).toContain(`**Technical Details:** ${error.message}`);
    expect(report).not.toContain("private payload");
  });
});
