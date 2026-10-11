<!--
  The Guide front page's opening picture builds itself once: the empty grid,
  then the two hands at their start (blue south, red north), then the arrows,
  then the hands travel along them and the letter A appears. It is the first
  step of the Guide's teaching word AABB, drawn by the one shared builder.

  One renderer owns the whole build (motionStartData/motionProgress), so the
  grid never redraws and progress 1 is pixel-identical to the finished
  pictograph. It starts once the picture is drawn and on screen (on a phone
  it sits below the buttons). Reduced motion shows the finished picture
  straight away.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { aabbWordSteps } from "../level-1/_data/aabb-word";

  const [startStep, firstA] = aabbWordSteps(
    "guide-hub-hero",
    Orientation.IN,
    Orientation.IN
  );
  const startData = startStep as unknown as PictographData;

  type Phase = "grid" | "hands" | "arrows" | "travel" | "done";
  // Pauses between beats, long enough to read each one.
  const BEAT_PAUSE_MS = 650;

  let mounted = $state(false);
  let phase = $state<Phase>("grid");
  let progress = $state(0);
  let arrowOpacity = $state(0);
  let started = false;
  let ready = false;
  let onScreen = false;
  let host: HTMLDivElement;
  let timer = 0;
  let frame = 0;

  const travelling = $derived(phase !== "done");

  function finish() {
    phase = "done";
    progress = 1;
    arrowOpacity = 1;
  }

  function after(ms: number, next: () => void) {
    timer = window.setTimeout(next, ms);
  }

  function animate(ms: number, step: (t: number) => void, done: () => void) {
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / ms);
      step(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else done();
    };
    frame = requestAnimationFrame(tick);
  }

  function play() {
    if (started || !ready || !onScreen) return;
    started = true;
    if (reducedMotion()) return finish();
    after(BEAT_PAUSE_MS, () => {
      phase = "hands";
      after(BEAT_PAUSE_MS, () => {
        phase = "arrows";
        animate(
          DURATION.emphasis,
          (t) => (arrowOpacity = t),
          () =>
            after(BEAT_PAUSE_MS, () => {
              phase = "travel";
              animate(
                DURATION.scene,
                (t) => (progress = cubicInOut(t)),
                finish
              );
            })
        );
      });
    });
  }

  onMount(() => {
    if (reducedMotion()) finish();
    mounted = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        onScreen = true;
        observer.disconnect();
        play();
      },
      { threshold: 0.6 }
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  });
</script>

<div class="hero-build" bind:this={host}>
  {#if mounted && firstA}
    <PictographContainer
      pictographData={firstA}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={PropType.HAND}
      rightPropTypeOverride={PropType.HAND}
      showGrid={true}
      showTKA={phase === "done"}
      showPlacements={false}
      showReversals={false}
      showTnD={false}
      showElemental={false}
      showNonRadialPoints={false}
      showHandPoints={true}
      stepNumberOverride={false}
      showProps={phase !== "grid"}
      animateContent={true}
      motionStartData={travelling ? startData : null}
      motionProgress={travelling ? progress : null}
      {arrowOpacity}
      disableTransitions={true}
      onReady={() => {
        ready = true;
        play();
      }}
    />
  {/if}
</div>

<style>
  .hero-build {
    width: 100%;
    aspect-ratio: 1;
  }
</style>
