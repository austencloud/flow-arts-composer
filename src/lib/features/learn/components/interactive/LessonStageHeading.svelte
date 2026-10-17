<script lang="ts">
  import type { Snippet } from "svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    isLessonMorphRunning,
    isLessonHeadingSplit,
  } from "../../services/lesson-open-morph.svelte";

  let {
    key,
    title,
    eyebrow,
    children,
  }: {
    key: unknown;
    title: string;
    eyebrow?: string;
    children: Snippet;
  } = $props();
</script>

<!-- The title and the lead line swap on their own. A new round keeps its
     title and changes only the lead, so the title holds still. Each line fades
     out before its replacement fades in, so two sentences never sit on top of
     each other, and the box eases to the new line's height. -->
<div class="lesson-stage-heading">
  <div class="heading-copy">
    <Crossfade
      key={`${eyebrow ?? ""}|${title}`}
      duration={DURATION.normal}
      mode="swap"
      animateHeight
    >
      <div class="title-copy">
        {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
        <!-- The course-map card's name becomes this title, and Review carries
             the title and lead line into its first section (lesson-open-morph). -->
        <h1
          use:claimedViewTransitionName={{
            name: "learn-lesson-title",
            enabled: isLessonMorphRunning() || isLessonHeadingSplit(),
          }}
        >
          {title}
        </h1>
      </div>
    </Crossfade>
    <Crossfade {key} duration={DURATION.normal} mode="swap" animateHeight>
      <div
        class="description"
        use:claimedViewTransitionName={{
          name: "learn-lesson-lead",
          enabled: isLessonHeadingSplit(),
        }}
      >
        {@render children()}
      </div>
    </Crossfade>
  </div>
</div>

<style>
  .lesson-stage-heading {
    min-width: 0;
    text-align: center;
  }

  .heading-copy,
  .title-copy {
    display: grid;
    gap: 0.35rem;
  }

  .title-copy {
    justify-items: center;
  }

  .eyebrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.75rem, 2.5vw, 2.5rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }

  .description {
    min-height: 1.65em;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.4vw, 1.25rem);
    line-height: 1.45;
  }

  .description :global(p) {
    margin: 0;
  }

  .description :global(strong) {
    color: var(--theme-text);
    font-weight: 700;
  }

  @media (max-height: 760px) {
    .heading-copy,
    .title-copy {
      gap: 0.2rem;
    }

    h1 {
      font-size: clamp(1.5rem, 3.5vh, 1.9rem);
    }

    .description {
      font-size: var(--font-size-min, 0.875rem);
      line-height: 1.3;
    }
  }

  @media (min-width: 2400px) and (min-height: 1300px) {
    .eyebrow {
      font-size: 0.9rem;
    }

    h1 {
      font-size: 3.25rem;
    }

    .description {
      font-size: 1.45rem;
    }
  }
</style>
