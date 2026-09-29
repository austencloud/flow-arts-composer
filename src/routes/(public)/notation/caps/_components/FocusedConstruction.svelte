<script lang="ts">
  import { onMount } from "svelte";
  import { animate } from "motion";
  import {
    CAP_MATH_MODEL,
    classifyTrochoid,
    evaluateCAPAssembly,
    evaluateResolvedCAPSegment,
    evaluateTrochoid,
    recommendedTrochoidSampleCount,
    resolveCAPAssembly,
    sampleResolvedCAPAssembly,
    sampleTrochoid,
    type CAPAssembly,
    type CAPSegment,
    type ElementaryPatternNotation,
    type EvaluatedCAPAssemblyFrame,
    type TrochoidFrame,
    type TrochoidParameters,
  } from "@caps/domain";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ConstructionStage from "./construction/ConstructionStage.svelte";
  import ConstructionTransport from "./construction/ConstructionTransport.svelte";
  import ConstructionRail from "./construction/ConstructionRail.svelte";
  import ConstructionProvenance from "./construction/ConstructionProvenance.svelte";

  let {
    selectedId,
    oncustom,
  }: {
    selectedId: string | null;
    oncustom: () => void;
  } = $props();

  type Layer = "trace" | "assembly" | "mechanism";

  const CYCLE_SECONDS = 10;
  const initialPattern =
    CAP_MATH_MODEL.elementaryPatterns.find(
      (pattern) => pattern.id === selectedId
    ) ?? CAP_MATH_MODEL.elementaryPatterns[0]!;

  let elementaryParameters = $state<TrochoidParameters>({
    theta1: initialPattern.theta1,
    theta2: initialPattern.theta2,
    rho1: initialPattern.rho1,
    rho2: initialPattern.rho2,
    d: initialPattern.d,
  });
  let loadedSelectionId = $state<string | null>(selectedId);
  let layer = $state<Layer>("trace");
  let progress = $state(0.08);
  let playing = $state(false);
  let reducedMotion = $state(false);
  let playback: { stop: () => void } | null = null;

  const selectedPattern = $derived.by<ElementaryPatternNotation | null>(() => {
    if (!selectedId) return null;
    return (
      CAP_MATH_MODEL.elementaryPatterns.find(
        (pattern) => pattern.id === selectedId
      ) ?? null
    );
  });
  const selectedAssembly = $derived.by<CAPAssembly | null>(() => {
    if (!selectedId) return null;
    return (
      CAP_MATH_MODEL.assemblies.find(
        (assembly) => assembly.id === selectedId
      ) ?? null
    );
  });
  const kind = $derived<"elementary" | "assembly">(
    selectedAssembly ? "assembly" : "elementary"
  );
  const resolvedAssembly = $derived(
    selectedAssembly ? resolveCAPAssembly(selectedAssembly.segments) : null
  );
  const segments = $derived.by<CAPSegment[]>(() =>
    selectedAssembly ? selectedAssembly.segments : [{ ...elementaryParameters }]
  );
  const sampled = $derived.by(() => {
    if (resolvedAssembly) return sampleResolvedCAPAssembly(resolvedAssembly);
    const points = sampleTrochoid(
      elementaryParameters,
      recommendedTrochoidSampleCount(elementaryParameters)
    );
    return { points, segmentPoints: [points] };
  });
  const currentFrame = $derived.by<TrochoidFrame | EvaluatedCAPAssemblyFrame>(
    () =>
      resolvedAssembly
        ? evaluateCAPAssembly(resolvedAssembly, progress)
        : evaluateTrochoid(
            elementaryParameters,
            progress * elementaryParameters.d
          )
  );
  const activeSegmentIndex = $derived.by<number>(() =>
    "segmentIndex" in currentFrame ? currentFrame.segmentIndex : 0
  );
  const junctions = $derived(
    resolvedAssembly
      ? resolvedAssembly.segments
          .slice(0, -1)
          .map((segment) => evaluateResolvedCAPSegment(segment, segment.d).tip)
      : []
  );
  const curveName = $derived(
    selectedAssembly?.name ?? selectedPattern?.name ?? "Custom trochoid"
  );
  const classificationLabel = $derived.by(() => {
    if (selectedAssembly) return "Assembled CAP";
    const classification = classifyTrochoid(elementaryParameters);
    if (classification === "cycloid") return "Cycloid";
    if (classification === "rosette") return "Rosette";
    return "Centered trochoid";
  });
  const notation = $derived(
    selectedAssembly?.notation ?? notationFor(elementaryParameters)
  );
  const description = $derived(
    selectedAssembly?.description ??
      (selectedId === null
        ? "The atlas curve is detached. Every parameter now responds to the controls."
        : "O stays fixed. M circles O. E circles M. The luminous line is the path traced by E.")
  );
  const layerOptions = $derived(
    kind === "assembly"
      ? [
          { value: "trace" as Layer, label: "Trace" },
          { value: "assembly" as Layer, label: "Assembly" },
          { value: "mechanism" as Layer, label: "Mechanism" },
        ]
      : [
          { value: "trace" as Layer, label: "Trace" },
          { value: "mechanism" as Layer, label: "Mechanism" },
        ]
  );
  const railParameters = $derived(
    selectedAssembly
      ? (segments[activeSegmentIndex] ?? segments[0]!)
      : elementaryParameters
  );

  function scalar(value: number): string {
    if (Math.abs(value - Math.round(value)) < 1e-8) {
      return String(Math.round(value));
    }
    for (const denominator of [2, 3, 4, 5, 8]) {
      const numerator = Math.round(value * denominator);
      if (Math.abs(value - numerator / denominator) < 1e-8) {
        return `${numerator}/${denominator}`;
      }
    }
    return String(Number(value.toFixed(2)));
  }

  function notationFor(parameters: TrochoidParameters): string {
    return `${scalar(parameters.theta1)} ${scalar(parameters.theta2)} ; ${scalar(parameters.rho1)} ${scalar(parameters.rho2)} ; ${scalar(parameters.d)}`;
  }

  function stopPlayback(): void {
    playback?.stop();
    playback = null;
  }

  function startPlayback(): void {
    if (reducedMotion) return;
    stopPlayback();
    if (progress >= 0.999) progress = 0;
    playing = true;
    const start = progress;
    playback = animate(start, 1, {
      duration: Math.max(0.1, (1 - start) * CYCLE_SECONDS),
      ease: "linear",
      onUpdate: (latest) => {
        progress = latest;
      },
      onComplete: () => {
        if (!playing) return;
        progress = 0;
        startPlayback();
      },
    });
  }

  function pausePlayback(): void {
    playing = false;
    stopPlayback();
  }

  function togglePlayback(): void {
    if (playing) pausePlayback();
    else startPlayback();
  }

  function scrub(value: number): void {
    pausePlayback();
    progress = value;
  }

  function selectLayer(value: Layer): void {
    layer = value;
  }

  function updateParameter(key: keyof TrochoidParameters, value: number): void {
    elementaryParameters = { ...elementaryParameters, [key]: value };
    if (selectedId !== null) oncustom();
  }

  $effect(() => {
    const id = selectedId;
    if (id === loadedSelectionId) return;
    loadedSelectionId = id;
    if (!id) return;

    const pattern = CAP_MATH_MODEL.elementaryPatterns.find(
      (candidate) => candidate.id === id
    );
    if (pattern) {
      elementaryParameters = {
        theta1: pattern.theta1,
        theta2: pattern.theta2,
        rho1: pattern.rho1,
        rho2: pattern.rho2,
        d: pattern.d,
      };
    }

    const resume = playing;
    stopPlayback();
    progress = 0.08;
    layer = "trace";
    if (resume) queueMicrotask(startPlayback);
  });

  onMount(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const syncMotionPreference = (): void => {
      reducedMotion = motionPreference.matches;
      if (reducedMotion) pausePlayback();
    };

    syncMotionPreference();
    motionPreference.addEventListener("change", syncMotionPreference);
    if (!reducedMotion) startPlayback();

    return () => {
      motionPreference.removeEventListener("change", syncMotionPreference);
      stopPlayback();
    };
  });
