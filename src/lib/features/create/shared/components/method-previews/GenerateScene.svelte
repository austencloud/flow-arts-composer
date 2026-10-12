<script lang="ts">
  /**
   * GenerateScene
   *
   * Mirrors: Generate. The Generate button (GenerateButtonCard) rolls a
   * whole sequence, and the step grid (WorkspaceGrid) washes it in with its
   * diagonal wave. Each cell's band is its row plus its column (waveBandAt),
   * staggered by DEFAULT_ANIMATION_TIMING, and every cell enters with the
   * step grid's stepCascade keyframes. Every roll is a closed four-step
   * loop, so the box shows it whole: a row of four, or a 2×2 in a square.
   * A small button with the dice and the word sits under the steps, as the
   * real button sits under its settings (2026-10-11); a dice tile leading
   * the row outweighed the card's title and read as a control.
   *
   * Each turn rolls once, and the roll washes in still, as the step grid
   * shows it. Once its first step has landed, all four steps play their
   * moves one at a time, each from the pose before it, as the workspace's
   * Play steps through a sequence, at the pace Construct's steps move
   * (2026-10-11), and the loop ends where it began; Generate's turn runs
   * longer to fit them. Turns rolled twice before; moves that rode the wave
   * all at once matched nothing the tool does. The steps land with their
   * props at the start of their moves, so none jumps back to start, and
   * without their arrows: each step's arrows come in as its props travel,
   * as the step grid's arrival (PictographArrivalStage) shows a step picked
   * from the options.
   *
   * Each roll is a real sequence from drawMatrixRealization(), the Firebase-free
   * source behind the home hero, drawn in the background between turns.
   * When that source fails, rolls step through the demo sequence instead.
   *
   * Finished picture: the button and the latest roll's four steps, each at
   * the end of its move. Before the first turn, four of the demo sequence's
   * from Generate's own start (DEMO_STEP_START), so no other card rests on
   * the same steps.
   */
  import { onDestroy, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import FontAwesomeIcon from "#lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { DEFAULT_ANIMATION_TIMING } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models.js";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import {
    generateLayout,
    type GenerateLayout,
  } from "./method-preview-compositions";
  import {
    FIRST_ROLL,
    GENERATE_CLEAR_MS,
    GENERATE_READY_WAIT_MS,
    generateCellDelayMs,
    generateFirstLandMs,
    generateRevealMs,
    nextRoll,
    rollPoseBefore,
    rollStep,
    type GenerateRoll,
  } from "./method-preview-generate";
  import { createNextSequenceDraw } from "./method-preview-next-sequence";
  import {
    PREVIEW_MOVE_MS,
    placeGhost,
    playTravel,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneFinger,
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
  /** Each cell's move, 0 to 1. Null draws the cell still. */
  let progress = $state.raw<(number | null)[]>([]);

  const layout = $derived(generateLayout(shape, width, height));

  /** Cells that have drawn the current roll. */
  const readyCells = new SvelteSet<number>();
  let announced = false;
  /** The next turn's roll, drawn in the background. */
  const nextRollDraw = createNextSequenceDraw({
    emptyWarning:
      "[method preview] Generate source returned no sequence; using the demo",
    errorWarning: "[method preview] Generate could not draw a sequence",
  });

  onDestroy(() => {
    nextRollDraw.dispose();
  });

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
      nextRollDraw.request();
    });
  });

  /** The turn's roll has landed. Its last move plays on. */
  function rest(): void {
    pose = null;
    phase = "rest";
    nextRollDraw.request();
  }

  function settle(): void {
    rest();
    // A move the turn cut short lands on its last frame.
    progress = progress.map((value) => (value === null ? null : 1));
  }

  /**
   * A step's arrows come in with its move, as PictographArrivalStage plays
   * one: none at its start, all once it lands. A still step shows them all.
   */
  function arrowsShown(index: number): number {
    return progress[index] ?? 1;
  }

  function setProgress(index: number, value: number): void {
    progress = progress.map((current, cell) =>
      cell === index ? value : current
    );
  }

  /**
   * Fade the shown roll and start washing in the next; the finger leaves as
   * it does. True when the wash started.
   */
  async function rollIn(
    run: SceneRun,
    box: GenerateLayout,
    finger: SceneFinger
  ): Promise<boolean> {
    phase = "clearing";
    if (!(await run.wait(GENERATE_CLEAR_MS))) return false;
    roll = nextRoll(roll, nextRollDraw.take(), box.cells.length);
    // Every step waits at the start of its move.
    progress = box.cells.map(() => 0);
    readyCells.clear();
    epoch += 1;
    // A cell still drawing after the wait washes in when it is ready.
    await waitUntil(
      run,
      () => readyCells.size >= box.cells.length,
      GENERATE_READY_WAIT_MS
    );
    if (run.aborted) return false;
    finger.ghost.visible = false;
    phase = "entering";
    return true;
  }

  /**
   * Once the first step has landed, the steps play their moves one at a
   * time. True once the last one has started: it plays on into the turn's
   * end, so a wait for it could only push the run past the turn and cut it
   * when a slow draw delayed the roll.
   */
  async function playSteps(
    run: SceneRun,
    box: GenerateLayout
  ): Promise<boolean> {
    if (!(await run.wait(generateFirstLandMs(box.columns)))) return false;
    const count = box.cells.length;
    for (let index = 0; index < count; index++) {
      const move = playTravel(run, PREVIEW_MOVE_MS, (value) =>
        setProgress(index, value)
      );
      if (index < count - 1 && !(await move)) return false;
    }
    return true;
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    if (!box || box.cells.length === 0) return;
    // Nothing is drawn ahead under reduced motion. Turns that come back
    // after it ask now, and fall back on the demo if the roll is late.
    nextRollDraw.request();
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    // The finger starts on the button, so the turn's time goes to the moves.
    const { x, y } = box.button;
    placeGhost(finger, x, y);
    if (!(await tapAt(finger, run, x, y))) return;
    if (!(await rollIn(run, box, finger))) return;
    const washed = run.wait(generateRevealMs(box.cells.length, box.columns));
    if (!(await playSteps(run, box))) return;
    if (!(await washed)) return;
    // The last move plays on into the turn's end, which settles the scene.
    rest();
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
    {@const button = layout.button}
    <span
      class="generate-button"
      class:labelled={button.labelled}
      class:pressed={pose?.pressed ?? false}
      style:left="{button.x}px"
      style:top="{button.y}px"
      style:height="{button.height}px"
      style:width={button.labelled ? null : `${button.height}px`}
      style:font-size="{Math.round(
        button.height * (button.labelled ? 0.5 : 0.6)
      )}px"
      aria-hidden="true"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
      {#if button.labelled}<span>{t("generator_button")}</span>{/if}
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
          motionStartData={rollPoseBefore(roll, index)}
          motionProgress={progress[index] ?? null}
          arrowOpacity={arrowsShown(index)}
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

  /* The Generate button (GenerateButtonCard) in small: its green, its dice
     and its word, centered under the steps. No glow, so it stays quieter
     than the card's title. */
  .generate-button {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    box-sizing: border-box;
    max-width: 100%;
    border-radius: 999px;
    color: var(--theme-text, #fff);
    background: var(--semantic-success, #22c55e);
    box-shadow: inset 0 1px 0
      var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    transform: translate(-50%, -50%);
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .generate-button.labelled {
    padding: 0 0.85em;
  }

  .generate-button.pressed {
    transform: translate(-50%, -50%) scale(0.9);
  }

  .cell {
    position: absolute;
  }

  /* The last roll fades out. Only this phase transitions, so the way back
     never fights the entrance below. */
  .scene[data-phase="clearing"] .cell {
    opacity: 0;
    transition: opacity var(--clear-duration, var(--duration-fast))
      var(--ease-standard-in);
  }

  /* The step grid's entrance, band by band (StepCell's .step-cell.animate). */
  .scene[data-phase="entering"] .cell {
    animation: stepCascade
      var(--step-entrance-duration, var(--duration-dramatic)) var(--ease-out)
      both;
    animation-delay: var(--reveal-delay, 0ms);
  }
</style>
