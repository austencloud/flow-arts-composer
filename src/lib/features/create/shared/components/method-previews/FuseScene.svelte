<script lang="ts">
  /**
   * FuseScene
   *
   * Mirrors: Fuse. Its two source cards hold a blue path and a red path, one
   * hand each (FuseSourceCard draws them with PictographContainer's
   * visibleHand), and Fuse plays the pair as one two-hand sequence. Here the
   * demo sequence's blue hand and red hand stand apart, slide together, and
   * the fused steps play once through Fuse's motion seam
   * (resolveFusePictographMotionFrame): the props travel from the pose before
   * each step and the arrows reveal with the motion, as on Fuse's own cards.
   *
   * Each source shows its step at the start of its travel, so a blue half and
   * a red half on one cell make that fused step exactly, and the fused cell
   * takes over without a jump. Each pictograph paints its own opaque cell, so
   * the half drawn on top (FuseSource.onTop) keeps only its props and takes
   * its cell backdrop from a ::before that dissolves during the slide: it
   * lands as a floating layer over the other half's cell, and both props
   * show as they meet.
   *
   * Finished picture: the fused steps, both hands, with their arrows.
   */
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { fuseLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    FUSE_PREVIEW_TIMING,
    fuseFrames,
    fuseSources,
  } from "./method-preview-fuse";
  import { waitUntil, type SceneRun } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  /** The step grid's entrance easing. */
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const frames = fuseFrames(DEMO_SEQUENCE, 2);

  let root = $state<HTMLElement | null>(null);
  let fusedRow = $state<HTMLElement | null>(null);
  let phase = $state<"rest" | "fusing">("rest");
  /** True while the halves slide together: the floating half's box dissolves. */
  let sliding = $state(false);
  /** Each fused step's travel, 0 to 1. Null rests on the finished step. */
  let progress = $state.raw<(number | null)[]>(frames.map(() => null));

  const layout = $derived(fuseLayout(shape, width, height));
  const sources = $derived(layout ? fuseSources(layout) : []);

  /** Cells that have drawn, by the keys renderedCells lists. */
  const readyCells = new SvelteSet<string>();
  let announced = false;
  /** Animations a turn started, so settle can end them. */
  let animations: Animation[] = [];

  /**
   * The cells the template draws right now: each fused step that has a cell,
   * and each source whose step has a frame. Empty while there is no layout.
   */
  const renderedCells = $derived.by(() => {
    if (!layout) return [];
    const keys: string[] = [];
    for (const index of frames.keys()) {
      if (layout.combined[index]) keys.push(`fused:${index}`);
    }
    for (const source of sources) {
      if (frames[source.step]) keys.push(source.key);
    }
    return keys;
  });

  function handleReady(cell: string): void {
    readyCells.add(cell);
  }

  // Ready once every cell now shown has drawn. A resize can change which
  // cells are shown before the last one reports, so this re-checks when the
  // layout changes, not only when a cell reports.
  $effect(() => {
    if (announced) return;
    const cells = renderedCells;
    if (cells.length === 0) return;
    if (!cells.every((cell) => readyCells.has(cell))) return;
    announced = true;
    untrack(() => onready());
  });

  function track(
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): Animation | null {
    const target = element as HTMLElement;
    if (typeof target.animate !== "function") return null;
    const animation = target.animate(keyframes, options);
    animations.push(animation);
    return animation;
  }

  function settle(): void {
    for (const animation of animations) animation.cancel();
    animations = [];
    progress = frames.map(() => null);
    sliding = false;
    phase = "rest";
  }

  /** Play one fused step: its props travel from the pose before it. */
  function travel(run: SceneRun, index: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        resolve(true);
        return;
      }
      const startedAt = performance.now();
      let id = 0;
      const step = (now: number) => {
        const value = Math.min(
          1,
          Math.max(0, (now - startedAt) / FUSE_PREVIEW_TIMING.stepMs)
        );
        progress = progress.map((current, cell) =>
          cell === index ? value : current
        );
        if (value >= 1) {
          resolve(true);
          return;
        }
        id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
      run.onAbort(() => {
        cancelAnimationFrame(id);
        resolve(false);
      });
    });
  }

  async function play(run: SceneRun): Promise<void> {
    const host = root;
    const fused = fusedRow;
    if (!host || !fused) return;
    // Each source's element, found by its key. A missing one skips the turn.
    const elements = new Map<string, HTMLElement>();
    for (const element of host.querySelectorAll<HTMLElement>(".source")) {
      if (element.dataset.key) elements.set(element.dataset.key, element);
    }
    const halves = sources.flatMap((source) => {
      const piece = elements.get(source.key);
      return piece ? [{ source, piece }] : [];
    });
    if (sources.length === 0 || halves.length !== sources.length) return;
    const timing = FUSE_PREVIEW_TIMING;
    phase = "fusing";
    sliding = false;

    // The finished fused steps step aside, and their props go back to the
    // start of their travel while no one sees them.
    const out = track(fused, [{ opacity: 1 }, { opacity: 0 }], {
      duration: timing.clearMs,
      easing: "ease-in",
      fill: "forwards",
    });
    if (!(await run.wait(timing.clearMs))) return;
    progress = frames.map(() => 0);

    // The blue path and the red path appear apart, one hand each.
    for (const { piece } of halves) {
      track(piece, [{ opacity: 0 }, { opacity: 1 }], {
        duration: timing.sourcesInMs,
        easing: "ease-out",
        fill: "forwards",
      });
    }
    if (!(await run.wait(timing.sourcesInMs))) return;

    // They slide together: the blue and red half of each step land on one cell.
    sliding = true;
    const slides: Animation[] = [];
    for (const { source, piece } of halves) {
      const slide = track(
        piece,
        [{ transform: "none" }, { transform: source.slide }],
        { duration: timing.slideMs, easing: EASE, fill: "forwards" }
      );
      if (slide) slides.push(slide);
    }
    if (!(await run.wait(timing.slideMs))) return;
    // A stalled main thread can leave the slides short of their cells when
    // the timer fires. Merging then would jump, so wait for them to land.
    // Not animation.finished: settle() cancels it, which rejects.
    await waitUntil(
      run,
      () => slides.every((slide) => slide.playState === "finished"),
      250,
      16
    );
    if (run.aborted) return;

    // The halves become the fused steps: the fused row fades in under the
    // halves, which cover it (it comes first in the markup, so it stacks
    // below). Once it is fully in, the halves are hidden at once, so the card
    // never shows through two half-faded layers.
    const merge = track(fused, [{ opacity: 0 }, { opacity: 1 }], {
      duration: timing.mergeMs,
      easing: "ease-out",
      fill: "forwards",
    });
    out?.cancel();
    if (!(await run.wait(timing.mergeMs))) return;
    await waitUntil(
      run,
      () => !merge || merge.playState === "finished",
      250,
      16
    );
    if (run.aborted) return;
    for (const { piece } of halves) {
      track(piece, [{ opacity: 0 }, { opacity: 0 }], {
        duration: 0,
        fill: "forwards",
      });
    }

    // The fused steps play once.
    for (const index of frames.keys()) {
      if (!(await travel(run, index))) return;
    }
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  class:sliding
  bind:this={root}
  style:--accent={accent}
  style:--slide-ms="{FUSE_PREVIEW_TIMING.slideMs}ms"
  style:--slide-ease={EASE}
  data-phase={phase}
>
  {#if layout}
    <div class="fused" bind:this={fusedRow}>
      {#each frames as frame, index (index)}
        {@const cell = layout.combined[index]}
        {#if cell}
          <div
            class="cell"
            style:left="{cell.x}px"
            style:top="{cell.y}px"
            style:width="{cell.size}px"
            style:height="{cell.size}px"
          >
            <MethodPreviewPictograph
              data={frame.step}
              motionStartData={frame.motionStartData}
              motionProgress={progress[index] ?? null}
              arrowOpacity={progress[index] ?? 1}
              onReady={() => handleReady(`fused:${index}`)}
            />
          </div>
        {/if}
      {/each}
    </div>
    {#each sources as source (source.key)}
      {@const frame = frames[source.step]}
      {#if frame}
        <div
          class="cell source"
          class:on-top={source.onTop}
          data-key={source.key}
          style:left="{source.rect.x}px"
          style:top="{source.rect.y}px"
          style:width="{source.rect.size}px"
          style:height="{source.rect.size}px"
        >
          <MethodPreviewPictograph
            data={frame.step}
            visibleHand={source.hand}
            transparentBackground={source.onTop}
            motionStartData={frame.motionStartData}
            motionProgress={0}
            arrowOpacity={0}
            onReady={() => handleReady(source.key)}
          />
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .fused {
    position: absolute;
    inset: 0;
  }

  .cell {
    position: absolute;
  }

  /* The one-hand sources rest out of sight; a turn brings them in. */
  .source {
    opacity: 0;
    transform-origin: 0 0;
  }

  /* The floating half draws its cell's backdrop itself (the Create grid's
     --dm-pictograph-bg), under its pictograph in the cell's own stacking
     context. It dissolves while the halves slide, so the other half's props
     show through as they meet; resetting it when the sources are hidden is
     instant.

     --dm-pictograph-bg and the renderer's TORCH_CONTRAST_PALETTE background
     are two sources for one color. setDarkMode keeps them in sync: it
     toggles the .dark class that switches the token (app.css: #d8d8d2 light,
     #0a0a0f dark), and the renderer follows the same mode. */
  .source.on-top {
    isolation: isolate;
  }

  .source.on-top::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--dm-pictograph-bg, #0a0a0f);
  }

  .scene.sliding .source.on-top::before {
    opacity: 0;
    transition: opacity var(--slide-ms, 520ms)
      var(--slide-ease, cubic-bezier(0.22, 1, 0.36, 1));
  }

  @media (prefers-reduced-motion: reduce) {
    .scene.sliding .source.on-top::before {
      transition: none;
    }
  }
</style>
