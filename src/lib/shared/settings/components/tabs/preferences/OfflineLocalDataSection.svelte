<!-- Offline downloads and local app data controls for Preferences > Advanced. -->
<script lang="ts">
  import { onMount } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { getAccountManager } from "$lib/shared/auth/get-account-manager";
  import { getOfflineCacheOrchestrator } from "$lib/shared/offline/get-offline-cache-orchestrator";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  import type { AccountManager } from "$lib/shared/auth/services/account-manager";
  import type {
    DownloadForOfflineResult,
    OfflineCacheStats,
  } from "$lib/shared/offline/domain/offline-cache-types";

  let offlineStats = $state<OfflineCacheStats | null>(null);
  let isDownloading = $state(false);
  let downloadError = $state<string | null>(null);
  let progress = $state<{ done: number; total: number } | null>(null);
  let lastResult = $state<DownloadForOfflineResult | null>(null);
  let cachingSupported = $state(true);
  let showResetConfirm = $state(false);
  let isResetting = $state(false);
  let resetError = $state<string | null>(null);
  let accountManager: AccountManager | null = null;

  const orchestrator = getOfflineCacheOrchestrator();

  onMount(() => {
    accountManager = getAccountManager();
    cachingSupported = orchestrator.isOfflineCachingSupported();
    void loadOfflineStats();
  });

  async function loadOfflineStats() {
    try {
      offlineStats = await orchestrator.getCacheStats();
    } catch {
      offlineStats = null;
    }
  }

  async function handleDownloadForOffline() {
    isDownloading = true;
    downloadError = null;
    lastResult = null;
    progress = null;

    try {
      lastResult = await orchestrator.downloadForOffline((done, total) => {
        progress = { done, total };
      });
      offlineStats = await orchestrator.getCacheStats();
    } catch (error) {
      downloadError =
        error instanceof Error
          ? error.message
          : t("settings_offline_download_failed");
    } finally {
      isDownloading = false;
      progress = null;
    }
  }

  async function performReset() {
    if (!accountManager || isResetting) return;

    isResetting = true;
    resetError = null;

    try {
      await accountManager.clearCache();
    } catch (error) {
      resetError =
        error instanceof Error
          ? error.message
          : t("settings_local_reset_failed");
      isResetting = false;
    }
  }

  const resultMessage = $derived.by(() => {
    const result = lastResult;
    if (!result) return null;
    if (!result.supported) {
      return t("settings_offline_only_installed");
    }
    if (result.reason === "offline") {
      return t("settings_offline_reconnect");
    }
    if (result.reason === "empty-gallery") {
      return t("settings_offline_empty_gallery");
    }

    const artNote = result.svgsCached
      ? t("settings_offline_art_cached")
      : t("settings_offline_art_caching");
    if (result.warmed === 0) {
      return t("settings_offline_no_thumbnails", { note: artNote });
    }
    return t("settings_offline_downloaded_count", {
      done: result.warmed.toLocaleString(),
      total: result.total.toLocaleString(),
      note: artNote,
    });
  });

  const resultIsInfo = $derived(
    lastResult != null &&
      (!lastResult.supported || lastResult.reason !== undefined)
  );

  const downloadLabel = $derived(
    isDownloading
      ? progress
        ? t("settings_offline_downloading", {
            done: progress.done,
            total: progress.total,
          })
        : t("settings_offline_preparing")
      : t("settings_offline_download")
  );

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const unit = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(unit));
    return `${parseFloat((bytes / Math.pow(unit, index)).toFixed(1))} ${sizes[index]}`;
  }
</script>

