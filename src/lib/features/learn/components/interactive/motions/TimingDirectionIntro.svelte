<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { downbeatPulse, type TimingMode } from "./timing-intro-phase";

  let { active = true } = $props<{ active?: boolean }>();
  // These are separate examples, not controls for one combined motion.
  let placementAngle = $state(180);
  const placement = $derived(
    placementAngle === 180 ? "alpha" : placementAngle === 0 ? "beta" : "gamma"
  );
  let timing = $state<TimingMode>("together");
  let rotations = $state([1, 1]);
  const direction = $derived(
    rotations[0] === rotations[1] ? "same" : "opposite"
  );
  let elapsed = $state(-0.15);
  let playing = $state(false);
  const loop = new AnimationLoop();
  const gate = createRenderActivityGate({
    name: "intro-downbeats",
    rootMargin: "0px",
  });
  const offset = $derived(
    timing === "split" ? 0.5 : timing === "quarter" ? 0.25 : 0
  );
  const pulses = $derived([
    downbeatPulse(elapsed, 0),
    downbeatPulse(elapsed, offset),
  ]);
  const placementPoints = [
    { angle: 0, x: 22.5, y: 50, name: "left" },
    { angle: 90, x: 50, y: 62 / 3, name: "top" },
    { angle: 180, x: 77.5, y: 50, name: "right" },
    { angle: 270, x: 50, y: 238 / 3, name: "bottom" },
  ];
  const placementCopy = $derived(
    placement === "alpha"
      ? "Opposite points."
      : placement === "beta"
        ? "The same point."
        : "A right angle apart."
  );
  const timingCopy = $derived(
    timing === "together"
      ? "At the same time."
      : timing === "split"
        ? "Taking turns, evenly spaced."
        : "A short gap, then a long gap."
  );
  const timingDescription = $derived(
    timing === "together"
      ? "Both downbeats happen together."
      : timing === "split"
        ? "Downbeats alternate, half a cycle apart."
        : "Downbeats happen a quarter cycle apart."
  );
  const placementOptions = [
    { value: "alpha", label: "Alpha" },
    { value: "beta", label: "Beta" },
    { value: "gamma", label: "Gamma" },
  ];
  const timingOptions = [
    { value: "together" as const, label: "Together" },
    { value: "split" as const, label: "Split" },
    { value: "quarter" as const, label: "Quarter" },
  ];
  const directionOptions = [
    { value: "same", label: "Same" },
    { value: "opposite", label: "Opposite" },
  ];

  onMount(() => {
    loop.setActivityGate(gate);
    playing = !reducedMotion();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopForPreference = () => {
      if (reducedMotion()) playing = false;
    };
    media.addEventListener("change", stopForPreference);
    const observer = new MutationObserver(stopForPreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-preference"],
    });
    return () => {
      media.removeEventListener("change", stopForPreference);
      observer.disconnect();
    };
  });
  onDestroy(() => {
    loop.dispose();
    gate.dispose();
  });
  $effect(() => {
    if (playing && active)
      loop.start((delta) => {
        elapsed += delta / 2400;
      }, 1);
    else loop.stop();
    return () => loop.stop();
  });
  function setTiming(value: TimingMode): void {
    timing = value;
    elapsed = -0.15;
  }
  function setPlacement(value: string): void {
    if (value !== placement)
      placementAngle = value === "alpha" ? 180 : value === "beta" ? 0 : 90;
  }
  function setDirection(value: string): void {
    rotations[1] = rotations[0]! * (value === "same" ? 1 : -1);
  }
</script>

<div
  class="concepts"
  role="group"
  aria-label="Placement, timing, and direction"
