<script lang="ts">
  /**
   * LoopScene
   *
   * Mirrors: LOOP. You add steps until they end with your start, turned,
   * then Make the LOOP repeats them; Watch it made shows copies of your steps
   * lift, turn and land as the next row (LoopCard). Here the explainer's two
   * steps play one after the other, then their copies fly a quarter turn
   * round into the second row.
   *
   * Finished picture: both rows, your two steps and the two that repeat them.
   */
  import { EASE_OUT } from "#lib/shared/transitions/motion.js";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { LOOP_PART_STEPS, loopLayout } from "./method-preview-compositions";
  import {
    LOOP_PREVIEW_STEPS,
    LOOP_PREVIEW_TIMING,
    LOOP_PREVIEW_TURN,
    loopPoseBefore,
  } from "./method-preview-loop";
  import {
    PREVIEW_MOVE_MS,
    playTravel,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  let root = $state<HTMLElement | null>(null);
  /**
   * Each step's move, 0 to 1. Null draws the finished step still, until its
   * first move; after that it rests at 1, as Construct's steps do.
   */
  let progress = $state.raw<(number | null)[]>(
    LOOP_PREVIEW_STEPS.map(() => null)
  );
  let phase = $state<"rest" | "building">("rest");
  /** The copies mount once the finished picture has drawn. */
  let copiesWanted = $state(false);
  const readyCells = new SvelteSet<number>();
  /** Animations a turn started, so settle can end them. */
  let animations: Animation[] = [];

  const cells = $derived(loopLayout(shape, width, height));

  $effect(() => {
    if (cells.length === 0) return;
    if (!cells.every((_, index) => readyCells.has(index))) return;
    untrack(() => {
      onready();
      copiesWanted = true;
    });
  });

  function setProgress(index: number, value: number): void {
    progress = progress.map((current, cell) =>
      cell === index ? value : current
    );
  }

  function track(
    element: Element | undefined,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): void {
    if (!element || typeof element.animate !== "function") return;
    animations.push(
      element.animate(keyframes, { fill: "forwards", ...options })
    );
  }

  function settle(): void {
    for (const animation of animations) animation.cancel();
    animations = [];
    progress = progress.map((value) => (value === null ? null : 1));
    phase = "rest";
  }

  async function play(run: SceneRun): Promise<void> {
    const host = root;
    if (!host || cells.length === 0) return;
    const places = cells;
    const steps = [...host.querySelectorAll(".step")];
    const copies = [...host.querySelectorAll(".copy")];
    const timing = LOOP_PREVIEW_TIMING;
    phase = "building";

    // The card clears, and your steps come back one at a time.
    for (const step of steps) {
      track(step, [{ opacity: 1 }, { opacity: 0 }], {
        duration: timing.clearMs,
        easing: "ease-in",
      });
    }
    if (!(await run.wait(timing.clearMs))) return;

    for (let index = 0; index < LOOP_PART_STEPS; index += 1) {
      setProgress(index, 0);
      track(steps[index], [{ opacity: 0 }, { opacity: 1 }], {
        duration: timing.clearMs,
        easing: "ease-out",
      });
      const moved = await playTravel(run, PREVIEW_MOVE_MS, (value) =>
        setProgress(index, value)
      );
      if (!moved) return;
    }
    if (!(await run.wait(timing.restMs))) return;

    // Both copies lift off together, turn as they go and land as row two.
    for (const [index, copy] of copies.entries()) {
      const from = places[index];
      const to = places[index + LOOP_PART_STEPS];
      if (!from || !to) continue;
      const there = `translate(${to.x - from.x}px, ${to.y - from.y}px)`;
      track(
        copy,
        [
          { opacity: 1, transform: "none" },
          {
            opacity: 1,
            transform: `${there} rotate(${LOOP_PREVIEW_TURN})`,
          },
        ],
        { duration: timing.flyMs, easing: EASE_OUT }
      );
    }
    if (!(await run.wait(timing.flyMs))) return;
    for (const step of steps.slice(LOOP_PART_STEPS)) {
      track(step, [{ opacity: 1 }, { opacity: 1 }], { duration: 0 });
    }
    for (const copy of copies) {
      track(copy, [{ opacity: 1 }, { opacity: 0 }], {
        duration: timing.landMs,
        easing: "ease-out",
      });
    }
    await run.wait(timing.landMs);
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent} data-phase={phase}>
  {#each cells as cell, index (index)}
    <div
      class="cell step"
      style:left="{cell.x}px"
      style:top="{cell.y}px"
      style:width="{cell.size}px"
      style:height="{cell.size}px"
    >
      <MethodPreviewPictograph
        data={LOOP_PREVIEW_STEPS[index] ?? null}
        motionStartData={loopPoseBefore(index)}
        motionProgress={progress[index] ?? null}
        arrowOpacity={progress[index] ?? 1}
        onReady={() => readyCells.add(index)}
      />
    </div>
  {/each}
  {#if copiesWanted}
    {#each cells.slice(0, LOOP_PART_STEPS) as cell, index (index)}
      <div
        class="cell copy"
        style:left="{cell.x}px"
        style:top="{cell.y}px"
        style:width="{cell.size}px"
        style:height="{cell.size}px"
      >
        <MethodPreviewPictograph data={LOOP_PREVIEW_STEPS[index] ?? null} />
      </div>
    {/each}
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .cell {
    position: absolute;
  }

  /* The copies rest out of sight; a turn lifts them off. */
  .copy {
    opacity: 0;
  }
</style>
