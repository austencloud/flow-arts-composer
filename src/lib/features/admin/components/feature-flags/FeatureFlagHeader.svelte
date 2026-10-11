<script lang="ts">
  /**
   * FeatureFlagHeader
   * Header with view mode toggle and stats
   */

  import type { FlagStats } from "./shared/feature-utils";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    viewMode: "global" | "users";
    stats: FlagStats;
    onViewModeChange: (mode: "global" | "users") => void;
  }

  let { viewMode, stats, onViewModeChange }: Props = $props();
</script>

<header class="feature-flag-header">
  <div class="header-main">
    <div class="header-content">
      <h2>{t("admin_feature_flags")}</h2>
      <p>{t("admin_feature_flags_desc")}</p>
    </div>

    <div class="view-toggle">
      <button
        type="button"
        class="toggle-btn"
        class:active={viewMode === "global"}
        onclick={() => onViewModeChange("global")}
      >
        <i class="fas fa-table-cells" aria-hidden="true"></i>
        <span>{t("admin_global_matrix")}</span>
      </button>
      <button
        type="button"
        class="toggle-btn"
        class:active={viewMode === "users"}
        onclick={() => onViewModeChange("users")}
      >
        <i class="fas fa-user-gear" aria-hidden="true"></i>
        <span>{t("admin_user_overrides")}</span>
      </button>
    </div>
  </div>

  <div class="stats-bar themed-scrollbar">
    <div class="stat">
      <span class="stat-value">{stats.total}</span>
      <span class="stat-label">{t("admin_features")}</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat">
      <span class="stat-value enabled">{stats.enabled}</span>
      <span class="stat-label">{t("admin_enabled")}</span>
    </div>
    <div class="stat">
      <span class="stat-value disabled">{stats.disabled}</span>
      <span class="stat-label">{t("admin_disabled")}</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat">
      <span class="stat-value modules">{stats.byCategory.module}</span>
      <span class="stat-label">{t("admin_modules")}</span>
    </div>
    <div class="stat">
      <span class="stat-value tabs">{stats.byCategory.tab}</span>
      <span class="stat-label">{t("admin_tabs")}</span>
    </div>
    <div class="stat">
      <span class="stat-value capabilities">{stats.byCategory.capability}</span>
      <span class="stat-label">{t("admin_capabilities")}</span>
    </div>
  </div>
</header>

<style>
  .feature-flag-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  @media (min-width: 768px) {
    .feature-flag-header {
      padding: 20px 24px;
      gap: 16px;
    }
  }

  .header-main {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  @media (min-width: 600px) {
    .header-main {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
    }
  }

  .header-content h2 {
    margin: 0 0 4px 0;
    font-size: clamp(20px, 5vw, 26px);
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .header-content p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
    min-height: var(--min-touch-target, 44px);
  }

  .toggle-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
  }

  .toggle-btn:active {
    transform: scale(0.98);
  }

  .toggle-btn.active {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    color: var(--theme-accent, #6366f1);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
  }

  .toggle-btn i {
    font-size: var(--font-size-sm, 14px);
  }

  @media (max-width: 400px) {
    .toggle-btn span {
      display: none;
    }

    .toggle-btn {
      padding: 10px 14px;
    }
  }

  .stats-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 48px;
  }

  .stat-value {
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .stat-value.enabled {
    color: #34d399;
  }

  .stat-value.disabled {
    color: #f87171;
  }

  .stat-value.modules {
    color: #8b5cf6;
  }

  .stat-value.tabs {
    color: #3b82f6;
  }

  .stat-value.capabilities {
    color: #f59e0b;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }
</style>
