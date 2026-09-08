<script lang="ts">
  import StepNumber from "$lib/shared/pictograph/shared/components/StepNumber.svelte";
  import { tick, untrack } from "svelte";
  import type { ChoreoCardCell } from "$lib/shared/choreo-card/services/choreo-card-render-engine";
  import type { PreparedPictographData } from "$lib/shared/pictograph/shared/domain/models/prepared-pictograph-data";
  import {
    GridMode,
    type GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import PictographRenderer from "$lib/shared/pictograph/shared/components/PictographRenderer.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { resolvePreviewCellRender } from "../services/preview-cell-render-contract";
  import { ensureCardFonts } from "$lib/shared/render/services/gelasio-fonts";

  let {
    live,
    darkMode,
    stepNumber,
    showStepNumber,
  }: {
    live: NonNullable<ChoreoCardCell["live"]>;
    darkMode: boolean;
    stepNumber: number;
    showStepNumber: boolean;
  } = $props();

  const contract = $derived(
    resolvePreviewCellRender(live.data, darkMode, live.options)
  );
  // Colors and glyph visibility never invalidate prepared geometry.
  const preparationKey = $derived(
    JSON.stringify([contract.data, contract.prepareOptions, live.epoch])
  );
  let prepared = $state<PreparedPictographData | null>(null);
  let preparedKey = $state("");
  let failed = $state(false);
  let readyGridMode = $state<string | null>(null);
  let fontsReady = $state(false);
  $effect(() => {
    let cancelled = false;
    void ensureCardFonts().then(() => {
      if (!cancelled) fontsReady = true;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const key = preparationKey;
    const { data, prepareOptions } = untrack(() => contract);
    let cancelled = false;
    failed = false;
    pictographPreparer
      .prepareSingle(data, prepareOptions)
      .then((result) => {
        if (cancelled) return;
        prepared = result;
        preparedKey = key;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to prepare card pictograph", error);
        failed = true;
        preparedKey = key;
      });
    return () => {
      cancelled = true;
    };
  });

  const options = $derived(contract.renderOptions);
  const displayed = $derived.by(() => {
    if (!prepared) return null;
    const motions = { ...prepared.motions };
    // The general workspace renderer dims hidden hands; cards omit them.
    if (options.showLeftMotion === false) delete motions.left;
    if (options.showRightMotion === false) delete motions.right;
    return { ...prepared, motions };
  });
  const activeLocations = $derived(
    Object.values(contract.data.motions ?? {})
      .flatMap((motion) =>
        motion ? [motion.startLocation, motion.endLocation] : []
      )
      .filter((location): location is GridLocation => !!location)
  );
  const step = $derived(live.data as Partial<StepData>);
  // Diamond and box share one loaded SVG; rotating it does not emit onGridReady.
  const gridMode = $derived(
    prepared?._prepared?.gridMode === GridMode.SKEWED ? "skewed" : "diamond"
  );

  $effect(() => {
    const settled = live.onSettled;
    const hasFailed = failed;
    if (
      preparedKey !== preparationKey ||
      (!hasFailed &&
        (!fontsReady || (options.showGrid && readyGridMode !== gridMode)))
    )
      return;
    let cancelled = false;
    void tick().then(() => {
      if (!cancelled) settled(hasFailed);
    });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if failed}
  <div class="placeholder" role="img" aria-label="Pictograph unavailable">
    !
  </div>
{:else if displayed}
  <div class="live-pictograph">
    <PictographRenderer
      pictograph={displayed}
      {darkMode}
      showDuration={false}
      showPathShape={false}
      widthMultiplier={options.widthMultiplier}
      glyphLayout={options.primaryPropColors ? "card-custom" : "card"}
      leftColorOverride={options.primaryPropColors?.left}
      rightColorOverride={options.primaryPropColors?.right}
      showGrid={options.showGrid}
      gridPointsOnTop={!options.primaryPropColors}
      showNonRadialPoints={options.showNonRadialPoints}
      handPointVisibility={options.handPointVisibility}
      {activeLocations}
      showTKA={contract.visibility.showTKA}
      showReversals={contract.visibility.showReversals}
      showTnD={options.showTnD}
      showElemental={options.showElemental}
      showPositions={options.showPositions}
      leftReversal={!!step.leftReversal && options.showLeftMotion !== false}
      rightReversal={!!step.rightReversal && options.showRightMotion !== false}
      onGridReady={() => {
        readyGridMode = gridMode;
      }}
    />
    {#if showStepNumber}
      <svg
        class="number-layer"
        viewBox="0 0 {950 * (options.widthMultiplier ?? 1)} 950"
        aria-hidden="true"
      >
        <StepNumber {stepNumber} showStepNumber={true} {darkMode} />
      </svg>
    {/if}
  </div>
{:else}
  <div class="placeholder">
    <ProgressRing percent={-1} size={20} strokeWidth={2} />
  </div>
{/if}

<style>
  .live-pictograph {
    position: relative;
    width: 100%;
    height: 100%;
    --pictograph-border: none;
  }
  .number-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .number-layer :global(.beat-number) {
    font-family: Gelasio, Georgia, serif;
    letter-spacing: 0;
  }

  .placeholder {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
  }
</style>
