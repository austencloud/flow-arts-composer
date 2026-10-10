<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * PanelTabs - Segmented control / tab component
   *
   * Provides consistent tab styling across panels.
   */

  interface Tab {
    /** Unique value for the tab */
    value: string;
    /** Display label */
    label: string;
    /** Optional FontAwesome icon class */
    icon?: string;
  }

  interface Props {
    /** Array of tab definitions */
    tabs: Tab[];
    /** Currently active tab value */
    activeTab: string;
    /** Change handler */
    onchange: (value: string) => void;
    /** Hide labels on mobile (show icons only) */
    compactOnMobile?: boolean;
  }

  let { tabs, activeTab, onchange, compactOnMobile = true }: Props = $props();
</script>

<div class="panel-tabs-container">
  <div
    class="panel-tabs"
    role="tablist"
    aria-label={t("shared_controls_panel_tabs")}
  >
    {#each tabs as tab (tab.value)}
      <button
        type="button"
        id="panel-tab-{tab.value}"
        class="panel-tab"
        class:panel-tab--active={activeTab === tab.value}
        role="tab"
        aria-selected={activeTab === tab.value}
        aria-controls="panel-{tab.value}"
        tabindex={activeTab === tab.value ? 0 : -1}
        onclick={() => onchange(tab.value)}
      >
        {#if tab.icon}
          <i class="fas {tab.icon}" aria-hidden="true"></i>
        {/if}
        <span
          class="panel-tab__label"
          class:panel-tab__label--compact={compactOnMobile}
        >
          {tab.label}
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .panel-tabs-container {
    padding: 0 20px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .panel-tabs {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-radius: 100px;
    box-shadow:
      inset 0 0.5px 1px rgba(0, 0, 0, 0.15),
      0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .panel-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 14px 18px;
    min-height: var(--min-touch-target);
    background: transparent;
    border: none;
    border-radius: 100px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .panel-tab:hover {
    color: var(--theme-text);
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 10%,
      transparent
    );
  }

  .panel-tab--active {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent-strong)) 25%,
      transparent
    );
    color: var(--theme-text);
  }

  .panel-tab i {
    font-size: var(--font-size-sm);
  }

  @media (max-width: 640px) {
    .panel-tabs-container {
      padding: 0 16px;
    }

    .panel-tab__label--compact {
      display: none;
    }

    .panel-tab {
      padding: 14px 16px;
      min-height: var(--min-touch-target);
    }

    .panel-tab i {
      font-size: var(--font-size-base);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-tab {
      transition: none;
    }
  }
</style>
