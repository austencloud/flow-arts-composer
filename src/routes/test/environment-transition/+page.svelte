<script lang="ts">
  import { onMount } from "svelte";

  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import EnvironmentTransitionVeil from "#lib/shared/3d/environments/components/EnvironmentTransitionVeil.svelte";
  import {
    DEFAULT_ENVIRONMENT_TRANSITION_TIMING,
    ENVIRONMENT_COVER_DURATION_MS,
    ENVIRONMENT_REVEAL_DURATION_MS,
    ENVIRONMENT_VEIL_MAX_OPACITY,
    advanceEnvironmentTransition,
    createEnvironmentTransitionState,
    getEnvironmentVeilOpacity,
    requestEnvironment,
    type EnvironmentTransitionPhase,
  } from "#lib/shared/3d/environments/domain/environment-transition.js";

  type StudyScene = "forest" | "ocean";
  type MotionMode = "standard" | "reduced";

  const SCENE_OPTIONS = [
    { value: "forest", label: "Forest" },
    { value: "ocean", label: "Ocean" },
  ] satisfies Array<{ value: StudyScene; label: string }>;

  const MOTION_OPTIONS = [
    { value: "standard", label: "Standard" },
    { value: "reduced", label: "Reduced motion" },
  ] satisfies Array<{ value: MotionMode; label: string }>;

  const PHASE_LABELS: Record<EnvironmentTransitionPhase, string> = {
    idle: "Ready",
    covering: "Lights down",
    gap: "Set cleared",
    waiting: "Preparing set",
    revealing: "Lights up",
  };

  let transition = $state(
    createEnvironmentTransitionState<StudyScene>("forest")
  );
  let coverDurationMs = $state(ENVIRONMENT_COVER_DURATION_MS);
  let revealDurationMs = $state(ENVIRONMENT_REVEAL_DURATION_MS);
  let peakOpacity = $state(ENVIRONMENT_VEIL_MAX_OPACITY);
  let readinessDelayMs = $state(220);
  let motionMode = $state<MotionMode>("standard");

  const veilOpacity = $derived(
    getEnvironmentVeilOpacity(transition, peakOpacity)
  );
  const phaseLabel = $derived(PHASE_LABELS[transition.phase]);
  const mountedSceneLabel = $derived(
    transition.mountedKey === null
      ? "Between sets"
      : transition.mountedKey === "forest"
        ? "Forest"
        : "Ocean"
  );

  function selectScene(scene: StudyScene): void {
    transition = requestEnvironment(transition, scene);
  }

  function swapScene(): void {
    selectScene(transition.requestedKey === "forest" ? "ocean" : "forest");
  }

  function setRangeValue(event: Event, setter: (value: number) => void): void {
    setter(Number((event.currentTarget as HTMLInputElement).value));
  }

  function resetDefaults(): void {
    coverDurationMs = ENVIRONMENT_COVER_DURATION_MS;
    revealDurationMs = ENVIRONMENT_REVEAL_DURATION_MS;
    peakOpacity = ENVIRONMENT_VEIL_MAX_OPACITY;
    readinessDelayMs = 220;
    motionMode = "standard";
  }

  onMount(() => {
    let frameId = 0;
    let previousTime = performance.now();
    let readyAt = previousTime;
    let previousPhase = transition.phase;

    function advance(time: number): void {
      const deltaMs = Math.min(50, Math.max(0, time - previousTime));
      previousTime = time;

      const timing =
        motionMode === "reduced"
          ? { coverDurationMs: 0, revealDurationMs: 0 }
          : { coverDurationMs, revealDurationMs };
      const mountedEnvironmentSettled =
        transition.phase === "waiting" && time >= readyAt;
      const nextTransition = advanceEnvironmentTransition(
        transition,
        deltaMs,
        mountedEnvironmentSettled,
        timing
      );

      if (nextTransition.phase === "waiting" && previousPhase !== "waiting") {
        readyAt = time + readinessDelayMs;
      }

      transition = nextTransition;
      previousPhase = nextTransition.phase;
      frameId = requestAnimationFrame(advance);
    }

    frameId = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frameId);
  });
</script>

<svelte:head>
  <title>Environment Transition Study</title>
</svelte:head>

