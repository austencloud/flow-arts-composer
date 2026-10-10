<script lang="ts">
  /**
   * ConstructScene
   *
   * Mirrors: Construct. A tap picks the start position (BuildStartPlacement),
   * then each tap in the option picker (OptionPicker) adds the next step to
   * the step grid (WorkspaceGrid). Each box offers three small choices, the
   * real step and two other moves Construct offers there
   * (method-preview-construct.ts). The finger taps the real one, it grows to
   * fill the box, and the other two fade.
   *
   * Finished picture: the demo sequence's start position and its first
   * steps, in a row in a strip and wrapped 2×2 in a square.
   */
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import {
    CONSTRUCT_MAX_SLOTS,
    cellCenter,
    constructChoiceCells,
    constructLayout,
  } from "./method-preview-compositions";
  import {
    CONSTRUCT_DECOYS,
    CONSTRUCT_GROW_MS,
    constructPick,
    decoySpots,
  } from "./method-preview-construct";
  import {
    DEMO_SEQUENCE,
    openingSteps,
    startPictograph,
  } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  type SlotPhase = "waiting" | "choosing" | "entering";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  const start = startPictograph(DEMO_SEQUENCE);
  const steps = openingSteps(DEMO_SEQUENCE, CONSTRUCT_MAX_SLOTS - 1);

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  /** One phase per slot while a run builds; empty means every slot rests. */
  let phases = $state.raw<SlotPhase[]>([]);
  /** The choice spot holding the real step, per slot, for this run. */
  let picks = $state.raw<number[]>([]);
  /** The other moves mount once the finished picture has drawn. */
  let decoysWanted = $state(false);
  let runs = 0;
  const readySlots = new SvelteSet<number>();

  const slots = $derived(constructLayout(shape, width, height));
  const choices = $derived(slots.map((cell) => constructChoiceCells(cell)));

  function slotData(index: number) {
    return index === 0 ? start : (steps[index - 1] ?? null);
  }

  function pickAt(index: number): number {
    return picks[index] ?? constructPick(index, 0);
  }

  /** The real step at its choice spot, moved and scaled from its box. */
  function choiceTransform(index: number): string | null {
    const cell = slots[index];
    const spot = choices[index]?.[pickAt(index)];
    if (!cell || !spot || cell.size <= 0) return null;
    const scale = spot.size / cell.size;
    return `translate(${spot.x - cell.x}px, ${spot.y - cell.y}px) scale(${scale})`;
  }

  function handleReady(index: number): void {
    readySlots.add(index);
  }

  // Ready once every slot now shown has drawn. A resize to fewer slots can
  // leave the unmounted one unreported, so this re-checks when slots change.
  $effect(() => {
    if (slots.length === 0) return;
    if (!slots.every((_, index) => readySlots.has(index))) return;
    untrack(() => {
      onready();
      decoysWanted = true;
    });
  });

  function settle(): void {
    pose = null;
    phases = [];
  }

  async function play(run: SceneRun): Promise<void> {
    const cells = slots;
    const first = cells[0];
    if (!first) return;
    const round = runs++;
    picks = cells.map((_, index) => constructPick(index, round));
    phases = cells.map((_, index) => (index === 0 ? "choosing" : "waiting"));
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const lead = cellCenter(first);
    placeGhost(finger, lead.x + first.size * 0.35, lead.y + first.size * 0.3);
    for (const [index, cell] of cells.entries()) {
      const spot = constructChoiceCells(cell)[picks[index]!];
      const target = cellCenter(spot ?? cell);
      if (!(await tapAt(finger, run, target.x, target.y))) return;
      // The pick grows in while the next box offers its choices.
      phases = phases.map((phase, slot) =>
        slot === index ? "entering" : slot === index + 1 ? "choosing" : phase
      );
    }
    if (!(await run.wait(CONSTRUCT_GROW_MS))) return;
    settle();
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
  style:--construct-grow="{CONSTRUCT_GROW_MS}ms"
  data-phase={phases.length > 0 ? "building" : "rest"}
>
  {#each slots as cell, index (index)}
    <div
      class="slot"
      class:waiting={phases[index] === "waiting"}
      class:choosing={phases[index] === "choosing"}
      class:entering={phases[index] === "entering"}
      style:left="{cell.x}px"
      style:top="{cell.y}px"
      style:width="{cell.size}px"
      style:height="{cell.size}px"
    >
      {#if decoysWanted}
        {#each CONSTRUCT_DECOYS[index] ?? [] as decoy, order (order)}
          {@const spot = choices[index]?.[decoySpots(pickAt(index))[order]!]}
          {#if spot}
            <div
              class="choice"
              style:left="{spot.x - cell.x}px"
              style:top="{spot.y - cell.y}px"
              style:width="{spot.size}px"
              style:height="{spot.size}px"
            >
              <MethodPreviewPictograph data={decoy} />
            </div>
          {/if}
        {/each}
      {/if}
      <div
        class="art"
        style:transform={phases[index] === "choosing"
          ? choiceTransform(index)
          : null}
      >
        <MethodPreviewPictograph
          data={slotData(index)}
          onReady={() => handleReady(index)}
        />
      </div>
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
    border-radius: 6px;
  }

  /* An empty slot waits as a faint outline in the method color. */
  .slot.waiting,
  .slot.choosing {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .art {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
  }

  .slot.waiting .art {
    opacity: 0;
  }

  /* The other moves show only while their box offers its choices. */
  .choice {
    position: absolute;
    opacity: 0;
    transition: opacity 160ms ease-out;
  }

  .slot.choosing .choice {
    opacity: 1;
    transition-duration: 120ms;
  }

  .slot.choosing .art {
    transition: opacity 120ms ease-out;
  }

  /* The picked choice grows from its spot to fill the box. */
  .slot.entering .art {
    transition: transform var(--construct-grow, 300ms)
      cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
