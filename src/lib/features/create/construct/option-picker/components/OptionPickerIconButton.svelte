<!--
  OptionPickerIconButton.svelte

  Shared icon trigger for the compact picker header. Popover primitives pass
  their ARIA state and event handlers through restProps, so settings and help
  keep identical geometry without duplicating button behavior.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    icon: string;
    active?: boolean;
    density?: "standard" | "compact";
  }

  let {
    icon,
    active = false,
    density = "standard",
    type = "button",
    class: className,
    ...restProps
  }: Props = $props();
</script>

<button
  {...restProps}
  {type}
  class="option-picker-icon-button {className ?? ''}"
  class:active
  class:compact={density === "compact"}
>
  <i class="fas {icon}" aria-hidden="true"></i>
</button>

<style>
  .option-picker-icon-button {
    box-sizing: border-box;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    background: var(--theme-card-bg, rgba(10, 18, 30, 0.88));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 12px);
    color: color-mix(in srgb, var(--theme-accent, #22b8db) 76%, white);
    cursor: pointer;
    transition:
      background var(--duration-normal, 200ms) ease,
      border-color var(--duration-normal, 200ms) ease,
      color var(--duration-normal, 200ms) ease,
      box-shadow var(--duration-normal, 200ms) ease,
      transform var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .option-picker-icon-button.compact {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border-radius: var(--radius-md, 10px);
  }

  .option-picker-icon-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    color: color-mix(in srgb, var(--theme-accent, #22b8db) 58%, white);
  }

  .option-picker-icon-button.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22b8db) 12%,
      var(--theme-panel-bg, rgba(10, 18, 30, 0.96))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22b8db) 52%,
      var(--theme-stroke, rgba(255, 255, 255, 0.14))
    );
  }

  .option-picker-icon-button:active {
    transform: scale(0.94);
  }

  .option-picker-icon-button:focus-visible {
    outline: 2px solid var(--theme-accent, #22b8db);
    outline-offset: 2px;
  }

  .option-picker-icon-button i {
    font-size: 1rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .option-picker-icon-button {
      transition: none;
    }

    .option-picker-icon-button:active {
      transform: none;
    }
  }
</style>
