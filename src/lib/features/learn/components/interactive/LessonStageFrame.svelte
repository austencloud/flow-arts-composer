<!--
  The stable visual frame shared by adjacent Learn lessons.

  The shell keeps the heading, teaching artifact, and action in the same three
  places while the lesson changes underneath them. The named regions let the
  browser carry those places across a concept handoff instead of replacing the
  whole screen in one frame.

  A workshop lesson can set `--lesson-workshop-max` for its artifact's width
  and `--lesson-controls-max` for its controls' span, which defaults to the
  artifact's.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    isLessonContinueRunning,
    isLessonMorphRunning,
    isLessonHeadingSplit,
  } from "../../services/lesson-open-morph.svelte";

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

  // While a course-map card grows into this lesson, the heading and controls
  // ride inside the growing lesson surface instead of fading in at their final
  // places over the map (lesson-open-morph).
  const ownRegions = $derived(!isLessonMorphRunning());
  // Continue and Previous fly the live board themselves, so the board region
  // sits that morph out instead of moving twice.
  const ownBoard = $derived(!isLessonContinueRunning());
  // Review and Steps, and the Hand Motions quiz and board, carry the heading's
  // parts on their own, so the heading block sits those swaps out.
  const ownHeading = $derived(ownRegions && !isLessonHeadingSplit());
</script>

<div class="lesson-stage-frame" class:workshop={artifactLayout === "workshop"}>
  <div
    class="stage-heading"
    use:claimedViewTransitionName={{
      name: "learn-lesson-heading",
      enabled: ownHeading,
    }}
  >
    {@render heading()}
  </div>

  <div class="stage-artifact">
    <div
      class="artifact-inner"
      class:wide={artifactLayout !== "square"}
      use:claimedViewTransitionName={{
        name: "learn-grid-stage",
        enabled: ownBoard,
      }}
    >
      {@render artifact()}
    </div>
  </div>

  {#if controls}<div
      class="stage-controls"
      use:claimedViewTransitionName={{
        name: "learn-lesson-controls",
        enabled: ownRegions,
      }}
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
    width: min(
      100%,
      var(--lesson-controls-max, var(--lesson-workshop-max, 90rem))
    );
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

  /* Phone: the whole lesson fits the screen with no scrolling. The stage
     title rides in the lesson's 48px top strip, between Back and Read
     (ConceptDetailView), with the lead line small under it; the controls
     are one short row at the foot; the artifact takes everything between
     and sizes to it. Workshop lessons fill the same way instead of growing
     to their natural height. */
  @media (max-width: 639.98px), (max-width: 767.98px) and (max-height: 700px) {
    .lesson-stage-frame,
    .lesson-stage-frame.workshop {
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 0.375rem;
      height: 100%;
      min-height: 0;
      padding: 0 0.75rem max(0.375rem, env(safe-area-inset-bottom));
    }

    .lesson-stage-frame.workshop {
      justify-content: flex-start;
    }

    .stage-heading {
      align-self: start;
    }

    .stage-heading :global(.title-copy) {
      min-height: 3rem;
      align-content: center;
    }

    /* Clear of Back on the left and Read and Review on the right, the
       same on both sides so the title stays centred. */
    .stage-heading :global(h1) {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      padding-inline: 4.75rem;
      font-size: 1.125rem;
      line-height: 1.15;
    }

    .stage-heading :global(.description),
    .stage-heading :global(.description p) {
      min-height: 0;
      font-size: var(--font-size-min, 0.875rem);
      line-height: 1.3;
    }

    /* A lead with its own measure sits centred under the title. */
    .stage-heading :global(.description p) {
      margin-inline: auto;
    }

    .workshop .stage-artifact {
      flex: 1 1 0;
      height: auto;
      min-height: 0;
      container-type: size;
    }

    .workshop .artifact-inner.wide {
      height: 100cqh;
    }

    .stage-controls,
    .workshop .stage-controls {
      width: 100%;
      min-height: 0;
      align-self: stretch;
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
