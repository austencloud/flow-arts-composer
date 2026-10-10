<!-- ModuleSwitcherButton - Menu Button for Module Navigation -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { inboxState } from "#lib/shared/inbox/state/inbox-state.svelte.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";

  let {
    onClick = () => {},
    onLongPress = () => {},
    longPressMs = 500,
  } = $props<{
    onClick?: () => void;
    onLongPress?: () => void;
    longPressMs?: number;
  }>();

  let hapticService: HapticFeedback | undefined;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = $state(false);

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function startLongPress(event: PointerEvent) {
    // Only trigger long-press for touch (not mouse)
    if (event.pointerType === "mouse") return;
    clearLongPress();
    longPressTimer = setTimeout(() => {
      suppressClick = true;
      hapticService?.trigger("selection");
      onLongPress();
    }, longPressMs);
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleClick() {
    // Skip click if long-press just fired
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    hapticService?.trigger("selection");
    onClick();
  }

  // Inbox badge count - shows notification count
  const badgeCount = $derived(inboxState.unreadNotificationCount);

  function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return count.toString();
  }
</script>

<button
  class="menu-button"
  class:has-badge={badgeCount > 0}
  onclick={handleClick}
  onpointerdown={startLongPress}
  onpointerup={clearLongPress}
  onpointerleave={clearLongPress}
  onpointercancel={clearLongPress}
  oncontextmenu={(e) => e.preventDefault()}
  aria-label={badgeCount > 0
    ? t("nav_menu_unread", { count: badgeCount })
    : t("nav_ui_open_menu")}
>
  <i class="fas fa-bars menu-icon" aria-hidden="true"></i>
  <!-- Inbox unread badge -->
  {#if badgeCount > 0}
    <span class="unread-badge" aria-hidden="true">
      {formatBadgeCount(badgeCount)}
    </span>
  {/if}
</button>

<style>
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0;
    background: transparent;
    /* Fallback #818cf8 (indigo-400) ensures visibility before theme loads */
    border: 1px solid var(--theme-accent, #818cf8);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px hsl(0 0% 0% / 0.3);
    transition:
      transform 0.1s ease,
      opacity 0.15s ease,
      background 0.15s ease;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    position: relative;
  }

  .menu-button:hover {
    opacity: 0.85;
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 15%,
      transparent
    );
  }

  .menu-button:active {
    transform: scale(0.95);
  }

  /* Focus state for keyboard navigation */
  .menu-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .menu-icon {
    font-size: var(--font-size-xl);
    /* Fallback #818cf8 (indigo-400) ensures visibility before theme loads */
    color: var(--theme-accent, #818cf8);
    pointer-events: none;
  }

  /* Unread badge */
  .unread-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--semantic-error, var(--semantic-error));
    border-radius: 9px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 18px;
    text-align: center;
    animation: badgePop var(--duration-emphasis) ease;
    pointer-events: none;
    z-index: 10;
  }

  @keyframes badgePop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .menu-button {
      border: 2px solid white;
    }

    .menu-button:focus-visible {
      outline: 3px solid white;
    }

    .menu-icon {
      color: white;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-button {
      transition: none;
    }

    .menu-button:active {
      transform: none;
    }

    .unread-badge {
      animation: none;
    }
  }
</style>
