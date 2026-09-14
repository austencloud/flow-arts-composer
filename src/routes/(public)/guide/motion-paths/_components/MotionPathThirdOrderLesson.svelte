<script lang="ts">
  import { onDestroy } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import TrajectoryMandala from "$lib/shared/mandala/components/TrajectoryMandala.svelte";
  import { FALLBACK_DEMO } from "$lib/shared/landing/data/per-visit-demo";
  import ThirdOrderFlowerOverlay from "$lib/features/toys/tabs/third-order/components/ThirdOrderFlowerOverlay.svelte";
  import {
    THIRD_ORDER_COMPOSITION_VERSION,
    type ThirdOrderCompositionDraft,
  } from "$lib/features/toys/tabs/third-order/domain/third-order-composition";
  import { THIRD_ORDER_VIEWBOX_SIZE } from "$lib/features/toys/tabs/third-order/domain/third-order-math";
  import { getThirdOrderCompositionSampler } from "$lib/features/toys/tabs/third-order/services/getThirdOrderCompositionSampler";
  import { bakeThirdOrderTrajectories } from "$lib/features/toys/tabs/third-order/services/third-order-trajectories";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  type Layer = "carrier" | "inner" | "together";
  type CarrierShape = "circle" | "flower";

  interface Props {
    /** The parent may pause this lesson when it is outside the viewport. */
    active?: boolean;
  }

  let { active = true }: Props = $props();
  const sampler = getThirdOrderCompositionSampler();
  const lessonVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  const lessonEffects = createEffectsConfigState(undefined, { persist: false });
  const composition = $state<ThirdOrderCompositionDraft>({
    version: THIRD_ORDER_COMPOSITION_VERSION,
    carrier: FALLBACK_DEMO,
    carrierPath: {
      mode: "flower",
      ratio: "1:3",
      style: "anti",
      strength: 0,
      phase: 0,
      relationship: "SO",
      showConstruction: false,
    },
    children: [
      {
        id: "grid-blue",
        label: "Blue inner grid",
        lane: "left",
        sequence: FALLBACK_DEMO,
        orientationMode: "world",
        timingMode: "phrase",
        rate: 1,
        visible: true,
      },
      {
        id: "grid-red",
        label: "Red inner grid",
        lane: "right",
        sequence: FALLBACK_DEMO,
        orientationMode: "world",
        timingMode: "phrase",
        rate: 1,
        visible: true,
      },
    ],
    bpm: 48,
  });

  let layer = $state<Layer>("carrier");
  let carrierShape = $state<CarrierShape>("circle");
  let masterBeat = $state(0);
  let isPlaying = $state(false);
  let animationFrame = 0;
  let previousTimestamp = 0;

  const frame = $derived(sampler.sample(composition, masterBeat));
  const trajectories = $derived(
    bakeThirdOrderTrajectories(composition, sampler, {
      left: "staff",
      right: "staff",
    })
  );
  const singleTipTrajectories = $derived({
    ...trajectories,
    layers: trajectories.layers.filter(
      (layer) => layer.streamId === "grid-blue:left" && layer.tipId === "tip:0"
    ),
  });
  const blueChild = $derived(
    frame.children.find((child) => child.id === "grid-blue")
  );

  function setCarrierShape(shape: CarrierShape): void {
    carrierShape = shape;
    composition.carrierPath.strength = shape === "circle" ? 0 : 1;
    composition.carrierPath.showConstruction = shape === "flower";
    masterBeat = 0;
  }

  function stopPlayback(): void {
    isPlaying = false;
    previousTimestamp = 0;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function setMasterBeat(beat: number): void {
    const total = frame.totalBeats;
    masterBeat = total > 0 ? ((beat % total) + total) % total : 0;
  }

  function scrubTo(beat: number): void {
    stopPlayback();
    setMasterBeat(beat);
  }

  function tick(timestamp: number): void {
    if (!isPlaying || !active) return;
    if (previousTimestamp > 0) {
      const elapsed = Math.min(0.1, (timestamp - previousTimestamp) / 1000);
      setMasterBeat(masterBeat + elapsed * (composition.bpm / 60));
    }
    previousTimestamp = timestamp;
    animationFrame = requestAnimationFrame(tick);
  }

  function togglePlayback(): void {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (!active) return;
    isPlaying = true;
    previousTimestamp = 0;
    animationFrame = requestAnimationFrame(tick);
  }

  $effect(() => {
    if (!active) stopPlayback();
  });

  onDestroy(() => stopPlayback());
</script>

<section class="lesson" aria-label="Build a third-order motion path">
  <div class="lesson-controls">
    <SegmentedControl
      options={[
        { value: "carrier", label: "Carrier path" },
        { value: "inner", label: "Inner motion", tone: "blue" },
        { value: "together", label: "Together", tone: "both" },
      ]}
      value={layer}
      onchange={(value) => (layer = value)}
      ariaLabel="Motion layer"
      semantics="tabs"
      density="compact"
    />
    <div class="secondary-controls">
      <SegmentedControl
        options={[
          { value: "circle", label: "Circle" },
          { value: "flower", label: "Flower" },
        ]}
        value={carrierShape}
        onchange={setCarrierShape}
        ariaLabel="Carrier path shape"
        semantics="radiogroup"
        density="compact"
      />
      <a class="toy-link" href="/toys/third-order">Open Third Order</a>
    </div>
  </div>

  <div class="stage">
    {#if layer !== "inner"}
      <ThirdOrderFlowerOverlay
        path={composition.carrierPath}
        children={frame.children}
      />
      {#if layer === "carrier"}
        {#each frame.children as child (child.id)}
          <i
            class="carrier-marker {child.id}"
            style:left={`${(child.pose.centerX / THIRD_ORDER_VIEWBOX_SIZE) * 100}%`}
            style:top={`${(child.pose.centerY / THIRD_ORDER_VIEWBOX_SIZE) * 100}%`}
            aria-hidden="true"
          ></i>
        {/each}
      {/if}
    {/if}

    {#if layer === "together"}
      <TrajectoryMandala
        trajectories={singleTipTrajectories}
        throughBeat={masterBeat}
        strokeWidth={1.5}
      />
    {/if}

    {#if layer === "inner" && blueChild}
      <div class="inner-grid">
        <AnimatorCanvas
          leftProp={blueChild.props.left}
          rightProp={blueChild.props.right}
          sequenceData={blueChild.sequence}
          currentStep={blueChild.step + 1}
          leftPropType="staff"
          rightPropType="staff"
          {isPlaying}
          gridMode={blueChild.sequence.gridMode}
          backgroundAlpha={0}
          gridOpacity={0.55}
          hideTkaGlyph
          hideStepNumbers
          hideProgressBar
          hideHeader
          hidePathLines
          beatIndicators={false}
          disableContextMenu
          suppress2DOverlays
          visibilityManagerOverride={lessonVisibility}
          effectsConfigState={lessonEffects}
          tipEffectMap={{}}
          fillContainer
        />
      </div>
    {:else if layer === "together"}
      {#each frame.children as child (child.id)}
        <div
          class="child-grid {child.id}"
          style:left={`${(child.pose.centerX / THIRD_ORDER_VIEWBOX_SIZE) * 100}%`}
          style:top={`${(child.pose.centerY / THIRD_ORDER_VIEWBOX_SIZE) * 100}%`}
          style:transform={`translate(-50%, -50%) rotate(${child.pose.rotation}rad) scale(${child.pose.scale})`}
        >
          <AnimatorCanvas
            leftProp={child.props.left}
            rightProp={child.props.right}
            sequenceData={child.sequence}
            currentStep={child.step + 1}
            leftPropType="staff"
            rightPropType="staff"
            {isPlaying}
            gridMode={child.sequence.gridMode}
            backgroundAlpha={0}
            gridOpacity={0.34}
            hideTkaGlyph
            hideStepNumbers
            hideProgressBar
            hideHeader
            hidePathLines
            beatIndicators={false}
            disableContextMenu
            suppress2DOverlays
            visibilityManagerOverride={lessonVisibility}
            effectsConfigState={lessonEffects}
            tipEffectMap={{}}
            fillContainer
          />
        </div>
      {/each}
    {/if}
  </div>

  <div class="transport">
    <TransportControls
      {isPlaying}
      onPlaybackToggle={togglePlayback}
      onRestartToStart={() => scrubTo(0)}
      onStepHalfBeatBackward={() => scrubTo(masterBeat - 0.5)}
      onStepHalfBeatForward={() => scrubTo(masterBeat + 0.5)}
      onStepFullBeatForward={() => scrubTo(masterBeat + 1)}
    />
    <input
      type="range"
      min="0"
      max={Math.max(0.01, frame.totalBeats - 0.01)}
      step="0.01"
      value={masterBeat}
      aria-label="Third Order count"
      oninput={(event) => scrubTo(Number(event.currentTarget.value))}
    />
  </div>
</section>

<style>
  .lesson {
    display: grid;
    gap: var(--spacing-sm, 8px);
    width: 100%;
    container-type: inline-size;
  }

  .lesson-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
  }

  .secondary-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-xs, 6px);
  }

  .toy-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
    padding-inline: var(--spacing-sm, 8px);
    border-radius: var(--border-radius-md, 8px);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    text-decoration: none;
  }

  .toy-link:hover {
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  .toy-link:focus-visible {
    outline: 2px solid var(--theme-focus-ring, var(--theme-accent));
    outline-offset: 2px;
  }

  .stage {
    position: relative;
    width: min(100%, 440px);
    aspect-ratio: 1;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-lg, 12px);
    background: var(--theme-card-bg);
    isolation: isolate;
  }

  .inner-grid,
  .child-grid,
  .carrier-marker {
    position: absolute;
    pointer-events: none;
  }

  .inner-grid {
    inset: 0;
  }

  .child-grid {
    inset: 0;
    width: 100%;
    height: 100%;
    transform-origin: center;
  }

  .child-grid.grid-blue {
    filter: drop-shadow(
      0 0 8px color-mix(in srgb, var(--prop-blue) 28%, transparent)
    );
  }

  .child-grid.grid-red {
    filter: drop-shadow(
      0 0 8px color-mix(in srgb, var(--prop-red) 28%, transparent)
    );
  }

  .carrier-marker {
    z-index: 3;
    width: 14px;
    height: 14px;
    translate: -50% -50%;
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
  }

  .carrier-marker.grid-blue {
    background: var(--prop-blue);
  }

  .carrier-marker.grid-red {
    background: var(--prop-red);
  }

  .transport {
    display: grid;
    grid-template-columns: auto minmax(120px, 1fr);
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: var(--min-touch-target, 44px);
    min-width: 0;
  }

  input[type="range"] {
    width: 100%;
    height: var(--min-touch-target, 44px);
    margin: 0;
    accent-color: var(--theme-accent);
    cursor: pointer;
  }

  input[type="range"]:focus-visible {
    outline: 2px solid var(--theme-focus-ring, var(--theme-accent));
    outline-offset: 2px;
  }

  @container (max-width: 520px) {
    .lesson-controls {
      justify-content: flex-start;
    }
  }

  @container (max-width: 360px) {
    .transport {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
    }

    input[type="range"] {
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .child-grid {
      filter: none;
    }
  }
</style>
