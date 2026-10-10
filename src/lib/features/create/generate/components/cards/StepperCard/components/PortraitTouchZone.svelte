<!--
PortraitTouchZone.svelte - Invisible touch zone for portrait stepper
Covers top or bottom half of the card for increment/decrement
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let { type, title, disabled, onclick, onkeydown } = $props<{
    type: "increment" | "decrement";
    title: string;
    disabled: boolean;
    onclick: () => void;
    onkeydown: (e: KeyboardEvent) => void;
  }>();

  const ariaLabel = $derived(
    t(
      type === "increment"
        ? "create_deep_increase_aria"
        : "create_deep_decrease_aria",
      { title }
    )
  );
</script>

<button
  class="portrait-touch-zone {type === 'increment'
    ? 'portrait-increment-zone'
    : 'portrait-decrement-zone'}"
  {onclick}
  {onkeydown}
  {disabled}
  aria-label={ariaLabel}
  data-ghost="safe"
  data-ghost-kind="generate-option"
  data-ghost-label={ariaLabel}
></button>

<style>
  /* Portrait mode: Touch zones - invisible overlay for top/bottom halves */
  .portrait-touch-zone {
    position: absolute;
    left: 0;
    right: 0;
    height: 50%;
    z-index: 1;

    background: transparent;
    border: none;
    cursor: pointer;
    transition:
      background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      outline-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);

    user-select: none;
    -webkit-user-select: none;
  }

  .portrait-increment-zone {
    top: 0;
  }

  .portrait-decrement-zone {
    bottom: 0;
  }

  .portrait-touch-zone:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text-color) 8%, transparent);
  }

  .portrait-touch-zone:active:not(:disabled) {
    background: color-mix(in srgb, var(--text-color) 15%, transparent);
  }

  .portrait-touch-zone:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .portrait-touch-zone:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--text-color) 70%, transparent);
    outline-offset: -2px;
    transition: outline-color var(--duration-dramatic)
      cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
