<!--
  ComposerEffectStrip

  Every effect in the registry, on the live 3D demo, as one wrapping row of
  chips. At most one is active: tapping the active chip clears effects, tapping
  another switches. That "at most one, clears on re-click" shape is why these
  are FilterChipBase toggles and not a SegmentedControl — the indicator of a
  segmented control has nowhere to go when nothing is selected.

  It reads the effects state from context, so it must be rendered inside the
  component that called setEffectsConfigContext (Composer3DViewerDemo, whose
  state is created with persist:false and never touches the visitor's own
  effects settings).
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";

  const effects = getEffectsConfigContext();
  const active = $derived(effects?.config.activeEffect ?? "none");

  function toggle(id: string) {
    if (!effects) return;
    effects.setActiveEffect(
      (active === id ? "none" : id) as EffectType
    );
  }
</script>

<div class="effect-strip">
  <span class="control-label">Effects follow the props.</span>
  <div class="chips">
    {#each EFFECTS as effect (effect.id)}
      <FilterChipBase
        mode="toggle"
        size="sm"
        label={effect.label}
        icon="fas {effect.icon}"
        chipColor={effect.color}
        active={active === effect.id}
        onclick={() => toggle(effect.id)}
      />
    {/each}
  </div>
</div>

<style>
  .effect-strip {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.75rem;
  }

  .control-label {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(0.74 0.018 270);
  }

  /* Wraps rather than scrolls: all 16 chips stay reachable at 375px without a
     horizontal scroller, and the row never pushes the page sideways. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-width: 0;
  }
</style>
