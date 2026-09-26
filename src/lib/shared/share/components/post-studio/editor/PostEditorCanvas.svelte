<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import type { PresetClip } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { toPaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import {
    ANIMATION_OVERLAY_ROLE,
    STRIP_AREA,
    stripModeFromRole,
  } from "$lib/shared/media-composition/domain/post-plan-compiler";
  import { POST_STUDIO_ROLE } from "$lib/shared/media-composition/domain/post-studio-presets";
  import {
    POST_TIME_EPSILON,
    itemEnd,
    type PostBox,
    type PostItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
  import PostStudioMediaLayer from "../PostStudioMediaLayer.svelte";
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
  import {
    BOX_CORNERS,
    BOX_NUDGE,
    BOX_SIDES,
    dragBox,
    type BoxGuides,
    type BoxHandle,
  } from "./post-box-drag";

  /**
   * The post as it will render, drawn from the frame the evaluator produced
   * for the playhead, with the selected item's box on top to move and
   * resize. The export reads its video and animation surfaces from this
   * element, so it must stay mounted while a render runs.
   */
  interface Props {
    editor: PostEditorState;
    sequence: SequenceData;
    bindingFor: (role: string) => CompositionSourceBinding | null;
    labelFor: (item: PostItem) => string;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    handLabeling?: HandLabeling | null;
    /** The record a scan of the card opens: the source, not a labeled copy. */
    qrSequence?: SequenceData;
    /** Outline the strip so prop ends can be framed clear of it. */
    showStripGuide?: boolean;
    /** Selecting and dragging boxes; off while a render or a share runs. */
    interactive?: boolean;
    root?: HTMLElement | null;
  }

  let {
    editor,
    sequence,
    bindingFor,
    labelFor,
    cardRenderOptions = null,
    handLabeling = null,
    qrSequence,
    showStripGuide = false,
    interactive = true,
    root = $bindable(null),
  }: Props = $props();

  type VisualClip = Extract<PresetClip, { kind: "visual" }>;

  interface RegionEntry {
    role: string;
    clip: VisualClip;
    layer: EvaluatedFrameLayer;
    live: boolean;
  }

  const hintId = $props.id();
  const preset = $derived(editor.compiled?.preset ?? null);
  const visible = $derived(
    new Map(editor.frameLayers.map((layer) => [layer.clipId, layer]))
  );

  /**
   * One layer per role in each region. A sequence item is cut into pieces at
   * the footage's cuts, and the pieces share one mounted layer that follows
   * whichever piece is live, so a cut never remounts the animation. A clip's
   * video stays mounted, parked on its first frame, so the cut into it is
   * instant rather than a reload.
   */
  const entries = $derived.by(() => {
    const out = new Map<string, RegionEntry[]>();
    if (!preset) return out;
    const byRegion = new Map<string, VisualClip[]>();
    for (const clip of preset.clips) {
      if (clip.kind !== "visual") continue;
      const list = byRegion.get(clip.regionId) ?? [];
      list.push(clip);
      byRegion.set(clip.regionId, list);
    }
    for (const [regionId, clips] of byRegion) {
      const roles = [...new Set(clips.map((clip) => clip.sourceRole))];
      const list: RegionEntry[] = [];
      for (const role of roles) {
        const roleClips = clips.filter((clip) => clip.sourceRole === role);
        // At a shared edge both pieces are live; the later one shows.
        const liveClip = [...roleClips]
          .reverse()
          .find((clip) => visible.has(clip.id));
        if (liveClip) {
          list.push({
            role,
            clip: liveClip,
            layer: visible.get(liveClip.id)!,
            live: true,
          });
          continue;
        }
        const parked = roleClips[0];
        if (parked && bindingFor(role)?.renderMode === "external-media") {
          list.push({ role, clip: parked, layer: parkedLayer(parked), live: false });
        }
      }
      out.set(regionId, list);
    }
    return out;
  });

  function parkedLayer(clip: VisualClip): EvaluatedFrameLayer {
    const sourceIn = clip.sourceIn.unit === "seconds" ? clip.sourceIn.value : 0;
    return {
      clipId: clip.id,
      regionId: clip.regionId,
      sourceRole: clip.sourceRole,
      opacity: 0,
      sourceTimeSeconds: sourceIn,
      projectProgress: 0,
      transform: clip.transform,
    };
  }

  /** Regions whose animation has its beat and letter painted over it. */
  const paintedLabelRegions = $derived(
    new Set(
      bindingFor(ANIMATION_OVERLAY_ROLE)?.status === "ready" && preset
        ? preset.clips
            .filter((clip) => clip.sourceRole === ANIMATION_OVERLAY_ROLE)
            .map((clip) => clip.regionId)
        : []
    )
  );

  const stripGuideVisible = $derived(
    showStripGuide &&
      editor.frameLayers.some(
        (layer) =>
          stripModeFromRole(layer.sourceRole) !== null ||
          layer.sourceRole === POST_STUDIO_ROLE.carousel
      )
  );

  /**
   * Until its take is mapped, a layer drawn from the sequence holds the
   * opening pose, the engine's position 1, rather than going blank.
   */
  const OPENING_POSITION = 1;

  function pct(value: number): string {
    return `${value * 100}%`;
  }

  // ---- Selecting and moving boxes ------------------------------------------

  /** Items drawn at the playhead, topmost first. */
  const itemsHere = $derived.by(() => {
    const at = editor.previewSeconds;
    const found: PostItem[] = [];
    editor.project.tracks.forEach((track) => {
      if (track.hidden) return;
      for (const item of track.items) {
        if (
          at >= item.start - POST_TIME_EPSILON &&
          at <= itemEnd(item) + POST_TIME_EPSILON
        ) {
          found.push(item);
        }
      }
    });
    return found.reverse();
  });

  const selected = $derived(
    editor.selectedItem &&
      itemsHere.some((item) => item.id === editor.selectedItemId)
      ? editor.selectedItem
      : null
  );

  interface BoxDrag {
    pointerId: number;
    itemId: string;
    handle: BoxHandle;
    startBox: PostBox;
    startX: number;
    startY: number;
    width: number;
    height: number;
    moved: boolean;
  }

  let drag: BoxDrag | null = null;
  let guides = $state<BoxGuides>({ vertical: false, horizontal: false });
  let dragging = $state(false);
  /** A press this small is a tap, not a move. */
  const TAP_PIXELS = 4;

  function hitTest(event: PointerEvent): PostItem | null {
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return (
      itemsHere.find(
        (item) =>
          x >= item.box.x &&
          x <= item.box.x + item.box.width &&
          y >= item.box.y &&
          y <= item.box.y + item.box.height
      ) ?? null
    );
  }

  function startDrag(event: PointerEvent, item: PostItem, handle: BoxHandle) {
    if (!root || event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    editor.pause();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      itemId: item.id,
      handle,
      startBox: { ...item.box },
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  }

  /** A press on the frame selects what is on top there, ready to drag. */
  function pressFrame(event: PointerEvent): void {
    if (!interactive || event.button !== 0) return;
    const hit = hitTest(event);
    editor.selectedItemId = hit?.id ?? null;
    if (hit && !trackLocked(hit.id)) startDrag(event, hit, "move");
  }

  function trackLocked(itemId: string): boolean {
    return editor.project.tracks.some(
      (track) => track.locked && track.items.some((item) => item.id === itemId)
    );
  }

  function moveDrag(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    const pixelsX = event.clientX - current.startX;
    const pixelsY = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.hypot(pixelsX, pixelsY) < TAP_PIXELS) return;
      current.moved = true;
      dragging = true;
      editor.beginGesture();
    }
    const result = dragBox(
      current.startBox,
      current.handle,
      pixelsX / current.width,
      pixelsY / current.height,
      !event.altKey
    );
    guides = result.guides;
    const itemId = current.itemId;
    editor.gestureStep((base, context) =>
      updateItem(base, itemId, { box: result.box }, context)
    );
  }

  function endDrag(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    drag = null;
    dragging = false;
    guides = { vertical: false, horizontal: false };
    if (current.moved) editor.endGesture();
  }

  function cancelDrag(): void {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    dragging = false;
    guides = { vertical: false, horizontal: false };
    if (moved) editor.cancelGesture();
  }

  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  }

  function nudge(event: KeyboardEvent): void {
    const item = selected;
    if (!item || trackLocked(item.id)) return;
    const step = event.shiftKey ? BOX_NUDGE.large : BOX_NUDGE.step;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    const box = dragBox(item.box, "move", move[0], move[1], false).box;
    editor.edit((project, context) =>
      updateItem(project, item.id, { box }, context)
    );
  }
