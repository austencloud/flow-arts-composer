<script lang="ts">
  /**
   * ConstructScene
   *
   * Mirrors: Construct. A tap picks the start position (BuildStartPlacement),
   * then each tap in the option picker (OptionPicker) adds the next step to
   * the step grid (WorkspaceGrid). Steps enter with the step grid's own
   * stepCascade keyframes and DEFAULT_ANIMATION_TIMING.
   *
   * Finished picture: the demo sequence's start position and its first
   * steps, in a row in a strip and wrapped 2×2 in a square.
   */
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { DEFAULT_ANIMATION_TIMING } from "$lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import MethodPreviewPictograph from "./MethodPreviewPictograph.svelte";
  import { cellCenter, constructLayout } from "./method-preview-compositions";
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

  type SlotPhase = "waiting" | "entering";

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
  const steps = openingSteps(DEMO_SEQUENCE, 3);

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  /** One phase per slot while a run builds; empty means every slot rests. */
  let phases = $state.raw<SlotPhase[]>([]);
  const readySlots = new Set<number>();

  const slots = $derived(constructLayout(shape, width, height));

  function slotData(index: number) {
    return index === 0 ? start : (steps[index - 1] ?? null);
  }

  function handleReady(index: number): void {
    readySlots.add(index);
    if (readySlots.size >= slots.length) onready();
  }

  function settle(): void {
    pose = null;
    phases = [];
  }

  async function play(run: SceneRun): Promise<void> {
    const cells = slots;
    const first = cells[0];
    if (!first) return;
    phases = cells.map(() => "waiting");
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const lead = cellCenter(first);
    placeGhost(finger, lead.x + first.size * 0.35, lead.y + first.size * 0.3);
    for (const [index, cell] of cells.entries()) {
      const target = cellCenter(cell);
      if (!(await tapAt(finger, run, target.x, target.y))) return;
      phases = phases.map((phase, slot) =>
        slot === index ? "entering" : phase
      );
    }
    if (!(await run.wait(DEFAULT_ANIMATION_TIMING.entranceDuration))) return;
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
  data-phase={phases.length > 0 ? "building" : "rest"}
>
  {#each slots as cell, index (index)}
    <div
      class="slot"
      class:waiting={phases[index] === "waiting"}
      class:entering={phases[index] === "entering"}
      style:left="{cell.x}px"
      style:top="{cell.y}px"
      style:width="{cell.size}px"
      style:height="{cell.size}px"
    >
      <div class="art">
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
  .slot.waiting {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .art {
    position: absolute;
    inset: 0;
  }

  .slot.waiting .art {
    opacity: 0;
  }

  /* The step grid's entrance (StepCell's .step-cell.animate). */
  .slot.entering .art {
    animation: stepCascade var(--step-entrance-duration, 380ms)
      cubic-bezier(0.22, 1, 0.36, 1) both;
  }
</style>
