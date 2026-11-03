<!--
  A 3D clip opened full size to set up its shot. The clip's own picture flies
  out of its box into the editor's frame and grows there, so it reads as the
  same stage coming forward. Inside: drag to turn the camera, scroll to move
  closer, the clip's shot controls, and play or scrub the clip on the post
  clock. Save writes the shot to the clip in one undo step; Cancel or Escape
  leaves the clip as it was. Either way the picture flies back into its box.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { findItem, updateItem } from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import type { PostAnimationItem, PostStage3D } from "../item-kinds";
  import PostStage3DTool from "./PostStage3DTool.svelte";
  import {
    orbitStagePose,
    roundStagePose,
    type StageCameraPose,
  } from "./stage-3d-camera";
  import { stage3DCameraState } from "./stage-3d-camera-state.svelte";
  import { stage3DShotEditor } from "./stage-3d-shot-editor.svelte";

  let {
    editor,
    item,
  }: {
    editor: VideoEditorState;
    item: PostAnimationItem;
  } = $props();

  /** Radians the camera turns per pixel dragged, as on the canvas. */
  const TURN_PER_PIXEL = 0.008;
  /** How much one notch of the wheel moves the camera in or out. */
  const ZOOM_PER_PIXEL = 0.0015;
  const FLIGHT_MS =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 420;
  const FLIGHT_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

  /**
   * How far before the clip's end playback jumps back to its start. The
   * editor lives inside the clip's layer, so the playhead must never leave
   * the clip while it is open.
   */
  const LOOP_MARGIN_SECONDS = 0.1;

  const draft = $derived(stage3DShotEditor.open?.draft ?? item.stage3d);
  const end = $derived(item.start + item.duration);
  const lastSeconds = $derived(Math.max(item.start, end - LOOP_MARGIN_SECONDS));

  let root = $state<HTMLDivElement | null>(null);
  let slot = $state<HTMLDivElement | null>(null);
  let frame = $state<HTMLDivElement | null>(null);
  let grip = $state<HTMLDivElement | null>(null);
  let rect = $state<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  let closing = $state(false);
  let shown = $state(false);

  function portal(node: HTMLElement) {
    document.body.append(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  /** The clip's box on the canvas, where the picture flies from and back to. */
  function homeRect(): DOMRect | null {
    const home = document.querySelector<HTMLElement>(
      `[data-stage-3d="${CSS.escape(item.id)}"]`
    );
    return home?.getBoundingClientRect() ?? null;
  }

  function measure(): void {
    const box = slot?.getBoundingClientRect();
    if (box) {
      rect = { x: box.left, y: box.top, width: box.width, height: box.height };
    }
  }

  function flightKeyframe(
    box: { x: number; y: number; width: number; height: number },
    radius: string
  ): Keyframe {
    return {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      borderRadius: radius,
    };
  }

  onMount(() => {
    const from = homeRect();
    if (
      editor.previewSeconds < item.start ||
      editor.previewSeconds >= lastSeconds
    ) {
      editor.seek(item.start);
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (slot) observer.observe(slot);
    void tick().then(() => {
      if (!frame) return;
      stage3DShotEditor.setFrame(frame);
      shown = true;
      root?.focus();
      if (from && from.width > 0) {
        frame.animate(
          [
            flightKeyframe(
              {
                x: from.left,
                y: from.top,
                width: from.width,
                height: from.height,
              },
              "0px"
            ),
            flightKeyframe(rect, "12px"),
          ],
          { duration: FLIGHT_MS, easing: FLIGHT_EASING }
        );
      }
    });
    return () => {
      observer.disconnect();
      stage3DCameraState.live = null;
      // Gone without Save or Cancel (the clip left the playhead): drop the draft.
      if (stage3DShotEditor.open?.itemId === item.id) stage3DShotEditor.close();
    };
  });

  // Playing inside the editor loops the clip, so it never runs off its end.
  $effect(() => {
    if (editor.isPlaying && editor.previewSeconds >= lastSeconds) {
      editor.seek(item.start);
    }
  });

  function finish(save: boolean): void {
    if (closing) return;
    closing = true;
    const next = draft;
    if (save && next) {
      const id = item.id;
      editor.editSetting(`${id}:stage3d:shot-editor`, (project, ctx) => {
        const found = findItem(project, id)?.item;
        if (found?.kind !== "animation" || !found.stage3d) return project;
        return updateItem(project, id, { stage3d: next }, ctx);
      });
    }
    shown = false;
    const to = homeRect();
    if (!frame || !to || to.width === 0) {
      stage3DShotEditor.close();
      return;
    }
    const flight = frame.animate(
      [
        flightKeyframe(rect, "12px"),
        flightKeyframe(
          { x: to.left, y: to.top, width: to.width, height: to.height },
          "0px"
        ),
      ],
      { duration: FLIGHT_MS, easing: FLIGHT_EASING, fill: "forwards" }
    );
    flight.onfinish = () => stage3DShotEditor.close();
  }

  function setDraft(next: PostStage3D): void {
    stage3DShotEditor.setDraft(next);
  }

  // ---- Camera ----------------------------------------------------------------

  interface CameraDrag {
    pointerId: number;
    start: StageCameraPose;
    startX: number;
    startY: number;
  }
  let drag: CameraDrag | null = null;

  function press(event: PointerEvent): void {
    if (event.button !== 0 || closing) return;
    const start =
      stage3DCameraState.shownPose(item.id) ?? draft?.camera ?? null;
    if (!start) return;
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take.
    }
    drag = {
      pointerId: event.pointerId,
      start,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function move(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId || !draft) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    // Turning the camera by hand makes the shot "My angle".
    if (draft.shot !== "saved") setDraft({ ...draft, shot: "saved" });
    stage3DCameraState.live = {
      itemId: item.id,
      pose: orbitStagePose(
        current.start,
        -dx * TURN_PER_PIXEL,
        dy * TURN_PER_PIXEL
      ),
    };
  }

  function release(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    drag = null;
    const live = stage3DCameraState.live;
    stage3DCameraState.live = null;
    if (live?.itemId !== item.id || !draft) return;
    setDraft({ ...draft, shot: "saved", camera: roundStagePose(live.pose) });
  }

  function zoom(event: WheelEvent): void {
    if (!draft || closing || drag) return;
    const start = stage3DCameraState.shownPose(item.id) ?? draft.camera;
    if (!start) return;
    event.preventDefault();
    setDraft({
      ...draft,
      shot: "saved",
      camera: roundStagePose(
        orbitStagePose(start, 0, 0, Math.exp(event.deltaY * ZOOM_PER_PIXEL))
      ),
    });
  }

  // A wheel listener has to be active to keep the page from scrolling.
  $effect(() => {
    const target = grip;
    if (!target) return;
    target.addEventListener("wheel", zoom, { passive: false });
    return () => target.removeEventListener("wheel", zoom);
  });

  function keydown(event: KeyboardEvent): void {
    // The studio's own shortcuts (delete, nudge, split) stay off while open.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    } else if (
      event.key === " " &&
      !(event.target instanceof HTMLInputElement)
    ) {
      event.preventDefault();
      editor.togglePlayback();
    }
  }

  function clock(seconds: number): string {
    const into = Math.max(0, seconds - item.start);
    const minutes = Math.floor(into / 60);
    return `${minutes}:${(into - minutes * 60).toFixed(1).padStart(4, "0")}`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (the dialog takes Escape and Space) -->
<div
  class="shot-editor"
  class:shown
  use:portal
  bind:this={root}
  role="dialog"
  aria-modal="true"
  aria-label={t("post_stage_3d_editor_title")}
  tabindex="-1"
  onkeydown={keydown}
>
  <div class="backdrop" aria-hidden="true"></div>
  <div class="layout">
    <div class="slot" bind:this={slot}></div>
    <aside class="controls">
      <h2>{t("post_stage_3d_editor_title")}</h2>
      {#if draft}
        <PostStage3DTool
          {editor}
          {item}
          locked={closing}
          {draft}
          ondraft={setDraft}
        />
      {/if}
      <div class="transport">
        <PanelButton
          variant="secondary"
          onclick={() => editor.togglePlayback()}
        >
          {editor.isPlaying
            ? t("post_stage_3d_pause")
            : t("post_stage_3d_play")}
        </PanelButton>
        <ValueSlider
          label={t("post_stage_3d_time")}
          value={Math.min(
            lastSeconds,
            Math.max(item.start, editor.previewSeconds)
          )}
          min={item.start}
          max={lastSeconds}
          step={0.05}
          format={clock}
          onchange={(seconds) => editor.seek(seconds)}
        />
      </div>
      <div class="actions">
        <PanelButton variant="quiet" onclick={() => finish(false)}>
          {t("common_cancel")}
        </PanelButton>
        <PanelButton variant="primary" onclick={() => finish(true)}>
          {t("post_stage_3d_save")}
        </PanelButton>
      </div>
    </aside>
  </div>
  <div
    class="frame"
    bind:this={frame}
    style:left="{rect.x}px"
    style:top="{rect.y}px"
    style:width="{rect.width}px"
    style:height="{rect.height}px"
  >
    <div
      class="grip"
      role="presentation"
      onpointerdown={press}
      onpointermove={move}
      onpointerup={release}
      onpointercancel={release}
      bind:this={grip}
    ></div>
  </div>
</div>

<style>
  .shot-editor {
    position: fixed;
    inset: 0;
    z-index: 1000;
    outline: none;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 0.72);
    backdrop-filter: blur(6px);
    opacity: 0;
    transition: opacity var(--duration-dramatic) var(--ease-standard);
  }

  .layout {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: 1.25rem;
    padding: clamp(1rem, 3vw, 2.5rem);
  }

  .slot {
    min-width: 0;
    min-height: 0;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem;
    border-radius: 12px;
    background: var(--theme-panel-bg, #16161c);
    opacity: 0;
    translate: 1.5rem 0;
    transition:
      opacity var(--duration-emphasis) var(--ease-standard),
      translate var(--duration-dramatic) var(--ease-standard-out);
  }

  .shown .backdrop,
  .shown .controls {
    opacity: 1;
    translate: 0 0;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .transport {
    display: grid;
    gap: 0.5rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: auto;
  }

  .frame {
    position: fixed;
    overflow: hidden;
    border-radius: 12px;
    background: #000;
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
  }

  .grip {
    position: absolute;
    inset: 0;
    z-index: 1;
    cursor: grab;
    touch-action: none;
  }

  .grip:active {
    cursor: grabbing;
  }

  @media (max-width: 760px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .controls {
      max-height: 50vh;
      translate: 0 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .controls {
      transition: none;
    }
  }
</style>