</script>

<svelte:window onkeydown={cancelOnEscape} />

<div
  class="post-canvas"
  bind:this={root}
  style:aspect-ratio={preset
    ? `${preset.output.width} / ${preset.output.height}`
    : "9 / 16"}
  data-post-canvas
>
  {#if preset}
    {#each preset.regions as region (region.id)}
      <div
        class="region"
        style:left={pct(region.x)}
        style:top={pct(region.y)}
        style:width={pct(region.width)}
        style:height={pct(region.height)}
        style:z-index={region.zIndex}
      >
        {#each entries.get(region.id) ?? [] as entry (entry.role)}
          {@const binding = bindingFor(entry.role)}
          {@const layer = entry.layer}
          {@const isVideo = binding?.renderMode === "external-media"}
          {#if binding?.status === "ready"}
            {#if binding.renderMode === "painted" && binding.painter}
              <div class="painted" style:opacity={layer.opacity}>
                <PostStudioPaintedLayer
                  painter={binding.painter}
                  frame={toPaintFrame(layer, editor.previewSeconds)}
                />
              </div>
            {:else if isVideo ? binding.previewUrl : true}
              <div class="layer" class:parked={!entry.live}>
                <PostStudioMediaLayer
                  {binding}
                  fit={region.fit}
                  opacity={layer.opacity}
                  sourceTimeSeconds={layer.sourceTimeSeconds}
                  playing={editor.isPlaying && entry.live}
                  {sequence}
                  {cardRenderOptions}
                  {handLabeling}
                  {qrSequence}
                  sequencePosition={layer.sequencePosition ??
                    (isVideo ? undefined : OPENING_POSITION)}
                  sequencePassIndex={layer.sequencePassIndex}
                  animationTimeSeconds={layer.animationTimeSeconds ??
                    (isVideo ? undefined : 0)}
                  breakdownMotion={stripModeFromRole(entry.role) !== null}
                  labelsPainted={paintedLabelRegions.has(region.id)}
                  displayedBeatNumber={layer.displayedBeatNumber ??
                    (binding.renderMode === "choreo-card" ? 0 : undefined)}
                  clipId={entry.clip.id}
                  transform={layer.transform}
                  playbackRate={entry.clip.playbackRate}
                />
              </div>
            {/if}
          {/if}
        {/each}
      </div>
    {/each}
    {#if stripGuideVisible}
      <div
        class="strip-guide"
        aria-hidden="true"
        style:left={pct(STRIP_AREA.x)}
        style:top={pct(STRIP_AREA.y)}
        style:width={pct(STRIP_AREA.width)}
        style:height={pct(STRIP_AREA.height)}
      ></div>
    {/if}
  {:else}
    <div class="empty">
      <i class="fa-solid fa-film" aria-hidden="true"></i>
      <span>{t("post_editor_empty_preview")}</span>
    </div>
  {/if}

  {#if interactive}
    <!-- Pointer surface only: the timeline and the inspector select and
         place items from the keyboard. -->
    <div
      class="edit-layer"
      role="presentation"
      onpointerdown={pressFrame}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={cancelDrag}
    >
      {#if guides.vertical}
        <div class="guide vertical" aria-hidden="true"></div>
      {/if}
      {#if guides.horizontal}
        <div class="guide horizontal" aria-hidden="true"></div>
      {/if}
      {#if selected}
        {@const locked = trackLocked(selected.id)}
        <div
          class="selection"
          class:dragging
          class:locked
          style:left={pct(selected.box.x)}
          style:top={pct(selected.box.y)}
          style:width={pct(selected.box.width)}
          style:height={pct(selected.box.height)}
          role="group"
          tabindex="0"
          aria-roledescription={t("post_editor_box")}
          aria-label={labelFor(selected)}
          aria-describedby={hintId}
          onkeydown={nudge}
          onpointerdown={(event) =>
            locked ? undefined : startDrag(event, selected, "move")}
        >
          {#if !locked && !editor.isPlaying}
            {#each BOX_CORNERS as corner (corner)}
              <span
                class="handle corner {corner}"
                aria-hidden="true"
                onpointerdown={(event) => startDrag(event, selected, corner)}
              ></span>
            {/each}
            {#each BOX_SIDES as side (side)}
              <span
                class="handle side {side}"
                aria-hidden="true"
                onpointerdown={(event) => startDrag(event, selected, side)}
              ></span>
            {/each}
          {/if}
        </div>
      {/if}
      <span id={hintId} class="sr-only">
        {t("post_editor_box_hint")}
      </span>
    </div>
  {/if}
</div>

<style>
  .post-canvas {
    position: relative;
    width: 100%;
    max-height: 100%;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #08080c;
    container-type: inline-size;
  }
  .region {
    position: absolute;
    overflow: hidden;
  }
  .layer,
  .painted {
    position: absolute;
    inset: 0;
  }
  .layer.parked {
    visibility: hidden;
  }
  .strip-guide {
    position: absolute;
    z-index: 20000;
    border: 2px dashed rgb(255 255 255 / 0.7);
    pointer-events: none;
  }
  .edit-layer {
    position: absolute;
    inset: 0;
    z-index: 30000;
    touch-action: none;
  }
  .selection {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid var(--theme-primary, #d4813a);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
    cursor: move;
  }
  .selection.locked {
    border-style: dashed;
    cursor: default;
  }
  .selection:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }
  /* Slim marks with a 44px grab area around each. */
  .handle {
    position: absolute;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
  .handle::after {
    content: "";
    position: absolute;
    inset: 50%;
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--theme-primary, #d4813a);
    border-radius: 50%;
    background: #fff;
    transform: translate(-50%, -50%);
  }
  .handle.side::after {
    border-radius: 0.25rem;
  }
  .handle.nw {
    left: 0;
    top: 0;
    cursor: nwse-resize;
  }
  .handle.ne {
    left: 100%;
    top: 0;
    cursor: nesw-resize;
  }
  .handle.sw {
    left: 0;
    top: 100%;
    cursor: nesw-resize;
  }
  .handle.se {
    left: 100%;
    top: 100%;
    cursor: nwse-resize;
  }
  .handle.n {
    left: 50%;
    top: 0;
    cursor: ns-resize;
  }
  .handle.s {
    left: 50%;
    top: 100%;
    cursor: ns-resize;
  }
  .handle.e {
    left: 100%;
    top: 50%;
    cursor: ew-resize;
  }
  .handle.w {
    left: 0;
    top: 50%;
    cursor: ew-resize;
  }
  .guide {
    position: absolute;
    background: var(--theme-primary, #d4813a);
    pointer-events: none;
  }
  .guide.vertical {
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .guide.horizontal {
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    padding: 1rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    text-align: center;
  }
  .empty i {
    font-size: 1.75rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
