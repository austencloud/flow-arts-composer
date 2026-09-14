<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { AnimationLoop } from "$lib/shared/animation-engine/services/animation-loop";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { downbeatPulse } from "./timing-intro-phase";
  import type { TimingLessonTopic } from "./timing-lesson-stage";
  import PlacementComparison from "./PlacementComparison.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

  let { topic, active = true }: { topic: TimingLessonTopic; active?: boolean } =
    $props();
  let elapsed = $state(0);
  let quiet = $state(true);
  let reversed = $state([false, false]);
  let selectedRhythm = $state("Together");

  function selectRhythm(label: string): void {
    if (label === selectedRhythm) return;
    selectedRhythm = label;
    elapsed = 0;
  }
  const rhythms = [
    { label: "Together", offset: 0, caption: "Downbeats land together." },
    { label: "Split", offset: 0.5, caption: "Downbeats alternate evenly." },
    {
      label: "Quarter",
      offset: 0.25,
      caption: "A short gap, then a long gap.",
    },
  ];
  const loop = new AnimationLoop();
  const gate = createRenderActivityGate({
    name: "timing-examples",
    rootMargin: "0px",
  });
  onMount(() => {
    loop.setActivityGate(gate);
    const updatePreference = () => {
      quiet = reducedMotion();
    };
    updatePreference();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", updatePreference);
    const observer = new MutationObserver(updatePreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-preference"],
    });
    return () => {
      media.removeEventListener("change", updatePreference);
      observer.disconnect();
    };
  });
  onDestroy(() => {
    loop.dispose();
    gate.dispose();
  });
  $effect(() => {
    if (active && topic === "timing" && !quiet)
      loop.start((delta) => {
        elapsed += delta / 1400;
      }, 1);
    else loop.stop();
    return () => loop.stop();
  });
</script>

<div
  class="examples-stage"
  style:--lesson-left={DEFAULT_VIEWER_CUSTOM_COLORS.left}
  style:--lesson-right={DEFAULT_VIEWER_CUSTOM_COLORS.right}
  use:renderGateTarget={gate}