</script>

<section
  class="focused-construction"
  aria-labelledby="focused-construction-title"
>
  <header class="construction-header">
    <div class="title-copy">
      <span class="model-kicker">Focused construction</span>
      <h3 id="focused-construction-title" tabindex="-1">{curveName}</h3>
      <p>{description}</p>
    </div>
    <code class="notation" aria-label="Current notation">{notation}</code>
  </header>

  <div class="layer-switcher">
    <span id="construction-layer-label">Choose what to reveal</span>
    <SegmentedControl
      options={layerOptions}
      value={layer}
      onchange={selectLayer}
      semantics="tabs"
      ariaLabelledby="construction-layer-label"
      color="accent"
      size="sm"
    />
  </div>

  <div class="construction-grid">
    <div class="stage-column">
      <ConstructionStage
        trace={sampled.points}
        segmentTraces={sampled.segmentPoints}
        {segments}
        frame={currentFrame}
        {junctions}
        {progress}
        {layer}
        {notation}
        {curveName}
      />
      <ConstructionTransport
        {progress}
        {playing}
        {reducedMotion}
        ontoggle={togglePlayback}
        onscrub={scrub}
      />
    </div>

    <div class="rail-slot">
      <ConstructionRail
        {kind}
        {layer}
        {classificationLabel}
        {notation}
        parameters={railParameters}
        {segments}
        frame={currentFrame}
        {activeSegmentIndex}
        isCustom={selectedId === null}
        onparameter={updateParameter}
      />
    </div>
  </div>
