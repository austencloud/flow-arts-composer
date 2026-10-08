<script lang="ts">
  /**
   * GenerateScene
   *
   * Mirrors: Generate. The Generate button (GenerateButtonCard) rolls a
   * whole sequence, and the step grid (WorkspaceGrid) washes it in with its
   * diagonal wave. Each cell's band is its row plus its column (waveBandAt),
   * staggered by DEFAULT_ANIMATION_TIMING, and every cell enters with the
   * step grid's stepCascade keyframes. The dice holds the lead slot, where
   * the step grid's start position sits.
   *
   * Each turn shows a real sequence from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, turns step through the demo
   * sequence instead.
   *
   * Finished picture: the dice and the latest roll's opening steps. Before
   * the first turn, the demo sequence's from Generate's own start
   * (DEMO_STEP_START), so no other card rests on the same steps.
   */
  import { onDestroy, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { drawMatrixRealization } from "$lib/shared/landing/data/shape-matrix-hero-pool";
  import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { cellCenter, generateLayout } from "./method-preview-compositions";
  import {
    FIRST_ROLL,
    GENERATE_CLEAR_MS,
    GENERATE_READY_WAIT_MS,
    generateCellDelayMs,
    generateRevealMs,
    nextRoll,
    rollStep,
    type GenerateRoll,
  } from "./method-preview-generate";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  type Phase = "rest" | "clearing" | "entering";

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
  let phase = $state<Phase>("rest");
  let roll = $state.raw<GenerateRoll>(FIRST_ROLL);
  /** Bumped with each roll, so every cell reports ready for its new step. */
  let epoch = $state(0);

  const layout = $derived(generateLayout(shape, width, height));

  /** Cells that have drawn the current roll. */
  const readyCells = new SvelteSet<number>();
  let announced = false;
  /** The next turn's roll, drawn in the background. */
  let fresh: SequenceData | null = null;
  let drawing = false;
  let sourceFailed = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  function drawNextRoll(): void {
    if (disposed || drawing || fresh || sourceFailed) return;
    drawing = true;
    runAtBackgroundPriority(() => {
      // The scene can be gone by the time the scheduler runs this.
      if (disposed) return;
      void drawMatrixRealization()
        .then((draw) => {
          if (!draw) {
            // The pool reports its own load failure as null, so this is
            // almost always a failed fetch, not an unlucky draw.
            sourceFailed = true;
            console.warn(
              "[method preview] Generate source returned no sequence; using the demo"
            );
          } else if (!disposed) fresh = draw.sequence;
        })
        .catch((error: unknown) => {
          sourceFailed = true;
          console.warn(
            "[method preview] Generate could not draw a sequence",
            error
          );
        })
        .finally(() => {
          drawing = false;
        });
    });
  }

  function handleCellReady(index: number): void {
    readyCells.add(index);
  }

  // Ready once every cell now shown has drawn. A resize can change the cell
  // count before the last cell reports, so this re-checks when the layout
  // changes, not only when a cell reports.
  $effect(() => {
    if (announced) return;
    const cells = layout?.cells;
    if (!cells || cells.length === 0) return;
    if (!cells.every((_, index) => readyCells.has(index))) return;
    announced = true;
    untrack(() => {
      onready();
      drawNextRoll();
    });
  });

  function settle(): void {
    pose = null;
    phase = "rest";
    drawNextRoll();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const last = box?.cells[box.cells.length - 1];
    if (!box || !last) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(last);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    phase = "clearing";
    if (!(await run.wait(GENERATE_CLEAR_MS))) return;
    const drawn = fresh;
    fresh = null;
    roll = nextRoll(roll, drawn, box.cells.length);
    readyCells.clear();
    epoch += 1;
    // A cell still drawing after the wait washes in when it is ready.
    await waitUntil(
      run,
      () => readyCells.size >= box.cells.length,
      GENERATE_READY_WAIT_MS
    );
    if (run.aborted) return;
    finger.ghost.visible = false;
    phase = "entering";
    if (!(await run.wait(generateRevealMs(box.cells.length, box.columns)))) {
      return;
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
  bind:this={root}
  style:--accent={accent}
  style:--step-entrance-duration="{DEFAULT_ANIMATION_TIMING.entranceDuration}ms"
  style:--clear-duration="{GENERATE_CLEAR_MS}ms"
  data-phase={phase}
>
  {#if layout}
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
    {#each layout.cells as cell, index (index)}
      <div
        class="cell"
        style:left="{cell.x}px"
        style:top="{cell.y}px"
        style:width="{cell.size}px"
        style:height="{cell.size}px"
        style:--reveal-delay="{generateCellDelayMs(index, layout.columns)}ms"
      >
        <MethodPreviewPictograph
          data={rollStep(roll, index)}
          readyEpoch={epoch}
          onReady={() => handleCellReady(index)}
        />
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

  /* The Generate button's dice (GenerateButtonCard): its green, its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 24%;
    color: var(--theme-text, #fff);
    background: var(--semantic-success, #22c55e);
    box-shadow:
      0 2px 6px
        color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent),
      inset 0 1px 0 var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }

  .cell {
    position: absolute;
  }

  /* The last roll fades out. Only this phase transitions, so the way back
     never fights the entrance below. */
  .scene[data-phase="clearing"] .cell {
    opacity: 0;
    transition: opacity var(--clear-duration, 150ms) ease-in;
  }

  /* The step grid's entrance, band by band (StepCell's .step-cell.animate). */
  .scene[data-phase="entering"] .cell {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--reveal-delay, 0ms);
  }
</style>
