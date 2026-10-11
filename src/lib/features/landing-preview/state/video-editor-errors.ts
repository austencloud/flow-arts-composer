import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

export function reportVideoEditError(action: string, error: unknown): void {
  console.error(`Failed to ${action}:`, error);
  const detail = error instanceof Error ? error.message : "Please try again.";
  toast.error(`Failed to ${action}. ${detail}`);
}
