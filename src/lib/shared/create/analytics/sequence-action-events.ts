import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type {
  SequenceActionSource,
  SequenceActionsOpenSource,
  SequenceActionTargetHand,
  SequenceTransformCommandId,
} from "$lib/shared/create/domain/sequence-action-types";

export interface SequenceActionEventProperties {
  action: SequenceTransformCommandId;
  source: SequenceActionSource;
  targetHand: SequenceActionTargetHand;
  createMode: string;
  stepCount: number;
  hasStartPlacement: boolean;
}

function eventProperties(props: SequenceActionEventProperties) {
  return {
    action: props.action,
    source: props.source,
    target_hand: props.targetHand,
    create_mode: props.createMode,
    step_count: props.stepCount,
    has_start_position: props.hasStartPlacement,
  };
}

export function logSequenceActionInvoked(
  props: SequenceActionEventProperties
): void {
  captureEvent("sequence_action_invoked", eventProperties(props));
}

export function logSequenceActionResult(
  props: SequenceActionEventProperties & {
    outcome: "completed" | "busy" | "unavailable" | "failed";
    durationMs: number;
    errorName?: string;
  }
): void {
  captureEvent("sequence_action_result", {
    ...eventProperties(props),
    outcome: props.outcome,
    duration_ms: Math.max(0, Math.round(props.durationMs)),
    ...(props.errorName ? { error_name: props.errorName } : {}),
  });
}

export function logSequenceActionSurfaceShown(
  source: "header" | "workspace_button"
): void {
  captureEvent("sequence_action_surface_shown", { source });
}

export function logSequenceActionsOpened(
  source: SequenceActionsOpenSource
): void {
  captureEvent("sequence_actions_opened", { source });
}
