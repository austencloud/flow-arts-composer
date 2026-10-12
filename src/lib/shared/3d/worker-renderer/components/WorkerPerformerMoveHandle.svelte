<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { TransitionConfig } from "svelte/transition";

  import { reducedMotion } from "../../../transitions/motion";
  import type { WorkerPerformerInteractionBridge } from "../services/worker-performer-interaction";
  import {
    createWorkerMoveHandleOwner,
    type WorkerMoveHandlePresentation,
    type WorkerMoveHandleSnapshot,
  } from "../worlds/selection-markers/worker-performer-move-handle";

  interface Props {
    bridge: WorkerPerformerInteractionBridge;
    position: { x: number; z: number };
    groundY: number;
    selectedCount: number;
    anchorIndex: number;
    dragging: boolean;
    placing: boolean;
    projectionRevision: number;
    visible?: boolean;
    onkeydown: (event: KeyboardEvent) => void;
    onInteractionStateMayHaveChanged: () => void;
  }

  let {
    bridge,
    position,
    groundY,
    selectedCount,
    anchorIndex,
    dragging,
    placing,
    projectionRevision,
    visible = true,
    onkeydown,
    onInteractionStateMayHaveChanged,
  }: Props = $props();

  let hovered = $state(false);
  let focusVisible = $state(false);
  let prefersReducedMotion = $state(reducedMotion());
  let showHint = $state(bridge.takeMoveHint());
  const hintTimer = showHint
    ? setTimeout(() => (showHint = false), 2200)
    : null;

  function moveHandleSnapshot(
    entranceProgress: number
  ): WorkerMoveHandleSnapshot {
    return {
      position,
      groundY,
      selectedCount,
      dragging,
      placing,
      hovered,
      focusVisible,
      visible,
      reducedMotion: prefersReducedMotion,
      entranceProgress,
    };
  }

  const presentationOwner = createWorkerMoveHandleOwner(moveHandleSnapshot(1));
  let presentation = $state<WorkerMoveHandlePresentation | null>(
    presentationOwner.current
  );

  $effect(() => {
    presentation = presentationOwner.update(moveHandleSnapshot(1));
  });

  const projected = $derived.by(() => {
    void projectionRevision;
    if (!presentation) return null;
    const [x, worldY, z] = presentation.geometry.worldPosition;
    return bridge.projectStagePosition({ x, z }, worldY);
  });

  function moveHandlePresence(_node: HTMLElement): TransitionConfig {
    const initial = presentationOwner.update(moveHandleSnapshot(1));
    return {
      duration: initial?.motion.durationMs ?? 0,
      css: (progress) => {
        const motion = presentationOwner.update(
          moveHandleSnapshot(progress)
        )?.motion;
        return motion
          ? `opacity: ${motion.opacity}; transform: scale(${motion.scale});`
          : "opacity: 1; transform: scale(1);";
      },
    };
  }

  function handlePointerDown(event: PointerEvent): void {
    bridge.onMoveHandlePointerDown(event, anchorIndex);
    onInteractionStateMayHaveChanged();
  }

  function handlePointerMove(event: PointerEvent): void {
    event.stopPropagation();
    bridge.onMoveHandlePointerMove(event);
    onInteractionStateMayHaveChanged();
  }

  function handlePointerUp(event: PointerEvent): void {
    event.stopPropagation();
    bridge.onMoveHandlePointerUp(event);
    onInteractionStateMayHaveChanged();
  }

  function handlePointerCancel(event: PointerEvent): void {
    event.stopPropagation();
    bridge.onMoveHandlePointerCancel(event);
    onInteractionStateMayHaveChanged();
  }

  function handleFocus(event: FocusEvent): void {
    focusVisible = (event.currentTarget as HTMLButtonElement).matches(
      ":focus-visible"
    );
  }

  function handleKeydown(event: KeyboardEvent): void {
    focusVisible = (event.currentTarget as HTMLButtonElement).matches(
      ":focus-visible"
    );
    onkeydown(event);
    onInteractionStateMayHaveChanged();
  }

  onMount(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      prefersReducedMotion = reducedMotion();
    };
    const preferenceObserver = new MutationObserver(updateMotionPreference);
    motionQuery.addEventListener("change", updateMotionPreference);
    preferenceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-preference"],
    });
    updateMotionPreference();

    return () => {
      motionQuery.removeEventListener("change", updateMotionPreference);
      preferenceObserver.disconnect();
    };
  });

  onDestroy(() => {
    if (hintTimer) clearTimeout(hintTimer);
    presentationOwner.dispose();
  });
</script>

{#if presentation && projected?.visible && presentation.visible}
  <div
    class="move-handle-anchor"
    style:left={`clamp(24px, ${projected.x + 36}px, calc(100% - 24px))`}
    style:top={`${projected.y}px`}
  >
    <button
      class="move-handle"
      type={presentation.interaction.buttonType}
      aria-label={presentation.accessibleLabel}
      aria-pressed={placing}
      title={presentation.title}
      draggable="false"
      style:min-width={`${presentation.geometry.minWidthPx}px`}
      style:min-height={`${presentation.geometry.minHeightPx}px`}
      style:padding-block={`${presentation.geometry.paddingBlockRem}rem`}
      style:padding-inline={`${presentation.geometry.paddingInlineRem}rem`}
      style:border-width={`${presentation.geometry.borderWidthPx}px`}
      style:border-color={presentation.material.borderColor}
      style:border-radius={`${presentation.geometry.borderRadiusPx}px`}
      style:gap={`${presentation.geometry.gapRem}rem`}
      style:background={presentation.material.background}
      style:color={presentation.material.color}
      style:box-shadow={presentation.material.boxShadow}
      style:font={presentation.typography.font}
      style:font-size={presentation.typography.fontSize}
      style:font-weight={presentation.typography.fontWeight}
      style:line-height={presentation.typography.lineHeight}
      style:white-space={presentation.typography.whiteSpace}
      style:cursor={presentation.material.cursor}
      style:pointer-events={presentation.interaction.pointerEvents}
      style:touch-action={presentation.interaction.touchAction}
      style:user-select={presentation.interaction.userSelect}
      style:transition={presentation.material.transition}
      style:outline={presentation.material.outline ?? undefined}
      style:outline-offset={presentation.material.outlineOffsetPx === null
        ? undefined
        : `${presentation.material.outlineOffsetPx}px`}
      transition:moveHandlePresence
      onpointerenter={() => (hovered = true)}
      onpointerleave={() => (hovered = false)}
      onfocus={handleFocus}
      onblur={() => (focusVisible = false)}
      onkeydown={handleKeydown}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
      onlostpointercapture={handlePointerCancel}
      oncontextmenu={(event) => event.preventDefault()}
      ondragstart={(event) => event.preventDefault()}
    >
      <span class="grip"
        ><i
          class={placing ? "fas fa-xmark" : presentation.icon.classes.join(" ")}
          aria-hidden={presentation.icon.ariaHidden}
        ></i></span
      >
    </button>
    {#if showHint && !placing}<span class="placement-note">Drag to move</span
      >{/if}
  </div>
{/if}

<style>
  .move-handle-anchor {
    position: absolute;
    z-index: 2;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .move-handle {
    border-style: solid;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
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
  }
  .move-handle:hover .grip,
  .move-handle:focus-visible .grip,
  .move-handle[aria-pressed="true"] .grip {
    color: var(--theme-accent-text, #a78bfa);
    border-color: var(--theme-accent-text, #a78bfa);
  }
  .placement-note {
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

  .move-handle i {
    text-align: center;
  }
</style>