>
  <Crossfade key={topic} fill>
    <div class="examples-scroll">
      <div class="teaching-band">
        {#if topic === "placement"}
          <PlacementComparison />
        {:else if topic === "timing"}
          <div class="examples" role="group" aria-label="Timing examples">
            {#each rhythms as rhythm}
              <section
                class="example timing-example"
                class:selected={selectedRhythm === rhythm.label}
                aria-label={`${rhythm.label} timing`}
              >
                <PanelButton
                  fullWidth
                  ariaLabel={`${rhythm.label} timing: ${rhythm.caption}`}
                  ariaPressed={selectedRhythm === rhythm.label}
                  onclick={() => selectRhythm(rhythm.label)}
                >
                  <div class="pulse-picture">
                    <svg
                      viewBox="0 0 260 156"
                      role="img"
                      aria-label={rhythm.caption}
                    >
                      {#each [0, rhythm.offset] as phase, index}
                        {@const strength =
                          quiet || selectedRhythm !== rhythm.label
                            ? 0
                            : downbeatPulse(elapsed, phase)}
                        <g class:blue={index === 0} class:red={index === 1}>
                          <circle
                            class="pulse-ring"
                            cx={index === 0 ? 70 : 190}
                            cy="78"
                            r={34 + 12 * (1 - strength)}
                            opacity={0.15 + strength * 0.55}
                          />
                          <circle
                            fill="currentColor"
                            cx={index === 0 ? 70 : 190}
                            cy="78"
                            r={23 + 5 * strength}
                            opacity={0.5 + 0.5 * strength}
                          />
                        </g>
                      {/each}
                    </svg>
                  </div>
                  <div class="caption">
                    <h2>{rhythm.label}</h2>
                    <p>{rhythm.caption}</p>
                  </div>
                </PanelButton>
              </section>
            {/each}
          </div>
        {:else}
          <div
            class="examples directions"
            role="group"
            aria-label="Direction examples"
          >
            {#each ["Same", "Opposite"] as label, example}
              <section class="example" aria-label={`${label} direction`}>
                <div class="direction-picture">
                  <PanelButton
                    fullWidth
                    onclick={() => (reversed[example] = !reversed[example])}
                    ariaLabel={`Reverse both arrows in ${label.toLowerCase()} direction`}
                  >
                    <svg viewBox="0 0 320 190" aria-hidden="true">
                      {#each [0, 1] as index}
                        {@const rotation =
                          (reversed[example] ? -1 : 1) *
                          (example === 1 && index === 1 ? -1 : 1)}
                        <g
                          class:blue={index === 0}
                          class:red={index === 1}
                          transform={`translate(${index === 0 ? 79 : 241} 98)`}
                        >
                          <g
                            class="turn"
                            style:transform={`scaleX(${rotation})`}
                          >
                            <path class="arc" d="M-33 33 A47 47 0 1 1 47 0" />
                            <path
                              fill="currentColor"
                              d="M28-7 Q25-7 27-3 L43 20 Q47 25 51 20 L67-3 Q69-7 66-7Z"
                            />
                          </g>
                        </g>
                      {/each}
                    </svg>
                    <span class="reverse-label"
                      ><i class="fa-solid fa-repeat" aria-hidden="true"
                      ></i>Reverse both</span
                    >
                  </PanelButton>
                </div>
                <div class="caption">
                  <h2>{label}</h2>
                  <p>
                    {example === 0
                      ? "Circling the same way."
                      : "Circling opposite ways."}
                  </p>
                </div>
              </section>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </Crossfade>
</div>

<style>
  .examples-stage {
    width: 100%;
    height: 100%;
    container: examples / size;
    color: var(--theme-text);
  }
  .examples-scroll {
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    display: grid;
    align-items: center;
  }
  .teaching-band {
    width: min(100%, 144rem);
    margin-inline: auto;
    padding: 0.5rem 0.25rem;
  }
  .examples {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(1rem, 3cqw, 3rem);
  }
  .directions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: 68rem;
    margin-inline: auto;
    gap: clamp(1.5rem, 5cqw, 5rem);
  }
  .example {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }
  .pulse-picture,
  .direction-picture {
    width: 100%;
    max-width: 30rem;
  }
  .pulse-picture {
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    padding: 0.75rem;
  }
  .timing-example :global(.panel-btn) {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
    padding: 1rem;
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    transform: scale(0.94);
    transition:
      transform var(--transition-emphasis),
      box-shadow var(--transition-emphasis),
      border-color var(--transition-emphasis),
      background-color var(--transition-emphasis);
  }
  .timing-example.selected :global(.panel-btn) {
    transform: translateY(-0.3rem) scale(1);
    border-color: var(--theme-accent);
    box-shadow: var(--shadow-elevated);
  }
  .timing-example .pulse-picture {
    border: 0;
    background: none;
  }
  svg {
    width: 100%;
    display: block;
    overflow: visible;
  }
  .direction-picture :global(.panel-btn) {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border-radius: 1rem;
    background: var(--theme-panel-bg);
  }
  .caption {
    text-align: center;
  }
  h2 {
    margin: 0;
    font-size: clamp(1.4rem, 1.8cqw, 2.25rem);
    line-height: 1.2;
  }
  p {
    margin: 0.65rem 0 0;
    font-weight: 400;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.15cqw, 1.25rem);
    line-height: 1.45;
    text-wrap: balance;
  }
  .blue {
    color: var(--lesson-left);
  }
  .red {
    color: var(--lesson-right);
  }
  .pulse-ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .arc {
    fill: none;
    stroke: currentColor;
    stroke-width: 11;
    stroke-linecap: round;
  }
  .turn {
    transform-origin: 0 0;
    transition: transform var(--transition-emphasis);
  }
  .reverse-label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.95rem;
  }
  @container examples (max-width: 650px) {
    .examples {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .example {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 0.75rem;
    }
    .timing-example {
      display: block;
    }
    .timing-example :global(.panel-btn) {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 0.75rem;
      padding: 0.5rem;
    }
    .timing-example svg {
      height: 4rem;
    }
    .timing-example h2 {
      font-size: 1.125rem;
    }
    .timing-example p {
      font-size: 0.875rem;
    }
    .pulse-picture {
      padding: 0.25rem;
    }
    .direction-picture :global(.panel-btn) {
      padding: 0.5rem;
    }
    .reverse-label {
      font-size: 0.875rem;
    }
    .teaching-band {
      padding-block: 0.375rem;
    }
    h2 {
      font-size: 1.25rem;
    }
    p {
      margin-top: 0.4rem;
      line-height: 1.35;
    }
  }
  @media (max-height: 540px) and (min-width: 651px) {
    .example {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 0.75rem;
    }
    .timing-example {
      display: block;
    }
    .timing-example :global(.panel-btn) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.75rem;
      padding: 0.75rem;
    }
    h2 {
      font-size: 1.25rem;
    }
    p {
      margin-top: 0.4rem;
      line-height: 1.35;
    }
    .direction-picture :global(.panel-btn) {
      padding: 0.5rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .turn,
    .timing-example :global(.panel-btn) {
      transition: none;
    }
  }
  @media (min-width: 2400px) {
    .directions {
      max-width: 112rem;
    }
    .pulse-picture,
    .direction-picture {
      max-width: 42rem;
    }
    p {
      font-size: 1.5rem;
    }
    .reverse-label {
      font-size: 1.25rem;
    }
  }
  :global([data-motion-preference="reduce"]) .turn {
    transition: none;
  }
  :global([data-motion-preference="reduce"])
    .timing-example
    :global(.panel-btn) {
    transition: none;
  }
</style>
