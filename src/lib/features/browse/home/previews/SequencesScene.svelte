<script lang="ts">
  /**
   * SequencesScene
   *
   * Mirrors: Explore > Sequences. The gallery is a wall of public sequence
   * cards, and a pointer resting on a card plays it (the gallery's hover
   * preview). Here a wall of real sequences, drawn from the home hero's
   * pool, rests on each one's opening step with its word under it. Each
   * turn the finger comes to rest on the next card, which lifts and plays
   * its steps one after another, each move from the pose before it, at the
   * pace Create's previews play moves.
   *
   * Finished picture: the wall, every card on its opening step.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import MethodPreviewFinger from "#lib/features/create/shared/components/method-previews/MethodPreviewFinger.svelte";
  import {
    PREVIEW_MOVE_MS,
    placeGhost,
    playTravel,
    sceneGhost,
    type SceneRun,
  } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
  import { playSceneTurns } from "#lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte.js";
  import type { MethodPreviewSceneProps } from "#lib/features/create/shared/components/method-previews/method-preview-scenes.js";
  import BrowsePreviewCard from "./BrowsePreviewCard.svelte";
  import { rectCenter, sequenceWall } from "./browse-home-preview-layout";
  import {
    demoPreviewSequence,
    drawPreviewSequences,
    previewPoseBefore,
    previewStep,
    type PreviewSequence,
  } from "./browse-preview-sequences";

  /** The most cards a wall shows (sequenceWall's row maximum). */
  const MAX_CARDS = 5;
  /** The finger rests this long before the card plays, as hover waits. */
  const HOVER_MS = 260;

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
  /** The card playing now, or -1. */
  let lifted = $state(-1);
  /** The lifted card's step, counted from its resting step. */
  let step = $state(0);
  let progress = $state<number | null>(null);
  /** Which card the next turn plays. */
  let next = 0;
  let disposed = false;
  let announced = false;

  const cards = $derived(sequenceWall(shape, width, height));
  const readyCards = new SvelteSet<number>();

  onMount(() => {
    void drawPreviewSequences(MAX_CARDS).then((drawn) => {
      if (!disposed) entries = drawn;
    });
  });

  onDestroy(() => {
    disposed = true;
  });

  function entryAt(index: number): PreviewSequence {
    return entries?.[index] ?? demoPreviewSequence(index);
  }

  // Ready once every card shown has drawn its opening step.
  $effect(() => {
    if (announced || !entries || cards.length === 0) return;
    if (!cards.every((_, index) => readyCards.has(index))) return;
    announced = true;
    untrack(() => onready());
  });

  function settle(): void {
    pose = null;
    lifted = -1;
    step = 0;
    progress = null;
  }

  async function play(run: SceneRun): Promise<void> {
    const wall = cards;
    if (wall.length === 0) return;
    const target = next % wall.length;
    next = target + 1;
    const card = wall[target]!;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = rectCenter(wall[Math.max(0, target - 1)] ?? card);
    placeGhost(finger, start.x, height);
    const center = rectCenter(card);
    await finger.glideTo(center.x, center.y + card.height * 0.18);
    if (run.aborted) return;
    finger.ghost.considering = true;
    if (!(await run.wait(HOVER_MS))) return;
    lifted = target;
    // The card plays on until the turn ends, which settles it.
    for (let move = 1; !run.aborted; move++) {
      step = move;
      progress = 0;
      if (
        !(await playTravel(run, PREVIEW_MOVE_MS, (value) => (progress = value)))
      )
        return;
    }
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent}>
  {#each cards as card, index (index)}
    {@const entry = entryAt(index)}
    {@const shownStep = lifted === index ? step : 0}
    <div
      class="slot"
      class:lifted={lifted === index}
      style:left="{card.x}px"
      style:top="{card.y}px"
    >
      <BrowsePreviewCard
        {card}
        word={entry.word}
        data={previewStep(entry, shownStep)}
        motionStartData={lifted === index && progress !== null
          ? previewPoseBefore(entry, shownStep)
          : null}
        motionProgress={lifted === index ? progress : null}
        readyEpoch={entries ? 1 : 0}
        onReady={() => {
          if (entries) readyCards.add(index);
        }}
      />
    </div>
  {/each}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slot {
    position: absolute;
    border-radius: 8px;
    transition:
      transform var(--duration-normal) var(--ease-out),
      box-shadow var(--duration-normal) var(--ease-out);
  }

  /* The card under the finger lifts, as a gallery card does under a
     pointer, and its ring takes the tile's color. */
  .slot.lifted {
    z-index: 1;
    transform: translateY(-4%) scale(1.06);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent),
      0 8px 18px rgba(0, 0, 0, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    .slot {
      transition: none;
    }
  }
</style>