</section>

<ConstructionProvenance assembly={selectedAssembly} />

<style>
  .focused-construction {
    --construction-surface: color-mix(
      in oklch,
      var(--theme-card-bg, #11151f) 88%,
      #071b19
    );
    --construction-panel: color-mix(
      in oklch,
      var(--theme-card-bg, #11151f) 94%,
      #102821
    );
    --construction-border: color-mix(
      in oklch,
      var(--theme-stroke, #ffffff1f) 68%,
      #34d399
    );
    --construction-text: var(--theme-text, #f8fafc);
    --construction-muted: var(--theme-text-dim, #aab4c3);
    --construction-arm: #67e8f9;
    --construction-prop: #c4b5fd;
    --construction-origin: #e2e8f0;
    --construction-hand: #fbbf24;
    --construction-tip: #fb7185;
    --construction-trace-a: #67e8f9;
    --construction-trace-b: #34d399;
    --construction-trace-c: #c4b5fd;
    --construction-stage-center: #102b29;
    --construction-stage-edge: #080c15;
    --theme-card-bg: var(--construction-panel);
    --theme-stroke: var(--construction-border);
    --theme-text: var(--construction-text);
    --theme-text-dim: var(--construction-muted);
    --theme-accent: #34d399;
    container-type: inline-size;
    margin-top: clamp(2.25rem, 4vw, 4.5rem);
    overflow: hidden;
    border: 1px solid var(--construction-border);
    border-radius: clamp(1.1rem, 1rem + 0.8vw, 1.9rem);
    background:
      radial-gradient(
        circle at 14% 0%,
        color-mix(in srgb, var(--construction-arm) 12%, transparent),
        transparent 34%
      ),
      radial-gradient(
        circle at 92% 8%,
        color-mix(in srgb, var(--construction-prop) 10%, transparent),
        transparent 30%
      ),
      var(--construction-surface);
    box-shadow:
      0 28px 80px rgb(0 0 0 / 0.28),
      inset 0 1px rgb(255 255 255 / 0.04);
    color: var(--construction-text);
  }

  .construction-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: clamp(1rem, 3cqi, 2.5rem);
    padding: clamp(1.25rem, 3.2cqi, 2.35rem) clamp(1.25rem, 3.5cqi, 2.75rem)
      1rem;
  }

  .model-kicker,
  .layer-switcher > span {
    display: block;
    color: color-mix(in srgb, var(--construction-trace-b) 86%, white);
    font-size: 0.75rem;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .construction-header h3 {
    margin: 0.28rem 0 0.45rem;
    font-size: clamp(1.65rem, 1.25rem + 1.6cqi, 3rem);
    letter-spacing: -0.035em;
    line-height: 1;
  }
  .construction-header h3:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 5px;
    border-radius: 0.2rem;
  }
  .construction-header p {
    margin: 0;
    color: var(--construction-muted);
    font-size: clamp(0.95rem, 0.9rem + 0.15cqi, 1.08rem);
    line-height: 1.55;
  }
  .notation {
    flex: 0 0 auto;
    max-width: min(46%, 34rem);
    min-width: 12rem;
    padding: 0.72rem 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--construction-trace-b) 34%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--construction-trace-b) 9%, transparent);
    color: color-mix(in srgb, var(--construction-trace-b) 76%, white);
    font-size: clamp(0.75rem, 0.7rem + 0.18cqi, 0.95rem);
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: normal;
  }

  .layer-switcher {
    display: grid;
    grid-template-columns: minmax(10rem, 0.22fr) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0 clamp(1.25rem, 3.5cqi, 2.75rem) clamp(1.15rem, 2.4cqi, 1.75rem);
  }
  .layer-switcher :global(.segmented-control) {
    min-width: 0;
  }

  .construction-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.46fr);
    align-items: stretch;
    min-height: 0;
    border-top: 1px solid var(--construction-border);
  }
  .stage-column {
    min-width: 0;
  }
  .rail-slot {
    min-width: 0;
    min-height: 32rem;
  }
  .rail-slot :global(.rail) {
    height: 100%;
  }

  @container (max-width: 55rem) {
    .construction-grid {
      grid-template-columns: 1fr;
    }
    .rail-slot {
      min-height: 24rem;
    }
  }

  @container (max-width: 39rem) {
    .construction-header {
      flex-direction: column;
    }
    .notation {
      align-self: stretch;
      max-width: none;
    }
    .layer-switcher {
      grid-template-columns: 1fr;
      gap: 0.65rem;
    }
  }

  @container (max-width: 29rem) {
    .construction-header {
      padding-inline: 1rem;
    }
    .layer-switcher {
      padding-inline: 1rem;
    }
    .rail-slot {
      min-height: 0;
    }
  }
</style>
