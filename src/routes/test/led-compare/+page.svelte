<!--
  LED look comparison.

  One generated LOOP, four canvases, four looks. The point of the page is that
  the sequence is the only thing the four stations share: same steps, same
  frame, same BPM, same grid, driven by ONE playback controller. Anything that
  differs between the tiles is the look and nothing else.

  Why four full canvases rather than four thumbnails: a thumbnail is a settled
  still, so it answers "what does this look paint" and never "what does this
  look feel like while it moves." Persistence length, how fast a trail decays
  into the next pass, whether a camera exposure reads as a drawn line or as
  mush — all of that only exists in motion.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { LED_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/led-presets.js";
  import { describeLook } from "#lib/shared/animation-engine/components/effects-panel/thumbnails/look-copy.js";
  import { AnimationLoop } from "#lib/shared/animation-engine/services/animation-loop.js";
  import { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
  import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
  import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
  import { getViewerAnimationPropConfig } from "#lib/shared/animation-engine/get-viewer-animation-prop-config.js";
  import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { orientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";
  import { getGenerationOrchestrator } from "#lib/features/create/generate/shared/get-generation-orchestrator.js";
  import { InfiniteSequenceGenerator } from "#lib/features/landing/services/infinite-sequence-generator.js";
  import { SpinnerMetricsRepository } from "#lib/features/landing/services/spinner-metrics-repository.js";
  import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  const DEFAULT_BPM = 60;

  /**
   * One isolated config per station.
   *
   * `persist: false` is load-bearing: a persisting instance reads and writes the
   * one shared `tka_effects_config` key, so four of them on a page would race
   * each other and leak whichever look won into the user's real app state.
   */
  const stations = LED_PRESETS.map((preset) => {
    const config = createEffectsConfigState(undefined, { persist: false });
    config.applyPreset("led", preset.id, preset.patch);
    config.setActiveEffect("led");

    const patch = preset.patch;
    const shutter = patch?.look?.shutter;
    return {
      id: preset.id,
      name: preset.name,
      description: describeLook(preset.id) ?? "",
      accent:
        preset.previewColor === "rainbow" ? "#8bd3ff" : preset.previewColor,
      config,
      // The five numbers that actually separate one look from another. They sit
      // under the tile because "why does that one read brighter" is the first
      // question the comparison provokes, and the answer is here.
      specs: [
        {
          label: "Device",
          value:
            patch?.device?.kind === "capsule"
              ? "Capsule"
              : `Staff ${patch?.device?.ledCount ?? "?"}`,
        },
        { label: "Pattern", value: patch?.pattern?.generatorId ?? "—" },
        { label: "Loop", value: `${patch?.cycleDuration ?? "?"}s` },
        {
          label: "Shutter",
          value:
            shutter?.mode === "camera"
              ? `Camera ${shutter.exposureSeconds}s`
              : `Eye ${shutter?.timeConstantSeconds ?? "?"}s`,
        },
        {
          label: "Glare / bright",
          value: `${Math.round((patch?.look?.glare ?? 0) * 100)}% · ${patch?.look?.brightness ?? "—"}`,
        },
      ],
    };
  });

  const animationState = createAnimationPanelState({ ephemeral: true });

  let controller: AnimationPlaybackController | null = null;
  let generator: InfiniteSequenceGenerator | null = null;
  let generationToken = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let loading = $state(true);
  let error = $state("");
  let bpm = $state(DEFAULT_BPM);
  let gridVisible = $state(false);
  let isPlaying = $state(false);
  let currentStep = $state(0);
  let sequenceWord = $state("");
  let stepCount = $state(0);

  const gridMode = $derived(
    (animationState.sequenceData?.gridMode ?? null) as GridMode | null
  );

  const boolOptions = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  const bpmOptions = [40, 60, 90, 120].map((value) => ({
    value,
    label: String(value),
  }));

  async function generateLoop(): Promise<void> {
    const token = ++generationToken;
    loading = true;
    error = "";
    generator ??= new InfiniteSequenceGenerator(
      getGenerationOrchestrator(),
      new SpinnerMetricsRepository(),
      orientationCycleExtender
    );

    try {
      const next = await generator.generateInitial();
      if (!next || !isEffectPreviewLoop(next.sequence)) {
        throw new Error(
          "The generated sequence did not meet the seamless LOOP contract."
        );
      }
      if (token !== generationToken) return;

      animationState.setShouldLoop(true);
      if (!controller?.initialize(next.sequence, animationState)) {
        throw new Error("Playback failed to initialize.");
      }
      controller.setSpeed(bpm / DEFAULT_BPM);
      // A generated LOOP repeats its word by construction, so the raw value is
      // the expanded string. Display is always the smallest form.
      sequenceWord = simplifyRepeatedWord(next.sequence.word ?? next.sequence.name ?? "");
      stepCount = next.sequence.steps.length;
      if (!animationState.isPlaying) controller.togglePlayback();
    } catch (cause: unknown) {
      if (token !== generationToken) return;
      error =
        cause instanceof Error ? cause.message : "LOOP generation failed.";
    } finally {
      if (token === generationToken) loading = false;
    }
  }

  function togglePlayback(): void {
    controller?.togglePlayback();
  }

  function handleBpmChange(next: number): void {
    bpm = next;
    controller?.setSpeed(next / DEFAULT_BPM);
  }

  onMount(() => {
    controller = new AnimationPlaybackController(
      new SequenceAnimationOrchestrator(
        new AnimationStateManager(),
        getViewerAnimationPropConfig
      ),
      new AnimationLoop()
    );

    // The panel state is not a rune the template can read through directly, so
    // mirror the two values the canvases need onto local $state. 50ms is the
    // same cadence the Effects Lab host uses.
    pollTimer = setInterval(() => {
      if (animationState.isPlaying !== isPlaying)
        isPlaying = animationState.isPlaying;
      if (animationState.currentStep !== currentStep)
        currentStep = animationState.currentStep;
    }, 50);

    void generateLoop();
  });

  onDestroy(() => {
    generationToken += 1;
    if (pollTimer !== null) clearInterval(pollTimer);
    controller?.dispose(animationState);
    animationState.dispose();
  });
</script>

<svelte:head>
  <title>LED looks | side-by-side</title>
</svelte:head>

<main class="harness">
  <header>
    <p class="eyebrow">LED EFFECT REVIEW</p>
    <h1>Four looks, one sequence</h1>
    <p class="intro">
      Every station runs the same generated LOOP off one playback controller, so
      the frame, the steps and the tempo are identical across all four. The only
      variable is the look.
    </p>
  </header>

  <section class="controls" aria-label="Comparison controls">
    <div class="control">
      <span class="control-label">Playback</span>
      <SegmentedControl
        options={boolOptions}
        value={isPlaying}
        onchange={() => togglePlayback()}
        size="sm"
        ariaLabel="Play all four stations"
      />
    </div>
    <div class="control">
      <span class="control-label">BPM</span>
      <SegmentedControl
        options={bpmOptions}
        value={bpm}
        onchange={handleBpmChange}
        size="sm"
        ariaLabel="Playback tempo"
      />
    </div>
    <div class="control">
      <span class="control-label">Grid</span>
      <SegmentedControl
        options={boolOptions}
        value={gridVisible}
        onchange={(value) => (gridVisible = value)}
        size="sm"
        ariaLabel="Show the grid behind every station"
      />
    </div>
    <button class="regen" onclick={() => void generateLoop()} disabled={loading}>
      <i class="fas fa-rotate" aria-hidden="true"></i>
      New LOOP
    </button>
    <p class="sequence-tag" aria-live="polite">
      {#if loading}
        Generating a 16-count LOOP&hellip;
      {:else if error}
        {error}
      {:else}
        {sequenceWord} · {stepCount} counts
      {/if}
    </p>
  </section>

  {#if error && !loading}
    <section class="failure" role="alert">
      <p>{error}</p>
      <button class="regen" onclick={() => void generateLoop()}>Try again</button>
    </section>
  {:else}
    <div class="stations-frame">
      <ol class="stations" aria-label="LED looks running the same sequence">
        {#each stations as station (station.id)}
          <li style:--station-accent={station.accent}>
            <div class="station-stage">
              <p class="station-head">
                <span class="swatch" aria-hidden="true"></span>
                <strong>{station.name}</strong>
                <span class="station-copy">{station.description}</span>
              </p>
              {#if loading}
                <div class="station-loading">
                  <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
                </div>
              {:else}
                <div class="station-canvas">
                  <AnimatorCanvas
                    leftProp={animationState.leftPropState}
                    rightProp={animationState.rightPropState}
                    {gridVisible}
                    {gridMode}
                    sequenceData={animationState.sequenceData}
                    {currentStep}
                    {isPlaying}
                    backgroundAlpha={0}
                    hideHeader
                    hideProgressBar
                    hideStepNumbers
                    hideTkaGlyph
                    hidePathLines
                    disableContextMenu
                    fillContainer
                    effectsConfigState={station.config}
                  />
                </div>
              {/if}
              <dl class="station-specs">
                {#each station.specs as spec (spec.label)}
                  <div>
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                {/each}
              </dl>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</main>

<style>
  .harness {
    display: flex;
    /* One screen, no scroll. A comparison page that makes you scroll to reach
       the third and fourth station is not a comparison — you end up holding
       two of them in memory, which is the exact thing the page exists to
       avoid. Everything below sizes off the leftover height. */
    height: 100svh;
    flex-direction: column;
    gap: 0.9em;
    padding: 1.1em 1.4em 1.4em;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% -18%, rgba(46, 128, 190, 0.16), transparent 38%),
      #05070c;
    color: var(--theme-text, #e8ecf6);
    /* Ramps with the viewport so the page composes the same way at 1440 and
       3840 instead of stranding a 1080p-sized card in a sea of rail. */
    font-size: clamp(1rem, 0.52rem + 0.42vw, 1.6rem);
  }

  header {
    width: min(72em, 100%);
  }

  .eyebrow {
    margin: 0 0 0.35em;
    color: var(--theme-accent, #8bd3ff);
    font-size: 0.75em;
    font-weight: 800;
    letter-spacing: 0.15em;
  }

  h1 {
    margin: 0;
    font-size: 1.75em;
    line-height: 1;
    letter-spacing: -0.025em;
  }

  .intro {
    margin: 0.5em 0 0;
    color: var(--theme-text-secondary, #9fb0cc);
    font-size: 0.95em;
    line-height: 1.45;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75em 1.2em;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 0.55em;
  }

  .control-label {
    color: var(--theme-text-secondary, #9fb0cc);
    font-size: 0.9em;
  }

  .regen {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    min-height: var(--min-touch-target, 44px);
    padding: 0.45em 1em;
    border: 1px solid rgba(139, 211, 255, 0.4);
    border-radius: 0.55em;
    background: rgba(139, 211, 255, 0.12);
    color: #cfe9ff;
    font-size: 0.88em;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms ease;
  }

  .regen:hover:not(:disabled) {
    background: rgba(139, 211, 255, 0.22);
  }

  .regen:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .sequence-tag {
    margin: 0;
    /* Holds the row's height whichever of the three messages is showing, so
       swapping between them never shoves the station grid. */
    min-width: 18ch;
    color: var(--theme-text-muted, #7d8ba6);
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .failure {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.8em;
    padding: 1.2em;
    border: 1px solid rgba(255, 120, 120, 0.35);
    border-radius: 0.7em;
    background: rgba(255, 90, 90, 0.08);
  }

  .failure p {
    margin: 0;
    font-size: 0.92em;
  }

  /* The column count has to key off the shape of the AREA THE TILES GET, not
     the shape of the window. The header and controls are a fixed ~230px, which
     is a quarter of a 1080p body and a tenth of a 4K one — so two screens that
     are both exactly 16:9 want different arrangements. A viewport media query
     cannot tell them apart; a size container measures the real thing. */
  .stations-frame {
    flex: 1;
    min-height: 0;
    container-type: size;
  }

  .stations {
    display: grid;
    --cols: 2;
    --rows: 2;
    --gap: 0.7em;
    /* Every tile is a square, so for a body of W x H the tile edge is
       min(W/4, H) at four-across and min(W/2, H/2) at 2x2. Four-across is never
       smaller, and it is strictly bigger only once W/H passes 2 — below that
       the two arrangements tie on size and the 2x2 is the one that also fills
       the vertical instead of leaving a half-empty screen under the row.
       Hence the 2/1 seam: 2x2 up to it, four across past it. Both counts are
       pinned, so neither can strand a row of one. */
    /* Tracks hug the squares and the whole block centers, rather than four
       1fr tracks each centering its own tile - that spreads the tiles to the
       far corners and strands a gutter down the middle wider than the tiles. */
    grid-template-columns: repeat(var(--cols), auto);
    grid-template-rows: repeat(var(--rows), auto);
    height: 100%;
    justify-content: center;
    align-content: center;
    gap: var(--gap);
    margin: 0;
    padding: 0;
    list-style: none;
    min-height: 0;
  }

  /* Every tile is a square, so on a W x H body the edge is min(W/4, H) at four
     across and min(W/2, H/2) at 2x2. Those are equal until W/H passes 2, after
     which four across is strictly bigger. Four squares can never fill a body
     wider than 2:1 - roughly half of one axis is left over either way - so the
     leftover therefore goes wherever it looks composed rather than wherever the
     arithmetic lands: a full-width row with the slack split above and below it,
     never a centre block with half the width stranded as rail. Dead rail is the
     failure that reads as "not at home on this screen"; vertical slack under a
     row that spans the full width does not.
     So the seam sits at 1.6 rather than at the 2.0 size crossover. Every real
     landscape body clears it - a 1440x900 laptop lands at 1.98, where the two
     arrangements are within 2px of each other anyway - and the 2x2 is kept for
     portrait, where four across would cut each tile to a quarter of the width. */
  @container (min-aspect-ratio: 8 / 5) {
    .stations {
      --cols: 4;
      --rows: 1;
    }
  }

  .stations li {
    display: flex;
    /* The tile is exactly the square, hugging rather than stretching to the
       whole grid cell: a stretched tile at four-across on 16:9 is ~990px tall
       around a ~500px canvas, and that empty 485px reads as a bug.
       Both edges are derived from the frame's own box rather than from a
       percentage of an indefinite cell, because `max-height: 100%` on a
       non-stretched grid item resolves against nothing and silently lets the
       tile overflow — at 2x2/4K that produced 1945px tiles in an 1880px frame. */
    --col-w: calc((100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols));
    --row-h: calc((100cqh - (var(--rows) - 1) * var(--gap)) / var(--rows));
    width: min(var(--col-w), var(--row-h));
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--station-accent) 34%, transparent);
    border-radius: 0.7em;
    background: #080b13;
    overflow: hidden;
  }

  .station-head {
    position: absolute;
    display: flex;
    z-index: 1;
    top: 0;
    left: 0;
    right: 0;
    align-items: baseline;
    gap: 0.5em;
    margin: 0;
    padding: 0.5em 0.7em 1.1em;
    /* Over the canvas, not above it: a label row that took its own height
       would come straight out of the square, and the square is the thing worth
       every pixel it can get. The fade keeps the copy readable over whatever
       the look paints in that corner. */
    background: linear-gradient(to bottom, rgba(4, 6, 11, 0.94), transparent);
    pointer-events: none;
  }

  .station-head strong {
    font-size: 0.95em;
  }

  .swatch {
    width: 0.62em;
    height: 0.62em;
    flex: 0 0 auto;
    align-self: center;
    border-radius: 50%;
    background: var(--station-accent);
    box-shadow: 0 0 0.8em color-mix(in srgb, var(--station-accent) 55%, transparent);
  }

  .station-copy {
    overflow: hidden;
    color: var(--theme-text-muted, #7d8ba6);
    font-size: 0.78em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The tile is already the square, so the stage simply fills it. Label and
     specs both ride over the canvas rather than taking their own height -
     a strip of either would come straight out of the square. */
  .station-stage {
    position: relative;
    display: grid;
    flex: 1;
    min-height: 0;
    place-items: stretch;
    background: #04060b;
    /* The spec strip has to answer to the tile it sits in, not to the window:
       the same 1920 screen gives a tile 463px wide in a row of four and 925px
       in a 2x2, and five columns of spec truncate at one and not the other. */
    container-type: inline-size;
  }

  .station-canvas {
    display: grid;
    min-width: 0;
    min-height: 0;
    place-items: stretch;
  }

  .station-specs {
    position: absolute;
    display: grid;
    z-index: 1;
    bottom: 0;
    left: 0;
    right: 0;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.3em 0.6em;
    margin: 0;
    padding: 1.1em 0.7em 0.6em;
    background: linear-gradient(to top, rgba(4, 6, 11, 0.94), transparent);
    pointer-events: none;
  }

  /* Five across needs a wide tile; below that the values start eliding to
     "prop-col..." and "Camera ...", which is worse than a second row.
     Five items over three columns is 3 + 2, so it never strands a row of one. */
  @container (max-width: 30em) {
    .station-specs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Narrower still and the one-line description elides to "Blue and red sh..."
     while the name behind it wraps to two lines. Drop the description and let
     the name have the row: the name is what identifies the station, the
     description only ever restated what the canvas is already showing. */
  @container (max-width: 18em) {
    .station-copy {
      display: none;
    }

    .station-head strong {
      white-space: nowrap;
    }

    /* Five fields need about 120px of height however they are wrapped, which on
       a 161px tile is most of the square - the strip stops annotating the
       canvas and starts covering it. The looks are the point; the numbers are
       one breakpoint up. */
    .station-specs {
      display: none;
    }
  }

  .station-specs div {
    min-width: 0;
  }

  .station-specs dt {
    color: var(--theme-text-muted, #6f7f9c);
    font-size: 0.62em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .station-specs dd {
    margin: 0.1em 0 0;
    overflow: hidden;
    color: var(--theme-text-secondary, #aebbd0);
    font-size: 0.72em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .station-loading {
    position: absolute;
    display: grid;
    inset: 0;
    color: var(--theme-text-muted, #6f7f9c);
    font-size: 1.4em;
    place-items: center;
  }

  /* Landscape and wide: one row of four. Each canvas gets the whole remaining
     height instead of half of it, and the row spans the window rather than
     leaving a rail down both sides. Above 1/1 aspect the four-across canvas is
     always the larger of the two — a 2x2 there is capped by height/2. */
  @media (min-width: 1680px) {
    .stations {
      gap: 1.1em;
    }
  }

  @media (max-width: 900px) {
    .harness {
      padding: 1em;
    }

    .controls {
      gap: 0.6em 0.9em;
    }
  }

  /* Phone width is the one place the one-screen rule has to give. The controls
     wrap to three rows here, leaving the frame ~260px, and four squares in
     260px are 123px each - too small to tell one look from another, which is
     the only thing the page is for. So below 30rem the height lock comes off
     and the tiles size by width alone: 165px each, legible, and the page
     scrolls if it must. The frame drops to inline-size containment in the same
     breath, because size containment on an auto-height box collapses it. */
  @media (max-width: 30rem) {
    .harness {
      height: auto;
      min-height: 100svh;
      overflow: visible;
    }

    .stations-frame {
      container-type: inline-size;
    }

    .stations {
      height: auto;
    }

    .stations li {
      --row-h: 100svh;
    }
  }

  /* Wide and short (folded Fold, landscape phone). The header is the first
     thing to go: at 412px tall it costs a third of the canvas height and the
     page is one screen with nowhere to scroll it away to. */
  @media (max-height: 34rem) and (min-width: 44rem) {
    .harness {
      gap: 0.5em;
      padding: 0.6em;
    }

    header {
      display: none;
    }

    .station-specs {
      display: none;
    }
  }

</style>
