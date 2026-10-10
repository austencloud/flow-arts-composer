<script lang="ts">
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { LOOP_COMPONENTS } from "#lib/features/create/generate/shared/domain/constants/loop-constants.js";

  let { activeComponents }: { activeComponents: Set<LOOPComponent> } = $props();
</script>

<div class="grid">
  {#each LOOP_COMPONENTS as info (info.component)}
    {@const isActive = activeComponents.has(info.component)}
    <div class="card" class:current={isActive} class:dim={!isActive} style:--comp-color={info.color}>
      <div class="icon-badge">
        <i class="fas fa-{info.icon}" aria-hidden="true"></i>
      </div>
      <div class="label">{info.label}</div>
      {#if isActive}
        <div class="desc">{info.description}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(6px, 1.5vw, 16px);
    padding: clamp(12px, 2vw, 24px) clamp(8px, 2vw, 24px);
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(6px, 1vw, 12px);
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    /* Named properties, not `all`: `all` tweened layout on every restyle. */
    transition:
      opacity var(--duration-fast, 0.2s) ease,
      background-color var(--duration-fast, 0.2s) ease,
      border-color var(--duration-fast, 0.2s) ease;
    text-align: center;
  }

  .icon-badge {
    width: clamp(28px, 3vw, 36px);
    height: clamp(28px, 3vw, 36px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: clamp(3px, 0.5vw, 6px);
    font-size: clamp(13px, 1vw, 16px);
  }

  .label {
    font-size: clamp(10px, 0.5vw + 0.4rem, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    line-height: 1.25;
    font-weight: 600;
  }

  .desc {
    font-size: clamp(9px, 0.4vw + 0.35rem, 11px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    line-height: 1.3;
    margin-top: clamp(2px, 0.3vw, 4px);
  }

  .card.dim {
    opacity: 0.5;
  }
  .card.dim .icon-badge {
    filter: grayscale(1) brightness(0.85);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
  .card.dim .label {
    filter: grayscale(1) brightness(0.85);
  }

  .card.current {
    background: color-mix(in srgb, var(--comp-color, #2196f3) 14%, transparent);
    border-color: color-mix(in srgb, var(--comp-color, #2196f3) 35%, transparent);
  }
  .card.current .icon-badge {
    background: color-mix(in srgb, var(--comp-color, #2196f3) 25%, transparent);
    color: var(--comp-color, #2196f3);
  }
  .card.current .label {
    color: var(--theme-text, #e8e8ea);
  }
  .card.current .desc {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
  }
</style>
