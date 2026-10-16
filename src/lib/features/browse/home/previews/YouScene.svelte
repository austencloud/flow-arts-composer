<script lang="ts">
  /**
   * YouScene
   *
   * Mirrors: Browse > You, where everything you save collects. A sequence
   * card sits beside your shelf of saved work. Each turn the finger taps the
   * card's heart, which fills, and the card files itself on the shelf as
   * its newest entry: the saved cards step along one place, the oldest
   * leaves, and the next sequence takes the card's place. In a square box
   * the shelf is the You badge in the corner, and the card flies into it.
   *
   * Finished picture: the card with an empty heart beside the shelf.
   */
  import { onDestroy, onMount, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import FontAwesomeIcon from "#lib/shared/foundation/ui/FontAwesomeIcon.svelte";
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
    rectCenter,
    youShelf,
    type PreviewCard,
    type PreviewRect,
  } from "./browse-home-preview-layout";
  import {
    demoPreviewSequence,
    drawPreviewSequences,
    previewStep,
    type PreviewSequence,
  } from "./browse-preview-sequences";

  /** Sequences the scene cycles through: the card and up to four saved. */
  const POOL = 8;
  /** The heart fills, then the card files itself. */
  const HEART_MS = 260;
  const FILE_MS = 460;
  const ARRIVE_MS = 320;

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
  /** The pool index of the card being saved. */
  let source = $state(0);
  /** Pool indices on the shelf, newest first. */
  let saved = $state.raw<number[]>([1, 2, 3, 4]);
  let hearted = $state(false);
  let filing = $state(false);
  let arriving = $state(false);
  let snapping = $state(false);
  let disposed = false;
  let announced = false;

  const layout = $derived(youShelf(shape, width, height));
  const readyCards = new SvelteSet<string>();

  onMount(() => {
    void drawPreviewSequences(POOL).then((drawn) => {
      if (!disposed) entries = drawn;
    });
  });

  onDestroy(() => {
    disposed = true;
  });

  function entryAt(index: number): PreviewSequence {
    return entries?.[index % POOL] ?? demoPreviewSequence(index % POOL);
  }

  $effect(() => {
    const box = layout;
    if (announced || !entries || !box) return;
    if (!readyCards.has("source")) return;
    if (!box.slots.every((_, index) => readyCards.has(`slot:${index}`))) return;
    announced = true;
    untrack(() => onready());
  });

  function moveTo(from: PreviewCard, to: PreviewRect, fade = false): string {
    const scale = to.width / from.width;
    const dx = to.x + to.width / 2 - (from.x + from.width / 2);
    const dy = to.y + to.height / 2 - (from.y + from.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${fade ? scale * 0.6 : scale})`;
  }

  /** The card is on the shelf: the next sequence takes its place. */
  function commit(): void {
    const slots = layout?.slots.length ?? 0;
    saved = [source, ...saved].slice(0, Math.max(slots, 4));
    source = (Math.max(source, ...saved) + 1) % POOL;
    // The card never shows a sequence already on the shelf.
    while (saved.slice(0, slots).includes(source)) source = (source + 1) % POOL;
    hearted = false;
    filing = false;
    snapping = true;
    requestAnimationFrame(() => {
      snapping = false;
    });
  }

  function settle(): void {
    pose = null;
    arriving = false;
    if (hearted) commit();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    if (!box) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = rectCenter(box.source);
    placeGhost(finger, start.x, height);
    const heart = rectCenter(box.heart);
    if (!(await tapAt(finger, run, heart.x, heart.y))) return;
    hearted = true;
    if (!(await run.wait(HEART_MS))) return;
    finger.ghost.visible = false;
    filing = true;
    if (!(await run.wait(FILE_MS))) return;
    commit();
    arriving = true;
    if (!(await run.wait(ARRIVE_MS))) return;
    arriving = false;
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });

  const square = $derived(layout?.slots.length === 0);
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--file="{FILE_MS}ms"
  style:--arrive="{ARRIVE_MS}ms"
  class:snapping
>
  {#if layout}
    <div
      class="plate"
      class:badge={square}
      class:received={square && filing}
      style:left="{layout.plate.x}px"
      style:top="{layout.plate.y}px"
      style:width="{layout.plate.width}px"
      style:height="{layout.plate.height}px"
      style:font-size="{Math.round(
        Math.min(layout.plate.width, layout.plate.height) *
          (square ? 0.46 : 0.2)
      )}px"
    >
      {#if square}<FontAwesomeIcon icon="user" style="solid" ariaHidden />{/if}
    </div>

    {#each layout.slots as slot, index (index)}
      {@const entry = entryAt(saved[index] ?? index + 1)}
      {@const nextSlot = layout.slots[index + 1]}
      <div
        class="card saved"
        class:leaving={filing && !nextSlot}
        style:left="{slot.x}px"
        style:top="{slot.y}px"
        style:transform={filing && nextSlot ? moveTo(slot, nextSlot) : "none"}
      >
        <BrowsePreviewCard
          card={slot}
          word={entry.word}
          data={previewStep(entry)}
          readyEpoch={entries ? 1 : 0}
          onReady={() => {
            if (entries) readyCards.add(`slot:${index}`);
          }}
        />
      </div>
    {/each}

    {@const sourceEntry = entryAt(source)}
    {@const target = layout.slots[0] ?? layout.plate}
    <div
      class="card source"
      class:arriving
      class:into-badge={square && filing}
      style:left="{layout.source.x}px"
      style:top="{layout.source.y}px"
      style:transform={filing ? moveTo(layout.source, target, square) : "none"}
    >
      <BrowsePreviewCard
        card={layout.source}
        word={sourceEntry.word}
        data={previewStep(sourceEntry)}
        readyEpoch={entries ? 1 : 0}
        onReady={() => {
          if (entries) readyCards.add("source");
        }}
      />
      <span
        class="heart"
        class:filled={hearted}
        style:left="{layout.heart.x - layout.source.x}px"
        style:top="{layout.heart.y - layout.source.y}px"
        style:width="{layout.heart.width}px"
        style:height="{layout.heart.height}px"
        style:font-size="{Math.round(layout.heart.width * 0.56)}px"
      >
        <FontAwesomeIcon
          icon="heart"
          style={hearted ? "solid" : "regular"}
          ariaHidden
        />
      </span>
    </div>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Your shelf: a quiet plate in the tile's color behind the saved cards. */
  .plate {
    position: absolute;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .plate.badge {
    z-index: 2;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 26%, var(--theme-card-bg));
    transition: transform var(--duration-fast) var(--ease-spring);
  }

  .plate.badge.received {
    transform: scale(1.12);
  }

  .card {
    position: absolute;
    transform-origin: center;
    transition:
      transform var(--file) var(--ease-out),
      opacity var(--file) var(--ease-out);
  }

  .card.source {
    z-index: 1;
  }

  .card.saved.leaving,
  .card.source.into-badge {
    opacity: 0;
  }

  .card.source.arriving {
    animation: popIn var(--arrive) var(--ease-out) both;
  }

  .heart {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-card-bg) 82%, transparent);
    color: var(--theme-text-dim);
    transition:
      color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-spring);
  }

  .heart.filled {
    color: var(--accent);
    transform: scale(1.18);
  }

  .scene.snapping .card,
  .scene.snapping .heart,
  .scene.snapping .plate {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .heart,
    .plate {
      transition: none;
    }
    .card.source.arriving {
      animation: none;
    }
  }
</style>
