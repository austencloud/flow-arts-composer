<!--
  ModalHeader.svelte - Reusable modal header component

  Features:
  - Optional icon with customizable color
  - Title and subtitle
  - Close button with accessibility
  - Gradient background accent
  - Staggered entrance animations via data-animate attributes
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";

  interface Props {
    title: string;
    subtitle?: string;
    icon?: string;
    iconColor?: string;
    showClose?: boolean;
    onClose?: () => void;
    id?: string;
  }

  let {
    title,
    subtitle,
    icon,
    iconColor = "var(--theme-accent, #3b82f6)",
    showClose = true,
    onClose,
    id,
  }: Props = $props();

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose?.();
  }
</script>

<header class="modal-header" style:--header-accent={iconColor}>
  {#if icon}
    <div class="header-icon" data-animate-icon>
      <i class="fas {icon}" aria-hidden="true"></i>
    </div>
  {/if}

  <div class="header-text" data-animate="2">
    <h2 {id} class="header-title">{title}</h2>
    {#if subtitle}
      <p class="header-subtitle">{subtitle}</p>
    {/if}
  </div>

  {#if showClose && onClose}
    <button
      class="close-btn"
      onclick={handleClose}
      aria-label="{t('create_ui_close_modal')}"
      data-animate="2"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  {/if}
</header>

<style>
  .modal-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--header-accent) 12%, transparent) 0%,
      transparent 100%
    );
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--header-accent);
    color: white;
    font-size: var(--font-size-lg, 18px);
    flex-shrink: 0;
    box-shadow:
      0 2px 8px color-mix(in srgb, var(--header-accent) 30%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .header-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
    line-height: 1.3;
  }

  .header-subtitle {
    margin: 3px 0 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    line-height: 1.4;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
    flex-shrink: 0;
    font-size: var(--font-size-base, 16px);
  }

  .close-btn:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .close-btn:active {
    transform: scale(0.95);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(255, 255, 255, 0.9));
    outline-offset: 2px;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .modal-header {
      padding: 16px;
      gap: 12px;
    }

    .header-icon {
      width: 40px;
      height: 40px;
      font-size: var(--font-size-base, 16px);
    }

    .header-title {
      font-size: 1.1rem;
    }

    .close-btn {
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .close-btn {
      transition: none;
    }
  }
</style>
