<!--
LandscapeTouchZone.svelte - Horizontal touch zone for landscape stepper
Left side decrements, right side increments
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let { type, disabled, onclick, onkeydown, title } = $props<{
    type: "increment" | "decrement";
    disabled: boolean;
    onclick: () => void;
    onkeydown: (event: KeyboardEvent) => void;
    title: string;
  }>();

  const ariaLabel = $derived(
    type === "increment"
      ? t("create_increase_value", { title })
      : t("create_decrease_value", { title })
  );
</script>

<button
  class="touch-zone {type}-zone"
  {onclick}
  {onkeydown}
  {disabled}
  aria-label={ariaLabel}
>
  <div class="zone-icon">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    >
      {#if type === "decrement"}
        <path d="M5 12h14" />
      {:else}
        <path d="M12 5v14M5 12h14" />
      {/if}
    </svg>
  </div>
</button>

<style>
  .touch-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;

    display: flex;
    align-items: center;

    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--text-color) 40%, transparent);

    cursor: pointer;
    transition:
      color 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      background 0.25s cubic-bezier(0.4, 0, 0.2, 1);

    user-select: none;
    -webkit-user-select: none;

    z-index: 1;
  }

  .decrement-zone {
    left: 0;
    justify-content: center;
    padding-right: clamp(14px, 4cqw, 32px);
    padding-left: clamp(2px, 0.5cqw, 4px);
  }

  .increment-zone {
    right: 0;
    justify-content: center;
    padding-left: clamp(14px, 4cqw, 32px);
    padding-right: clamp(2px, 0.5cqw, 4px);
  }

  .touch-zone:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text-color) 15%, transparent);
    color: color-mix(in srgb, var(--text-color) 80%, transparent);
  }

  .touch-zone:active:not(:disabled) {
    background: color-mix(in srgb, var(--text-color) 25%, transparent);
    color: var(--text-color);
  }

  .touch-zone:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  .touch-zone:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--text-color) 70%, transparent);
    outline-offset: -2px;
    transition: outline-color var(--duration-dramatic)
      cubic-bezier(0.4, 0, 0.2, 1);
  }

  .zone-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(28px, 6cqh, 40px);
    height: clamp(28px, 6cqh, 40px);
    flex-shrink: 0;

    background: color-mix(in srgb, var(--text-color) 15%, transparent);
    border: 2px solid color-mix(in srgb, var(--text-color) 30%, transparent);
    border-radius: 50%;
    color: var(--text-color);

    transition:
      color 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      background 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .zone-icon svg {
    width: 60%;
    height: 60%;
  }

  .touch-zone:hover:not(:disabled) .zone-icon {
    background: color-mix(in srgb, var(--text-color) 25%, transparent);
    border-color: color-mix(in srgb, var(--text-color) 50%, transparent);
    transform: scale(1.05);
  }

  .touch-zone:active:not(:disabled) .zone-icon {
    background: color-mix(in srgb, var(--text-color) 35%, transparent);
    transform: scale(0.95);
  }
</style>
