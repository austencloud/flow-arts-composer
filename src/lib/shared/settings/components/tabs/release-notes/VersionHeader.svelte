<!-- VersionHeader - Badge and date display -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getReactiveLocale } from "#lib/shared/i18n/locale-state.svelte.js";
  import { PRE_RELEASE_VERSION } from "#lib/shared/versioning/domain/models/version-models.js";
  import CopyForAIButton from "#lib/shared/foundation/ui/CopyForAIButton.svelte";

  let {
    version,
    releasedAt,
    onClose,
    getCopyData,
    layout = "drawer",
  }: {
    version: string;
    releasedAt: Date;
    onClose?: () => void;
    getCopyData?: () => string;
    layout?: "drawer" | "inline";
  } = $props();

  const isPreRelease = $derived(version === PRE_RELEASE_VERSION);
  const formattedDate = $derived(
    releasedAt.toLocaleDateString(getReactiveLocale(), {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );
</script>

<header class="panel-header" class:layout-inline={layout === "inline"} class:layout-drawer={layout === "drawer"}>
  {#if layout === "drawer"}
    {#if getCopyData}
      <CopyForAIButton
        getData={getCopyData}
        ariaLabel={t("settings_copy_release_notes")}
        variant="icon-only"
        size="md"
        idleIcon="fa-copy"
        class="header-button copy-button"
      />
    {/if}

    {#if onClose}
      <button
        type="button"
        class="header-button close-button"
        onclick={onClose}
        aria-label={t("settings_close_version_details")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}

    <div class="version-badge" class:pre-release={isPreRelease}>
      <span class="badge-text">
        {isPreRelease ? t("settings_pre_release") : `v${version}`}
      </span>
    </div>

    <time class="release-date">{formattedDate}</time>
  {:else}
    <div class="version-badge inline-badge" class:pre-release={isPreRelease}>
      <span class="badge-text">
        {isPreRelease ? t("settings_pre_release") : `v${version}`}
      </span>
    </div>

    <time class="release-date">{formattedDate}</time>

    {#if getCopyData}
      <CopyForAIButton
        getData={getCopyData}
        ariaLabel={t("settings_copy_release_notes")}
        variant="icon-only"
        size="md"
        idleIcon="fa-copy"
        class="header-button copy-button-inline"
      />
    {/if}
  {/if}
</header>

<style>
  /* Drawer layout: centered, column */
  .panel-header.layout-drawer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    position: relative;
  }

  /* Inline layout: horizontal row */
  .panel-header.layout-inline {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .layout-inline .release-date {
    flex: 1;
  }

  .header-button {
    position: absolute;
    top: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .header-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .close-button {
    right: 0;
  }

  .version-badge {
    display: inline-flex;
    padding: 8px 20px;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 20%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 10%,
        transparent
      )
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent-strong)) 30%,
        transparent
      );
    border-radius: 24px;
  }

  .version-badge.inline-badge {
    padding: 4px 14px;
  }

  .version-badge.pre-release {
    background: var(--theme-card-bg);
    border-color: var(--theme-stroke-strong);
  }

  .badge-text {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--theme-accent);
  }

  .inline-badge .badge-text {
    font-size: var(--font-size-base);
  }

  .pre-release .badge-text {
    color: var(--theme-text-dim);
    font-size: var(--font-size-base);
  }

  .release-date {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  @media (max-width: 768px) {
    .panel-header.layout-drawer {
      margin-bottom: 16px;
    }

    .version-badge {
      padding: 6px 16px;
    }

    .layout-drawer .badge-text {
      font-size: var(--font-size-lg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .header-button {
      transition: none;
    }
  }
</style>
