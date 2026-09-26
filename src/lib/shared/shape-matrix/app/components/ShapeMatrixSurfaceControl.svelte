<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import type { ShapeMatrixSurface } from "../state/shape-matrix-app-state.svelte";

  interface Props {
    compact?: boolean;
  }

  const { compact = false }: Props = $props();
  const state = getShapeMatrixAppContext();
  const options = $derived([
    {
      value: "matrix" as const,
      label: t("shape_engine_surface_level_desc"),
    },
    {
      // The Matrix sits at a Kinetic Alphabet level and Theory does not sit at
      // one at all, so the switch between them says which is which rather than
      // implying a step up the same ladder.
      value: "theory" as const,
      label: t("shape_engine_surface_ratio_desc"),
    },
  ]);
</script>

{#snippet optionContent(surface: ShapeMatrixSurface)}
  <span class="mode-copy">
    <strong>
      {compact
        ? surface === "matrix"
          ? t("shape_engine_levels")
          : t("shape_engine_ratios")
        : surface === "matrix"
          ? t("shape_engine_level_matrix")
          : t("shape_engine_ratio_playground")}
    </strong>
    {#if !compact}
      <small>
        {surface === "matrix"
          ? t("shape_engine_explore_levels")
          : t("shape_engine_build_four")}
      </small>
    {/if}
  </span>
{/snippet}

<div class:compact class="surface-control">
  <SegmentedControl
    {options}
    value={state.surface}
    onchange={(surface: ShapeMatrixSurface) => state.setSurface(surface)}
    size="sm"
    density={compact ? "tight" : "standard"}
    color="accent"
    semantics="radiogroup"
    ariaLabel={t("shape_engine_choose_mode")}
    {optionContent}
  />
</div>

<style>
  .surface-control {
    width: 25rem;
  }

  .surface-control.compact {
    width: 11.5rem;
  }

  .mode-copy {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
    text-align: left;
  }

  .mode-copy strong,
  .mode-copy small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-copy strong {
    color: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 750;
    white-space: nowrap;
  }

  .mode-copy small {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.2;
    white-space: nowrap;
  }

  .surface-control :global(.segment) {
    min-height: 3.65rem;
    justify-content: flex-start;
    padding-inline: 0.8rem;
  }

  .surface-control.compact :global(.segment) {
    min-height: var(--min-touch-target, 44px);
    justify-content: center;
    padding-inline: 0.35rem;
  }

  .surface-control.compact .mode-copy {
    text-align: center;
  }

  @container shape-matrix-app (max-width: 30rem) {
    .surface-control.compact {
      width: 9rem;
    }

    .surface-control.compact .mode-copy strong {
      font-size: var(--font-size-compact, 0.75rem);
    }
  }
</style>
