<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { GUIDE_MOVES } from "#lib/shared/notation/qft/qft-guide.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  let {
    hand,
    tone,
  }: {
    hand: "left" | "right";
    tone: "accent" | "blue" | "red";
  } = $props();

  const state = getQftAppContext();
  const activeId = $derived(
    hand === "left" ? state.leftPresetId : state.rightPresetId
  );
  const chipColor = $derived(
    tone === "blue"
      ? "var(--prop-blue, #3575e2)"
      : tone === "red"
        ? "var(--prop-red, #ed1c24)"
        : "var(--theme-accent, #8b5cf6)"
  );
</script>

<section class="presets" aria-label={`${hand} hand presets`}>
  <span class="label">Canonical moves</span>
  <div class="preset-grid">
    {#each GUIDE_MOVES as move (move.id)}
      <FilterChipBase
        label={move.title}
        mode="toggle"
        emphasis="solid"
        size="sm"
        active={activeId === move.id}
        {chipColor}
        onclick={() => state.selectPreset(hand, move.id)}
      />
    {/each}
  </div>
</section>

<style>
  .presets {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
  }

  .preset-grid :global(.filter-chip) {
    width: 100%;
    justify-content: center;
  }

  @container (min-width: 34rem) {
    .preset-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
