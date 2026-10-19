<script lang="ts">
  /**
   * CollectionsScene
   *
   * Mirrors: Explore > Collections. A collection is a set of sequences
   * someone gathered, and the shelf shows each as a stack of its cards.
   * Each turn the finger taps the next stack, which opens: its cards spread
   * into a row across the box while the other stacks step back, hold a
   * moment, then gather back into their stack.
   *
   * Finished picture: the shelf, every stack closed.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import MethodPreviewFinger from "#lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
  import { playSceneTurns } from "#lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.js";
  import type { MethodPreviewSceneProps } from "#lib/features/create/shared/components/method-previews/method-preview-scenes.js";
  import BrowsePreviewCard from "./BrowsePreviewCard.svelte";
  import {
    STACK_DEPTH,
    collectionShelf,
    rectCenter,
    type PreviewCard,
  } from "./browse-home-preview-layout";
  import {
    demoPreviewSequence,
    drawPreviewSequences,
    previewStep,
    type PreviewSequence,
  } from "./browse-preview-sequences";

  /** The most stacks a shelf shows (collectionShelf's row maximum). */
  const MAX_STACKS = 3;
  /** How long an opened stack stays open. */
  const OPEN_HOLD_MS = 1150;
  /** How long its cards take to spread out or gather back. */
  const SPREAD_MS = 420;

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
  let pose = $state.raw<GhostState | null>(null);
  let entries = $state.raw<PreviewSequence[] | null>(null);
  /** The open stack, or -1. */
  let open = $state(-1);
  /** Set while settle puts a cut stack back, so it does not glide. */
  let snapping = $state(false);
  let next = 0;
  let disposed = false;
  let announced = false;

  const shelf = $derived(collectionShelf(shape, width, height));
  const readyCards = new SvelteSet<string>();

  onMount(() => {
    void drawPreviewSequences(MAX_STACKS * STACK_DEPTH).then((drawn) => {
      if (!disposed) entries = drawn;
    });
  });

  onDestroy(() => {
    disposed = true;
  });

  function entryAt(stack: number, depth: number): PreviewSequence {
    const index = stack * STACK_DEPTH + depth;
    return entries?.[index] ?? demoPreviewSequence(index);
  }

  $effect(() => {
    const stacks = shelf?.stacks;
    if (announced || !entries || !stacks || stacks.length === 0) return;
    for (let stack = 0; stack < stacks.length; stack++) {
      for (let depth = 0; depth < STACK_DEPTH; depth++) {
        if (!readyCards.has(`${stack}:${depth}`)) return;
      }
    }
    announced = true;
    untrack(() => onready());
  });

  /**
   * A card's place: fanned out when its stack is open, else tucked in its
   * stack, the back cards turned a little either way.
   */
  function cardTransform(
    stackRect: PreviewCard,
    fan: PreviewCard | undefined,
    stack: number,
    depth: number
  ): string {
    if (open === stack && fan) {
      const scale = fan.width / stackRect.width;
      const dx = fan.x + fan.width / 2 - (stackRect.x + stackRect.width / 2);
      const dy = fan.y + fan.height / 2 - (stackRect.y + stackRect.height / 2);
      return `translate(${dx}px, ${dy}px) scale(${scale})`;
    }
    if (depth === 0) return "none";
    const side = depth % 2 === 1 ? -1 : 1;
    const nudge = Math.round(stackRect.width * 0.07 * depth);
    return `translate(${side * nudge}px, ${-Math.round(nudge * 0.4)}px) rotate(${side * 5 * depth}deg)`;
  }

  function settle(): void {
    pose = null;
    if (open === -1) return;
    snapping = true;
    open = -1;
    requestAnimationFrame(() => {
      snapping = false;
    });
  }

  async function play(run: SceneRun): Promise<void> {
    const box = shelf;
    if (!box || box.stacks.length === 0) return;
    const target = next % box.stacks.length;
    next = target + 1;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const stack = rectCenter(box.stacks[target]!);
    placeGhost(finger, stack.x, height);
    if (!(await tapAt(finger, run, stack.x, stack.y))) return;
    finger.ghost.visible = false;
    open = target;
    if (!(await run.wait(SPREAD_MS + OPEN_HOLD_MS))) return;
    open = -1;
    await run.wait(SPREAD_MS);
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--spread="{SPREAD_MS}ms"
  data-open={open === -1 ? null : open}
  class:snapping
>
  {#if shelf}
    {#each shelf.stacks as stackRect, stack (stack)}
      <div
        class="stack"
        class:dimmed={open !== -1 && open !== stack}
        class:opened={open === stack}
      >
        {#each { length: STACK_DEPTH } as _, reversed (reversed)}
          {@const depth = STACK_DEPTH - 1 - reversed}
          {@const entry = entryAt(stack, depth)}
          <div
            class="card"
            style:left="{stackRect.x}px"
            style:top="{stackRect.y}px"
            style:transform={cardTransform(
              stackRect,
              shelf.fan[depth],
              stack,
              depth
            )}
          >
            <BrowsePreviewCard
              card={stackRect}
              data={previewStep(entry)}
              readyEpoch={entries ? 1 : 0}
              onReady={() => {
                if (entries) readyCards.add(`${stack}:${depth}`);
              }}
            />
          </div>
        {/each}
      </div>
    {/each}
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .stack {
    position: absolute;
    inset: 0;
    transition: opacity var(--spread) var(--ease-out);
  }

  .stack.opened {
    z-index: 1;
  }

  .stack.dimmed {
    opacity: 0.22;
  }

  .card {
    position: absolute;
    transform-origin: center;
    transition: transform var(--spread) var(--ease-out);
  }

  /* The open stack's top card wears the tile's color, so the spread reads
     as one collection opening. */
  .stack.opened .card {
    filter: drop-shadow(
      0 4px 10px color-mix(in srgb, var(--accent) 30%, transparent)
    );
  }

  .scene.snapping .stack,
  .scene.snapping .card {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .stack,
    .card {
      transition: none;
    }
  }
</style>
