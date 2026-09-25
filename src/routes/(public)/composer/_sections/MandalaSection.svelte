<!--
  MandalaSection: TEST-page showcase (marketing preview, not shipping code).

  The curated showcase: renders CHOSEN_MANDALAS (baked by the Choose button on
  /test/mandala-pick) with the real SequenceMandala. Tiles render STATIC by
  default — a dozen simultaneously-breathing mandalas was a standing rAF tax on
  the whole page — and each tile is a button: click it and THAT mandala comes
  alive (undulating as it turns), click again or click another to move the one
  live slot. At most one animates at a time, so the cost stays flat.
  No auth. Empty until picks are chosen; points at the picker until then.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { CHOSEN_MANDALAS } from "./chosen-mandalas";

  let reducedMotion = $state(false);
  let sizes = $state<number[]>([]);
  // The single live slot: index of the one mandala currently animating.
  let liveIndex = $state<number | null>(null);

  onMount(() => {
    if (!browser) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    const onMq = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  });
</script>

<section class="depth-showcase">
  <div class="beat">
    <div class="beat-copy">
      <h3 class="beat-heading">Shapes only the Kinetic Alphabet can make</h3>
      <p class="beat-caption">
        Hand-picked from the collection. Non-radial orientations and reversed
        hand paths reach shapes older systems never could. Tap one to watch it
        breathe.
      </p>
    </div>

    {#if CHOSEN_MANDALAS.length}
      <div class="tile-grid">
        {#each CHOSEN_MANDALAS as m, i (m.id)}
          <div
            class="stage"
            class:live={liveIndex === i}
            bind:clientWidth={sizes[i]}
          >
            <button
              type="button"
              class="stage-activation"
              onclick={() => (liveIndex = liveIndex === i ? null : i)}
              aria-pressed={liveIndex === i}
              aria-label={liveIndex === i
                ? "Pause this mandala"
                : "Play this mandala"}
            ></button>
            <LazyMount
              loader={() => import("$lib/shared/mandala/components/SequenceMandala.svelte")}
              active={browser && sizes[i] > 0}
              props={{
                sequence: { steps: m.steps },
                size: sizes[i] || 300,
                show: m.variant,
                style: "stroke",
                leftPropType: m.leftPropType,
                rightPropType: m.rightPropType,
                pathShape: "arc",
                strokeWidth: 2.5,
                animate: liveIndex === i && !reducedMotion,
                animateEasing: "breathe",
                animateRotation: reducedMotion ? 0 : 18,
                animatePeriod: 6 + i * 0.3,
                animateMin: 40,
                animateMax: 240,
              }}
            >
              {#snippet error(_error, retry)}
                <div class="mandala-load-error" role="alert">
                  <span>This mandala did not load.</span>
                  <button type="button" onclick={retry}>Try again</button>
                </div>
              {/snippet}
            </LazyMount>
            <!-- Corner affordance: the tile IS a button — say so. -->
            <span class="stage-toggle" aria-hidden="true">
              <i class={liveIndex === i ? "fas fa-pause" : "fas fa-play"}></i>
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="collection-status">
        No picks yet. Choose them at <a href="/test/mandala-pick">/test/mandala-pick</a>.
      </div>
    {/if}
  </div>
</section>

<style>
  .depth-showcase {
    display: flex;
    flex-direction: column;
    gap: clamp(2rem, 1.4rem + 2.4vw, 3.4rem);
    padding: clamp(1rem, 0.6rem + 2vw, 2.5rem);
    color: oklch(0.9 0.02 270);
  }

  .beat {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  .beat-copy {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .beat-heading {
    margin: 0;
    font-size: clamp(1.25rem, 1.1rem + 0.8vw, 1.75rem);
    font-weight: 720;
    letter-spacing: -0.01em;
    color: oklch(0.95 0.02 270);
  }
  .beat-caption {
    margin: 0;
    font-size: clamp(0.95rem, 0.9rem + 0.2vw, 1.1rem);
    line-height: 1.55;
    color: oklch(0.68 0.02 270);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: clamp(0.9rem, 0.6rem + 1vw, 1.4rem);
  }
  .stage {
    position: relative;
    aspect-ratio: 1;
    border-radius: 16px;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    background: oklch(0.16 0.018 270 / 0.55);
    border: 1px solid oklch(0.5 0.03 270 / 0.18);
    box-shadow: 0 12px 30px oklch(0.1 0.02 270 / 0.35);
    transition: border-color 0.18s ease;
  }
  .stage-activation {
    position: absolute;
    inset: 0;
    z-index: 1;
    padding: 0;
    cursor: pointer;
    border: 0;
    background: transparent;
  }
  .stage:hover {
    border-color: oklch(0.6 0.06 275 / 0.45);
  }
  .stage:has(.stage-activation:focus-visible) {
    outline: 2px solid oklch(0.78 0.13 275);
    outline-offset: 2px;
  }
  .stage.live {
    border-color: oklch(0.7 0.1 275 / 0.55);
  }

  /* Corner play/pause glyph — the visible "this is clickable" signal. Faint at
     rest, solid on hover/live. Sized to the touch-target floor. */
  .stage-toggle {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 2;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.85rem;
    color: oklch(0.9 0.02 270 / 0.7);
    background: oklch(0.14 0.018 270 / 0.65);
    border: 1px solid oklch(0.5 0.03 270 / 0.3);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    opacity: 0.55;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .mandala-load-error {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem;
    color: oklch(0.9 0.02 270);
    text-align: center;
    background: oklch(0.13 0.018 270 / 0.94);
  }
  .mandala-load-error button {
    min-height: 44px;
    padding-inline: 0.9rem;
    color: inherit;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    border: 1px solid oklch(0.62 0.08 275 / 0.55);
    border-radius: 9px;
    background: oklch(0.28 0.05 275 / 0.85);
  }
  .stage:hover .stage-toggle,
  .stage.live .stage-toggle {
    opacity: 1;
  }
  .stage-toggle .fa-play {
    /* Optical centering: a play triangle reads centered a hair right of true. */
    margin-left: 2px;
  }

  .collection-status {
    padding: 2.5rem 0;
    text-align: center;
    font-size: 0.95rem;
    color: oklch(0.66 0.02 270);
  }
  .collection-status a {
    color: oklch(0.78 0.13 275);
  }
</style>
