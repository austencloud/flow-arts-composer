<!-- VersionListItem - Compact clickable item for master panel version list -->
<script lang="ts">
  import type { AppVersion } from "#lib/shared/versioning/domain/models/version-models.js";
  import { PRE_RELEASE_VERSION } from "#lib/shared/versioning/domain/models/version-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getReactiveLocale } from "#lib/shared/i18n/locale-state.svelte.js";
  import { releaseSummary } from "./release-summary";

  const { version, isActive, onclick } = $props<{
    version: AppVersion;
    isActive: boolean;
    onclick: () => void;
  }>();

  const summary = $derived(releaseSummary(version));

  const formattedDate = $derived(
    version.releasedAt.toLocaleDateString(getReactiveLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  );

  const isPreRelease = $derived(version.version === PRE_RELEASE_VERSION);
</script>

<button
  type="button"
  class="version-list-item"
  class:active={isActive}
  class:pre-release={isPreRelease}
  role="option"
  aria-selected={isActive}
  {onclick}
>
  <div class="header-row">
    <span class="version-number">
      {#if isPreRelease}
        {t("settings_pre_release")}
      {:else}
        v{version.version}
      {/if}
    </span>
    <span class="version-date">{formattedDate}</span>
  </div>
  <span class="summary-text">{summary}</span>
</button>

<style>
  .version-list-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: 1px solid transparent;
    border-bottom-color: color-mix(in srgb, var(--theme-stroke) 50%, transparent);
    border-radius: 0;
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-normal, 200ms) ease,
      border-color var(--duration-normal, 200ms) ease;
  }

  .version-list-item:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent) 4%,
      transparent
    );
  }

  /* The whole row marks the release you are reading — an accent bar on one
     edge is the banned pattern (.claude/rules/no-left-edge-accent-bar.md). */
  .version-list-item.active {
    border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  .version-list-item.active .version-number {
    color: var(--theme-accent);
  }

  .version-list-item.active .summary-text {
    color: var(--theme-text);
  }

  .version-list-item.pre-release {
    opacity: 0.7;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .version-number {
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    color: var(--theme-accent);
  }

  .pre-release .version-number {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .version-date {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    flex-shrink: 0;
  }

  .summary-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .version-list-item {
      transition: none;
    }
  }
</style>
