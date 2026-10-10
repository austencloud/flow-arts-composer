import type {
  ShowErrorOptions,
  ErrorContext,
  AppError,
} from "#lib/shared/error/domain/error-models.js";
import {
  showError as showErrorState,
  dismissError as dismissErrorState,
  clearErrorHistory,
  getErrorHistory,
} from "#lib/shared/error/state/error-state.svelte.js";
import { showErrorToast } from "#lib/shared/error/state/error-toast-state.svelte.js";

/**
 * Error Handling Service Implementation
 *
 * Centralized error handling for both internal logging and user-facing display.
 * Integrates with the error state for reactive UI updates.
 */
export class ErrorHandler {
  private errors: Array<{ error: Error; context?: string; timestamp: Date }> =
    [];
  private criticalErrors: Array<{
    error: Error;
    context?: string;
    timestamp: Date;
  }> = [];

  // Internal Logging (existing functionality)

  handleError(error: Error, context?: string): void {
    const errorEntry = {
      error,
      ...(context && { context }),
      timestamp: new Date(),
    };

    this.errors.push(errorEntry);

    console.error(
      `Error ${context ? `in ${context}` : ""}: ${error.message}`,
      error
    );

    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }
  }

  reportCriticalError(error: Error, context?: string): void {
    const errorEntry = {
      error,
      ...(context && { context }),
      timestamp: new Date(),
    };

    this.criticalErrors.push(errorEntry);
    this.handleError(error, context);

    console.error(
      `CRITICAL ERROR ${context ? `in ${context}` : ""}: ${error.message}`,
      error
    );

    if (this.criticalErrors.length > 50) {
      this.criticalErrors = this.criticalErrors.slice(-50);
    }
  }

  // ========================================
  // User-Facing Error Display (new)
  // ========================================

  showUserError(options: ShowErrorOptions): string {
    // Log internally regardless of which tier handles the display
    if (options.error) {
      this.handleError(
        options.error,
        options.context?.action || options.context?.module
      );
    }

    const severity = options.severity ?? "error";

    if (severity === "warning" || severity === "info") {
      // Toast tier: non-blocking notification in the corner
      const id = showErrorToast(options);

      // Auto-report warnings to telemetry so the developer sees patterns.
      // Info toasts are purely informational and don't need reporting.
      if (severity === "warning") {
        this.reportToTelemetry(options);
      }

      return id;
    }

    // Modal tier: blocking dialog for errors the user can't work around.
    // User can optionally add a comment and submit a bug report.
    return showErrorState(options);
  }

  showError(
    message: string,
    error?: Error,
    context?: Partial<ErrorContext>
  ): string {
    return this.showUserError({
      message,
      error,
      context,
      severity: "error",
    });
  }

  showWarning(message: string, context?: Partial<ErrorContext>): string {
    return this.showUserError({
      message,
      context,
      severity: "warning",
    });
  }

  dismissError(): void {
    dismissErrorState();
  }

  // ========================================
  // Telemetry (fire-and-forget for toast-tier errors)
  // ========================================

  /**
   * Silently report a warning-level error to the errorTelemetry Firestore
   * collection. Uses dynamic import so Firebase isn't loaded until the first
   * warning actually fires (same pattern as reportBug).
   */
  private reportToTelemetry(options: ShowErrorOptions): void {
    import("#lib/shared/error/services/error-telemetry-reporter.js")
      .then(({ reportErrorTelemetry }) => {
        reportErrorTelemetry(options);
      })
      .catch((err) =>
        console.error("[ErrorHandler] Telemetry import failed:", err)
      );
  }

  // ========================================
  // Bug Reporting Integration
  // ========================================

  async reportBug(
    errorId: string,
    additionalComment?: string
  ): Promise<string | null> {
    try {
      const errorHistory = getErrorHistory();
      const appError = errorHistory.find((e) => e.id === errorId);

      if (!appError) {
        console.warn(
          `Cannot report bug: error ${errorId} not found in history`
        );
        return null;
      }

      // Dynamically import feedback service singleton to avoid circular dependencies
      const { feedbackService } =
        await import("#lib/shared/feedback/services/feedback-repository.js");

      // Build bug report
      const errorReport = this.buildErrorReport(appError, additionalComment);

      // Submit as feedback
      const feedbackId = await feedbackService.submitFeedback(
        {
          type: "bug",
          title: `[Auto] ${appError.message.slice(0, 60)}${appError.message.length > 60 ? "..." : ""}`,
          description: errorReport,
        },
        appError.context.module || "unknown",
        appError.context.tab || "unknown"
      );

      // Dismiss the error modal after successful report
      this.dismissError();

      return feedbackId;
    } catch (error) {
      console.error("Failed to report bug:", error);
      return null;
    }
  }

  private buildErrorReport(
    appError: AppError,
    additionalComment?: string
  ): string {
    const lines: string[] = [
      "## Auto-generated Bug Report",
      "",
      `**Error Message:** ${appError.message}`,
      "",
    ];

    if (
      appError.technicalDetails &&
      appError.technicalDetails !== appError.message
    ) {
      lines.push(`**Technical Details:** ${appError.technicalDetails}`, "");
    }

    lines.push("### Context", "");

    if (appError.context.module) {
      lines.push(`- **Module:** ${appError.context.module}`);
    }
    if (appError.context.tab) {
      lines.push(`- **Tab:** ${appError.context.tab}`);
    }
    if (appError.context.action) {
      lines.push(`- **Action:** ${appError.context.action}`);
    }

    lines.push(`- **Timestamp:** ${appError.timestamp.toISOString()}`);
    lines.push(
      `- **URL:** ${typeof window !== "undefined" ? window.location.href : "N/A"}`
    );
    lines.push(
      `- **User Agent:** ${typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}`
    );

    if (additionalComment) {
      lines.push("", "### User Comment", "", additionalComment);
    }

    if (appError.stack) {
      lines.push("", "### Stack Trace", "", "```", appError.stack, "```");
    }

    if (appError.context.additionalData) {
      lines.push(
        "",
        "### Additional Data",
        "",
        "```json",
        JSON.stringify(appError.context.additionalData, null, 2),
        "```"
      );
    }

    return lines.join("\n");
  }

  // Stats & Cleanup

  getErrorStats(): {
    totalErrors: number;
    criticalErrors: number;
    lastError?: Date;
  } {
    const lastErrorEntry = this.errors[this.errors.length - 1];
    return {
      totalErrors: this.errors.length,
      criticalErrors: this.criticalErrors.length,
      ...(lastErrorEntry && { lastError: lastErrorEntry.timestamp }),
    };
  }

  clearErrors(): void {
    this.errors = [];
    this.criticalErrors = [];
    clearErrorHistory();
  }
}
