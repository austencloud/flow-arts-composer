<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    label,
    detail,
    art,
    selected = false,
    selectedLeft = false,
    selectedRight = false,
    active = false,
    color = "blue",
    badge,
    actionLabel,
    disabled = false,
    ghost = false,
    buttonProps,
    onpress,
  } = $props<{
    label: string;
    detail?: string;
    art: Snippet;
    selected?: boolean;
    selectedLeft?: boolean;
    selectedRight?: boolean;
    active?: boolean;
    color?: "blue" | "red" | (string & {});
    badge?: number;
    actionLabel: string;
    disabled?: boolean;
    ghost?: boolean;
    buttonProps?: HTMLButtonAttributes;
    onpress?: () => void;
  }>();

  const isSentinel = $derived(color === "blue" || color === "red");
  const customStyle = $derived(
    isSentinel
      ? ""
      : `background: ${color}; box-shadow: 0 3px 10px color-mix(in srgb, ${color} 50%, transparent), 0 1px 3px var(--theme-shadow);`
  );
</script>

<button
  type="button"
  class="prop-button prop-selection-button"
  class:selected
  class:active
  onclick={onpress}
  aria-label={actionLabel}
  aria-pressed={selected}
  data-ghost={ghost && !selected ? "safe" : undefined}
  data-ghost-kind={ghost && !selected ? "prop" : undefined}
  data-ghost-label={ghost ? label : undefined}
  title={actionLabel}
  {disabled}
  {...buttonProps}
>
  <span class="prop-image-container" aria-hidden="true">
    {@render art()}
  </span>

  <span class="prop-copy">
    <span class="prop-label">{label}</span>
    {#if detail}
      <span class="prop-detail">{detail}</span>
    {/if}
  </span>

  {#if badge}
    <span class="variant-badge" aria-label={t("settings_variant_count", { count: badge })}>{badge}</span>
  {/if}

  {#if selected || selectedLeft || selectedRight}
    <span class="checkmark-container" aria-hidden="true">
      {#if selected}
        <span
          class="ios-checkmark"
          class:blue={color === "blue"}
          class:red={color === "red"}
          style={customStyle}
        >
          <i class="fas fa-check"></i>
        </span>
      {:else}
        {#if selectedLeft}
          <span class="ios-checkmark blue">
            <i class="fas fa-check"></i>
          </span>
        {/if}
        {#if selectedRight}
          <span class="ios-checkmark red" class:offset={selectedLeft}>
            <i class="fas fa-check"></i>
          </span>
        {/if}
      {/if}
    </span>
  {/if}
</button>

<style>
  .prop-selection-button {
    position: relative;
    display: flex;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    aspect-ratio: 1 / 1.05;
    box-sizing: border-box;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    padding: 10px 8px 8px;
    overflow: hidden;
    color: var(--theme-text);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-accent) 7%, transparent),
        transparent 72%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    cursor: pointer;
    transition:
      color var(--transition-normal),
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      box-shadow var(--transition-normal),
      transform var(--transition-fast);
  }

  .prop-selection-button:hover:not(:disabled) {
    color: var(--theme-text);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-accent) 13%, transparent),
        transparent 74%
      ),
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    transform: translateY(-1px);
  }

  .prop-selection-button.selected {
    color: var(--theme-text);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-accent) 28%, transparent),
        color-mix(in srgb, var(--theme-accent) 10%, transparent)
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: color-mix(in srgb, var(--theme-accent) 68%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--theme-accent) 18%, transparent),
      0 8px 24px color-mix(in srgb, var(--theme-accent) 22%, transparent);
  }

  .prop-selection-button.selected:hover:not(:disabled) {
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-accent) 34%, transparent),
        color-mix(in srgb, var(--theme-accent) 14%, transparent)
      ),
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .prop-selection-button.active:not(.selected) {
    border-color: color-mix(in srgb, var(--theme-accent) 72%, transparent);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent) 34%, transparent);
  }

  .prop-selection-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .prop-selection-button:active:not(:disabled) {
    transform: scale(0.96);
  }

  .prop-selection-button:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .prop-image-container {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 0;
    flex: 1;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .prop-image-container :global(.prop-composition-preview),
  .prop-image-container :global(.prop-selection-art) {
    width: 82%;
    height: auto;
    max-height: 80%;
    aspect-ratio: 1;
    opacity: 0.82;
    filter: drop-shadow(0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.4)));
    transition:
      opacity var(--transition-normal),
      transform var(--transition-normal);
  }

  .prop-selection-button:hover:not(:disabled)
    .prop-image-container
    :global(.prop-composition-preview),
  .prop-selection-button:hover:not(:disabled)
    .prop-image-container
    :global(.prop-selection-art) {
    opacity: 0.96;
    transform: scale(1.035);
  }

  .prop-selection-button.selected
    .prop-image-container
    :global(.prop-composition-preview),
  .prop-selection-button.selected
    .prop-image-container
    :global(.prop-selection-art) {
    opacity: 1;
  }

  .prop-copy {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .prop-label,
  .prop-detail {
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  }

  .prop-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.1px;
    opacity: 0.82;
    transition:
      color var(--transition-normal),
      opacity var(--transition-normal);
  }

  .prop-detail {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    line-height: 1.15;
    opacity: 0.78;
  }

  .prop-selection-button:hover:not(:disabled) .prop-label {
    color: var(--theme-text);
    opacity: 1;
  }

  .prop-selection-button.selected .prop-label {
    color: var(--theme-accent);
    opacity: 1;
  }

  .variant-badge {
    position: absolute;
    top: 7px;
    left: 7px;
    z-index: 10;
    display: flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    color: var(--theme-panel-bg, #121218);
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    border-radius: 50%;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }

  .checkmark-container {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 10;
    display: flex;
    gap: 3px;
  }

  .ios-checkmark {
    display: flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    color: white;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    animation: ios-checkmark-pop var(--transition-bounce);
  }

  .ios-checkmark.blue {
    background: var(--theme-accent, #818cf8);
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-accent, #818cf8) 40%, transparent);
  }

  .ios-checkmark.red {
    background: var(--prop-red-text, #f87171);
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--prop-red-text, #f87171) 40%, transparent);
  }

  .ios-checkmark.red.offset {
    margin-left: -8px;
  }

  @keyframes ios-checkmark-pop {
    from {
      opacity: 0;
      transform: scale(0);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-selection-button,
    .ios-checkmark,
    .prop-image-container :global(.prop-composition-preview),
    .prop-image-container :global(.prop-selection-art) {
      transition: none;
      animation: none;
    }

    .prop-selection-button:hover,
    .prop-selection-button:active {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    .prop-selection-button {
      border: 2px solid var(--theme-stroke-strong);
    }

    .prop-selection-button.selected {
      border: 2px solid var(--theme-accent);
      background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    }
  }
</style>
