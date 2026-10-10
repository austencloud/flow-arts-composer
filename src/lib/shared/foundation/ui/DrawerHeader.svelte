<!--
  DrawerHeader.svelte

  Shared header component for drawers with title and close button.
  Provides consistent styling and accessibility across all drawer types.

  Usage:
    <DrawerHeader title="Filter Options" onClose={() => isOpen = false} />
    <DrawerHeader title="What's New" icon="fa-gift" onClose={handleClose} />
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

  interface Props {
    /** The title displayed in the header */
    title: string;
    /** Callback when close button is clicked */
    onClose: () => void;
    /**
     * Optional back callback. When provided, renders a leading back chevron
     * (top-left) and centers the title — turns the header into a drill-down
     * sub-page header (back returns to the parent view).
     */
    onBack?: () => void;
    /** Optional subtitle or secondary text */
    subtitle?: string;
    /** Optional Font Awesome icon class (e.g., "fa-gift", "fa-tasks") */
    icon?: string;
    /** Optional custom icon color */
    iconColor?: string;
    /** Prevent closing while the drawer is completing an in-flight action. */
    closeDisabled?: boolean;
    /** Accessible label for the close button. */
    closeLabel?: string;
  }

  let {
    title,
    onClose,
    onBack,
    subtitle,
    icon,
    iconColor,
    closeDisabled = false,
    closeLabel = "Close",
  }: Props = $props();

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  function handleClose() {
    if (closeDisabled) return;
    hapticService?.trigger("selection");
    onClose();
  }

  function handleBack() {
    hapticService?.trigger("selection");
    onBack?.();
  }
</script>

<header class="drawer-header" class:has-back={onBack}>
  {#if onBack}
    <button
      class="drawer-back-btn"
      onclick={handleBack}
      aria-label="{t('learn_back')}"
      type="button"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
  {/if}
  <div class="drawer-header-text">
    <h2>
      {#if icon}
        <i
          class="fas {icon}"
          aria-hidden="true"
          style={iconColor ? `color: ${iconColor}` : undefined}
        ></i>
      {/if}
      {title}
    </h2>
    {#if subtitle}
      <p class="drawer-header-subtitle">{subtitle}</p>
    {/if}
  </div>
  <button
    class="drawer-close-btn"
    onclick={handleClose}
    aria-label={closeLabel}
    disabled={closeDisabled}
    type="button"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
</header>

<style>
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
    gap: 16px;
  }

  /* Drill-down sub-page header: back-left, title-centered, close-right. */
  .drawer-header.has-back {
    display: grid;
    grid-template-columns: var(--min-touch-target, 48px) 1fr var(
        --min-touch-target,
        48px
      );
    gap: 12px;
  }

  .drawer-header.has-back .drawer-header-text {
    align-items: center;
    text-align: center;
  }

  .drawer-header.has-back h2 {
    justify-content: center;
  }

  .drawer-header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0; /* Allow text truncation */
  }

  .drawer-header h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 600;
    color: var(--theme-text, white);
    margin: 0;
    line-height: 1.2;
  }

  .drawer-header h2 i {
    font-size: 0.9em;
    color: var(--theme-accent, #6366f1);
  }

  .drawer-header-subtitle {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
    line-height: 1.3;
  }

  .drawer-close-btn,
  .drawer-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      color var(--transition-normal),
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      transform var(--transition-fast);
    flex-shrink: 0;
  }

  .drawer-close-btn:hover,
  .drawer-back-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .drawer-close-btn:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .drawer-close-btn:active,
  .drawer-back-btn:active {
    transform: scale(0.95);
  }

  .drawer-close-btn:focus-visible,
  .drawer-back-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .drawer-header {
      padding: 16px 20px;
    }

    .drawer-header h2 {
      font-size: var(--font-size-lg, 1.125rem);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .drawer-close-btn {
      transition: none;
    }

    .drawer-close-btn:active {
      transform: none;
    }
  }
</style>
