import type { DeviceDraft } from "#lib/features/create/shared/services/draft-catalog.js";

export function createDraftsShelfState(
  loadDrafts: () => Promise<DeviceDraft[]>
) {
  let drafts = $state<DeviceDraft[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let revision = 0;

  async function refresh(): Promise<void> {
    const current = ++revision;
    loading = true;
    error = null;
    try {
      const result = await loadDrafts();
      if (current === revision) drafts = result;
    } catch {
      if (current === revision)
        error = "Drafts couldn't be loaded from this device.";
    } finally {
      if (current === revision) loading = false;
    }
  }

  return {
    get drafts() {
      return drafts;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    refresh,
  };
}
