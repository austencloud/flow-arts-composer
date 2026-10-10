<!--
  The stable visual frame shared by adjacent Learn lessons.

  The shell keeps the heading, teaching artifact, and action in the same three
  places while the lesson changes underneath them. The named regions let the
  browser carry those places across a concept handoff instead of replacing the
  whole screen in one frame.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";

  let {
    heading,
    artifact,
    controls,
    artifactLayout = "square",
  }: {
    heading: Snippet;
    artifact: Snippet;
    controls?: Snippet;
    /**
     * Most lesson artifacts are one persistent square. Comparison/playground
     * states need the same stage position without being squeezed into that
     * square on a short landscape screen.
     */
    artifactLayout?: "square" | "wide" | "workshop";
  } = $props();
</script>

<div class="lesson-stage-frame" class:workshop={artifactLayout === "workshop"}>
  <div
    class="stage-heading"
    use:claimedViewTransitionName={{ name: "learn-lesson-heading" }}
  >
    {@render heading()}
  </div>

  <div class="stage-artifact">
    <div
      class="artifact-inner"
      class:wide={artifactLayout !== "square"}
      use:claimedViewTransitionName={{ name: "learn-grid-stage" }}
    >
      {@render artifact()}
    </div>
  </div>

  {#if controls}<div
      class="stage-controls"
      use:claimedViewTransitionName={{ name: "learn-lesson-controls" }}
    >
      {@render controls()}
    </div>{/if}
</div>

<style>
  .lesson-stage-frame {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(5.5rem, auto) minmax(0, 1fr) auto;
    justify-items: center;
    gap: clamp(0.5rem, 1.4vh, 1.25rem);
    padding: 4.5rem clamp(1rem, 3vw, 3rem) clamp(0.75rem, 2vh, 1.5rem);
  }

  .stage-heading {
    width: min(100%, 54rem);
    min-width: 0;
    align-self: end;
  }

  .stage-artifact {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }

  .artifact-inner {
    width: min(100cqw, 100cqh, var(--lesson-artifact-max, 42rem));
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
  }

  .artifact-inner.wide {
    width: min(100cqw, var(--lesson-artifact-wide-max, 54rem));
    height: 100cqh;
    aspect-ratio: auto;
  }

  .stage-controls {
    min-height: 5.75rem;
    display: grid;
    place-items: center;
    align-self: start;
  }

  /* Construction lessons have controls and feedback with natural height. The
     concept shell owns scrolling; the artifact must not shrink to fit it. */
  .lesson-stage-frame.workshop {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: auto;
    min-height: 100%;
    gap: clamp(1rem, 1.5vh, 1.5rem);
    --lesson-artifact-wide-max: var(--lesson-workshop-max, 90rem);
  }

  .workshop .stage-heading {
    align-self: center;
  }

  .workshop .stage-artifact {
    flex-shrink: 0;
    container-type: inline-size;
    height: auto;
  }

  .workshop .artifact-inner.wide {
    height: auto;
  }

  .workshop .stage-controls {
    flex-shrink: 0;
    width: min(100%, var(--lesson-workshop-max, 90rem));
    min-height: 0;
    align-self: center;
  }

  @media (max-height: 760px) {
    .lesson-stage-frame {
      grid-template-rows: minmax(4.25rem, auto) minmax(0, 1fr) auto;
      gap: 0.4rem;
      padding-top: 3.75rem;
      padding-bottom: 0.5rem;
    }

    .stage-controls {
      min-height: 5rem;
    }
  }

  @media (max-width: 640px) {
    .lesson-stage-frame {
      grid-template-rows: minmax(5rem, auto) minmax(0, 1fr) auto;
      padding-inline: 0.75rem;
    }

    .workshop .stage-controls {
      position: sticky;
      bottom: 0;
      z-index: 2;
      padding-block: 0.75rem;
      background: var(--theme-panel-bg);
      backdrop-filter: blur(16px);
    }
  }

  @media (min-width: 2400px) and (min-height: 1300px) {
    .lesson-stage-frame {
      grid-template-rows: minmax(7rem, auto) minmax(0, 1fr) auto;
      --lesson-artifact-max: 56rem;
      --lesson-artifact-wide-max: 90rem;
    }

    .stage-controls {
      min-height: 7.5rem;
    }
  }
</style>
