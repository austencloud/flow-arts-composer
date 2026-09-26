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
    POST_MAX_ZOOM,
    POST_MIN_ZOOM,
    POST_TIME_EPSILON,
    itemEnd,
    type PostBox,
    type PostItem,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { updateItemAt } from "$lib/shared/media-composition/domain/post-project-edits";
  import { boxAt, framingAt } from "$lib/shared/media-composition/domain/post-project-keyframes";
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
  import {
    PICTURE_NUDGE,
    dragPicturePan,
    nudgePicturePan,
    stepPicturePinch,
    zoomFromWheelDelta,
  } from "./post-picture-pan-drag";

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

  /** A box this close to the whole frame reads as "fills the frame". */
  const FRAME_FILL_EPSILON = 1e-3;

  function fillsFrame(box: PostBox): boolean {
    return (
      box.x <= FRAME_FILL_EPSILON &&
      box.y <= FRAME_FILL_EPSILON &&
      box.width >= 1 - FRAME_FILL_EPSILON &&
      box.height >= 1 - FRAME_FILL_EPSILON
    );
  }

  /**
   * A body drag pans the picture, rather than moving the box, in Picture
   * mode - and always for a video that already fills the frame, where
   * moving the box would have nothing left to show for it.
   */
  function isPictureDragTarget(item: PostItem, box: PostBox): boolean {
    return (
      item.kind === "video" &&
      (editor.previewDragTarget === "picture" || fillsFrame(box))
    );
  }

  interface BoxDrag {
    kind: "box";
    pointerId: number;
    itemId: string;
    handle: BoxHandle;
    startBox: PostBox;
    startSeconds: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    moved: boolean;
  }

  interface PictureDrag {
    kind: "picture";
    pointerId: number;
    itemId: string;
    startPanX: number;
    startPanY: number;
    startSeconds: number;
    startX: number;
    startY: number;
    regionWidthPx: number;
    regionHeightPx: number;
    sourceWidth: number;
    sourceHeight: number;
    fit: "cover" | "contain";
    zoom: number;
    moved: boolean;
  }

  type Drag = BoxDrag | PictureDrag;

  let drag: Drag | null = null;
  let guides = $state<BoxGuides>({ vertical: false, horizontal: false });
  let dragging = $state(false);
  /** A press this small is a tap, not a move. */
  const TAP_PIXELS = 4;

  function hitTest(event: PointerEvent): PostItem | null {
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const seconds = editor.previewSeconds;
    return (
      itemsHere.find((item) => {
        const box = boxAt(item, seconds);
        return (
          x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
        );
      }) ?? null
    );
  }

  /** The mounted video's own pixel size, or zero until it has loaded. */
  function mountedVideoSize(itemId: string): { width: number; height: number } {
    const video = root?.querySelector<HTMLVideoElement>(`[data-clip-id="${itemId}"] video`);
    return { width: video?.videoWidth || 0, height: video?.videoHeight || 0 };
  }

  function startDrag(event: PointerEvent, item: PostItem, handle: BoxHandle) {
    if (!root || event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    // A drag another pointer left open (a pen beside a mouse) is kept as its
    // own step, so no gesture is left holding the history.
    releaseDrag(true);
    editor.pause();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const seconds = editor.previewSeconds;
    const box = boxAt(item, seconds);

    if (handle === "move" && isPictureDragTarget(item, box)) {
      const video = item as PostVideoItem;
      const framing = framingAt(video, seconds);
      const size = mountedVideoSize(item.id);
      drag = {
        kind: "picture",
        pointerId: event.pointerId,
        itemId: item.id,
        startPanX: framing.panX,
        startPanY: framing.panY,
        startSeconds: seconds,
        startX: event.clientX,
        startY: event.clientY,
        regionWidthPx: box.width * rect.width,
        regionHeightPx: box.height * rect.height,
        sourceWidth: size.width,
        sourceHeight: size.height,
        fit: video.fit,
        zoom: framing.zoom,
        moved: false,
      };
      return;
    }

    drag = {
      kind: "box",
      pointerId: event.pointerId,
      itemId: item.id,
      handle,
      startBox: box,
      startSeconds: seconds,
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
    const itemId = current.itemId;
    const seconds = current.startSeconds;
    if (current.kind === "picture") {
      const result = dragPicturePan({
        sourceWidth: current.sourceWidth,
        sourceHeight: current.sourceHeight,
        regionWidthPx: current.regionWidthPx,
        regionHeightPx: current.regionHeightPx,
        fit: current.fit,
        zoom: current.zoom,
        startPanX: current.startPanX,
        startPanY: current.startPanY,
        deltaXPx: pixelsX,
        deltaYPx: pixelsY,
      });
      editor.gestureStep((base, context) =>
        updateItemAt(
          base,
          itemId,
          { panX: result.panX, panY: result.panY },
          seconds,
          context
        )
      );
      return;
    }
    const result = dragBox(
      current.startBox,
      current.handle,
      pixelsX / current.width,
      pixelsY / current.height,
      !event.altKey
    );
    guides = result.guides;
    editor.gestureStep((base, context) =>
      updateItemAt(base, itemId, { box: result.box }, seconds, context)
    );
  }

  /** Ends the drag in progress, keeping its move or putting it back. */
  function releaseDrag(keep: boolean): void {
    const current = drag;
    if (!current) return;
    drag = null;
    dragging = false;
    guides = { vertical: false, horizontal: false };
    if (!current.moved) return;
    if (keep) editor.endGesture();
    else editor.cancelGesture();
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    releaseDrag(true);
  }

  function cancelDrag(): void {
    releaseDrag(false);
  }

  const ARROW_DIRECTIONS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  /** Arrow keys move the box - or, where a drag pans, pan the picture. */
  function nudge(event: KeyboardEvent): void {
    const item = selected;
    if (!item || trackLocked(item.id)) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const seconds = editor.previewSeconds;
    const current = boxAt(item, seconds);
    if (item.kind === "video" && isPictureDragTarget(item, current)) {
      nudgePicture(item, current, direction, event.shiftKey, seconds);
      return;
    }
    const step = event.shiftKey ? BOX_NUDGE.large : BOX_NUDGE.step;
    const box = dragBox(
      current,
      "move",
      direction[0] * step,
      direction[1] * step,
      false
    ).box;
    editor.edit((project, context) =>
      updateItemAt(project, item.id, { box }, seconds, context)
    );
  }

  function nudgePicture(
    item: PostVideoItem,
    box: PostBox,
    direction: [number, number],
    large: boolean,
    seconds: number
  ): void {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const framing = framingAt(item, seconds);
    const size = mountedVideoSize(item.id);
    const pan = nudgePicturePan({
      sourceWidth: size.width,
      sourceHeight: size.height,
      regionWidthPx: box.width * rect.width,
      regionHeightPx: box.height * rect.height,
      fit: item.fit,
      zoom: framing.zoom,
      panX: framing.panX,
      panY: framing.panY,
      directionX: direction[0],
      directionY: direction[1],
      step: large ? PICTURE_NUDGE.large : PICTURE_NUDGE.step,
    });
    if (pan.panX === framing.panX && pan.panY === framing.panY) return;
    // Held or repeated presses land as one undo step, as a wheel zoom does.
    editor.editSetting(`${item.id}:picture-pan`, (project, context) =>
      updateItemAt(project, item.id, pan, seconds, context)
    );
  }

  // ---- Zooming the picture: ctrl/cmd + wheel, and a touch pinch ------------

  function handleWheel(event: WheelEvent): void {
    if (!interactive || !(event.ctrlKey || event.metaKey)) return;
    const item = selected;
    if (!item || item.kind !== "video" || trackLocked(item.id)) return;
    // A ctrl/cmd + wheel zoom - a trackpad pinch reports the same way - is a
    // deliberate replacement for the page's own zoom.
    event.preventDefault();
    editor.pause();
    const seconds = editor.previewSeconds;
    const framing = framingAt(item, seconds);
    const zoom = zoomFromWheelDelta(framing.zoom, event.deltaY, POST_MIN_ZOOM, POST_MAX_ZOOM);
    if (zoom === framing.zoom) return;
    editor.editSetting(`${item.id}:picture-zoom`, (project, context) =>
      updateItemAt(project, item.id, { zoom }, seconds, context)
    );
  }

  interface PinchPoint {
    x: number;
    y: number;
  }

  interface PinchState {
    itemId: string;
    pointerA: number;
    pointerB: number;
    posA: PinchPoint;
    posB: PinchPoint;
    distance: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
    startSeconds: number;
    regionWidthPx: number;
    regionHeightPx: number;
    sourceWidth: number;
    sourceHeight: number;
    fit: "cover" | "contain";
    moved: boolean;
  }

  let pinch: PinchState | null = null;
  /** Touch points currently down on the edit layer, by pointer id. */
  const touchPoints = new Map<number, PinchPoint>();

  function distanceBetween(a: PinchPoint, b: PinchPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpointOf(a: PinchPoint, b: PinchPoint): PinchPoint {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** A second finger landing anywhere on the frame pinches a selected video. */
  function startPinch(): void {
    const item = selected;
    if (!root || !item || item.kind !== "video" || trackLocked(item.id)) return;
    if (touchPoints.size !== 2) return;
    const [[idA, posA], [idB, posB]] = [...touchPoints.entries()];
    // A one-finger move already made is kept as its own step, and the pinch
    // goes on from where it left the picture.
    releaseDrag(true);
    const rect = root.getBoundingClientRect();
    const seconds = editor.previewSeconds;
    const box = boxAt(item, seconds);
    const framing = framingAt(item, seconds);
    const size = mountedVideoSize(item.id);
    editor.pause();
    const mid = midpointOf(posA, posB);
    pinch = {
      itemId: item.id,
      pointerA: idA,
      pointerB: idB,
      posA,
      posB,
      distance: distanceBetween(posA, posB),
      midX: mid.x,
      midY: mid.y,
      zoom: framing.zoom,
      panX: framing.panX,
      panY: framing.panY,
      startSeconds: seconds,
      regionWidthPx: box.width * rect.width,
      regionHeightPx: box.height * rect.height,
      sourceWidth: size.width,
      sourceHeight: size.height,
      fit: item.fit,
      moved: false,
    };
  }

  function stepPinch(event: PointerEvent): void {
    const current = pinch;
    if (!current) return;
    if (event.pointerId === current.pointerA) {
      current.posA = { x: event.clientX, y: event.clientY };
    } else if (event.pointerId === current.pointerB) {
      current.posB = { x: event.clientX, y: event.clientY };
    } else {
      return;
    }
    const distance = distanceBetween(current.posA, current.posB);
    const mid = midpointOf(current.posA, current.posB);
    if (!current.moved) {
      const spread = Math.abs(distance - current.distance);
      const shift = Math.hypot(mid.x - current.midX, mid.y - current.midY);
      if (spread < TAP_PIXELS && shift < TAP_PIXELS) return;
      current.moved = true;
      dragging = true;
      editor.beginGesture();
    }
    const step = stepPicturePinch({
      sourceWidth: current.sourceWidth,
      sourceHeight: current.sourceHeight,
      regionWidthPx: current.regionWidthPx,
      regionHeightPx: current.regionHeightPx,
      fit: current.fit,
      zoom: current.zoom,
      panX: current.panX,
      panY: current.panY,
      distanceRatio: current.distance > 0 ? distance / current.distance : 1,
      midpointDeltaXPx: mid.x - current.midX,
      midpointDeltaYPx: mid.y - current.midY,
      minZoom: POST_MIN_ZOOM,
      maxZoom: POST_MAX_ZOOM,
    });
    current.distance = distance;
    current.midX = mid.x;
    current.midY = mid.y;
    current.zoom = step.zoom;
    current.panX = step.panX;
    current.panY = step.panY;
    const itemId = current.itemId;
    const seconds = current.startSeconds;
    editor.gestureStep((base, context) =>
      updateItemAt(
        base,
        itemId,
        { zoom: step.zoom, panX: step.panX, panY: step.panY },
        seconds,
        context
      )
    );
  }

  function endPinch(): void {
    const current = pinch;
    pinch = null;
    dragging = false;
    if (current?.moved) editor.endGesture();
  }

  function cancelPinch(): void {
    const current = pinch;
    pinch = null;
    dragging = false;
    if (current?.moved) editor.cancelGesture();
  }

  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (pinch) {
      event.preventDefault();
      event.stopPropagation();
      cancelPinch();
      return;
    }
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  }

  // ---- One pointer surface for a mouse drag, a touch drag or a pinch -------

  /**
   * Fingers are counted on the way down to the target, before the selection
   * box or a handle can claim the press, so a second finger anywhere on the
   * frame reaches the pinch instead of starting a drag of its own.
   */
  function countTouchDown(event: PointerEvent): void {
    if (event.pointerType !== "touch") return;
    // The first finger of a new touch: any finger still counted was lost.
    if (event.isPrimary) touchPoints.clear();
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size < 2) return;
    event.preventDefault();
    event.stopPropagation();
    if (touchPoints.size === 2 && !pinch) startPinch();
  }

  function countTouchMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  }

  function countTouchUp(event: PointerEvent): void {
    touchPoints.delete(event.pointerId);
  }

  function onLayerPointerDown(event: PointerEvent): void {
    if (pinch) return;
    pressFrame(event);
  }

  function onLayerPointerMove(event: PointerEvent): void {
    if (pinch) {
      if (event.pointerId === pinch.pointerA || event.pointerId === pinch.pointerB) {
        stepPinch(event);
      }
      return;
    }
    moveDrag(event);
  }

  function onLayerPointerUp(event: PointerEvent): void {
    if (pinch) {
      if (event.pointerId === pinch.pointerA || event.pointerId === pinch.pointerB) {
        endPinch();
      }
      return;
    }
    endDrag(event);
  }

  function onLayerPointerCancel(event: PointerEvent): void {
    if (pinch) {
      if (event.pointerId === pinch.pointerA || event.pointerId === pinch.pointerB) {
        cancelPinch();
      }
      return;
    }
    if (drag && event.pointerId === drag.pointerId) cancelDrag();
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
      {@const rect = editor.regionRects.get(region.id) ?? region}
      <div
        class="region"
        style:left={pct(rect.x)}
        style:top={pct(rect.y)}
        style:width={pct(rect.width)}
        style:height={pct(rect.height)}
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
      onpointerdowncapture={countTouchDown}
      onpointermovecapture={countTouchMove}
      onpointerupcapture={countTouchUp}
      onpointercancelcapture={countTouchUp}
      onpointerdown={onLayerPointerDown}
      onpointermove={onLayerPointerMove}
      onpointerup={onLayerPointerUp}
      onpointercancel={onLayerPointerCancel}
      onwheel={handleWheel}
    >
      {#if guides.vertical}
        <div class="guide vertical" aria-hidden="true"></div>
      {/if}
      {#if guides.horizontal}
        <div class="guide horizontal" aria-hidden="true"></div>
      {/if}
      {#if selected}
        {@const locked = trackLocked(selected.id)}
        {@const box = boxAt(selected, editor.previewSeconds)}
        {@const pictureMode = isPictureDragTarget(selected, box)}
        <div
          class="selection"
          class:dragging
          class:locked
          class:picture-mode={pictureMode}
          style:left={pct(box.x)}
          style:top={pct(box.y)}
          style:width={pct(box.width)}
          style:height={pct(box.height)}
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
        {selected && isPictureDragTarget(selected, boxAt(selected, editor.previewSeconds))
          ? t("post_editor_picture_hint")
          : t("post_editor_box_hint")}
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
  .selection.picture-mode {
    cursor: grab;
  }
  .selection.picture-mode.dragging {
    cursor: grabbing;
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
