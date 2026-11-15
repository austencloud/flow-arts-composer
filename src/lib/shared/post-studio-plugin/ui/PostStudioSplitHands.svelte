<script lang="ts">
  import { onDestroy, type ComponentProps } from "svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type {
    SplitCanvasLift,
    SplitPose,
  } from "#lib/shared/media-composition/domain/post-animation-split.js";
  import {
    paintSplitComposite,
    registerSplitPainter,
    SPLIT_HAND_ANIMATOR_FLAGS,
    type SplitHandCast,
  } from "../split-hands-paint";

  /**
   * An animation's split hands: two hidden animators, one drawing only left
   * hands and one only right hands, and the one canvas they are composited
   * onto by the pose. The parent mounts this a little before the split first
   * moves, so both animators are drawing by the time they show. Everything
   * else each animator draws (grid, trails, mandala, effects, path lines) is
   * set by `canvas`, the settings the single canvas uses, so each hand's
   * canvas draws what a one-hand clip of that hand draws.
   */
  let {
    pose,
    spread,
    lift = null,
    leftHand,
    rightHand,
    canvas,
    onReadyChange,
  }: {
    pose: SplitPose;
    spread: number | undefined;
    /** Where a lifted panel has moved the single canvas; null where it rests. */
    lift?: SplitCanvasLift | null;
    leftHand: SplitHandCast;
    rightHand: SplitHandCast;
    /** The animator settings both hands share with the single canvas. */
    canvas: Partial<ComponentProps<typeof AnimatorCanvas>>;
    /** Whether both animators have started drawing. */
    onReadyChange?: (ready: boolean) => void;
  } = $props();

  let composite = $state<HTMLCanvasElement | null>(null);
  let leftSource = $state<HTMLElement | null>(null);
  let rightSource = $state<HTMLElement | null>(null);
  let leftReady = $state(false);
  let rightReady = $state(false);
  $effect(() => onReadyChange?.(leftReady && rightReady));
  onDestroy(() => onReadyChange?.(false));

  const scratch = {
    main: document.createElement("canvas"),
    left: document.createElement("canvas"),
    right: document.createElement("canvas"),
  };
  function paint(): void {
    if (!composite) return;
    paintSplitComposite(
      composite,
      { left: leftSource, right: rightSource },
      pose,
      spread,
      scratch,
      lift
    );
  }

  // The export repaints on demand right before it captures.
  $effect(() => {
    const target = composite;
    if (!target) return;
    return registerSplitPainter(target, paint);
  });

  /**
   * Frames a still preview may go without a repaint. The animators keep
   * drawing for a while after their inputs settle (artwork arriving, trails
   * fading, a setting changed inside the engine), and no input here shows
   * that, so a still frame still repaints this often.
   */
  const STILL_REPAINT_FRAMES = 8;

  // The preview repaints while anything that feeds the picture changes: the
  // pose, the hands, the shared settings (which carry the beat and the time),
  // or playback. Otherwise it repaints only every few frames.
  $effect(() => {
    if (!composite) return;
    let lastInputs: readonly unknown[] = [];
    let lastSize = "";
    let still = 0;
    let frame = requestAnimationFrame(function tick() {
      const inputs = [pose, spread, lift, leftHand, rightHand, canvas] as const;
      const box = composite?.getBoundingClientRect();
      const size = box ? `${box.width}x${box.height}` : "";
      const changed =
        canvas.isPlaying === true ||
        size !== lastSize ||
        inputs.some((input, index) => input !== lastInputs[index]);
      if (changed || ++still >= STILL_REPAINT_FRAMES) {
        paint();
        still = 0;
        lastInputs = inputs;
        lastSize = size;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="split-hands" aria-hidden="true">
  <div class="split-sources" data-split-source>
    <div class="split-source" bind:this={leftSource}>
      <AnimatorCanvas
        {...canvas}
        leftProp={leftHand.left}
        rightProp={leftHand.right}
        additionalLayers={leftHand.layers}
        primaryPropColors={leftHand.colors}
        {...SPLIT_HAND_ANIMATOR_FLAGS}
        onInitialized={() => (leftReady = true)}
      />
    </div>
    <div class="split-source" bind:this={rightSource}>
      <AnimatorCanvas
        {...canvas}
        leftProp={rightHand.left}
        rightProp={rightHand.right}
        additionalLayers={rightHand.layers}
        primaryPropColors={rightHand.colors}
        {...SPLIT_HAND_ANIMATOR_FLAGS}
        onInitialized={() => (rightReady = true)}
      />
    </div>
  </div>
  <canvas class="split-composite" data-split-composite bind:this={composite}
  ></canvas>
</div>

<style>
  .split-hands,
  .split-sources,
  .split-source,
  .split-composite {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .split-hands {
    z-index: 1;
  }
  /* Drawn, never seen: the composite shows them. */
  .split-sources {
    opacity: 0;
  }
  .split-composite {
    width: 100%;
    height: 100%;
  }
</style>
