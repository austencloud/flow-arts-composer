<script lang="ts">
  import EffectControlStack from "$lib/shared/effects/components/EffectControlStack.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";

  interface Props {
    onBack?: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();
</script>

<div class="customize-view">
  {#if onBack}
    <button type="button" class="back-btn" onclick={onBack}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      Back
    </button>
  {/if}

  {#if state}
    <EffectControlStack
      effect="ghost"
      config={state}
      view="2d"
      tiers={["primary"]}
    />
  {:else}
    <p class="empty">Effect state unavailable.</p>
  {/if}
</div>

<style>
  .customize-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    min-height: 44px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .back-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .back-btn i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn {
      transition: none;
    }
  }

  .empty {
    opacity: 0.6;
    font-size: var(--font-size-min, 14px);
    padding: 4px 0;
  }
</style>
