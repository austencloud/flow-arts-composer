import type {
  ScanAnalyticsValue,
  ScanExportStage,
} from "#lib/shared/analytics/scan-analytics.js";
import { exportDeliveryStage } from "../domain/art-export-analytics";
import { ExportAttemptGuard } from "../domain/export-attempt-guard";

type Properties = Record<string, ScanAnalyticsValue>;

/** Where one attempt is: the render has not begun, is running, or is done and
 *  waiting for the file to reach the person. */
type AttemptPhase = "starting" | "rendering" | "delivering";

export interface FileExportLifecycleInputs {
  /** The config every stage of one attempt carries, read once at the start. */
  config: () => Properties;
  emit: (stage: ScanExportStage, properties: Properties) => void;
}

/**
 * The stages of one video or card export, from the press to its single ending.
 * It reuses the attempt guard the art exports use, so a late result after a
 * cancel or a newer attempt reports nothing. Tunnel and mandala keep their
 * own stage reporting in the art pane.
 */
export function createFileExportLifecycle(inputs: FileExportLifecycleInputs) {
  const guard = new ExportAttemptGuard();
  let attemptProperties: Properties = {};
  let phase: AttemptPhase = "starting";
  /** The last attempt ended in a hand-over that can be tried again from the
   *  finished preview, which then counts as a retry rather than a new request. */
  let deliveryRetryable = false;

  function emit(stage: ScanExportStage, extra: Properties = {}): void {
    inputs.emit(stage, { ...attemptProperties, ...extra });
  }

  function begin(stage: "requested" | "retry", extra: Properties = {}) {
    const token = guard.begin();
    if (token === null) return null;
    attemptProperties = inputs.config();
    phase = "starting";
    deliveryRetryable = false;
    emit(stage, extra);
    return token;
  }

  function finish(
    token: number,
    stage: "completed" | "failed" | "canceled",
    extra: Properties = {}
  ): boolean {
    if (!guard.finish(token)) return false;
    emit(stage, extra);
    return true;
  }

  function finishActive(
    stage: "completed" | "failed" | "canceled",
    extra: Properties = {}
  ): boolean {
    const token = guard.token;
    return token !== null && finish(token, stage, extra);
  }

  /** The render really began. Sent once per attempt. */
  function renderStarted(token: number): void {
    if (!guard.isActive(token) || phase !== "starting") return;
    phase = "rendering";
    emit("started");
  }

  /** The render produced a file; the attempt now waits for it to be handed over. */
  function renderFinished(token: number): void {
    if (guard.isActive(token)) phase = "delivering";
  }

  /**
   * The hand-over ended. An attempt that already ended in a failed or
   * dismissed hand-over opens a fresh one when the person tries to save again.
   */
  function delivered(result: {
    success: boolean;
    canceled?: boolean;
    method: "share" | "download" | null;
  }): void {
    if (!guard.active) {
      if (!deliveryRetryable) return;
      begin("retry", { reason: "delivery_retry" });
    }
    const stage = exportDeliveryStage(result);
    const method: Properties = result.method
      ? { delivery_method: result.method }
      : {};
    if (stage === "completed") {
      if (finishActive("completed", method)) deliveryRetryable = false;
      return;
    }
    const ended = finishActive(
      stage,
      stage === "canceled"
        ? { reason: "share_dismissed", ...method, user_initiated: false }
        : { reason: "delivery_error", ...method }
    );
    if (ended) deliveryRetryable = true;
  }

  /** The session is closing with an attempt still open. */
  function sessionEnded(reason: string): void {
    finishActive("canceled", { reason, user_initiated: false });
  }

  return {
    begin,
    finish,
    finishActive,
    renderStarted,
    renderFinished,
    delivered,
    sessionEnded,
    isActive: (token: number) => guard.isActive(token),
    get active() {
      return guard.active;
    },
    get phase() {
      return phase;
    },
  };
}

export type FileExportLifecycle = ReturnType<typeof createFileExportLifecycle>;
