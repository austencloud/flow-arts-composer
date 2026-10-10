<!--
  AnimationPanelHeader.svelte

  Renders appropriate header for mobile vs desktop layouts.
  - Mobile (!isSideBySideLayout): Minimal close button in top-right (floating)
  - Desktop (isSideBySideLayout): Header row with title, info button, and close button
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    isSideBySideLayout = false,
    onClose = () => {},
    onShowHelp = () => {},
  }: {
    isSideBySideLayout?: boolean;
    onClose?: () => void;
    onShowHelp?: () => void;
  } = $props();
</script>

{#if !isSideBySideLayout}
  <!-- Minimal Mobile Header - info button on left, close button on right -->
  <div class="mobile-header">
    <button
      class="mobile-info-btn"
      onclick={onShowHelp}
      aria-label={t("compose_show_help")}
    >
      <i class="fas fa-circle-info" aria-hidden="true"></i>
    </button>
    <button class="mobile-close-btn" onclick={onClose} aria-label={t("compose_close_panel")}>
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>
{:else}
  <!-- Desktop Header - info button on left, title centered, close button on right -->
  <header class="desktop-header">
    <button
      class="header-info-btn"
      onclick={onShowHelp}
      aria-label={t("compose_show_help")}
    >
      <i class="fas fa-circle-info" aria-hidden="true"></i>
    </button>
    <span class="header-title">{t("compose_animation_viewer")}</span>
    <button class="header-close-btn" onclick={onClose} aria-label={t("compose_close_panel")}>
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>
{/if}

<style>
  .mobile-header {
    position: absolute;
    top: 4px;
    left: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: none;
  }

  .mobile-info-btn,
  .mobile-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 50%;
    color: var(--theme-text);
    font-size: var(--icon-size-md);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    pointer-events: auto;
  }

  .mobile-info-btn {
    color: var(--theme-accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .mobile-info-btn:hover,
    .mobile-close-btn:hover {
      background: var(--theme-card-hover-bg);
      transform: scale(1.05);
    }
  }

  .mobile-info-btn:active,
  .mobile-close-btn:active {
    transform: scale(0.95);
  }

  .desktop-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(12px, 3cqi, 16px) clamp(16px, 4cqi, 24px);
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
    flex-shrink: 0;
    background: var(--theme-card-bg);
    min-height: 72px;
    width: 100%;
  }

  .header-title {
    font-size: clamp(14px, 4cqi, 18px);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
    text-align: center;
  }

  .header-info-btn,
  .header-close-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--icon-size-md);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .header-info-btn {
    left: clamp(16px, 4cqi, 24px);
    color: var(--theme-accent);
  }

  .header-close-btn {
    right: clamp(16px, 4cqi, 24px);
  }

  .header-info-btn:hover,
  .header-close-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text, white);
    transform: translateY(-50%) scale(1.05);
  }

  .header-info-btn:hover {
    color: var(--theme-accent);
  }

  .header-info-btn:active,
  .header-close-btn:active {
    transform: translateY(-50%) scale(0.95);
  }
</style>
