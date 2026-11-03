<script lang="ts">
  import type { SelectionLayerProps } from "@austencloud/video-editor";
  import { findItem, updateItem } from "@austencloud/video-editor/core";
  import {
    orbitStagePose,
    roundStagePose,
    type StageCameraPose,
  } from "./stage-3d-camera";
  import { stage3DCameraState } from "./stage-3d-camera-state.svelte";
  import { stage3DShotEditor } from "./stage-3d-shot-editor.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  /**
   * A selected 3D clip on its "My angle" shot: a drag inside it turns the
   * camera around the performers (across) and raises or lowers it (up and
   * down). The clip shows the camera live, and letting go stores it on the
   * clip. Any other clip, or any other shot, leaves presses to the canvas, so
   * the box moves as usual. The corner button opens the clip full size to set
   * up its shot.
   */
  let { editor, item, locked, canvas }: SelectionLayerProps = $props();

  /** Radians the camera turns per pixel dragged. */
  const TURN_PER_PIXEL = 0.008;

  interface CameraDrag {
    pointerId: number;
    itemId: string;
    start: StageCameraPose;
    startX: number;
    startY: number;
    moved: boolean;
  }
  let drag: CameraDrag | null = null;

  function savedShot(): boolean {
    return (
      item.kind === "animation" && item.stage3d?.shot === "saved" && !locked
    );
  }

  export function press(event: PointerEvent): boolean {
    if (event.button !== 0 || !savedShot()) return false;
    if (canvas.itemAt(event)?.id !== item.id) return false;
    const start = stage3DCameraState.shownPose(item.id);
    if (!start) return false;
    event.preventDefault();
    event.stopPropagation();
    canvas.cancelBoxDrag();
    editor.pause();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take.
    }
    drag = {
      pointerId: event.pointerId,
      itemId: item.id,
      start,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    return true;
  }

  export function move(event: PointerEvent): boolean {
    const current = drag;
    if (!current) return false;
    if (event.pointerId !== current.pointerId) return true;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < canvas.tapPixels) return true;
    current.moved = true;
    stage3DCameraState.live = {
      itemId: current.itemId,
      pose: orbitStagePose(
        current.start,
        -dx * TURN_PER_PIXEL,
        dy * TURN_PER_PIXEL
      ),
    };
    return true;
  }

  export function release(event: PointerEvent, keep: boolean): boolean {
    const current = drag;
    if (!current) return false;
    if (event.pointerId !== current.pointerId) return true;
    drag = null;
    const live = stage3DCameraState.live;
    stage3DCameraState.live = null;
    if (!keep || !current.moved || live?.itemId !== current.itemId) return true;
    const id = current.itemId;
    const camera = roundStagePose(live.pose);
    editor.editSetting(`${id}:stage3d:camera`, (project, ctx) => {
      const found = findItem(project, id)?.item;
      if (found?.kind !== "animation" || !found.stage3d) return project;
      return updateItem(
        project,
        id,
        { stage3d: { ...found.stage3d, camera } },
        ctx
      );
    });
    return true;
  }

  export function contextMenu(): boolean {
    return false;
  }

  const stage = $derived(
    item.kind === "animation" && item.stage3d ? item.stage3d : null
  );
</script>

{#if stage && !locked}
  <button
    type="button"
    class="open-shot"
    title={t("post_stage_3d_open_editor")}
    aria-label={t("post_stage_3d_open_editor")}
    onpointerdown={(event) => event.stopPropagation()}
    onclick={(event) => {
      event.stopPropagation();
      editor.pause();
      stage3DShotEditor.start(item.id, stage);
    }}
  >
    <i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"
    ></i>
  </button>
{/if}

<style>
  .open-shot {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid rgb(255 255 255 / 0.28);
    border-radius: 999px;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    font-size: 0.8125rem;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition:
      background var(--duration-fast) var(--ease-standard),
      scale var(--duration-fast) var(--ease-standard);
  }

  .open-shot:hover {
    background: rgb(0 0 0 / 0.8);
    scale: 1.08;
  }

  .open-shot:focus-visible {
    outline: 2px solid var(--theme-accent, #6aa9ff);
    outline-offset: 2px;
  }
</style>
