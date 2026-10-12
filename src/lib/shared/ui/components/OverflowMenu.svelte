<!--
  OverflowMenu - Dropdown for secondary actions

  Displays either a compact three-dot trigger or a labelled toolbar trigger.
  On click, opens a positioned dropdown with action items. Closes on outside
  click or Escape.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Icon, type IconDefinition } from "@austencloud/video-editor/icons";

  interface MenuItem {
    label: string;
    /** A FontAwesome class, or an icon definition from the video editor package. */
    icon: string | IconDefinition;
    action: () => void;
    variant?: "danger";
    /** Keep unavailable actions discoverable without making them activatable. */
    disabled?: boolean;
    /** Why an item is unavailable, so a greyed row is not a dead end. */
    hint?: string;
    /**
     * Present (true OR false) marks this item as one option among a choice, so
     * it announces as a radio item. Leave it undefined for plain actions — a
     * menu can hold both, and calling a destructive action an unselected radio
     * option is worse than saying nothing.
     */
    selected?: boolean;
  }

  interface Props {
    items: MenuItem[];
    disabled?: boolean;
    ariaLabel?: string;
    placement?: "top" | "bottom";
    align?: "left" | "right";
    /** A labelled trigger keeps the menu behavior while reading as a normal
     * toolbar action instead of an icon-only overflow affordance. */
    triggerPresentation?: "icon" | "labelled";
    /**
     * Replaces the three-dot glyph inside the trigger button, which keeps the
     * expanded/haspopup wiring and the outside-click and Escape handling while
     * letting a caller show the current value instead of a generic affordance.
     */
    trigger?: Snippet;
    triggerClass?: string;
  }

  const {
    items,
    disabled = false,
    ariaLabel = "More actions",
    placement = "top",
    align = "right",
    triggerPresentation = "icon",
    trigger,
    triggerClass,
  }: Props = $props();

  const isRadioGroup = $derived(items.some((item) => item.selected));

  let open = $state(false);
  let menuEl: HTMLElement | null = $state(null);

  function toggle() {
    if (disabled) return;
    open = !open;
  }

  function handleItemClick(item: MenuItem) {
    open = false;
    item.action();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
    }
  }

  function handleOutsidePointerDown(e: PointerEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener("pointerdown", handleOutsidePointerDown, true);
      return () =>
        document.removeEventListener(
          "pointerdown",
          handleOutsidePointerDown,
          true
        );
    }
    return undefined;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="overflow-menu"
  class:opens-bottom={placement === "bottom"}
  class:aligns-left={align === "left"}
  bind:this={menuEl}
  onkeydown={handleKeydown}
>
  <button
    type="button"
    class="overflow-trigger {triggerClass ?? ''}"
    class:labelled-trigger={triggerPresentation === "labelled"}
    {disabled}
    onclick={toggle}
    aria-label={ariaLabel}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    {#if trigger}
      {@render trigger()}
    {:else}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    {/if}
  </button>

  {#if open}
    <div class="overflow-dropdown" role="menu">
      {#each items as item}
        <button
          type="button"
          class="overflow-item"
          class:danger={item.variant === "danger"}
          class:selected={item.selected}
          role={item.selected === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.selected === undefined ? undefined : item.selected}
          disabled={item.disabled}
          aria-disabled={item.disabled || undefined}
          title={item.hint}
          onclick={() => {
            if (!item.disabled) handleItemClick(item);
          }}
        >
          {#if typeof item.icon === "string"}
            <i class={item.icon} aria-hidden="true"></i>
          {:else}
            <Icon icon={item.icon} />
          {/if}
          <span class="overflow-item-label">
            {item.label}
            {#if item.hint && item.disabled}<small>{item.hint}</small>{/if}
          </span>
          {#if isRadioGroup}
            <i
              class="fa-solid fa-check overflow-check"
              class:is-on={item.selected}
              aria-hidden="true"
            ></i>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .overflow-menu {
    position: relative;
  }

  .overflow-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min, 44px);
    height: var(--touch-target-min, 44px);
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      background-color var(--duration-fast)
        var(--ease-out, var(--ease-standard)),
      border-color var(--duration-fast) var(--ease-out, var(--ease-standard)),
      color var(--duration-fast) var(--ease-out, var(--ease-standard));
    -webkit-tap-highlight-color: transparent;
  }

  .overflow-trigger.labelled-trigger {
    gap: 8px;
    width: 100%;
    height: auto;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 16px;
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
  }

  .overflow-trigger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .overflow-trigger:not(:disabled):hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .overflow-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .overflow-dropdown {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    min-width: 180px;
    padding: 4px;
    /* The menu floats over dense cards and pictographs. Paint the theme wash
       over a solid base so content behind it never competes with its labels. */
    background-color: #12141c;
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98)),
      var(--theme-panel-bg, rgba(18, 18, 28, 0.98))
    );
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 50;
  }

  .opens-bottom .overflow-dropdown {
    top: calc(100% + 6px);
    bottom: auto;
  }

  .aligns-left .overflow-dropdown {
    right: auto;
    left: 0;
  }

  .overflow-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
    -webkit-tap-highlight-color: transparent;
  }

  .overflow-item:not(:disabled):hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .overflow-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* The label column takes the slack so the check stays pinned right and the
     row width never depends on which item is currently chosen. */
  .overflow-item-label {
    display: grid;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .overflow-item-label small {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 400;
  }

  /* Reserved, not conditionally rendered: toggling the check in and out of flow
     would resize every row in the menu as the selection moves. */
  .overflow-check {
    visibility: hidden;
    color: var(--theme-accent, #6366f1);
  }

  .overflow-check.is-on {
    visibility: visible;
  }

  .overflow-item.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 16%,
      transparent
    );
  }

  .overflow-item:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  .overflow-item i,
  .overflow-item :global(.ve-icon) {
    width: 18px;
    text-align: center;
    font-size: 14px;
  }

  .overflow-item.danger {
    color: var(--semantic-error);
  }

  .overflow-item.danger:not(:disabled):hover {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .overflow-trigger,
    .overflow-item {
      transition: none;
    }
  }
</style>
