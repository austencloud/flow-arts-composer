<script lang="ts">
  import { onDestroy } from "svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    pictograph,
    loading = false,
    accent = "var(--theme-accent)",
    showTKA = true,
    autoplay = true,
  }: {
    pictograph: PictographData | null;
    loading?: boolean;
    accent?: string;
    showTKA?: boolean;
    autoplay?: boolean;
  } = $props();

  let progress = $state<number | null>(null);
  let animationFrame: number | null = null;
  let lastPictographId = $state<string | null>(null);

  const motionStartData = $derived.by(() => {
    if (!pictograph) return null;
    try {
      return startPlacementDeriver.deriveFromFirstStep(
        pictograph as unknown as StepData
      );
    } catch {
      return null;
    }
  });

  function stopAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function replay() {
    if (!pictograph || !motionStartData) return;
    stopAnimation();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress = null;
      return;
    }

    progress = 0;
    const startedAt = performance.now();
    const duration = 1050;

    const draw = (now: number) => {
      const linear = Math.min(1, (now - startedAt) / duration);
      progress = 1 - Math.pow(1 - linear, 3);
      if (linear < 1) {
        animationFrame = requestAnimationFrame(draw);
      } else {
        animationFrame = null;
        progress = 1;
      }
    };

    animationFrame = requestAnimationFrame(draw);
  }

  $effect(() => {
    const currentId = pictograph?.id ?? null;
    if (!autoplay || !currentId || currentId === lastPictographId) return;
    lastPictographId = currentId;
    queueMicrotask(replay);
  });

  onDestroy(stopAnimation);
</script>

<div class="lesson-pictograph" style:--stage-accent={accent}>
  <div class="render-frame">
    {#if loading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={34} strokeWidth={3} />
        <span>Loading the real pictograph…</span>
      </div>
    {:else if pictograph}
      <PictographContainer
        pictographData={pictograph}
        disableTransitions
        {showTKA}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showPlacements={false}
        showNonRadialPoints={false}
        showHandPoints
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        {motionStartData}
        motionProgress={progress}
        arrowOpacity={progress === null ? 1 : progress}
      />
    {:else}
      <div class="error-state" role="status">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>Pictograph unavailable</span>
      </div>
    {/if}
  </div>

  {#if pictograph && motionStartData}
    <button class="replay-button" type="button" onclick={replay}>
      <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
      Replay the motion
    </button>
  {/if}
</div>

<style>
  .lesson-pictograph {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
  }

  .render-frame {
    width: min(100%, 30rem);
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--stage-accent) 46%, var(--theme-stroke));
    border-radius: 1.25rem;
    background: var(--theme-panel-bg);
    box-shadow:
      0 1.5rem 4rem var(--theme-shadow),
      0 0 3rem color-mix(in srgb, var(--stage-accent) 12%, transparent);
  }

  .loading-state,
  .error-state {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    color: var(--theme-text-dim);
    font-size: 0.9rem;
  }

  .error-state i {
    color: var(--semantic-error);
    font-size: 1.5rem;
  }

  .replay-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.65rem 1rem;
    border: 1px solid
      color-mix(in srgb, var(--stage-accent) 48%, var(--theme-stroke));
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--stage-accent) 12%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .replay-button:hover {
    background: color-mix(
      in srgb,
      var(--stage-accent) 20%,
      var(--theme-card-bg)
    );
  }

  .replay-button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--stage-accent) 72%, white);
    outline-offset: 3px;
  }

  @container (min-width: 1100px) {
    .render-frame {
      width: min(100%, 34rem);
    }
  }

  @media (max-height: 560px) and (min-width: 700px) {
    .lesson-pictograph {
      gap: 0.4rem;
    }

    .render-frame {
      width: min(100%, 17rem);
    }

    .replay-button {
      min-height: 2.75rem;
      padding-block: 0.45rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .replay-button {
      transition: none;
    }
  }
</style>
