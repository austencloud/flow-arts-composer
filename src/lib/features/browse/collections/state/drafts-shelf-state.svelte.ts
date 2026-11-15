import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
        error = t("browse_drafts_load_failed");
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
