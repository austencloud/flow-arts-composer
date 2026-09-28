/**
 * Staff Tip Analyzer — main-thread entry point
 *
 * Finds where a filmed take's two LED staff ends are, once, so Post Studio
 * effects can follow the real staffs instead of a guessed centre. All the
 * actual work (decode, per-frame detection, tracking) runs in
 * `staff-tip-tracker.worker.ts`; this module just owns the worker's
 * lifecycle — spawn, relay progress, resolve or reject, always terminate.
 */

import type {
  StaffTipWorkerInMessage,
  StaffTipWorkerOutMessage,
} from "../workers/staff-tip-tracker.worker";
import type { StaffTipTrack } from "../domain/staff-tip-track";

export interface AnalyzeStaffTipsOptions {
  onProgress?: (fraction: number, phase: "background" | "detect" | "track") => void;
  signal?: AbortSignal;
}

/** Decodes `video`, tracks both LED staffs' lit ends, and returns the finished track. */
export function analyzeStaffTips(video: Blob, options: AnalyzeStaffTipsOptions = {}): Promise<StaffTipTrack> {
  const { onProgress, signal } = options;

  if (signal?.aborted) {
    return Promise.reject(new Error("Staff tip analysis was cancelled."));
  }

  return new Promise<StaffTipTrack>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/staff-tip-tracker.worker.ts", import.meta.url), {
      type: "module",
    });

    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fn();
    };

    const onAbort = (): void => {
      finish(() => reject(new Error("Staff tip analysis was cancelled.")));
    };
    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<StaffTipWorkerOutMessage>): void => {
      const msg = event.data;
      switch (msg.type) {
        case "progress":
          onProgress?.(msg.fraction, msg.phase);
          break;
        case "complete":
          finish(() => resolve(msg.track));
          break;
        case "error":
          finish(() => reject(new Error(msg.message)));
          break;
      }
    };
    worker.onerror = (): void => {
      finish(() => reject(new Error("This video could not be read.")));
    };

    const request: StaffTipWorkerInMessage = { type: "analyze", video };
    worker.postMessage(request);
  });
}
