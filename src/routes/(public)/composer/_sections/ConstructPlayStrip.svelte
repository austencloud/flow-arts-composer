<!--
  ConstructPlayStrip

  The step carousel beside the full-card player in the guided Construct demo.
  It shows the start and every step as the same cells the build grid uses, so
  highlighting and click-to-jump behave the same. It keeps the playing step in
  view and lays out as a column or a row according to the shape of the card
  (the `play-shell` container in ConstructSection).
-->
<script lang="ts">
  import StartTile from "#lib/features/create/shared/workspace-panel/sequence-display/components/StartTile.svelte";
  import StepCell from "#lib/features/create/shared/workspace-panel/sequence-display/components/StepCell.svelte";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";

  let {
    start,
    steps,
    selectedStepNumber = null,
    onStepClick,
    onStartClick,
    leftPropType,
    rightPropType,
    leftColor,
    rightColor,
    follow = true,
  }: {
    start: StepData;
    steps: StepData[];
    /** 0 is the start tile; null selects nothing. */
    selectedStepNumber?: number | null;
    onStepClick: (stepNumber: number) => void;
    onStartClick: () => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    leftColor?: string;
    rightColor?: string;
    /** False holds the strip still: while the tiles fly in from the build, a
        scroll under them would carry their landing spots away. Turning it
        back on catches up with the playing step. */
    follow?: boolean;
  } = $props();

  /** A person scrolling the strip gets it to themselves for this long before
      following the playing step takes over again. */
  const BROWSE_HOLD_MS = 4000;

  let strip = $state<HTMLElement | null>(null);
  let followResumesAt = 0;

  function holdFollow() {
    followResumesAt = performance.now() + BROWSE_HOLD_MS;
  }

  // Only the strip's own scroll position moves. scrollIntoView would also
  // scroll the page, which belongs to the visitor while this plays.
  $effect(() => {
    const active = selectedStepNumber;
    if (
      !follow ||
      !strip ||
      active === null ||
      performance.now() < followResumesAt
    ) {
      return;
    }
    const tile = strip.querySelector<HTMLElement>(`[data-step="${active}"]`);
    if (!tile) return;
    strip.scrollTo({
      left: tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2,
      top: tile.offsetTop - (strip.clientHeight - tile.offsetHeight) / 2,
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  });

  $effect(() => {
    if (!strip) return;
    const scrollbarPress = (event: PointerEvent) => {
      if (event.target === strip) holdFollow();
    };
    strip.addEventListener("wheel", holdFollow, { passive: true });
    strip.addEventListener("touchmove", holdFollow, { passive: true });
    strip.addEventListener("pointerdown", scrollbarPress);
    return () => {
      strip?.removeEventListener("wheel", holdFollow);
      strip?.removeEventListener("touchmove", holdFollow);
      strip?.removeEventListener("pointerdown", scrollbarPress);
    };
  });
</script>

<div class="play-strip" role="group" aria-label="Sequence steps" bind:this={strip}>
  <div class="tile" data-step="0">
    <StartTile
      startPlacement={start}
      {onStartClick}
      isSelected={selectedStepNumber === 0}
      leftPropTypeOverride={leftPropType}
      rightPropTypeOverride={rightPropType}
      leftColorOverride={leftColor}
      rightColorOverride={rightColor}
    />
  </div>
  {#each steps as step, index (step.stepNumber)}
    <div class="tile" data-step={step.stepNumber}>
      <StepCell
        {step}
        {index}
        onClick={() => onStepClick(step.stepNumber)}
        isSelected={selectedStepNumber === step.stepNumber}
        autoFocusOnSelection={false}
        leftPropTypeOverride={leftPropType}
        rightPropTypeOverride={rightPropType}
        leftColorOverride={leftColor}
        rightColorOverride={rightColor}
      />
    </div>
  {/each}
</div>

<style>
  /* The padding is room for the selected tile, which scales up past its box. */
  .play-strip {
    position: relative;
    flex: 1;
    display: flex;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem;
    box-sizing: border-box;
    overflow: auto hidden;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke, rgba(255, 255, 255, 0.2)) transparent;
    transition: scrollbar-color var(--duration-normal) var(--ease-out);
  }

  /* While the tiles fly in from the build, the strip is live under them and
     its scrollbar would stand alone before any tile lands. It shows once they
     have, in the same space, so nothing shifts. */
  :global(html.construct-play-morph) .play-strip {
    scrollbar-color: transparent transparent;
  }

  .tile {
    flex: 0 0 auto;
    align-self: flex-start;
    width: var(--play-tile, 6rem);
    aspect-ratio: 1;
    scroll-snap-align: center;
  }

  /* Auto margins center a short sequence, and unlike centering the flex line
     they collapse to nothing once the tiles overflow, so the first tile can
     always be scrolled to. */
  .tile:first-child {
    margin-inline-start: auto;
  }

  .tile:last-child {
    margin-inline-end: auto;
  }

  @container play-shell (orientation: landscape) {
    .play-strip {
      flex-direction: column;
      overflow: hidden auto;
      scroll-snap-type: y proximity;
    }

    .tile:first-child {
      margin-inline-start: 0;
      margin-block-start: auto;
    }

    .tile:last-child {
      margin-inline-end: 0;
      margin-block-end: auto;
    }
  }
</style>
