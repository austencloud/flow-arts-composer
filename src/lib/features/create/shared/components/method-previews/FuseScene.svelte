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
   * each step.
   *
   * Each source shows its step's arrow, as Fuse's source cards do, with its
   * prop at the start of its travel, so a blue half and a red half on one cell
   * make that fused step exactly, and the fused cell takes over without a
   * jump. The arrows stay while the fused steps play, and the props travel
   * along them (2026-10-10: arrows that appeared only after the halves met
   * read as something new arriving).
   *
   * A hand drawn alone is laid out as one hand (PictographContainer prepares
   * a visibleHand presentation that way), and the fused letter can lay it out
   * differently: its arrow on the other side of its point, its prop nudged
   * off the other hand's. Each half's arrow and prop glide from the one to
   * the other while the halves slide, so they land where the fused cell
   * draws them instead of snapping there at the merge. Each pictograph paints its own opaque cell, so
   * the half drawn on top (FuseSource.onTop) keeps only its props and takes
   * its cell backdrop from a ::before that dissolves during the slide: it
   * lands as a floating layer over the other half's cell, and both props
   * show as they meet.
   *
   * Each turn is a Regenerate (2026-10-10): one hand gets a new path from
   * Fuse's own path maker while the other keeps its own, red first, then
   * blue, so a new pair forms each turn. The next pair is made and drawn
   * into the hidden sources while the scene rests, and the fused row takes
   * it while it is faded out. The kept hand's halves show the very steps
   * they showed before; the new hand's arrive a beat later with a small pop.
   * A pair not made yet, or a maker that fails, replays the current pair.
   *
   * Finished picture: the latest pair's fused steps, both hands, with their
   * arrows.
   */
  import { onDestroy, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { FuseSide } from "#lib/features/fuse/state/fuse-shuffle-pool.svelte.js";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { fuseLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    FIRST_FUSE_SWAP,
    FUSE_PREVIEW_DRAW_WAIT_MS,
    FUSE_PREVIEW_STEPS,
    FUSE_PREVIEW_TIMING,
    fusePreviewFrames,
    fuseSources,
    nextFuseSwap,
    type FuseSource,
  } from "./method-preview-fuse";
  import type { FusePreviewPair } from "./method-preview-fuse-swap";
  import { waitUntil, type SceneRun } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  /** The step grid's entrance easing. */
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  /**
   * Where a new path's half pops in from: a little smaller, still centered
   * on its cell (sources scale from their top-left corner).
   */
  const NEW_HAND_FROM = "translate(5%, 5%) scale(0.9)";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const restFrames = fusePreviewFrames(DEMO_SEQUENCE);

  let root = $state<HTMLElement | null>(null);
  let fusedRow = $state<HTMLElement | null>(null);
  let phase = $state<"rest" | "fusing">("rest");
  /** True while the halves slide together: the floating half's box dissolves. */
  let sliding = $state(false);
  /** Each fused step's travel, 0 to 1. Null rests on the finished step. */
  let progress = $state.raw<(number | null)[]>(
    Array.from({ length: FUSE_PREVIEW_STEPS }, () => null)
  );
  /** The steps the fused row shows. */
  let fusedFrames = $state.raw(restFrames);
  /** The steps the sources show: the fused row's, or the next pair's. */
  let sourceFrames = $state.raw(restFrames);
  /** Bumped when a row takes new steps, so each of its cells reports again. */
  let fusedEpoch = $state(0);
  let sourceEpoch = $state(0);

  /** The pair the fused row shows. Null is the demo's own two hands. */
  let pair: FusePreviewPair | null = null;
  /** A pair made while a turn played. The sources take it at rest. */
  let upcoming: FusePreviewPair | null = null;
  /** The pair the hidden sources show, which the next turn fuses. */
  let staged: FusePreviewPair | null = null;
  /** The hand the next new pair gives a new path. */
  let swapSide: FuseSide = FIRST_FUSE_SWAP;
  let making = false;
  let makerFailed = false;
  let destroyed = false;

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
    for (const index of fusedFrames.keys()) {
      if (layout.combined[index]) keys.push(`fused:${index}`);
    }
    for (const source of sources) {
      if (sourceFrames[source.step]) keys.push(source.key);
    }
    return keys;
  });

  function handleReady(cell: string): void {
    readyCells.add(cell);
  }

  const isFused = (cell: string) => cell.startsWith("fused:");

  /** True once every fused cell (or every source) shown has drawn. */
  function drawn(fused: boolean): boolean {
    return renderedCells
      .filter((cell) => isFused(cell) === fused)
      .every((cell) => readyCells.has(cell));
  }

  /** The fused cells (or the sources) start drawing new steps. */
  function forget(fused: boolean): void {
    for (const cell of [...readyCells]) {
      if (isFused(cell) === fused) readyCells.delete(cell);
    }
  }

  /**
   * Make the next pair in the background, as Regenerate would: the hand
   * after the last swap gets a new path. Fuse's maker loads only now, after
   * the scene first drew.
   */
  async function makeNextPair(): Promise<void> {
    if (making || upcoming || staged || makerFailed || destroyed) return;
    making = true;
    try {
      const { demoFusePair, swapFuseHand } =
        await import("./method-preview-fuse-swap");
      const next = await swapFuseHand(pair ?? demoFusePair(), swapSide);
      if (destroyed) return;
      upcoming = next;
      stageUpcoming();
    } catch (error) {
      makerFailed = true;
      console.warn("Fuse preview: no new path, so this pair replays.", error);
    } finally {
      making = false;
    }
  }

  /** At rest, the hidden sources draw the next pair for the next turn. */
  function stageUpcoming(): void {
    if (!upcoming || phase !== "rest") return;
    staged = upcoming;
    upcoming = null;
    sourceFrames = staged.frames;
    sourceEpoch += 1;
    forget(false);
  }

  onDestroy(() => {
    destroyed = true;
  });

  // Ready once every cell now shown has drawn. A resize can change which
  // cells are shown before the last one reports, so this re-checks when the
  // layout changes, not only when a cell reports.
  $effect(() => {
    if (announced) return;
    const cells = renderedCells;
    if (cells.length === 0) return;
    if (!cells.every((cell) => readyCells.has(cell))) return;
    announced = true;
    untrack(() => {
      onready();
      void makeNextPair();
    });
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
    progress = fusedFrames.map(() => null);
    sliding = false;
    phase = "rest";
    stageUpcoming();
  }

  /** The layers of one hand that the fused letter can lay out differently. */
  const GLIDING_LAYERS = ["arrow", "prop"] as const;

  /**
   * Over the slide, each half's arrow and prop glide from where the hand
   * alone puts them to where its fused cell draws them. Both pictographs
   * share one viewBox and the slide lands each half on its cell, so the
   * fused cell's transforms are the halves' targets as they are.
   */
  function glideIntoPlace(
    halves: { source: FuseSource; piece: HTMLElement }[],
    fused: HTMLElement
  ): void {
    for (const { source, piece } of halves) {
      const cell = fused.querySelector(`.cell[data-step="${source.step}"]`);
      for (const layer of GLIDING_LAYERS) {
        const selector = `.${source.hand}-${layer}-svg`;
        const from = piece.querySelector(selector);
        const to = cell?.querySelector(selector);
        if (!from || !to) continue;
        const start = getComputedStyle(from).transform;
        const end = getComputedStyle(to).transform;
        if (start === end) continue;
        track(from, [{ transform: start }, { transform: end }], {
          duration: FUSE_PREVIEW_TIMING.slideMs,
          easing: EASE,
          fill: "forwards",
        });
      }
    }
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
    // The pair the hidden sources drew fuses this turn. Sources still
    // drawing it get a moment; the turn then plays what they show.
    const next = staged;
    phase = "fusing";
    sliding = false;
    if (next && !drawn(false)) {
      await waitUntil(run, () => drawn(false), FUSE_PREVIEW_DRAW_WAIT_MS, 16);
      if (run.aborted) return;
    }

    // The finished fused steps step aside, and their props go back to the
    // start of their travel while no one sees them.
    const out = track(fused, [{ opacity: 1 }, { opacity: 0 }], {
      duration: timing.clearMs,
      easing: "ease-in",
      fill: "forwards",
    });
    if (!(await run.wait(timing.clearMs))) return;
    if (next) {
      // Out of sight, the fused row takes the new pair, and the pair after
      // it starts being made.
      staged = null;
      pair = next;
      fusedFrames = next.frames;
      fusedEpoch += 1;
      forget(true);
      swapSide = nextFuseSwap(swapSide);
      void makeNextPair();
    }
    progress = fusedFrames.map(() => 0);

    // The blue path and the red path appear apart, one hand each. A new
    // path arrives last, with a small pop, so the eye finds what changed.
    for (const { source, piece } of halves) {
      if (source.hand === next?.changed) {
        track(
          piece,
          [
            { opacity: 0, transform: NEW_HAND_FROM },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: timing.newHandMs,
            delay: timing.sourcesInMs - timing.newHandMs,
            easing: "ease-out",
            fill: "both",
          }
        );
      } else {
        track(piece, [{ opacity: 0 }, { opacity: 1 }], {
          duration: timing.sourcesInMs,
          easing: "ease-out",
          fill: "forwards",
        });
      }
    }
    if (!(await run.wait(timing.sourcesInMs))) return;

    // They slide together: the blue and red half of each step land on one
    // cell, their arrows and props gliding to where the fused letter puts
    // them. A fused row still drawing a new pair has no targets yet, so its
    // halves keep their own layout and the merge snaps, as it once did.
    sliding = true;
    if (drawn(true)) glideIntoPlace(halves, fused);
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
    // the timer fires. Merging then would jump, so wait for them to land,
    // and for the fused row to finish drawing a new pair.
    // Not animation.finished: settle() cancels it, which rejects.
    await waitUntil(
      run,
      () =>
        slides.every((slide) => slide.playState === "finished") &&
        (!next || drawn(true)),
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
    for (const index of fusedFrames.keys()) {
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
      {#each fusedFrames as frame, index (index)}
        {@const cell = layout.combined[index]}
        {#if cell}
          <div
            class="cell"
            data-step={index}
            style:left="{cell.x}px"
            style:top="{cell.y}px"
            style:width="{cell.size}px"
            style:height="{cell.size}px"
          >
            <MethodPreviewPictograph
              data={frame.step}
              motionStartData={frame.motionStartData}
              motionProgress={progress[index] ?? null}
              readyEpoch={fusedEpoch}
              onReady={() => handleReady(`fused:${index}`)}
            />
          </div>
        {/if}
      {/each}
    </div>
    {#each sources as source (source.key)}
      {@const frame = sourceFrames[source.step]}
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
            readyEpoch={sourceEpoch}
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
