<script lang="ts">
  import { onDestroy } from "svelte";
  import { T } from "@threlte/core";
  import { HTML } from "@threlte/extras";
  import { Vector3 } from "three";

  interface Props {
    position: { x: number; z: number };
    groundY: number;
    selectedCount: number;
    dragging?: boolean;
    placing?: boolean;
    takeHint: () => boolean;
    onkeydown: (event: KeyboardEvent) => void;
    onpointerdown: (event: PointerEvent) => void;
    onpointermove: (event: PointerEvent) => void;
    onpointerup: (event: PointerEvent) => void;
    onpointercancel: (event: PointerEvent) => void;
  }

  let {
    position,
    groundY,
    selectedCount,
    dragging = false,
    placing = false,
    takeHint,
    onkeydown,
    onpointerdown,
    onpointermove,
    onpointerup,
    onpointercancel,
  }: Props = $props();

  let showHint = $state(takeHint());
  const projectionPoint = new Vector3();
  function handleScreenPosition(
    object: import("three").Object3D,
    camera: import("three").Camera,
    size: { width: number; height: number }
  ): [number, number] {
    object.getWorldPosition(projectionPoint).project(camera);
    return [
      Math.min(
        Math.max(((projectionPoint.x + 1) * size.width) / 2 + 36, 24),
        size.width - 24
      ),
      ((1 - projectionPoint.y) * size.height) / 2,
    ];
  }
  const hintTimer = showHint
    ? setTimeout(() => (showHint = false), 2200)
    : null;
  onDestroy(() => {
    if (hintTimer) clearTimeout(hintTimer);
  });
  const accessibleLabel = $derived(
    placing
      ? "Cancel move"
      : selectedCount === 1
        ? "Move selected character: drag or press to choose a floor position"
        : `Move ${selectedCount} selected characters: drag or press to choose a floor position`
  );
</script>

<T.Group position={[position.x, groundY + 0.08, position.z]}>
  <HTML center sprite calculatePosition={handleScreenPosition}>
    <div class="handle-anchor">
      <button
        class="move-handle"
        class:dragging
        class:placing
        type="button"
        aria-label={accessibleLabel}
        aria-pressed={placing}
        title={accessibleLabel}
        {onkeydown}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        {onpointercancel}
        onlostpointercapture={onpointercancel}
        oncontextmenu={(event) => event.preventDefault()}
        ondragstart={(event) => event.preventDefault()}
        ><span class="grip"
          ><i
            class={placing
              ? "fas fa-xmark"
              : "fas fa-arrows-up-down-left-right"}
            aria-hidden="true"
          ></i></span
        ></button
      >
      {#if showHint && !placing}<span class="move-hint">Drag to move</span>{/if}
    </div>
  </HTML>
</T.Group>

<style>
  .handle-anchor {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .move-handle {
    width: 48px;
    height: 48px;
    padding: 8px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-text, #fff);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .grip {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--theme-accent, #8b5cf6);
    border-radius: 50%;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.82));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
    font-size: 14px;
  }
  .move-handle:hover .grip,
  .move-handle:focus-visible .grip,
  .move-handle.placing .grip {
    color: var(--theme-accent-text, #a78bfa);
    border-color: var(--theme-accent-text, #a78bfa);
  }
  .move-handle:focus-visible {
    outline: 2px solid var(--theme-accent-text, #a78bfa);
    outline-offset: 1px;
  }
  .move-handle.dragging {
    cursor: grabbing;
  }
  .move-hint {
    position: absolute;
    left: 44px;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    padding: 0.3rem 0.5rem;
    border-radius: 0.4rem;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.82));
    color: var(--theme-text, #fff);
    font-size: max(14px, var(--font-size-min, 0.875rem));
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .move-handle,
    .grip {
      transition: none;
    }
  }
</style>
