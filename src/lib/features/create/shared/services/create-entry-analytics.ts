import { captureEvent } from "$lib/shared/analytics/services/posthog";
import type { CreateFrontDoorSource } from "$lib/shared/navigation/state/navigation-state.svelte";

export function logCreateFrontDoorViewed(props: {
  source: CreateFrontDoorSource;
  methodCount: number;
}): void {
  captureEvent("create_front_door_viewed", {
    source: props.source,
    method_count: props.methodCount,
  });
}

export function logCreateMethodSelected(props: {
  method: string;
  source: CreateFrontDoorSource;
  isLastUsed: boolean;
  isLocked: boolean;
}): void {
  captureEvent("create_method_selected", {
    method: props.method,
    source: props.source,
    is_last_used: props.isLastUsed,
    is_locked: props.isLocked,
  });
}
