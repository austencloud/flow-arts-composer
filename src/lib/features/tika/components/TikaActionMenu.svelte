<!--
  TikaActionMenu - Overflow menu for secondary Tika actions

  Groups utility actions (refresh, tools, copy, review panel) in a dropdown
  to keep the header clean while maintaining access to all features.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";

  interface ActionItem {
    id: string;
    label: string;
    icon: string;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
  }

  const {
    actions = [],
  } = $props<{
    actions: ActionItem[];
  }>();

  let hapticService: HapticFeedback | null = null;
  let isOpen = $state(false);
  let menuRef = $state<HTMLDivElement | null>(null);

  function toggle() {
    hapticService?.trigger("selection");
    isOpen = !isOpen;
  }

  function handleAction(action: ActionItem) {
    hapticService?.trigger("selection");
    action.onClick();
    isOpen = false;
  }

  function handlePointerDownOutside(event: PointerEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  onMount(() => {
    hapticService = getHapticFeedback();
    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
    };
  });
</script>

<div class="action-menu" bind:this={menuRef}>
  <button aria-label="More actions"
    class="menu-trigger"
    class:active={isOpen}
    onclick={toggle}
    type="button"
    aria-expanded={isOpen}
    aria-haspopup="menu"
  >
    <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
  </button>

  {#if isOpen}
    <div class="menu-dropdown" role="menu">
      {#each actions as action (action.id)}
        <button aria-label={action.label}
          class="menu-item"
          class:active={action.active}
          class:danger={action.danger}
          onclick={() => handleAction(action)}
          type="button"
          role="menuitem"
        >
          <i class="fas {action.icon}" aria-hidden="true"></i>
          <span>{action.label}</span>
          {#if action.active}
            <i class="fas fa-check check-icon" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .action-menu {
    position: relative;
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    padding: 0;
    background: var(--theme-card-bg, rgba(100, 100, 120, 0.85));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    color: var(--theme-text, #ffffff);
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-normal, 0.3s) ease;
    flex-shrink: 0;
    box-shadow: var(--shadow-sm);
  }

  .menu-trigger:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-md);
    background: var(--theme-card-bg, rgba(120, 120, 140, 0.95));
  }

  .menu-trigger:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .menu-trigger.active {
    background: var(--theme-accent, rgba(99, 102, 241, 0.9));
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }

  .menu-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .menu-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
    z-index: var(--z-dropdown);
    overflow: hidden;
    animation: slideDown var(--duration-normal, 0.3s) ease;
    padding: 6px;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal, 0.3s) ease;
    text-align: left;
  }

  .menu-item:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .menu-item:active {
    transform: scale(0.98);
  }

  .menu-item.active {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-accent, #6366f1);
  }

  .menu-item.danger {
    color: var(--semantic-error, #ef4444);
  }

  .menu-item.danger:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
  }

  .menu-item i:first-child {
    width: 18px;
    text-align: center;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .menu-item span {
    flex: 1;
  }

  .check-icon {
    color: var(--semantic-success, #22c55e);
    font-size: var(--font-size-min, 14px);
    flex-shrink: 0;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .menu-dropdown {
      animation: none;
    }
  }
</style>
