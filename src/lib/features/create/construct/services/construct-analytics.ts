import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { LetterTypeGroupKey } from "../option-picker/services/section-title-formatter";

export type StartPlacementPath = "presets" | "build";
export type LetterTypeNavigationSource = "selector" | "carousel";

const IMMEDIATE_UNDO_WINDOW_MS = 5_000;
let lastOptionApplication:
  | {
      at: number;
      stepNumber: number;
    }
  | undefined;

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function logConstructStartPlacementPath(path: StartPlacementPath): void {
  captureEvent("construct_start_pose_path_selected", { path });
}

export function logConstructStartPlacementCompleted(props: {
  path: StartPlacementPath;
  gridMode: GridMode;
}): void {
  captureEvent("construct_start_pose_completed", {
    path: props.path,
    grid_mode: props.gridMode,
  });
}

export function logConstructStartPlacementCancelled(
  path: StartPlacementPath
): void {
  captureEvent("construct_start_pose_cancelled", { path });
}

export function logConstructLetterTypeGroupSelected(props: {
  group: LetterTypeGroupKey;
  source: LetterTypeNavigationSource;
}): void {
  // Keep the established event and property names so historical dashboards
  // remain continuous while the product uses the canonical "letter type" term.
  captureEvent("construct_movement_type_selected", {
    family: props.group,
    source: props.source,
  });
}

export function logConstructOptionApplied(
  props: {
    stepNumber: number;
  },
  at = monotonicNow()
): void {
  lastOptionApplication = { at, ...props };
  captureEvent("construct_option_applied", {
    step_number: props.stepNumber,
  });
}

export function logConstructContextPreviewReady(props: {
  stepNumber: number;
  latencyMs: number;
  autoplay: boolean;
}): void {
  captureEvent("construct_context_preview_ready", {
    step_number: props.stepNumber,
    latency_ms: Math.max(0, Math.round(props.latencyMs)),
    autoplay: props.autoplay,
  });
}

export function logConstructContextPreviewCompleted(props: {
  stepNumber: number;
}): void {
  captureEvent("construct_context_preview_completed", {
    step_number: props.stepNumber,
  });
}

export function logConstructFullPlay(stepCount: number): void {
  captureEvent("construct_full_play_activated", {
    step_count: stepCount,
  });
}

export function logConstructImmediateUndo(at = monotonicNow()): boolean {
  if (
    !lastOptionApplication ||
    at - lastOptionApplication.at < 0 ||
    at - lastOptionApplication.at > IMMEDIATE_UNDO_WINDOW_MS
  ) {
    return false;
  }

  captureEvent("construct_immediate_undo", {
    step_number: lastOptionApplication.stepNumber,
    elapsed_ms: Math.round(at - lastOptionApplication.at),
  });
  lastOptionApplication = undefined;
  return true;
}

/** @internal Test isolation for the small immediate-undo correlation window. */
export function resetConstructAnalyticsForTests(): void {
  lastOptionApplication = undefined;
}
