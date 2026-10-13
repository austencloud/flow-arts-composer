<!--
  EffectModeBar.svelte

  Horizontal mode switcher for the Effects Lab.
  Displays Trails / Fire / LED buttons with effect-specific accent colors.
-->
<script lang="ts">
  import {
    EFFECT_DESCRIPTORS,
    type EffectMode,
  } from "../domain/effect-descriptor";

  interface Props {
    activeMode: EffectMode;
    onModeChange: (mode: EffectMode) => void;
  }
  let { activeMode, onModeChange }: Props = $props();
</script>

<div class="mode-bar" role="tablist" aria-label="Effect type">
  {#each EFFECT_DESCRIPTORS as desc}
    {@const isActive = activeMode === desc.id}
    <button
      role="tab"
      class="mode-btn"
      class:active={isActive}
      aria-selected={isActive}
      style="--mode-color: {desc.accentColor}; --mode-color-mid: {desc.accentColorMid}; --mode-color-border: {desc.accentColorBorder}"
      onclick={() => onModeChange(desc.id as EffectMode)}
    >
      <i class={desc.icon} aria-hidden="true"></i>
      <span class="mode-label">{desc.label}</span>
    </button>
  {/each}
</div>

<style>
  .mode-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: var(--spacing-sm, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
  }

  .mode-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 72px;
    padding: 12px 8px;
    border: 1.5px solid transparent;
    border-radius: var(--border-radius-md, 8px);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .mode-btn:hover {
    color: var(--theme-text, white);
    background: color-mix(in srgb, var(--theme-text) 6%, transparent);
    border-color: color-mix(in srgb, var(--theme-text) 8%, transparent);
  }

  .mode-btn.active {
    color: var(--mode-color);
    background: var(--mode-color-mid);
    border-color: var(--mode-color-border);
  }

  .mode-btn i {
    font-size: 1.25rem;
  }

  .mode-btn.active i {
    filter: drop-shadow(0 0 6px var(--mode-color));
  }

  .mode-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .mode-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mode-btn {
      transition: none;
    }

    .mode-btn.active i {
      filter: none;
    }
  }
</style>
