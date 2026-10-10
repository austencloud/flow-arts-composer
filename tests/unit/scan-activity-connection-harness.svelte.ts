import type { ScanActivityState } from "#lib/features/choreo-card/state/scan-activity-state.svelte.js";
import { watchScanActivityConnection } from "#lib/features/choreo-card/state/scan-activity-connection.svelte.js";

export function createScanActivityConnectionHarness(
  activity: ScanActivityState
): {
  setAuth: (next: {
    loading: boolean;
    userId: string | null;
    isAdmin: boolean;
  }) => void;
  dispose: () => void;
} {
  let loading = $state(true);
  let userId = $state<string | null>(null);
  let isAdmin = $state(false);

  const dispose = $effect.root(() => {
    watchScanActivityConnection(activity, () => ({
      loading,
      userId,
      isAdmin,
    }));
  });

  return {
    setAuth(next) {
      loading = next.loading;
      userId = next.userId;
      isAdmin = next.isAdmin;
    },
    dispose,
  };
}
