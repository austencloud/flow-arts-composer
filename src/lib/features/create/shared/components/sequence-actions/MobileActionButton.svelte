<!--
  MobileActionButton.svelte

  Compact action button for mobile toolbar with long-press help support.
  Icon (24px) + label below. Normal tap = action. 500ms long press = help.
  48px minimum touch target. Uses --btn-color CSS variable for theming.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    icon: string;
    label: string;
    btnColor: string;
    disabled?: boolean;
    unavailable?: boolean;
    highlighted?: boolean;
    /** Guest-gated: muted with a lock badge, stays tappable (tap → sign-up). */
    locked?: boolean;
    customIcon?: Snippet;
    onAction: () => void;
    onLongPress?: () => void;
  }

  let {
    icon,
    label,
    btnColor,
    disabled = false,
    unavailable = false,
    highlighted = false,
    locked = false,
    customIcon,
    onAction,
    onLongPress,
  }: Props = $props();

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let didLongPress = false;
  let startX = 0;
  let startY = 0;
  let didDrag = false;
  const DRAG_THRESHOLD = 8;

  function handlePointerDown(e: PointerEvent) {
    if (disabled && !unavailable) return;
    didLongPress = false;
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;

    if (onLongPress) {
      longPressTimer = setTimeout(() => {
        didLongPress = true;
        onLongPress?.();
      }, 500);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (didDrag) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      didDrag = true;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  function handlePointerUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (!didLongPress && !didDrag && !disabled) {
      onAction();
    }
    didLongPress = false;
    didDrag = false;
  }

  function handlePointerCancel() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    didLongPress = false;
    didDrag = false;
  }
</script>

<button
  class="mobile-action-btn"
  class:unavailable
  class:highlighted
  class:locked
  style:--btn-color={btnColor}
  {disabled}
  aria-label={locked ? `${label} - ${t("create_deep_locked_signup")}` : label}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  onpointerleave={handlePointerCancel}
  oncontextmenu={(e) => e.preventDefault()}
>
  <div class="btn-icon">
    {#if customIcon}
      {@render customIcon()}
    {:else}
      <i class="fas fa-{icon}" aria-hidden="true"></i>
    {/if}
  </div>
  <span class="btn-label">{label}</span>
  {#if locked}
    <div class="lock-badge" aria-hidden="true">
      <i class="fas fa-lock" aria-hidden="true"></i>
    </div>
  {/if}
</button>

<style>
  .mobile-action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    min-height: var(--min-touch-target);
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    text-align: center;
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.15),
      rgba(var(--btn-color), 0.05)
    );
    border: 1px solid rgba(var(--btn-color), 0.3);
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
  }

  .mobile-action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .mobile-action-btn:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: 50ms;
  }

  .mobile-action-btn.unavailable {
    --btn-color: 100, 100, 100;
    opacity: 0.5;
  }

  /* Guest-locked: muted like the LOOP grid's locked cards, still tappable. */
  .mobile-action-btn.locked {
    position: relative;
    opacity: 0.55;
    filter: saturate(0.55);
  }

  .lock-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(20, 20, 35, 0.85);
    color: rgba(255, 255, 255, 0.85);
    font-size: 9px;
    pointer-events: none;
  }

  .mobile-action-btn.highlighted {
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.25),
      rgba(var(--btn-color), 0.12)
    );
    border: 2px solid rgba(var(--btn-color), 0.6);
    box-shadow: 0 0 12px rgba(var(--btn-color), 0.2);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: var(--font-size-base, 16px);
    flex-shrink: 0;
    color: white;
    background: rgb(var(--btn-color));
  }

  .btn-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    line-height: 1.1;
  }

  .mobile-action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-action-btn {
      transition: none;
    }
    .mobile-action-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
