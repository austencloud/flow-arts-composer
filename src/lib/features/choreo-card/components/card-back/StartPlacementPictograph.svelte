<!--
  Miniature pictograph showing the starting placement with actual props rendered.
  Used on the card back so users can see what prop type the card uses
  and visually compare start placements when chaining cards together.

  Renders with a transparent background so the grid dots and props
  float directly on the card back's gradient - no box/container.

  Uses PictographPreparer + PictographRenderer directly (no PictographContainer)
  so it works both in live Svelte rendering and offscreen DOM capture.
-->
<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { PreparedPictographData } from "$lib/shared/pictograph/shared/domain/models/prepared-pictograph-data";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import PictographRenderer from "$lib/shared/pictograph/shared/components/PictographRenderer.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { resolveStartPlacementColorOverrides } from "$lib/features/choreo-card/services/card-back/card-back-appearance";

  interface Props {
    pictographData: PictographData;
    darkMode?: boolean;
    leftPropType?: PropType;
    rightPropType?: PropType;
    primaryPropColors?: { left: string; right: string } | null;
  }

  let { pictographData, darkMode = true, leftPropType, rightPropType, primaryPropColors }: Props = $props();

  let prepared: PreparedPictographData | null = $state(null);
  let colorOverrides = $derived(resolveStartPlacementColorOverrides(primaryPropColors, darkMode));

  $effect(() => {
    const data = pictographData;
    if (!data) { prepared = null; return; }

    (async () => {
      try {
        const result = await pictographPreparer.prepareSingle(data, {
          themeMode: darkMode ? "dark" : "light",
          leftPropType,
          rightPropType,
        });
        prepared = result;
      } catch (err) {
        console.warn("[StartPlacementPictograph] Preparation failed:", err);
        prepared = data as PreparedPictographData;
      }
    })();
  });
</script>

<div class="start-placement-picto">
  <div class="picto-zoom">
    {#if prepared}
      <PictographRenderer
        pictograph={prepared}
        leftColorOverride={colorOverrides.left}
        rightColorOverride={colorOverrides.right}
        transparentBackground={true}
        showGrid={true}
        showTKA={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showPlacements={false}
        showNonRadialPoints={false}
        handPointVisibility="all"
        darkMode={darkMode}
        showStepNumber={false}
      />
    {/if}
  </div>
</div>

<style>
  .start-placement-picto {
    /* Fill the parent box. In the live card, CardBack.svelte's :global override
       forces 12cqi; standalone (offscreen rasterization for the new card-back
       render path) there's no override, so fill 100% of the sized container. */
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0.3cqi solid var(--card-text-muted, rgba(255, 255, 255, 0.3));
    border-radius: 1cqi;
    overflow: hidden;
  }

  .picto-zoom {
    transform: scale(1.3);
  }

  /* The inner pictograph SVG must fill the box. CardBack.svelte applies this as a
     :global override for the live card; scope it here so standalone rasterization
     (new render path) sizes the SVG identically. */
  .picto-zoom :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