<div class="offline-local-data">
  <div class="offline-summary">
    <span
      class="status-badge"
      class:ready={offlineStats?.isOfflineReady}
      class:not-cached={!offlineStats?.isOfflineReady}
    >
      <i
        class="fas {offlineStats?.isOfflineReady
          ? 'fa-check-circle'
          : 'fa-cloud-download-alt'}"
        aria-hidden="true"
      ></i>
      {offlineStats?.isOfflineReady
        ? t("settings_offline_ready")
        : t("settings_offline_not_downloaded")}
    </span>

    {#if offlineStats}
      <dl class="cache-stats">
        <div class="stat-row">
          <dt>{t("settings_offline_gallery_sequences")}</dt>
          <dd>{offlineStats.gallerySequenceCount.toLocaleString()}</dd>
        </div>
        <div class="stat-row">
          <dt>{t("settings_offline_thumbnails")}</dt>
          <dd>
            {offlineStats.thumbnailsCached.toLocaleString()}
            {#if offlineStats.thumbnailsSizeBytes > 0}
              <span>({formatBytes(offlineStats.thumbnailsSizeBytes)})</span>
            {/if}
          </dd>
        </div>
        {#if offlineStats.storageUsedBytes !== null && offlineStats.storageQuotaBytes !== null}
          <div class="stat-row">
            <dt>{t("settings_offline_device_storage")}</dt>
            <dd>
              {formatBytes(offlineStats.storageUsedBytes)}
              {t("settings_offline_of")}
              {formatBytes(offlineStats.storageQuotaBytes)}
              {#if offlineStats.storagePersisted}<span
                  >{t("settings_offline_protected")}</span
                >{/if}
            </dd>
          </div>
        {/if}
      </dl>
    {/if}
  </div>

  <div class="action-block">
    <div class="action-copy">
      <h4>{t("settings_offline_heading")}</h4>
      <p>
        {t("settings_offline_description")}
      </p>
    </div>
    <div class="action-control download-control">
      <PanelButton
        variant="secondary"
        onclick={handleDownloadForOffline}
        disabled={isDownloading || !cachingSupported}
        ariaBusy={isDownloading}
      >
        <i
          class="fas {isDownloading ? 'fa-spinner fa-spin' : 'fa-download'}"
          aria-hidden="true"
        ></i>
        <span>{downloadLabel}</span>
      </PanelButton>
    </div>
  </div>

  {#if downloadError}
    <p class="message error" role="alert">{downloadError}</p>
  {:else if resultMessage}
    <p
      class="message result"
      class:info={resultIsInfo}
      role="status"
      aria-live="polite"
    >
      {resultMessage}
    </p>
  {:else if !cachingSupported}
    <p class="message info" role="note">
      {t("settings_offline_localhost_unavailable")}
    </p>
  {/if}

  <div class="action-block reset-block">
    <div class="action-copy">
      <h4>{t("settings_local_reset_heading")}</h4>
      <p>
        {t("settings_local_reset_description")}
      </p>
    </div>
    <div class="action-control">
      <PanelButton
        variant="secondary"
        onclick={() => (showResetConfirm = true)}
        disabled={isResetting}
        ariaBusy={isResetting}
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
        <span
          >{isResetting
            ? t("settings_local_resetting")
            : t("settings_local_reset")}</span
        >
      </PanelButton>
    </div>
  </div>

  {#if resetError}
    <p class="message error" role="alert">{resetError}</p>
  {/if}
</div>

<ConfirmDialog
  bind:isOpen={showResetConfirm}
  variant="warning"
  title={t("settings_local_reset_confirm_title")}
  message={t("settings_local_reset_confirm_message")}
  confirmText={t("settings_local_reset")}
  cancelText={t("common_cancel")}
  onConfirm={performReset}
  onCancel={() => {}}
/>

<style>
  .offline-local-data {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .offline-summary {
    display: grid;
    gap: 0.75rem;
    padding-bottom: 1rem;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 0.4rem;
    min-height: 2rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--theme-text-dim) 24%, transparent);
    border-radius: 999px;
    font-size: max(0.75rem, var(--font-size-compact));
    font-weight: 650;
    color: var(--theme-text-dim);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 75%,
      var(--theme-text) 3%
    );
  }

  .status-badge.ready {
    color: var(--semantic-success);
    border-color: color-mix(in srgb, var(--semantic-success) 35%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-success) 10%,
      var(--theme-panel-bg)
    );
  }

  .cache-stats {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0.75rem 0.9rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.65rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 82%,
      var(--theme-text) 4%
    );
  }

  .stat-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    font-size: max(0.75rem, var(--font-size-compact));
  }

  .stat-row dt {
    color: var(--theme-text-dim);
  }

  .stat-row dd {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.3rem;
    margin: 0;
    color: var(--theme-text);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .stat-row dd span {
    color: var(--theme-text-dim);
    font-weight: 450;
  }

  .action-block {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    border-top: 1px solid var(--theme-stroke);
  }

  .action-copy h4,
  .action-copy p {
    margin: 0;
  }

  .action-copy h4 {
    color: var(--theme-text);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 650;
  }

  .action-copy p,
  .message {
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.45;
  }

  .action-copy p {
    margin-top: 0.25rem;
  }

  .action-control {
    display: flex;
    justify-content: flex-end;
    min-width: 10.5rem;
  }

  .download-control {
    min-width: 13.5rem;
  }

  .message {
    margin: -0.25rem 0 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  }

  .message.result:not(.info) {
    color: var(--semantic-success);
  }

  .message.error {
    color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  @media (max-width: 36rem) {
    .action-block {
      grid-template-columns: 1fr;
    }

    .action-control,
    .download-control {
      justify-content: flex-start;
      min-width: 0;
    }
  }
</style>
