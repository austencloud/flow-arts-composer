<script lang="ts">
  import { EFFECTS, type EffectMeta } from "./effect-registry";

  interface Props {
    activeEffect: string;
    onSelect: (effect: string) => void;
    /** Hover/press intent — fires before the click commits so the canvas can warm
     *  the effect's webgl renderer ahead of activation (kills the switch freeze). */
    onPrewarm?: (effect: string) => void;
    /** Trays recompose from 4 to 8 columns when their own width allows it. */
    layout?: "panel" | "tray";
    /** In the tray, tapping the selected effect opens its tuning screen. */
    activeAction?: "disable" | "tune";
    /** Restrict the roster to the effects this host can actually draw. A host
     *  with its own renderer (the shape-matrix theory stage) supports a subset;
     *  offering a chip that renders nothing is worse than not offering it.
     *  Omit for the full roster. */
    availableEffects?: readonly string[];
  }

  const {
    activeEffect,
    onSelect,
    onPrewarm,
    layout = "panel",
    activeAction = "disable",
    availableEffects,
  }: Props = $props();

  const effects = $derived(
    availableEffects
      ? EFFECTS.filter((effect) => availableEffects.includes(effect.id))
      : EFFECTS
  );

  function getActiveLabel(effect: EffectMeta): string {
    return activeAction === "tune"
      ? `Tune ${effect.label}`
      : `Click to disable ${effect.label}`;
  }
</script>

<div class="effect-selector-shell">
  <div
    class="effect-selector"
    class:tray={layout === "tray"}
    role="radiogroup"
    aria-label="Select effect"
  >
    {#each effects as effect (effect.id)}
      {@const isActive = activeEffect === effect.id}
      <button
        type="button"
        class="effect-btn"
        class:active={isActive}
        role="radio"
        aria-checked={isActive}
        aria-label={isActive && activeAction === "tune"
          ? getActiveLabel(effect)
          : effect.label}
        title={isActive ? getActiveLabel(effect) : effect.label}
        style:--effect-color={effect.color}
        data-ghost="safe"
        data-ghost-kind="effect"
        data-ghost-id={effect.id}
        data-ghost-active={isActive || undefined}
        data-ghost-label={effect.label}
        onclick={() => onSelect(effect.id)}
        onpointerenter={() => onPrewarm?.(effect.id)}
        onpointerdown={() => onPrewarm?.(effect.id)}
      >
        <i class="fas {effect.icon}" aria-hidden="true"></i>
        <span class="effect-label">{effect.label}</span>
        {#if isActive && activeAction === "tune"}
          <span class="tune-badge" aria-hidden="true">
            <i class="fas fa-sliders"></i>
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .effect-selector-shell {
    container: effect-selector / inline-size;
  }

  .effect-selector {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  /* A wide tray gets two complete rows instead of stretching six buttons
     across the screen and stranding four on a third row. The width cap keeps
     the buttons at the same visual scale as the four-column panel version. */
  .effect-selector.tray {
    width: 100%;
    max-width: 68rem;
    margin-inline: auto;
  }

  /* Four columns leave a narrow rail (an unfolded Fold's settings column is
     about 195px) 34px per label, which clips "Sparkle" and "Bubbles". Three
     columns keep every name whole. */
  @container effect-selector (max-width: 15.5rem) {
    .effect-selector:not(.tray) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container effect-selector (min-width: 44rem) {
    .effect-selector.tray {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  .effect-btn {
    min-height: 48px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 4px;
    border-radius: 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    position: relative;
    cursor: pointer;
    font-size: inherit;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease,
      color var(--duration-fast, 100ms) ease;
  }

  .effect-btn.active {
    border-color: var(--effect-color);
    background: color-mix(in srgb, var(--effect-color) 14%, transparent);
    color: var(--effect-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .effect-btn {
      transition: none;
    }
  }

  .effect-btn:hover:not(.active) {
    background: color-mix(
      in srgb,
      var(--theme-text, white) 6%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .effect-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .effect-btn i {
    font-size: 14px;
    color: var(--effect-color);
    line-height: 1;
    pointer-events: none;
  }

  .effect-label {
    font-size: var(--font-size-compact, 12px);
    line-height: 1;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .tune-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--effect-color) 30%,
      var(--theme-panel-bg, rgba(20, 22, 32, 0.9))
    );
    box-shadow: 0 0 6px color-mix(in srgb, var(--effect-color) 60%, transparent);
    pointer-events: none;
  }

  .tune-badge i {
    font-size: 9px;
  }
</style>
