<!--
  ComposerTunnelDemo

  The Tunnel section's live embed: the real kaleidoscope renderer
  (TunnelArtView) multiplying the baked demo fixture across a ring.

  Follows TunnelDetailPreview's per-instance seam (the proven pattern for
  mounting the tunnel outside the sequence viewer): local TunnelViewController,
  local effects-config context with persist:false, stub playback. The public
  band's view state is seeded locally and never touches saved viewer state.

  This component statically imports the heavy tunnel stack — the page must
  mount it through LazyMount so none of it lands in the eager graph.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { onDestroy, onMount, untrack, type Snippet } from "svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ComposerWordRow from "./ComposerWordRow.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import TunnelPictographStrip from "$lib/shared/sequence-viewer/tunnel/TunnelPictographStrip.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import TunnelPresetBrowser from "$lib/shared/sequence-viewer/components/art-settings/TunnelPresetBrowser.svelte";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";
  import { generateComposerDemoSequence } from "./composer-demo-generation";
  import {
    classifyComposerGenerationFailure,
    type ComposerGenerationResult,
  } from "./composer-generation-failure";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import {
    DEFAULT_TUNNEL_VIEW_STATE,
    loadTunnelViewState,
    saveTunnelViewState,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-state";
  import {
    MAX_IMAGES,
    MAX_IMAGES_RM,
    TUNNEL_PRESETS,
    imageCount,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { builtInTunnelPresetRecipe } from "$lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";

  /**
   * `layout`:
   *   "square" (default) — the original centered square plus the Performers
   *     row. Any existing consumer renders exactly as before.
   *   "band" — a two-column composition: the square stage left (the renderer
   *     is square-only), a control column right.
   */
  let {
    sequence: sourceSequence,
    active = true,
    layout = "square",
    leftPropType = "staff",
    rightPropType = "staff",
    appearance,
    propControl,
    onGenerated,
  }: {
    sequence: SequenceData;
    active?: boolean;
    layout?: "square" | "band";
    leftPropType?: string;
    rightPropType?: string;
    appearance?: ComposerPropAppearance;
    propControl?: Snippet;
    onGenerated?: (sequence: SequenceData) => void;
  } = $props();

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let playing = $state(!reduceMotion.current);
  let fold = $state(4);
  let generating = $state(false);
  let generationResult = $state<ComposerGenerationResult>("idle");
  let showArrows = $state(true);
  let showProps = $state(true);
  type Source = "first" | "second";
  let activeSource = $state<Source>("first");
  let pendingSource = $state<Source | null>(null);
  let swapping = $state(false);
  let publishPending = false;
  let pendingGeneratedSequence = $state.raw<SequenceData | null>(null);
  let firstSequence = $state.raw<SequenceData | null>(sourceSequence);
  let secondSequence = $state.raw<SequenceData | null>(null);
  // Generated sequences are immutable snapshots. Keep their reference identity
  // so the source effect cannot mistake a deep state proxy for a new sequence.
  let seenSource = $state.raw(sourceSequence);
  let firstStep = $state(1);
  let secondStep = $state(1);
  let firstCanvasReady = $state(false);
  let secondCanvasReady = $state(false);

  async function generate() {
    if (generating) return;
    generating = true;
    generationResult = "idle";
    try {
      const next = await generateComposerDemoSequence();
      if (active) prepareSequence(next, true);
      else pendingGeneratedSequence = next;
    } catch (error) {
      generationResult = classifyComposerGenerationFailure(error);
      if (generationResult === "error") {
        console.error("[composer tunnel] generation failed", error);
      }
      generating = false;
    }
  }

  const foldOptions = [2, 4, 8].map((f) => ({
    value: String(f),
    label: String(f),
  }));
  const initialPreset = TUNNEL_PRESETS.find(
    (preset) => preset.id === (reduceMotion.current ? "radial" : "pinwheel")
  )!;
  const prevTunnelViewState =
    layout === "square" ? loadTunnelViewState() : null;

  const effects = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effects);

  const initialViewState =
    layout === "band"
      ? {
          ...DEFAULT_TUNNEL_VIEW_STATE,
          config: initialPreset.config,
          presetRecipe: builtInTunnelPresetRecipe(initialPreset.id),
        }
      : (prevTunnelViewState ?? DEFAULT_TUNNEL_VIEW_STATE);
  const firstController = new TunnelViewController({
    getSequence: () => firstSequence,
    initialViewState,
    persistViewState: false,
  });
  const secondController = new TunnelViewController({
    getSequence: () => secondSequence,
    initialViewState,
    persistViewState: false,
  });
  firstController.active = active;
  const controller = $derived(
    activeSource === "first" ? firstController : secondController
  );
  const sequence = $derived(
    (activeSource === "first" ? firstSequence : secondSequence)!
  );
  const currentStep = $derived(
    activeSource === "first" ? firstStep : secondStep
  );

  function prepareSequence(next: SequenceData, publish = false): void {
    const incoming =
      activeSource === "first" ? secondController : firstController;
    incoming.applyConfig(controller.config, controller.presetRecipe);
    incoming.colors = controller.colors;
    incoming.gridVisible = controller.gridVisible;
    incoming.active = true;
    publishPending = publish;
    if (activeSource === "first") {
      secondCanvasReady = false;
      secondStep = 1;
      secondSequence = next;
      pendingSource = "second";
    } else {
      firstCanvasReady = false;
      firstStep = 1;
      firstSequence = next;
      pendingSource = "first";
    }
  }

  $effect(() => {
    firstController.active =
      active &&
      (activeSource === "first" || pendingSource === "first" || swapping);
    secondController.active =
      active &&
      (activeSource === "second" || pendingSource === "second" || swapping);
  });

  $effect(() => {
    const next = sourceSequence;
    if (!active) return;
    if (pendingGeneratedSequence) {
      const generated = pendingGeneratedSequence;
      pendingGeneratedSequence = null;
      untrack(() => prepareSequence(generated, true));
      return;
    }
    if (next === seenSource || pendingSource || swapping) return;
    seenSource = next;
    untrack(() => prepareSequence(next));
  });

  // The outgoing tunnel keeps its own choreography and clock until every
  // incoming copy and its first canvas frame are ready to be revealed.
  $effect(() => {
    if (!active || !pendingSource) return;
    const incoming =
      pendingSource === "first" ? firstController : secondController;
    const painted =
      pendingSource === "first" ? firstCanvasReady : secondCanvasReady;
    if (incoming.buildError) {
      generationResult = "error";
      generating = false;
      if (pendingSource === "first") firstSequence = null;
      else secondSequence = null;
      incoming.active = false;
      pendingSource = null;
      return;
    }
    if (!incoming.layersReady || !painted) return;
    activeSource = pendingSource;
    pendingSource = null;
    swapping = true;
    generationResult = "success";
    if (publishPending) {
      seenSource = sequence;
      untrack(() => onGenerated?.(sequence));
    }
  });

  function finishHandoff(source: Source): void {
    if (!swapping || source !== activeSource) return;
    if (source === "first") {
      secondSequence = null;
      secondController.active = false;
    } else {
      firstSequence = null;
      firstController.active = false;
    }
    swapping = false;
    generating = false;
  }

  function seek(step: number): void {
    playing = false;
    if (activeSource === "first") firstStep = step;
    else secondStep = step;
  }

  function setPerformers(value: string): void {
    fold = Number(value);
    controller.applyConfig({
      ...controller.config,
      fold,
      mirror: false,
      flip: false,
    });
  }

  onMount(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      playing = false;
      if (layout === "band" && imageCount(controller.config) > MAX_IMAGES_RM) {
        controller.applyPreset("radial");
      }
    };
    preference.addEventListener("change", handleChange);
    return () => preference.removeEventListener("change", handleChange);
  });

  $effect(() => {
    if (layout === "square") {
      controller.applyConfig({
        fold,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      });
    }
  });

  const playback = {
    animationState: { sequenceData: undefined },
  } as unknown as ViewerPlaybackState;

  onDestroy(() => {
    if (prevTunnelViewState) saveTunnelViewState(prevTunnelViewState);
  });
