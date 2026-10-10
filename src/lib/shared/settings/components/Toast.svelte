<!-- Toast.svelte - Temporary notification for save status -->
<script lang="ts">
  let {
    message = "",
    show = false,
    duration = 3000,
  } = $props<{
    message?: string;
    show?: boolean;
    duration?: number;
  }>();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isVisible = $state(false);

  $effect(() => {
    if (show) {
      isVisible = true;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        isVisible = false;
      }, duration);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  });
</script>

{#if isVisible}
  <div class="toast" role="status" aria-live="polite">
    <i class="fas fa-check-circle" aria-hidden="true"></i>
    <span>{message}</span>
  </div>
{/if}

<style>
  /* iOS-Native Toast Notification - Pixel Perfect */
  .toast {
    position: fixed;
    bottom: calc(
      env(safe-area-inset-bottom, 0px) + 64px
    ); /* Above tab bar (49px + 15px margin) */
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px; /* iOS standard icon-text spacing */
    padding: 12px 16px; /* iOS exact padding */
    background: rgba(48, 209, 88, 0.94); /* iOS system green - exact RGB */
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-radius: 12px; /* iOS medium corner radius */
    color: white;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    font-size: var(--font-size-sm); /* iOS footnote size */
    font-weight: 600; /* iOS semibold */
    line-height: 1.5; /* WCAG AAA compliant */
    letter-spacing: -0.24px; /* iOS footnote tracking - exact spec */
    z-index: var(--z-toast);
    pointer-events: none;
    /* iOS spring animation - exact curve */
    animation: ios-toast-spring 0.5s cubic-bezier(0.36, 0.66, 0.04, 1);
  }

  .toast i {
    font-size: var(--font-size-base); /* iOS icon size for footnote text */
  }

  /* iOS Spring Animation */
  @keyframes ios-toast-spring {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(30px) scale(0.9);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) translateY(-4px) scale(1.02);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }

  /* Desktop positioning */
  @media (min-width: 769px) {
    .toast {
      bottom: 24px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .toast {
      background: color-mix(in srgb, var(--semantic-success, #22c55e) 98%, transparent);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
  }
</style>