<main class="transition-study" data-motion-mode={motionMode}>
  <header class="study-header">
    <div>
      <p class="eyebrow">3D viewer motion study</p>
      <h1>Environment transition</h1>
    </div>
    <p class="summary">
      The set darkens and rebuilds behind a fully lit performer. Adjust the
      values, then switch between the two abstract scenes.
    </p>
  </header>

  <div class="study-layout">
    <section class="preview-panel" aria-label="Transition preview">
      <div
        class="stage"
        data-phase={transition.phase}
        data-mounted-scene={transition.mountedKey ?? "none"}
      >
        <div class="set-layer" aria-hidden="true">
          {#if transition.mountedKey === "forest"}
            <div class="forest-set">
              <div class="moon"></div>
              <div class="ridge ridge-far"></div>
              <div class="ridge ridge-near"></div>
              <div class="tree tree-one"></div>
              <div class="tree tree-two"></div>
              <div class="tree tree-three"></div>
              <div class="ground forest-ground"></div>
            </div>
          {:else if transition.mountedKey === "ocean"}
            <div class="ocean-set">
              <div class="surface-light"></div>
              <div class="ruin ruin-left"></div>
              <div class="ruin ruin-right"></div>
              <div class="coral coral-one"></div>
              <div class="coral coral-two"></div>
              <div class="ground ocean-ground"></div>
            </div>
          {/if}
        </div>

        <div class="center-guide" aria-hidden="true"></div>
        <div
          class="performer"
          data-study-performer
          aria-label="Stationary performer"
        >
          <div class="performer-head"></div>
          <div class="performer-body"></div>
          <div class="performer-arm arm-left">
            <span class="prop prop-blue"></span>
          </div>
          <div class="performer-arm arm-right">
            <span class="prop prop-red"></span>
          </div>
          <div class="performer-leg leg-left"></div>
          <div class="performer-leg leg-right"></div>
        </div>

        <EnvironmentTransitionVeil
          opacity={veilOpacity}
          phase={transition.phase}
        />

        <div class="stage-readout" aria-live="polite">
          <span>{mountedSceneLabel}</span>
          <strong>{phaseLabel}</strong>
        </div>
      </div>

      <div class="preview-actions">
        <div class="scene-picker">
          <SegmentedControl
            options={SCENE_OPTIONS}
            value={transition.requestedKey}
            onchange={selectScene}
            color="accent"
            ariaLabel="Preview environment"
          />
        </div>
        <PanelButton variant="primary" onclick={swapScene}>
          Change scene
        </PanelButton>
      </div>
    </section>

    <aside class="control-panel" aria-label="Transition controls">
      <div class="control-heading">
        <div>
          <p class="eyebrow">Live controls</p>
          <h2>Shape the cue</h2>
        </div>
        <span class="phase-chip">{phaseLabel}</span>
      </div>

      <div class="motion-picker">
        <SegmentedControl
          options={MOTION_OPTIONS}
          value={motionMode}
          onchange={(value) => (motionMode = value)}
          color="accent"
          ariaLabel="Motion preference simulation"
        />
      </div>

      <label class="range-control">
        <span class="range-label">
          <span>Lights down</span>
          <output>{coverDurationMs} ms</output>
        </span>
        <input
          type="range"
          min="100"
          max="500"
          step="10"
          value={coverDurationMs}
          disabled={motionMode === "reduced"}
          oninput={(event) =>
            setRangeValue(event, (value) => (coverDurationMs = value))}
        />
      </label>

      <label class="range-control">
        <span class="range-label">
          <span>Lights up</span>
          <output>{revealDurationMs} ms</output>
        </span>
        <input
          type="range"
          min="120"
          max="700"
          step="10"
          value={revealDurationMs}
          disabled={motionMode === "reduced"}
          oninput={(event) =>
            setRangeValue(event, (value) => (revealDurationMs = value))}
        />
      </label>

      <label class="range-control">
        <span class="range-label">
          <span>Peak darkness</span>
          <output>{Math.round(peakOpacity * 100)}%</output>
        </span>
        <input
          type="range"
          min="0.65"
          max="1"
          step="0.01"
          value={peakOpacity}
          oninput={(event) =>
            setRangeValue(event, (value) => (peakOpacity = value))}
        />
      </label>

      <label class="range-control">
        <span class="range-label">
          <span>Set preparation</span>
          <output>{readinessDelayMs} ms</output>
        </span>
        <input
          type="range"
          min="0"
          max="1200"
          step="20"
          value={readinessDelayMs}
          oninput={(event) =>
            setRangeValue(event, (value) => (readinessDelayMs = value))}
        />
      </label>

      <div class="timing-note">
        <span class="note-mark" aria-hidden="true"></span>
        <p>
          Set preparation simulates asset and shader readiness. The veil holds
          at its darkest point until the new set is ready.
        </p>
      </div>

      <PanelButton onclick={resetDefaults} fullWidth>
        Reset production values
      </PanelButton>
    </aside>
  </div>
</main>

<style>
  .transition-study {
    --theme-panel-bg: rgba(13, 18, 27, 0.94);
    --theme-card-bg: rgba(255, 255, 255, 0.055);
    --theme-card-hover-bg: rgba(255, 255, 255, 0.095);
    --theme-stroke: rgba(255, 255, 255, 0.12);
    --theme-stroke-strong: rgba(255, 255, 255, 0.22);
    --theme-text: #f5f7fb;
    --theme-text-dim: #aeb8c8;
    --theme-accent: #4d9fe8;
    --theme-text-on-accent: #06111d;
    --duration-fast: 150ms;
    --duration-normal: 200ms;
    min-height: 100vh;
    padding: clamp(1rem, 2.5vw, 3rem);
    color: var(--theme-text);
    background:
      radial-gradient(
        circle at 18% 8%,
        rgba(55, 106, 151, 0.2),
        transparent 32%
      ),
      radial-gradient(
        circle at 86% 90%,
        rgba(74, 50, 112, 0.18),
        transparent 30%
      ),
      #080b11;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .study-header,
  .study-layout {
    width: min(100%, var(--shell-w, 92vw));
    margin-inline: auto;
  }

  .study-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    padding-block: 0.5rem clamp(1.25rem, 2.4vw, 2.5rem);
  }

  .eyebrow {
    margin: 0 0 0.45rem;
    color: #73b9f5;
    font-size: clamp(0.75rem, 0.7rem + 0.12vw, 0.95rem);
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0;
    font-size: clamp(2rem, 1.25rem + 2.1vw, 4.8rem);
    font-weight: 680;
    letter-spacing: -0.045em;
    line-height: 0.98;
  }

  h2 {
    margin-bottom: 0;
    font-size: clamp(1.25rem, 1rem + 0.55vw, 2rem);
    letter-spacing: -0.025em;
  }

  .summary {
    max-width: 43rem;
    margin-bottom: 0.1rem;
    color: var(--theme-text-dim);
    font-size: clamp(0.9rem, 0.82rem + 0.25vw, 1.2rem);
    line-height: 1.55;
  }

  .study-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(19rem, 0.7fr);
    gap: clamp(1rem, 1.8vw, 2rem);
    align-items: stretch;
  }

  .preview-panel,
  .control-panel {
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(1rem, 1.2vw, 1.65rem);
    background: var(--theme-panel-bg);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.3);
  }

  .preview-panel {
    min-width: 0;
    padding: clamp(0.75rem, 1.25vw, 1.4rem);
  }

  .stage {
    position: relative;
    min-height: clamp(25rem, 63vh, 55rem);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: clamp(0.75rem, 1vw, 1.2rem);
    background: #0a0e14;
    isolation: isolate;
  }

  .set-layer,
  .forest-set,
  .ocean-set {
    position: absolute;
    inset: 0;
  }

  .forest-set {
    background:
      radial-gradient(
        circle at 48% 30%,
        rgba(135, 181, 165, 0.2),
        transparent 25%
      ),
      linear-gradient(#172c35 0%, #1b3340 45%, #13261f 100%);
  }

  .ocean-set {
    background:
      radial-gradient(
        ellipse at 50% -10%,
        rgba(123, 220, 232, 0.42),
        transparent 42%
      ),
      linear-gradient(#1d6070 0%, #124755 42%, #082b35 100%);
  }

  .moon {
    position: absolute;
    top: 13%;
    right: 15%;
    width: clamp(3rem, 5vw, 6rem);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #d8e8dc;
    box-shadow: 0 0 3rem rgba(203, 235, 219, 0.38);
  }

  .ridge {
    position: absolute;
    right: -8%;
    bottom: 24%;
    left: -8%;
    height: 42%;
    clip-path: polygon(
      0 64%,
      14% 34%,
      29% 58%,
      43% 19%,
      57% 53%,
      72% 26%,
      86% 55%,
      100% 31%,
      100% 100%,
      0 100%
    );
  }

  .ridge-far {
    background: #1c4140;
    opacity: 0.74;
    transform: translateY(-18%);
  }

  .ridge-near {
    background: #102e29;
  }

  .tree {
    position: absolute;
    bottom: 18%;
    width: clamp(1.8rem, 3vw, 3.6rem);
    height: 46%;
    background: #09221c;
    clip-path: polygon(
      50% 0,
      74% 32%,
      60% 32%,
      87% 65%,
      62% 65%,
      100% 100%,
      0 100%,
      38% 65%,
      13% 65%,
      40% 32%,
      26% 32%
    );
  }

  .tree-one {
    left: 7%;
  }
  .tree-two {
    left: 18%;
    transform: scale(0.72);
    transform-origin: bottom;
  }
  .tree-three {
    right: 9%;
    transform: scale(0.86);
    transform-origin: bottom;
  }

  .surface-light {
    position: absolute;
    top: -7%;
    right: 12%;
    left: 12%;
    height: 48%;
    background: repeating-linear-gradient(
      108deg,
      transparent 0 9%,
      rgba(173, 239, 241, 0.11) 10% 12%,
      transparent 13% 21%
    );
    filter: blur(0.25rem);
  }

  .ruin {
    position: absolute;
    bottom: 20%;
    width: 13%;
    height: 43%;
    border: clamp(0.65rem, 1.2vw, 1.15rem) solid #607d72;
    border-bottom: 0;
    opacity: 0.74;
  }

  .ruin-left {
    left: 9%;
    transform: rotate(-4deg);
  }
  .ruin-right {
    right: 11%;
    transform: rotate(5deg) scale(0.82);
    transform-origin: bottom;
  }

  .coral {
    position: absolute;
    bottom: 13%;
    width: 2.2%;
    height: 24%;
    border-radius: 999px 999px 0 0;
    background: #d47472;
    box-shadow:
      -1.2rem 2.2rem 0 -0.45rem #b86483,
      1.1rem 3.2rem 0 -0.45rem #d99869;
  }

  .coral-one {
    left: 28%;
  }
  .coral-two {
    right: 25%;
    transform: scale(0.72);
    transform-origin: bottom;
  }

  .ground {
    position: absolute;
    right: -6%;
    bottom: -16%;
    left: -6%;
    height: 42%;
    border-radius: 50% 50% 0 0;
  }

  .forest-ground {
    background: #0b2019;
  }
  .ocean-ground {
    background: #375f5d;
  }

  .center-guide {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 50%;
    width: 1px;
    height: 42%;
    transform: translate(-50%, -18%);
    background: linear-gradient(
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
  }

  .center-guide::after {
    content: "";
    position: absolute;
    top: 64%;
    left: 50%;
    width: clamp(5rem, 10vw, 10rem);
    height: 1px;
    transform: translateX(-50%);
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.22),
      transparent
    );
  }

  .performer {
    position: absolute;
    z-index: 6;
    bottom: 19%;
    left: 50%;
    width: clamp(4.8rem, 7vw, 7.2rem);
    height: clamp(12rem, 25vh, 20rem);
    transform: translateX(-50%);
    filter: drop-shadow(0 0.8rem 1rem rgba(0, 0, 0, 0.5));
  }

  .performer-head {
    position: absolute;
    top: 0;
    left: 50%;
    width: 31%;
    aspect-ratio: 1;
    transform: translateX(-50%);
    border-radius: 50%;
    background: #e8cdb6;
  }

  .performer-body {
    position: absolute;
    top: 18%;
    bottom: 38%;
    left: 50%;
    width: 38%;
    transform: translateX(-50%);
    border-radius: 45% 45% 24% 24%;
    background: linear-gradient(90deg, #171d27, #303c4d 52%, #171d27);
  }

  .performer-arm {
    position: absolute;
    top: 29%;
    width: 50%;
    height: 8%;
    border-radius: 999px;
    background: #e8cdb6;
    animation: arm-swing 2.4s ease-in-out infinite alternate;
  }

  .arm-left {
    right: 56%;
    transform-origin: right center;
    transform: rotate(18deg);
  }

  .arm-right {
    left: 56%;
    transform-origin: left center;
    transform: rotate(-18deg);
    animation-delay: -1.2s;
  }

  .prop {
    position: absolute;
    top: 50%;
    width: 20%;
    aspect-ratio: 1;
    transform: translateY(-50%);
    border-radius: 50%;
  }

  .prop-blue {
    left: -5%;
    background: #56b8ff;
    box-shadow: 0 0 1.2rem #238ee0;
  }

  .prop-red {
    right: -5%;
    background: #ff665c;
    box-shadow: 0 0 1.2rem #d63837;
  }

  .performer-leg {
    position: absolute;
    bottom: 0;
    width: 16%;
    height: 43%;
    border-radius: 999px 999px 0 0;
    background: #111722;
    transform-origin: top center;
  }

  .leg-left {
    left: 31%;
    transform: rotate(4deg);
  }
  .leg-right {
    right: 31%;
    transform: rotate(-4deg);
  }

  @keyframes arm-swing {
    from {
      rotate: -5deg;
    }
    to {
      rotate: 10deg;
    }
  }

  .stage-readout {
    position: absolute;
    z-index: 6;
    top: clamp(0.75rem, 1.2vw, 1.25rem);
    right: clamp(0.75rem, 1.2vw, 1.25rem);
    display: grid;
    min-width: 10rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.75rem;
    background: rgba(4, 7, 11, 0.66);
    color: #c5cfdb;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.45;
  }

  .stage-readout strong {
    color: #fff;
    font-size: var(--font-size-min, 0.875rem);
  }

  .preview-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: clamp(0.85rem, 1.2vw, 1.25rem) 0 0;
  }

  .scene-picker {
    width: min(24rem, 62%);
  }

  .control-panel {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: clamp(1rem, 1.5vw, 1.5rem);
    padding: clamp(1.1rem, 1.8vw, 2rem);
  }

  .control-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .phase-chip {
    flex: 0 0 auto;
    min-width: 7.5rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid rgba(115, 185, 245, 0.25);
    border-radius: 999px;
    background: rgba(77, 159, 232, 0.1);
    color: #9ed2ff;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    text-align: center;
  }

  .motion-picker {
    width: 100%;
  }

  .range-control {
    display: grid;
    gap: 0.15rem;
  }

  .range-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }

  output {
    min-width: 4.8rem;
    color: #dcebfa;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  input[type="range"] {
    width: 100%;
    height: 2.75rem;
    margin: 0;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    height: 0.4rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  input[type="range"]::-webkit-slider-thumb {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: -0.425rem;
    appearance: none;
    border: 3px solid #0f1721;
    border-radius: 50%;
    background: #73b9f5;
    box-shadow: 0 0 0 1px rgba(115, 185, 245, 0.35);
  }

  input[type="range"]::-moz-range-track {
    height: 0.4rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  input[type="range"]::-moz-range-thumb {
    width: 1rem;
    height: 1rem;
    border: 3px solid #0f1721;
    border-radius: 50%;
    background: #73b9f5;
  }

  input[type="range"]:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
    border-radius: 0.5rem;
  }

  input[type="range"]:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .timing-note {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.035);
  }

  .note-mark {
    width: 0.55rem;
    height: 0.55rem;
    margin-top: 0.35rem;
    border-radius: 50%;
    background: #73b9f5;
    box-shadow: 0 0 0.8rem rgba(115, 185, 245, 0.7);
  }

  .timing-note p {
    margin-bottom: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.55;
  }

  /* Test routes do not inherit the marketing shell's root-size ramp. Match its
     1680-to-3840 progression here so the study remains legible on a 4K TV. */
  @media (min-width: 1680px) {
    :global(html:has(.transition-study)) {
      font-size: clamp(16px, calc(9.78px + 0.37vw), 24px);
    }
  }

  @media (min-width: 2600px) {
    .stage {
      min-height: clamp(55rem, 70vh, 65rem);
    }
  }

  @media (min-width: 68.01rem) and (max-height: 59.375rem) {
    .transition-study {
      padding-block: clamp(1rem, 1.75vw, 2rem);
    }
  }

  @media (max-width: 68rem) {
    .study-header {
      align-items: start;
      flex-direction: column;
      gap: 1rem;
    }

    .study-layout {
      grid-template-columns: 1fr;
    }

    .stage {
      min-height: clamp(23rem, 55vh, 38rem);
    }
  }

  @media (max-width: 40rem) {
    .transition-study {
      padding: 0.75rem;
    }

    .preview-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .scene-picker {
      width: 100%;
    }

    .preview-actions :global(.panel-btn) {
      width: 100%;
    }

    .stage {
      min-height: 25rem;
    }

    .stage-readout {
      min-width: 8.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .performer-arm {
      animation: none;
    }
  }

  .transition-study[data-motion-mode="reduced"] .performer-arm {
    animation: none;
  }
</style>