</script>

{#snippet stage()}
  <div class="stage">
    <div
      class="art"
      role="img"
      aria-label="Live tunnel performance of {simplifyRepeatedWord(
        sequence.word
      )}, {layout === 'band'
        ? `${controller.presetRecipe?.name ?? 'custom'} preset with ${controller.performerCount} performers`
        : `${fold} performers`}"
    >
      <DualSourceCrossfade
        active={activeSource}
        first={firstArt}
        second={secondArt}
        duration={DURATION.dramatic}
        profile="soft-dissolve"
        onsettled={finishHandoff}
      />
    </div>
    {#if layout === "square"}
      <button
        type="button"
        class="pause-toggle"
        aria-label={playing ? "Pause preview" : "Play preview"}
        onclick={() => (playing = !playing)}
      >
        <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
        ></i>
      </button>
    {/if}
  </div>
{/snippet}

{#snippet firstArt()}
  {#if firstSequence}
    <TunnelArtView
      sequence={firstSequence}
      controller={firstController}
      {playback}
      bpm={60}
      {leftPropType}
      {rightPropType}
      {...appearance}
      playing={active && playing && (activeSource === "first" || swapping)}
      onPlayingChange={(next) => (playing = next)}
      bind:currentStep={firstStep}
      onCanvasReady={(canvas) => (firstCanvasReady = !!canvas)}
    />
  {/if}
{/snippet}

{#snippet secondArt()}
  {#if secondSequence}
    <TunnelArtView
      sequence={secondSequence}
      controller={secondController}
      {playback}
      bpm={60}
      {leftPropType}
      {rightPropType}
      {...appearance}
      playing={active && playing && (activeSource === "second" || swapping)}
      onPlayingChange={(next) => (playing = next)}
      bind:currentStep={secondStep}
      onCanvasReady={(canvas) => (secondCanvasReady = !!canvas)}
    />
  {/if}
{/snippet}

{#snippet performers()}
  <SegmentedControl
    options={foldOptions}
    value={String(controller.performerCount)}
    onchange={setPerformers}
    ariaLabel={t("composer_demo_tunnel_performers")}
    color="accent"
    size="md"
  />
{/snippet}

{#if layout === "band"}
  <div class="tunnel-demo band">
    <div class="band-stage">
      <!-- The band stays mounted while its stop is parked, so only the
           current stop announces a new word. -->
      <ComposerWordRow
        word={sequence.word ?? ""}
        live={active ? "polite" : "off"}
        {propControl}
      />
      {@render stage()}
      <div class="tunnel-notation">
        <div class="notation-caption">
          <span>All performers, one beat</span>
          <span class="beat-count"
            >{Math.floor(currentStep)} / {controller.loopSteps}</span
          >
        </div>
        <TunnelPictographStrip
          {controller}
          {currentStep}
          bpm={60}
          {leftPropType}
          {rightPropType}
          {appearance}
          showGrid={controller.gridVisible}
          {showArrows}
          {showProps}
          onCellClick={seek}
        />
      </div>
      <div
        class="stage-toolbar"
        role="group"
        aria-label="Tunnel preview controls"
      >
        <PanelButton
          ariaLabel={playing ? "Pause preview" : "Play preview"}
          ariaPressed={playing}
          onclick={() => (playing = !playing)}
        >
          <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
          ></i>
        </PanelButton>
        <PanelButton
          ariaLabel="Toggle tunnel grid"
          ariaPressed={controller.gridVisible}
          onclick={() => (controller.gridVisible = !controller.gridVisible)}
        >
          <i class="fas fa-border-all" aria-hidden="true"></i>
        </PanelButton>
      </div>
    </div>
    <div class="band-controls">
      <div
        class="tunnel-settings"
        inert={generating || swapping || !!pendingSource}
      >
        <div class="performer-control">
          <span class="control-label">{t("composer_demo_performers")}</span>
          {@render performers()}
        </div>
        <div
          class="notation-controls"
          role="group"
          aria-label="Pictograph layers"
        >
          <FilterChipBase
            label="Arrows"
            mode="toggle"
            active={showArrows}
            labelScale="readable"
            onclick={() => (showArrows = !showArrows)}
          />
          <FilterChipBase
            label="Props"
            mode="toggle"
            active={showProps}
            labelScale="readable"
            onclick={() => (showProps = !showProps)}
          />
        </div>
        <h3 class="preset-heading">Choose a tunnel</h3>
        <TunnelPresetBrowser
          {controller}
          dense={true}
          showcase={true}
          showGridControl={false}
          showUserPresets={false}
          showCustomCard={false}
          showCustomizeButton={false}
          maximumInstances={reduceMotion.current ? MAX_IMAGES_RM : MAX_IMAGES}
          selectionMode="config"
        />
      </div>
      {#if onGenerated}
        <div class="new-tunnel-action">
          <PanelButton
            variant="primary"
            onclick={generate}
            disabled={generating || swapping || !!pendingSource}
            ariaBusy={generating}
          >
            <i
              class="fas {generating ? 'fa-circle-notch fa-spin' : 'fa-dice'}"
              aria-hidden="true"
            ></i>
            <span>New tunnel</span>
          </PanelButton>
          <span class="retry-note" aria-live="polite">
            {generating
              ? "Preparing the next tunnel…"
              : generationResult === "no-result"
                ? t("composer_demo_no_result")
                : generationResult === "error"
                  ? t("composer_demo_generate_failed")
                  : ""}
          </span>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="tunnel-demo">
    {@render stage()}

    <div class="fold-row">
      <span class="control-label">{t("composer_demo_performers")}</span>
      {@render performers()}
    </div>
  </div>
{/if}

<style>
  /* Spacing to the prose above is owned by the host's duo grid gap. */
  .stage {
    position: relative;
    aspect-ratio: 1;
    max-width: min(30rem, 100%);
    margin-inline: auto;
    background: #000;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid oklch(0.4 0.04 270 / 0.18);
  }
  .art {
    position: absolute;
    inset: 0;
  }
  /* Ultrawide: the duo column has the room — the kaleidoscope becomes a
     near-viewport moment (height-keyed, so it scales with the screen).
     Keep in sync with the page's .sk-stage-square placeholder. */
  @media (min-width: 1680px) {
    .stage {
      max-width: min(72vh, 100%);
    }
  }

  .pause-toggle {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: max(var(--min-touch-target, 48px), 48px);
    height: max(var(--min-touch-target, 48px), 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(4px);
  }
  .pause-toggle:hover {
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
  }
  .pause-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  /* Deterministic footprint: capped width, one-line labels, so the row is
     always exactly one 52px control tall — the page's tunnel skeleton
     reserves this exact height (no-layout-shift). */
  .fold-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    margin-top: 1rem;
    width: min(100%, 22rem);
    margin-inline: auto;
  }
  .control-label {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(0.74 0.018 270);
  }

  .fold-row :global(.segment) {
    min-height: max(var(--min-touch-target, 48px), 48px);
  }

  /* Band: square stage left, control column right. The renderer is square-only,
     so the stage keeps aspect-ratio 1 and is height-keyed. A host that knows
     the height it has, such as a stop on the /composer stage, sets
     --tunnel-stage-size. */
  .tunnel-demo.band {
    display: grid;
    /* The stage track is sized here, not on .band-stage: a percentage width
       inside an `auto` track is cyclic and resolves to zero. */
    grid-template-columns:
      minmax(0, var(--tunnel-stage-size, min(46rem, 62vh)))
      minmax(16rem, 30rem);
    gap: clamp(1.5rem, 4vw, 3rem);
    align-items: center;
    justify-content: center;
  }
  .band-stage {
    width: 100%;
    min-width: 0;
  }
  .stage-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    min-height: 3rem;
    margin-top: 0.75rem;
  }
  .stage-toolbar :global(.panel-btn) {
    width: 3rem;
    height: 3rem;
    min-height: 3rem;
    padding: 0;
  }
  .tunnel-demo.band .stage {
    max-width: 100%;
  }
  .band-controls {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    max-width: 30rem;
    width: 100%;
  }
  .tunnel-settings {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .performer-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .notation-controls {
    display: flex;
    gap: 0.5rem;
  }
  .tunnel-notation {
    margin-top: 0.75rem;
    min-width: 0;
    height: 8.125rem;
  }
  .notation-caption {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding-inline: 0.25rem;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    color: var(--theme-text-muted);
  }
  .beat-count {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .preset-heading {
    margin: 0;
    font-size: var(--font-size-lg, 1.25rem);
    font-weight: 650;
  }

  .new-tunnel-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .retry-note {
    min-height: 1.25rem;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-muted);
  }

  @media (max-width: 959.98px) {
    .tunnel-demo.band {
      grid-template-columns: minmax(0, 1fr);
    }
    .band-stage {
      width: min(var(--tunnel-stage-size, min(46rem, 62vh)), 100%);
      margin-inline: auto;
    }
    .band-controls {
      margin-inline: auto;
    }
  }
</style>
