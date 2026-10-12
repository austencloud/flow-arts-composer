<script lang="ts">
  /**
   * AdminDetailPanel
   *
   * Right-side detail panel with header, close button, and optional action footer.
   * Used within AdminTwoPanelLayout to display details of a selected item.
   *
   * @example
   * <AdminDetailPanel
   *   title="User Details"
   *   subtitle="john@example.com"
   *   icon="fa-user"
   *   onClose={() => selectedUser = null}
   * >
   *   <div>Detail content</div>
   *
   *   {#snippet actions()}
   *     <button>Save</button>
   *   {/snippet}
   * </AdminDetailPanel>
   */

  import type { Snippet } from "svelte";
  import {
    ADMIN_COLORS,
    ADMIN_SPACING,
    ADMIN_RADIUS,
  } from "../styles/admin-theme";

  interface AdminDetailPanelProps {
    title: string;
    subtitle?: string;
    icon?: string;
    onClose: () => void;
    variant?: "default" | "form" | "readonly";
    class?: string;
    children: Snippet;
    header?: Snippet;
    actions?: Snippet;
  }

  let {
    title,
    subtitle,
    icon,
    onClose,
    variant = "default",
    class: className = "",
    children,
    header,
    actions,
  }: AdminDetailPanelProps = $props();
</script>

<div class="admin-detail-panel {className} variant-{variant}">
  {#if header}
    {@render header()}
  {:else}
    <header class="detail-header">
      <button
        class="close-btn"
        onclick={onClose}
        aria-label="Close detail panel"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>

      {#if icon}
        <div class="header-icon">
          <i class="fas {icon}" aria-hidden="true"></i>
        </div>
      {/if}

      <h3 class="header-title">{title}</h3>

      {#if subtitle}
        <p class="header-subtitle">{subtitle}</p>
      {/if}
    </header>
  {/if}

  <div class="detail-content themed-scrollbar">
    {@render children()}
  </div>

  {#if actions}
    <footer class="detail-footer">
      {@render actions()}
    </footer>
  {/if}
</div>

<style>
  .admin-detail-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
  }

  /* Header */
  .detail-header {
    position: relative;
    padding: 32px 24px;
    text-align: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal),
      width var(--duration-normal),
      height var(--duration-normal);
  }

  /* Expand touch target while maintaining visual size */
  .close-btn::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, #ffffff);
  }

  .header-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    border-radius: 50%;
    background: var(--theme-card-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-2xl);
    color: var(--theme-text-dim);
  }

  .header-title {
    margin: 0 0 4px 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .header-subtitle {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  /* Content */
  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  /* Footer */
  .detail-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  /* Safe area padding for notched devices */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .detail-footer {
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
  }

  /* Variant: readonly (remove edit actions styling) */
  .variant-readonly .detail-footer {
    justify-content: center;
  }

  /* Mobile adjustments */
  @media (max-width: 767px) {
    .detail-header {
      padding: 20px 16px 24px;
    }

    .header-icon {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      margin: 0 auto 12px;
      font-size: var(--font-size-xl);
    }

    .header-title {
      font-size: var(--font-size-lg);
    }

    .header-subtitle {
      font-size: var(--font-size-compact);
      word-break: break-all;
    }

    .close-btn {
      top: 12px;
      right: 12px;
      width: var(--min-touch-target); /* WCAG AA touch target */
      height: var(--min-touch-target);
    }

    .detail-content {
      padding: 16px;
    }

    .detail-footer {
      padding: 12px 16px;
      gap: 10px;
    }

    /* Stack buttons on very small screens */
    .detail-footer > :global(*) {
      flex: 1;
      min-width: 120px;
    }
  }
</style>
