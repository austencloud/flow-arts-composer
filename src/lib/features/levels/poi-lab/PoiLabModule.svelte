<script lang="ts">
  /**
   * Poi Lab Module
   *
   * Sandbox for validating sequences against poi physics constraints.
   * Two tabs:
   * - Browser: Browse sequences with poi validation overlay
   * - Validator: Input sequence and check poi legality
   */

  import { browser } from "$app/env";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BrowserTab from "./components/BrowserTab.svelte";
  import ValidatorTab from "./components/ValidatorTab.svelte";

  // Tab persistence key for HMR
  const TAB_STORAGE_KEY = "poi-lab-active-tab";

  // Load persisted tab or default to browser
  function getInitialTab(): "browser" | "validator" {
    if (browser) {
      const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
      if (stored === "browser" || stored === "validator") {
        return stored;
      }
    }
    return "browser";
  }

  let activeTab = $state<"browser" | "validator">(getInitialTab());

  // Persist tab changes
  $effect(() => {
    if (browser) {
      sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }
  });
</script>

<div class="poi-lab">
  <header class="header">
    <div class="title-row">
      <h1>{t('poi_lab_title')}</h1>
      <span class="badge">{t('poi_lab_admin_badge')}</span>
    </div>
    <p class="subtitle">{t('poi_lab_subtitle')}</p>
    <nav class="tabs">
      <button
        class="tab"
        class:active={activeTab === "browser"}
        onclick={() => (activeTab = "browser")}
      >
        <i class="fas fa-th" aria-hidden="true"></i>
        {t('poi_lab_tab_browser')}
      </button>
      <button
        class="tab"
        class:active={activeTab === "validator"}
        onclick={() => (activeTab = "validator")}
      >
        <i class="fas fa-check-double" aria-hidden="true"></i>
        {t('poi_lab_tab_validator')}
      </button>
    </nav>
  </header>

  <div class="content themed-scrollbar">
    {#if activeTab === "browser"}
      <BrowserTab />
    {:else if activeTab === "validator"}
      <ValidatorTab />
    {/if}
  </div>
</div>

<style>
  .poi-lab {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .header {
    padding: 1.5rem 1.5rem 1rem;
    flex-shrink: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: rgba(34, 211, 238, 0.15);
    color: #22d3ee;
  }

  .subtitle {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-top: 1rem;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.25rem;
    border-radius: 10px;
    width: fit-content;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    min-height: 44px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-secondary, #888);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  @media (pointer: coarse) {
    .tab {
      min-height: var(--min-touch-target);
    }
  }

  .tab:hover {
    color: var(--theme-text, #fff);
  }

  .tab.active {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .tab:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .tab i {
    font-size: 0.875rem;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.5rem 1.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab {
      transition: none;
    }
  }
</style>
