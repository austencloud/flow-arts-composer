<!-- VersionCard - Clickable card showing a single version's summary -->
<script lang="ts">
  import type { AppVersion } from "$lib/shared/versioning/domain/models/version-models";
  import { PRE_RELEASE_VERSION } from "$lib/shared/versioning/domain/models/version-models";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReactiveLocale } from "$lib/shared/i18n/locale-state.svelte";
  import { releaseSummary } from "./release-summary";

  const { version, onclick } = $props<{
    version: AppVersion;
    onclick: () => void;
  }>();

  // Check if we have curated changelog entries
  const hasChangelog = $derived(
    version.changelogEntries && version.changelogEntries.length > 0
  );

  // Format date
  const formattedDate = $derived(
    version.releasedAt.toLocaleDateString(getReactiveLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  );

  // Check if pre-release
  const isPreRelease = $derived(version.version === PRE_RELEASE_VERSION);

  const summary = $derived(releaseSummary(version));

  // Total changes count
  const totalChanges = $derived(
    hasChangelog && version.changelogEntries
      ? version.changelogEntries.length
      : version.feedbackCount
  );
</script>

<button
  type="button"
  class="version-card"
  class:pre-release={isPreRelease}
  {onclick}
>
  <div class="version-info">
    <span class="version-number">
      {#if isPreRelease}
        {t("settings_pre_release")}
      {:else}
        v{version.version}
      {/if}
    </span>
    <span class="version-date">{formattedDate}</span>
  </div>

  <div class="version-summary">
    <span class="summary-text">{summary}</span>
    <span class="total-count">
      {hasChangelog
        ? t("settings_change_count", { count: totalChanges })
        : t("settings_resolved_item_count", { count: totalChanges })}
    </span>
  </div>

  <div class="arrow-icon">
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </div>
</button>

<style>
  .version-card {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    transition: all var(--duration-normal) ease;
  }

  .version-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 30%,
      transparent
    );
  }

  .version-card:active {
    transform: scale(0.99);
  }

  .version-card.pre-release {
    opacity: 0.7;
  }

  .version-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 100px;
  }

  .version-number {
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--theme-accent);
  }

  .pre-release .version-number {
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
  }

  .version-date {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .version-summary {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-text {
    font-size: var(--font-size-sm);
    color: var(--theme-text);
  }

  .total-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .arrow-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--theme-text-dim);
    transition:
      color 0.2s ease,
      transform 0.2s ease;
  }

  .version-card:hover .arrow-icon {
    color: var(--theme-accent);
    transform: translateX(2px);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .version-card,
    .arrow-icon {
      transition: none;
    }

    .version-card:active {
      transform: none;
    }
  }
</style>
