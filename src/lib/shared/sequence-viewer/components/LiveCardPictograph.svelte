<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import StepNumber from "#lib/shared/pictograph/shared/components/StepNumber.svelte";
  import { tick, untrack } from "svelte";
  import type { ChoreoCardCell } from "#lib/shared/choreo-card/services/choreo-card-render-engine.js";
  import type { PreparedPictographData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
  import PictographRenderer from "#lib/shared/pictograph/shared/components/PictographRenderer.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { resolvePreviewCellRender } from "../services/preview-cell-render-contract";
  import { ensureCardFonts } from "#lib/shared/render/services/gelasio-fonts.js";
  import { derivePropElementalTypeForStep } from "#lib/shared/shape-matrix/domain/prop-relationship.js";
  import { renderStepNumber } from "@tka/render-composition";
  import { DURATION } from "@austencloud/motion";
  import { motionDuration } from "#lib/shared/transitions/motion.js";

  let {
    live,
    darkMode,
    stepNumber,
    showStepNumber,
    poseOnly = false,
    exportPresentation = false,
  }: {
    live: NonNullable<ChoreoCardCell["live"]>;
    darkMode: boolean;
    stepNumber: number;
    showStepNumber: boolean;
    /** Choose Start picker: grid and props only, beat glyphs fade out. */
    poseOnly?: boolean;
    /** Portable card previews use the compositor's opaque cell host. */
    exportPresentation?: boolean;
  } = $props();

  const contract = $derived(
    resolvePreviewCellRender(live.data, darkMode, live.options)
  );
  // Colors and glyph visibility never invalidate prepared geometry.
  const preparationKey = $derived(
    JSON.stringify([contract.data, contract.prepareOptions, live.epoch])
  );
  type Hand = "left" | "right";
  const HANDS: readonly Hand[] = ["left", "right"];
  type HandsShown = Readonly<Record<Hand, boolean>>;

  let prepared = $state.raw<PreparedPictographData | null>(null);
  let preparedKey = $state("");
  // The hands the prepared drawing was made with. The card keeps showing the
  // old drawing until the new one is ready, so the hands follow the drawing,
  // not the toggle.
  let preparedHands = $state<HandsShown>({ left: true, right: true });
  let preparedDataKey = "";
  // Showing or hiding a hand redraws the same pictograph: that hand fades, and
  // the other prop and arrow ease to where the new drawing puts them (a lone
  // prop drops its beta offset). A different pictograph still redraws in place.
  let handChange = $state(false);
  // A hand just hidden keeps drawing from the previous drawing while it fades.
  let fadingFrom = $state.raw<{
    drawing: PreparedPictographData;
    hands: ReadonlySet<Hand>;
  } | null>(null);
  // A hand just shown mounts at zero for a frame so its fade-in has a start.
  let arrivingHands = $state.raw<ReadonlySet<Hand>>(new Set());
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let arriveFrame = 0;

  function clearHandMotion(): void {
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = null;
    if (arriveFrame) cancelAnimationFrame(arriveFrame);
    arriveFrame = 0;
    fadingFrom = null;
    arrivingHands = new Set();
  }

  /** Lands a newly prepared drawing, fading any hand it shows or hides. */
  function applyPrepared(
    result: PreparedPictographData,
    key: string,
    dataKey: string,
    hands: HandsShown
  ): void {
    const before = prepared;
    const beforeHands = preparedHands;
    const sameDrawing =
      !exportPresentation &&
      before !== null &&
      dataKey === preparedDataKey &&
      motionDuration(DURATION.normal) > 0;
    const leaving = sameDrawing
      ? HANDS.filter((hand) => beforeHands[hand] && !hands[hand])
      : [];
    const arriving = sameDrawing
      ? HANDS.filter((hand) => !beforeHands[hand] && hands[hand])
      : [];

    clearHandMotion();
    handChange = leaving.length > 0 || arriving.length > 0;
    prepared = result;
    preparedKey = key;
    preparedDataKey = dataKey;
    preparedHands = hands;
    if (before && leaving.length > 0) {
      fadingFrom = { drawing: before, hands: new Set(leaving) };
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        fadingFrom = null;
      }, motionDuration(DURATION.normal));
    }
    if (arriving.length > 0) {
      arrivingHands = new Set(arriving);
      arriveFrame = requestAnimationFrame(() => {
        arriveFrame = requestAnimationFrame(() => {
          arriveFrame = 0;
          arrivingHands = new Set();
        });
      });
    }
  }
  $effect(() => clearHandMotion);

  let failed = $state(false);
  let readyGridMode = $state<string | null>(null);
  let fontsReady = $state(false);
  let exportNumberCanvas = $state<HTMLCanvasElement>();
  $effect(() => {
    let cancelled = false;
    void ensureCardFonts().then(() => {
      if (!cancelled) fontsReady = true;
    });
    return () => {
      cancelled = true;
    };
  });

  // Keep the actual live SVG pictograph intact. The export-only label layer
  // uses the same canvas primitive as PNG composition, after its font has
  // loaded, so text raster and hanging-baseline metrics stay identical.
  $effect(() => {
    const canvas = exportNumberCanvas;
    if (
      !exportPresentation ||
      !canvas ||
      !fontsReady ||
      !showStepNumber ||
      poseOnly
    )
      return;
    const draw = (): void => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);
      if (width < 1 || height < 1) return;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      renderStepNumber(context, stepNumber, 0, 0, height, darkMode);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  $effect(() => {
    const key = preparationKey;
    const { data, prepareOptions } = untrack(() => contract);
    const dataKey = JSON.stringify([data, untrack(() => live.epoch)]);
    const hands: HandsShown = {
      left: prepareOptions.showLeftMotion !== false,
      right: prepareOptions.showRightMotion !== false,
    };
    let cancelled = false;
    failed = false;
    pictographPreparer
      .prepareSingle(data, prepareOptions)
      .then((result) => {
        if (cancelled) return;
        applyPrepared(result, key, dataKey, hands);
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
    const render = prepared._prepared;
    const fading = fadingFrom;
    const fadingRender = fading?.drawing._prepared;
    if (!fading || !render || !fadingRender) {
      // The general workspace renderer dims hidden hands; cards omit them.
      for (const hand of HANDS) if (!preparedHands[hand]) delete motions[hand];
      return { ...prepared, motions };
    }
    const merged = {
      ...render,
      propAssets: { ...render.propAssets },
      propPositions: { ...render.propPositions },
      arrowAssets: { ...render.arrowAssets },
      arrowPositions: { ...render.arrowPositions },
      arrowMirroring: { ...render.arrowMirroring },
    };
    for (const hand of HANDS) {
      if (preparedHands[hand]) continue;
      const motion = fading.hands.has(hand)
        ? fading.drawing.motions?.[hand]
        : undefined;
      if (!motion) {
        delete motions[hand];
        continue;
      }
      // Drawn where it was, at the old drawing's place, while it fades out.
      motions[hand] = motion;
      merged.propAssets[hand] = fadingRender.propAssets[hand];
      merged.propPositions[hand] = fadingRender.propPositions[hand];
      merged.arrowAssets[hand] = fadingRender.arrowAssets[hand]!;
      merged.arrowPositions[hand] = fadingRender.arrowPositions[hand]!;
      merged.arrowMirroring[hand] = fadingRender.arrowMirroring[hand]!;
    }
    return { ...prepared, motions, _prepared: merged };
  });
  const handShown = (hand: Hand): boolean =>
    preparedHands[hand] && !arrivingHands.has(hand);
  const activeLocations = $derived(
    Object.values(contract.data.motions ?? {})
      .flatMap((motion) =>
        motion ? [motion.startLocation, motion.endLocation] : []
      )
      .filter((location): location is GridLocation => !!location)
  );
  const step = $derived(live.data as Partial<StepData>);
  // Derived even while the chip is off so the glyph stays mounted and fades.
  const propElementalType = $derived(derivePropElementalTypeForStep(live.data));
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
  <div
    class="placeholder"
    role="img"
    aria-label={t("viewer_ui_pictograph_unavailable")}
  >
    !
  </div>
{:else if displayed}
  <div class="live-pictograph">
    <PictographRenderer
      pictograph={displayed}
      {darkMode}
      transparentBackground={exportPresentation}
      showDuration={false}
      showHandColorKey={stepNumber === 0
        ? options.showHandColorKey !== false
        : undefined}
      animateVisibility={!exportPresentation}
      leftMotionVisible={handShown("left")}
      rightMotionVisible={handShown("right")}
      hiddenMotionOpacity={0}
      animateHandPresence={handChange}
      showPathShape={false}
      widthMultiplier={options.widthMultiplier}
      glyphLayout={options.primaryPropColors ? "card-custom" : "card"}
      leftColorOverride={options.primaryPropColors?.left}
      rightColorOverride={options.primaryPropColors?.right}
      showGrid={options.showGrid}
      showNonRadialPoints={options.showNonRadialPoints}
      handPointVisibility={options.handPointVisibility}
      {activeLocations}
      showTKA={contract.visibility.showTKA}
      showReversals={contract.visibility.showReversals}
      {poseOnly}
      showTnD={options.showTnD}
      showElemental={options.showElemental}
      {propElementalType}
      showPropTnD={options.showPropTnD}
      showPlacements={options.showPlacements}
      leftReversal={!!step.leftReversal && options.showLeftMotion !== false}
      rightReversal={!!step.rightReversal && options.showRightMotion !== false}
      onGridReady={() => {
        readyGridMode = gridMode;
      }}
    />
    {#if exportPresentation && showStepNumber && !poseOnly}
      <canvas
        class="number-layer export-number-layer"
        aria-hidden="true"
        bind:this={exportNumberCanvas}
      ></canvas>
    {:else if showStepNumber && !poseOnly}
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
  .export-number-layer {
    display: block;
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