>
  <section class="concept" aria-label="Placement">
    <header>
      <h3>Placement</h3>
      <p>Where things are right now.</p>
    </header>
    <div class="picture-slot">
      <div
        class="picture"
        role="group"
        aria-label="Click a point to change placement"
      >
        <svg viewBox="0 0 320 300" aria-hidden="true">
          <circle class="placement-ring" cx="160" cy="150" r="88" />
          <circle class="center" cx="160" cy="150" r="3" />
          {#each placementPoints as point}
            <circle
              class="placement-target"
              cx={point.x * 3.2}
              cy={point.y * 3}
              r="3"
            />
          {/each}
          <g transform="translate(160 150)">
            <circle class="blue-dot" cx="-88" cy="0" r="19" />
            <g
              class="placement-turn"
              style:transform={`rotate(${placementAngle}deg)`}
            >
              <circle class="red-dot" cx="-88" cy="0" r="13" />
            </g>
          </g>
        </svg>
        {#each placementPoints as point}
          <button
            class="point-button"
            style:left={`${point.x}%`}
            style:top={`${point.y}%`}
            onclick={() => (placementAngle = point.angle)}
            aria-label={`Place the second dot at the ${point.name}`}
            aria-pressed={placementAngle === point.angle}
            title={`Place the second dot at the ${point.name}`}
          ></button>
        {/each}
      </div>
    </div>
    <div class="caption" aria-live="polite">
      <Crossfade key={placement}><p>{placementCopy}</p></Crossfade>
    </div>
    <div class="choices">
      <SegmentedControl
        options={placementOptions}
        value={placement}
        onchange={setPlacement}
        semantics="radiogroup"
        ariaLabel="Placement example"
        color="accent"
        density="tight"
      />
    </div>
  </section>

  <section class="concept" aria-label="Timing" use:renderGateTarget={gate}>
    <header>
      <h3>Timing</h3>
      <p>A pulse marks each downbeat.</p>
    </header>
    <div class="picture-slot">
      <div class="picture pulse-picture">
        <svg viewBox="0 0 320 300" role="img" aria-label={timingDescription}>
          {#each pulses as strength, index}
            <g class:blue={index === 0} class:red={index === 1}>
              <circle
                class="pulse-halo"
                cx={index === 0 ? 92 : 228}
                cy="150"
                r={29 + 15 * (1 - strength)}
                opacity={strength * 0.75}
              />
              <circle
                class="pulse-dot"
                cx={index === 0 ? 92 : 228}
                cy="150"
                r={20 + 4 * strength}
                opacity={0.55 + 0.45 * strength}
              />
            </g>
          {/each}
        </svg>
        <div class="pulse-transport">
          <PanelButton
            onclick={() => (playing = !playing)}
            ariaLabel={playing ? "Pause downbeats" : "Play downbeats"}
          >
            <svg class="transport-icon" viewBox="0 0 20 20" aria-hidden="true"
              >{#if playing}<path
                  d="M6 4v12M14 4v12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />{:else}<path
                  d="M6 3L17 10L6 17Z"
                  fill="currentColor"
                />{/if}</svg
            >
          </PanelButton>
        </div>
      </div>
    </div>
    <div class="caption" aria-live="polite">
      <Crossfade key={timing}><p>{timingCopy}</p></Crossfade>
    </div>
    <div class="choices">
      <SegmentedControl
        options={timingOptions}
        value={timing}
        onchange={setTiming}
        semantics="radiogroup"
        ariaLabel="Timing example"
        color="accent"
        density="tight"
      />
    </div>
  </section>

  <section class="concept" aria-label="Direction">
    <header>
      <h3>Direction</h3>
      <p>Which way things rotate.</p>
    </header>
    <div class="picture-slot">
      <div
        class="picture"
        role="group"
        aria-label="Click either arrow to flip its rotation"
      >
        <svg viewBox="0 0 320 300" aria-hidden="true">
          {#each rotations as rotation, index}
            <g
              class:blue={index === 0}
              class:red={index === 1}
              transform={`translate(${index === 0 ? 83 : 237} 150)`}
            >
              <g class="arrow-flip" style:transform={`scaleX(${rotation})`}>
                <path class="rotation-arc" d="M-35.35 35.35A50 50 0 1 1 50 0" />
                <path
                  class="arrowhead"
                  d="M35-8 Q31-8 34-4 L47 17 Q50 22 53 17 L66-4 Q69-8 65-8Z"
                />
              </g>
            </g>
          {/each}
        </svg>
        {#each rotations as rotation, index}
          <button
            class="arrow-button"
            style:left={`${(index === 0 ? 83 : 237) / 3.2}%`}
            onclick={() => (rotations[index] = -rotation)}
            aria-label={`Flip ${index === 0 ? "left" : "right"} arrow. Currently ${rotation === 1 ? "clockwise" : "counterclockwise"}.`}
            title={`Flip ${index === 0 ? "left" : "right"} arrow`}
          ></button>
        {/each}
      </div>
    </div>
    <div class="caption" aria-live="polite">
      <Crossfade key={direction}
        ><p>
          {direction === "same"
            ? "Circling the same way."
            : "Circling opposite ways."}
        </p></Crossfade
      >
    </div>
    <div class="choices">
      <SegmentedControl
        options={directionOptions}
        value={direction}
        onchange={setDirection}
        semantics="radiogroup"
        ariaLabel="Direction example"
        color="accent"
        density="tight"
      />
    </div>
  </section>
</div>

<style>
  .concepts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    height: 100%;
    min-height: 28rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-xl, 1rem);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    overflow: hidden;
  }
  .concept {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    justify-items: center;
    padding: clamp(1.25rem, 2cqw, 3rem);
    text-align: center;
  }
  .concept + .concept {
    border-inline-start: 1px solid var(--theme-stroke);
  }
  header {
    width: 100%;
  }
  h3 {
    margin: 0;
    font-size: clamp(1.5rem, 1.7cqw, 2.25rem);
    line-height: 1.2;
    letter-spacing: -0.025em;
  }
  p {
    margin: 0;
    line-height: 1.5;
    text-wrap: balance;
  }
  header p {
    margin-top: 0.65rem;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 0.9cqw, 1.25rem);
  }
  .picture-slot {
    width: 100%;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
    margin-block: clamp(0.75rem, 1.5cqw, 2rem);
  }
  .picture {
    width: min(100cqw, calc(100cqh * 320 / 300));
    aspect-ratio: 320 / 300;
    align-self: center;
    position: relative;
  }
  .picture > svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .placement-ring {
    fill: none;
    stroke: var(--theme-text-dim);
    stroke-width: 1.5;
    opacity: 0.45;
  }
  .center {
    fill: var(--theme-text-dim);
    opacity: 0.5;
  }
  .placement-target {
    fill: var(--theme-text-dim);
    opacity: 0.65;
  }
  .point-button,
  .arrow-button {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
  }
  .point-button {
    width: 44px;
    height: 44px;
  }
  .arrow-button {
    top: 50%;
    width: 46.875%;
    height: 50%;
    min-width: 44px;
    min-height: 44px;
  }
  .point-button:hover,
  .arrow-button:hover {
    outline: 1px solid var(--theme-stroke-strong, var(--theme-text-dim));
  }
  .point-button:focus-visible,
  .arrow-button:focus-visible {
    outline: 2px solid var(--theme-text);
    outline-offset: 3px;
  }
  .blue {
    color: var(--prop-blue, #3d44b8);
  }
  .red {
    color: var(--prop-red, #ed1c24);
  }
  .blue-dot {
    fill: var(--prop-blue, #3d44b8);
  }
  .red-dot {
    fill: var(--prop-red, #ed1c24);
  }
  .placement-turn,
  .arrow-flip {
    transform-origin: 0 0;
    transition: transform var(--transition-emphasis);
  }
  .pulse-dot,
  .arrowhead {
    fill: currentColor;
  }
  .pulse-halo {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .rotation-arc {
    fill: none;
    stroke: currentColor;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .pulse-transport {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
  }
  .pulse-transport :global(.panel-btn) {
    width: 44px;
    min-height: 44px;
    padding: 0;
    border-radius: 50%;
  }
  .transport-icon {
    width: 16px;
    height: 16px;
  }
  .caption {
    width: 100%;
    min-height: 3em;
    display: grid;
    align-items: center;
    margin-bottom: 1rem;
    font-size: clamp(1rem, 1cqw, 1.35rem);
  }
  .choices {
    width: min(100%, 22rem);
  }
  .concept:last-child .choices {
    width: min(100%, 16rem);
  }
  @container (max-width: 850px) and (min-width: 501px) {
    .concepts {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(3, minmax(16rem, 1fr));
      min-height: 48rem;
    }
    .concept {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto auto auto;
      column-gap: 1rem;
      padding: 1.5rem;
    }
    .concept + .concept {
      border-inline-start: 0;
      border-top: 1px solid var(--theme-stroke);
    }
    header {
      grid-column: 1;
      align-self: end;
    }
    .picture-slot {
      grid-column: 2;
      grid-row: 1 / 4;
      margin-block: 0;
    }
    .caption {
      grid-column: 1;
      margin: 0.5rem 0;
    }
    .choices {
      grid-column: 1;
      align-self: start;
    }
  }
  @container (max-width: 500px) {
    .concepts {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(3, minmax(26rem, 1fr));
      min-height: 78rem;
    }
    .concept {
      padding: 1.5rem 1rem;
    }
    .concept + .concept {
      border-inline-start: 0;
      border-top: 1px solid var(--theme-stroke);
    }
    .picture-slot {
      margin-block: 0.25rem;
    }
    .caption {
      min-height: 2em;
      margin-bottom: 0.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .placement-turn,
    .arrow-flip {
      transition: none;
    }
  }
  @media (max-height: 540px) and (min-width: 641px) {
    .concepts {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(3, minmax(14rem, 1fr));
      min-height: 42rem;
    }
    .concept {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: auto auto auto;
      padding: 1rem;
      column-gap: 1rem;
    }
    .concept + .concept {
      border-inline-start: 0;
      border-top: 1px solid var(--theme-stroke);
    }
    header,
    .caption,
    .choices {
      grid-column: 1;
    }
    .picture-slot {
      grid-column: 2;
      grid-row: 1 / 4;
      margin: 0;
    }
    .caption {
      min-height: 0;
      margin: 0.5rem 0;
    }
  }
  :global([data-motion-preference="reduce"]) .placement-turn,
  :global([data-motion-preference="reduce"]) .arrow-flip {
    transition: none;
  }
</style>
