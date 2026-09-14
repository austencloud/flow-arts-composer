<!-- NavButton - Reusable Navigation Button Component -->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    icon = "",
    iconContent,
    label = "",
    active = false,
    disabled = false,
    color = "rgba(255, 255, 255, 1)",
    gradient = "rgba(255, 255, 255, 1)",
    type = "section", // 'section' | 'special'
    onClick = () => {},
    ariaLabel = "",
    badgeCount = 0,
    onpointerdown,
    onpointerup,
    onpointerleave,
    onpointercancel,
    oncontextmenu,
  } = $props<{
    icon?: string;
    iconContent?: Snippet;
    label: string;
    active?: boolean;
    disabled?: boolean;
    color?: string;
    gradient?: string;
    type?: "section" | "special";
    onClick?: () => void;
    ariaLabel?: string;
    badgeCount?: number;
    onpointerdown?: HTMLButtonAttributes["onpointerdown"];
    onpointerup?: HTMLButtonAttributes["onpointerup"];
    onpointerleave?: HTMLButtonAttributes["onpointerleave"];
    onpointercancel?: HTMLButtonAttributes["onpointercancel"];
    oncontextmenu?: HTMLButtonAttributes["oncontextmenu"];
  }>();

  function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return count.toString();
  }

  // Services
  let hapticService: HapticFeedback | undefined;

  // Label values (NavigationLabelService was a no-op, removed)
  let compactLabel = $derived(label);
  let fullLabel = $derived(label);

  function handleClick() {
    if (!disabled) {
      hapticService?.trigger("selection");
      onClick();
    }
  }

  onMount(() => {
    hapticService = getHapticFeedback();
  });
</script>

<button
  class="nav-button"
  class:active
  class:disabled
  class:has-badge={badgeCount > 0}
  class:section={type === "section"}
  class:special={type === "special"}
  onclick={handleClick}
  {onpointerdown}
  {onpointerup}
  {onpointerleave}
  {onpointercancel}
  {oncontextmenu}
  {disabled}
  aria-label="{ariaLabel || label}{badgeCount > 0
    ? `, ${badgeCount} unread`
    : ''}"
  aria-current={active && type === "section" ? "page" : undefined}
  style="--section-color: {color}; --section-gradient: {gradient};"
>
  <span class="nav-icon"
    >{#if iconContent}{@render iconContent()}{:else}{@html icon}{/if}</span
  >
  {#if badgeCount > 0}
    <span class="nav-badge" aria-hidden="true">
      {formatBadgeCount(badgeCount)}
    </span>
  {/if}
  <span class="nav-label nav-label-full">{fullLabel}</span>
  <span class="nav-label nav-label-compact">{compactLabel}</span>
</button>

<style>
  /* Base button styles */
  .nav-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: transparent;
    border: 1px solid transparent;
    color: hsl(0 0% 100% / 0.6);
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      box-shadow var(--transition-normal),
      color var(--transition-normal),
      transform var(--transition-fast);
    position: relative;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  /* Expanded invisible touch target for settings button in corner */
  .nav-button.special::before {
    content: "";
    position: absolute;
    /* Square touch target matching button dimensions */
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 0; /* Square instead of circle */
    cursor: pointer;
    /* Debug: uncomment to see touch area */
    /* background: rgba(0, 255, 0, 0.2); */
  }

  /* Section buttons - rounded rectangles */
  .nav-button.section {
    border-radius: 12px;
  }

  /* Special buttons (Menu/Settings) - rounded rectangle */
  .nav-button.special {
    border-radius: 12px;
    flex: 0 0 auto;
  }

  /* Special buttons keep their owning surface treatment when active. */
  .nav-button.special.active {
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
  }

  .nav-button:hover:not(.disabled) {
    background: hsl(0 0% 100% / 0.12);
  }

  .nav-button:active:not(.disabled) {
    transform: scale(0.97);
    background: hsl(0 0% 100% / 0.08);
  }

  /* Focus state for keyboard navigation */
  .nav-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .nav-button.active {
    color: hsl(0 0% 100%);
    background: color-mix(
      in srgb,
      var(--section-color, white) 16%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--section-color, white) 50%,
      var(--theme-stroke, transparent)
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--section-color, white) 18%, transparent);
  }

  .nav-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-button.disabled:active {
    transform: none;
  }

  .nav-icon {
    font-size: var(--font-size-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
      opacity 0.15s ease,
      filter 0.15s ease;
    /* Prevent icon from blocking button clicks */
    pointer-events: none;
  }

  /* Style Font Awesome icons with gradient colors */
  .nav-icon :global(i) {
    background: var(--section-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 6px hsl(0 0% 0% / 0.15));
  }

  /* Fallback for browsers that don't support background-clip */
  @supports not (background-clip: text) {
    .nav-icon :global(i) {
      color: var(--section-color);
      background: none;
      -webkit-text-fill-color: initial;
    }
  }

  /* Inactive buttons have reduced opacity */
  .nav-button:not(.active) .nav-icon :global(i) {
    opacity: 0.6;
  }

  .nav-button:hover:not(.disabled) .nav-icon :global(i) {
    opacity: 1;
    filter: drop-shadow(0 0 8px hsl(0 0% 0% / 0.2));
  }

  /* Active button has full color and subtle glow */
  .nav-button.active .nav-icon :global(i) {
    opacity: 1;
    filter: drop-shadow(0 0 10px var(--section-color)) brightness(1.05);
  }

  /* Disabled buttons remain grayed out */
  .nav-button.disabled .nav-icon {
    opacity: 0.3;
    filter: grayscale(1);
  }

  .nav-button.disabled .nav-icon :global(i) {
    color: var(--muted-foreground);
  }

  .nav-label {
    font-size: var(--font-size-compact);
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
    line-height: 1.2;
    pointer-events: none;
  }

  /* Labels hidden by default - parent layout controls visibility */
  .nav-label-full,
  .nav-label-compact {
    display: none;
  }

  /* Unread badge */
  .nav-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: var(--semantic-error, var(--semantic-error));
    border-radius: 8px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    box-shadow: 0 1px 3px var(--theme-shadow);
    animation: badgePop var(--duration-emphasis) ease;
    pointer-events: none;
    z-index: 5;
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
    .nav-button:focus-visible {
      outline: 3px solid white;
      outline-offset: 2px;
    }

    .nav-button.active {
      background: hsl(0 0% 100% / 0.2);
      border: 2px solid currentColor;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .nav-button {
      transition: none;
    }

    .nav-button:active {
      transform: none;
    }

    .nav-icon {
      transition: none;
    }

    .nav-badge {
      animation: none;
    }
  }
</style>
