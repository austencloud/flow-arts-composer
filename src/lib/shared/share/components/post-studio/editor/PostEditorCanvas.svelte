<script lang="ts">
  import { tick, untrack } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    motionDuration,
    reducedMotion,
  } from "$lib/shared/transitions/motion";
  import { LAYOUT_MOTION_EASING } from "$lib/shared/transitions/layout-flip";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import type { CompositionSourceBinding } from "$lib/shared/media-composition/state/media-composition-state.svelte";
  import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
  import type { PresetClip } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { toPaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import { backdropLayer } from "$lib/shared/media-composition/services/post-backdrop-painter";
  import {
    regionEdgePixels,
    shadowDropInRegion,
  } from "$lib/shared/media-composition/services/region-edge-painter";
  import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";
  import {
    itemIdFromClipId,
    itemIdFromStaffEffectRole,
  } from "$lib/shared/media-composition/domain/post-project-compiler";
  import { planProjectAudio } from "$lib/shared/media-composition/domain/post-audio-plan";
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
    type PostSourceGeometry,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { updateItemAt } from "$lib/shared/media-composition/domain/post-project-edits";
  import {
    boxAt,
    channelValueAt,
    framingAt,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import {
    postOutputSize,
    postSafeArea,
  } from "$lib/shared/media-composition/domain/post-canvas";
  import PostStudioBackdrop from "../PostStudioBackdrop.svelte";
  import PostStudioMediaLayer from "../PostStudioMediaLayer.svelte";
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
  import {
    BOX_CORNERS,
    BOX_NUDGE,
    BOX_SIDES,
    NO_GUIDES,
    TURN_HANDLE_GAP,
    boxContains,
    boxTurn,
    dragBox,
    handleCursor,
    intoTurnedBox,
    turnBox,
    turnHandleSide,
    type BoxGuides,
    type BoxHandle,
  } from "./post-box-drag";
  import { keepsShape, keptBox, shownBox } from "./post-item-rect";
  import {
    dragSourceGeometry,
    scaleSourceGeometry,
  } from "./post-source-geometry";
  import {
    PICTURE_NUDGE,
    dragPicturePan,
    nudgePicturePan,
    stepPicturePinch,
    zoomFromWheelDelta,
  } from "./post-picture-pan-drag";
  import {
    CROP_CORNERS,
    CROP_SIDES,
    cameraDisplayScale,
    cameraWindowCenter,
    cropCamera,
    cropWindowScale,
    handlePoint,
    handleScaleAt,
    handleScaleRange,
    type CropCamera,
    type CropHandle,
    type CropPoint,
    type CropPose,
    type CropSize,
  } from "./post-crop-geometry";
  import {
    boxPicture,
    frameGlideStart,
    glideStart,
    stagePicture,
    transformOfStyle,
    transformPicture,
    type StageFrame,
    type StageTransform,
  } from "./post-crop-glide";
  import type { CropSession } from "./post-crop-session.svelte";

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
    /**
     * The crop screen's session. While it holds a clip the canvas is the crop
     * stage: that clip's window fitted large in the middle, the rest of its
     * picture dimmed around it, and everything else in the post hidden but
     * still mounted.
     */
    crop?: CropSession | null;
    /** A region's footage has reported its own size. */
    onSourceSize?: (regionId: string, size: CropSize) => void;
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
    crop = null,
    onSourceSize,
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
  const previewAudioSegments = $derived(
    editor.compiled?.videoSegments.filter((segment) => segment.volume > 0) ?? []
  );
  const previewAudioPlan = $derived(
    editor.compiled
      ? planProjectAudio(editor.compiled, editor.project.audio)
      : []
  );

  function previewGain(entry: RegionEntry): number {
    if (!interactive || !editor.isPlaying || !entry.live) return 0;
    const index = previewAudioSegments.findIndex(
      (segment) => segment.itemId === itemIdFromClipId(entry.clip.id)
    );
    const segment = previewAudioPlan[index];
    if (!segment) return 0;
    const elapsed = editor.previewSeconds - segment.postStartSeconds;
    if (elapsed < 0 || elapsed >= segment.durationSeconds) return 0;
    const edgeFade = 0.008;
    let envelope = 1;
    const fadeIn = segment.crossfadeInSeconds ?? edgeFade;
    const fadeOut = segment.crossfadeOutSeconds ?? edgeFade;
    if (fadeIn > 0) envelope = Math.min(envelope, elapsed / fadeIn);
    if (fadeOut > 0)
      envelope = Math.min(
        envelope,
        (segment.durationSeconds - elapsed) / fadeOut
      );
    return Math.max(0, Math.min(1, envelope * (segment.gain ?? 1)));
  }
  /** The post's size, before anything is on it too. */
  const outputSize = $derived(
    preset?.output ?? postOutputSize(editor.project.canvas)
  );
  const visible = $derived(
    new Map(editor.frameLayers.map((layer) => [layer.clipId, layer]))
  );
  /** The main clip the blurred background shows, when the post has one. */
  const backdrop = $derived(
    preset ? backdropLayer(preset, editor.frameLayers) : null
  );
  /** The crop screen shows its clip even where a fade leaves it clear. */
  const present = $derived(
    cropping
      ? new Map(editor.presentLayers.map((layer) => [layer.clipId, layer]))
      : visible
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
      const layers = regionId === cropItem?.id ? present : visible;
      for (const role of roles) {
        const roleClips = clips.filter((clip) => clip.sourceRole === role);
        // At a shared edge both pieces are live; the later one shows.
        const liveClip = [...roleClips]
          .reverse()
          .find((clip) => layers.has(clip.id));
        if (liveClip) {
          list.push({
            role,
            clip: liveClip,
            layer: layers.get(liveClip.id)!,
            live: true,
          });
          continue;
        }
        const parked = roleClips[0];
        if (parked && bindingFor(role)?.renderMode === "external-media") {
          list.push({
            role,
            clip: parked,
            layer: parkedLayer(parked),
            live: false,
          });
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

  interface EdgeStyle {
    radius: string;
    shadow: string | undefined;
    border: string | undefined;
    color: string;
    opacity: number;
  }

  /**
   * A clip's corners, border and shadow at the stage's size, measured as the
   * export measures them. They fade with the clip, and the crop screen shows
   * the picture without them. A turned clip's shadow still drops straight
   * down the frame.
   */
  function edgeStyle(
    region: LayoutRegion,
    rect: { width: number; height: number; turn?: number },
    list: readonly RegionEntry[]
  ): EdgeStyle | null {
    if (!region.edge || cropping || stageWidth <= 0 || stageHeight <= 0) {
      return null;
    }
    const opacity = Math.max(
      0,
      ...list.map((entry) => (entry.live ? entry.layer.opacity : 0))
    );
    const pixels = regionEdgePixels(
      region.edge,
      { width: rect.width * stageWidth, height: rect.height * stageHeight },
      { width: stageWidth, height: stageHeight }
    );
    const shadow = pixels.shadow;
    const drop = shadow && shadowDropInRegion(shadow.drop, rect.turn ?? 0);
    return {
      radius: `${pixels.radius}px`,
      shadow:
        shadow && drop && opacity > 0
          ? `${drop.x}px ${drop.y}px ${shadow.blur}px rgb(0 0 0 / ${shadow.alpha * opacity})`
          : undefined,
      border: pixels.border > 0 ? `${pixels.border}px` : undefined,
      color: pixels.color,
      opacity,
    };
  }

  /** Regions whose animation has its beat and letter painted over it. */
  const paintedLabelRegions = $derived(
    new Set(
      bindingFor(ANIMATION_OVERLAY_ROLE)?.status === "ready" && preset
        ? preset.clips.flatMap((clip) =>
            clip.kind === "visual" && clip.sourceRole === ANIMATION_OVERLAY_ROLE
              ? [clip.regionId]
              : []
          )
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
   * A body drag pans the picture, rather than moving the box, for a video
   * that already fills the frame, where moving the box would have nothing
   * left to show for it.
   */
  function isPictureDragTarget(item: PostItem, box: PostBox): boolean {
    return (
      item.kind === "video" &&
      !sourceGeometryAt(item, editor.previewSeconds) &&
      fillsFrame(box)
    );
  }

  function sourceGeometryAt(
    item: PostItem,
    seconds: number
  ): PostSourceGeometry | null {
    if (item.kind !== "video" && item.kind !== "image") return null;
    if (!item.sourceGeometry && !item.keyframes?.sourceGeometry?.length)
      return null;
    return channelValueAt(item, "sourceGeometry", seconds);
  }

  function shownItemBox(item: PostItem, seconds: number): PostBox {
    const geometry = sourceGeometryAt(item, seconds);
    return geometry
      ? {
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          turn: geometry.rotation,
        }
      : shownBox(editor, item, seconds);
  }

  interface BoxDrag {
    kind: "box";
    pointerId: number;
    itemId: string;
    /** The item as the drag found it; its shape holds for the drag. */
    item: PostItem;
    handle: BoxHandle;
    /** Where it showed, which the handle moves. */
    startBox: PostBox;
    /** Its box, which a shaped clip keeps its room from. */
    startSpot: PostBox;
    startGeometry?: PostSourceGeometry;
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
    rotation: number;
    /** The box's own turn, which the drag is turned back out of. */
    turn: number;
    moved: boolean;
  }

  /** The turn handle swinging the whole box about its centre. */
  interface TurnDrag {
    kind: "turn";
    pointerId: number;
    itemId: string;
    /** Its box, which the turn keeps all but the angle of. */
    startSpot: PostBox;
    startGeometry?: PostSourceGeometry;
    startSeconds: number;
    startX: number;
    startY: number;
    /** The box's centre, in client pixels. */
    centreX: number;
    centreY: number;
    /** The pointer's angle about the centre as the drag began, in degrees. */
    startAngle: number;
    moved: boolean;
  }

  type Drag = BoxDrag | PictureDrag | TurnDrag;

  let drag: Drag | null = null;
  let guides = $state.raw<BoxGuides>(NO_GUIDES);
  /** A box, a picture or a pinch is moving: the grid and safe area show. */
  let dragging = $state(false);
  /**
   * A turn in progress: the side its handle keeps until the drag ends, so
   * it never jumps under the pointer, and the angle so far.
   */
  let turning = $state.raw<{
    side: "above" | "below" | "inside";
    degrees: number;
  } | null>(null);
  /** What Instagram leaves uncovered on this post's shape, if it covers any. */
  const safeArea = $derived(postSafeArea(editor.project.canvas));
  /** A press this small is a tap, not a move. */
  const TAP_PIXELS = 4;

  function hitTest(event: PointerEvent): PostItem | null {
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const seconds = editor.previewSeconds;
    return (
      itemsHere.find((item) =>
        boxContains(shownItemBox(item, seconds), x, y, rect.width / rect.height)
      ) ?? null
    );
  }

  /** The pointer's angle about a point, in degrees clockwise from east. */
  function angleAbout(x: number, y: number, event: PointerEvent): number {
    return (Math.atan2(event.clientY - y, event.clientX - x) * 180) / Math.PI;
  }

  const degreesLabel = (value: number) => `${Number(value.toFixed(1))}°`;

  /** The mounted video's own pixel size, or zero until it has loaded. */
  function mountedVideoSize(itemId: string): { width: number; height: number } {
    const video = root?.querySelector<HTMLVideoElement>(
      `[data-clip-id="${itemId}"] video`
    );
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
    const box = shownItemBox(item, seconds);

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
        rotation: framing.rotation,
        turn: boxTurn(box),
        moved: false,
      };
      return;
    }

    drag = {
      kind: "box",
      pointerId: event.pointerId,
      itemId: item.id,
      item,
      handle,
      startBox: box,
      startSpot: boxAt(item, seconds),
      startGeometry: sourceGeometryAt(item, seconds) ?? undefined,
      startSeconds: seconds,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  }

  /** The turn handle, pressed: the box turns about its centre as it goes. */
  function startTurn(event: PointerEvent, item: PostItem): void {
    if (!root || event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    releaseDrag(true);
    editor.pause();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const seconds = editor.previewSeconds;
    const box = shownItemBox(item, seconds);
    const centreX = rect.left + (box.x + box.width / 2) * rect.width;
    const centreY = rect.top + (box.y + box.height / 2) * rect.height;
    drag = {
      kind: "turn",
      pointerId: event.pointerId,
      itemId: item.id,
      startSpot: boxAt(item, seconds),
      startGeometry: sourceGeometryAt(item, seconds) ?? undefined,
      startSeconds: seconds,
      startX: event.clientX,
      startY: event.clientY,
      centreX,
      centreY,
      startAngle: angleAbout(centreX, centreY, event),
      moved: false,
    };
    turning = {
      side: turnHandleSide(box, { width: rect.width, height: rect.height }),
      degrees: boxTurn(box),
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
      const [deltaXPx, deltaYPx] = intoTurnedBox(
        pixelsX,
        pixelsY,
        current.turn
      );
      const result = dragPicturePan({
        sourceWidth: current.sourceWidth,
        sourceHeight: current.sourceHeight,
        regionWidthPx: current.regionWidthPx,
        regionHeightPx: current.regionHeightPx,
        fit: current.fit,
        zoom: current.zoom,
        rotation: current.rotation,
        startPanX: current.startPanX,
        startPanY: current.startPanY,
        deltaXPx,
        deltaYPx,
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
    if (current.kind === "turn") {
      // Alt turns freely and Shift in steps, as a move's Alt skips its snaps.
      const turn = turnBox(
        current.startGeometry
          ? { ...current.startSpot, turn: current.startGeometry.rotation }
          : current.startSpot,
        angleAbout(current.centreX, current.centreY, event) -
          current.startAngle,
        event.altKey ? "free" : event.shiftKey ? "step" : "snap"
      );
      if (turning) turning = { ...turning, degrees: turn };
      const patch = current.startGeometry
        ? { sourceGeometry: { ...current.startGeometry, rotation: turn } }
        : { box: { ...current.startSpot, turn } };
      editor.gestureStep((base, context) =>
        updateItemAt(base, itemId, patch, seconds, context)
      );
      return;
    }
    if (current.startGeometry) {
      const sourceGeometry = dragSourceGeometry(
        current.startGeometry,
        current.handle,
        pixelsX,
        pixelsY,
        current.width,
        current.height
      );
      editor.gestureStep((base, context) =>
        updateItemAt(base, itemId, { sourceGeometry }, seconds, context)
      );
      return;
    }
    const result = dragBox(
      current.startBox,
      current.handle,
      pixelsX / current.width,
      pixelsY / current.height,
      !event.altKey,
      safeArea,
      current.width / current.height
    );
    guides = result.guides;
    const box = keptBox(editor, current.item, result.box, current.startSpot);
    editor.gestureStep((base, context) =>
      updateItemAt(base, itemId, { box }, seconds, context)
    );
  }

  /** Ends the drag in progress, keeping its move or putting it back. */
  function releaseDrag(keep: boolean): void {
    const current = drag;
    if (!current) return;
    drag = null;
    dragging = false;
    guides = NO_GUIDES;
    turning = null;
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
    const current = shownItemBox(item, seconds);
    const geometry = sourceGeometryAt(item, seconds);
    if (geometry) {
      const step = event.shiftKey ? BOX_NUDGE.large : BOX_NUDGE.step;
      const sourceGeometry = {
        ...geometry,
        x: geometry.x + direction[0] * step,
        y: geometry.y + direction[1] * step,
      };
      editor.editSetting(`${item.id}:source-position`, (project, context) =>
        updateItemAt(project, item.id, { sourceGeometry }, seconds, context)
      );
      return;
    }
    if (item.kind === "video" && isPictureDragTarget(item, current)) {
      nudgePicture(item, current, direction, event.shiftKey, seconds);
      return;
    }
    const step = event.shiftKey ? BOX_NUDGE.large : BOX_NUDGE.step;
    const moved = dragBox(
      current,
      "move",
      direction[0] * step,
      direction[1] * step,
      false
    ).box;
    const box = keptBox(editor, item, moved, boxAt(item, seconds));
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
    // The picture moves the way the key points on screen, turned box or not.
    const [directionX, directionY] = intoTurnedBox(
      direction[0],
      direction[1],
      boxTurn(box)
    );
    const pan = nudgePicturePan({
      sourceWidth: size.width,
      sourceHeight: size.height,
      regionWidthPx: box.width * rect.width,
      regionHeightPx: box.height * rect.height,
      fit: item.fit,
      zoom: framing.zoom,
      rotation: framing.rotation,
      panX: framing.panX,
      panY: framing.panY,
      directionX,
      directionY,
      step: large ? PICTURE_NUDGE.large : PICTURE_NUDGE.step,
    });
    if (pan.panX === framing.panX && pan.panY === framing.panY) return;
    // Held or repeated presses land as one undo step, as a wheel zoom does.
    editor.editSetting(`${item.id}:picture-pan`, (project, context) =>
      updateItemAt(project, item.id, pan, seconds, context)
    );
  }

  // ---- Zooming the picture: ctrl/cmd + wheel, and a touch pinch ------------

  let editLayer = $state<HTMLElement | null>(null);

  // Svelte adds wheel handlers as passive, and a passive handler cannot stop
  // the page zooming or scrolling under the picture.
  $effect(() => {
    const target = editLayer;
    if (!target) return;
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  });

  function handleWheel(event: WheelEvent): void {
    if (!interactive) return;
    if (cropping) {
      cropWheel(event);
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const item = selected;
    if (
      !item ||
      (item.kind !== "video" && item.kind !== "image") ||
      trackLocked(item.id)
    )
      return;
    // A ctrl/cmd + wheel zoom - a trackpad pinch reports the same way - is a
    // deliberate replacement for the page's own zoom.
    event.preventDefault();
    editor.pause();
    const seconds = editor.previewSeconds;
    const sourceGeometry = sourceGeometryAt(item, seconds);
    if (sourceGeometry) {
      const rect = root?.getBoundingClientRect();
      if (!rect) return;
      const factor = Math.max(
        0.5,
        Math.min(2, Math.exp(-event.deltaY * 0.001))
      );
      const next = scaleSourceGeometry(
        sourceGeometry,
        factor,
        0,
        0,
        rect.width,
        rect.height
      );
      editor.editSetting(`${item.id}:source-size`, (project, context) =>
        updateItemAt(
          project,
          item.id,
          { sourceGeometry: next },
          seconds,
          context
        )
      );
      return;
    }
    if (item.kind !== "video") return;
    const framing = framingAt(item, seconds);
    const zoom = zoomFromWheelDelta(
      framing.zoom,
      event.deltaY,
      POST_MIN_ZOOM,
      POST_MAX_ZOOM
    );
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
    sourceGeometry?: PostSourceGeometry;
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
    rotation: number;
    /** The box's own turn, which the fingers' slide is turned back out of. */
    turn: number;
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
    if (
      !root ||
      !item ||
      (item.kind !== "video" && item.kind !== "image") ||
      trackLocked(item.id)
    )
      return;
    if (item.kind === "image" && !sourceGeometryAt(item, editor.previewSeconds))
      return;
    const [first, second] = [...touchPoints.entries()];
    if (touchPoints.size !== 2 || !first || !second) return;
    const [idA, posA] = first;
    const [idB, posB] = second;
    // A one-finger move already made is kept as its own step, and the pinch
    // goes on from where it left the picture.
    releaseDrag(true);
    const rect = root.getBoundingClientRect();
    const seconds = editor.previewSeconds;
    const box = shownItemBox(item, seconds);
    const framing =
      item.kind === "video"
        ? framingAt(item, seconds)
        : { zoom: 1, panX: 0, panY: 0, rotation: 0 };
    const size =
      item.kind === "video"
        ? mountedVideoSize(item.id)
        : { width: 0, height: 0 };
    editor.pause();
    const mid = midpointOf(posA, posB);
    pinch = {
      itemId: item.id,
      sourceGeometry: sourceGeometryAt(item, seconds) ?? undefined,
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
      fit: item.kind === "video" ? item.fit : "contain",
      rotation: framing.rotation,
      turn: boxTurn(box),
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
    if (current.sourceGeometry) {
      const rect = root?.getBoundingClientRect();
      if (!rect) return;
      const factor = current.distance > 0 ? distance / current.distance : 1;
      const next = scaleSourceGeometry(
        current.sourceGeometry,
        factor,
        mid.x - current.midX,
        mid.y - current.midY,
        rect.width,
        rect.height
      );
      current.sourceGeometry = next;
      current.distance = distance;
      current.midX = mid.x;
      current.midY = mid.y;
      editor.gestureStep((base, context) =>
        updateItemAt(
          base,
          current.itemId,
          { sourceGeometry: next },
          current.startSeconds,
          context
        )
      );
      return;
    }
    const [slideX, slideY] = intoTurnedBox(
      mid.x - current.midX,
      mid.y - current.midY,
      current.turn
    );
    const step = stepPicturePinch({
      sourceWidth: current.sourceWidth,
      sourceHeight: current.sourceHeight,
      regionWidthPx: current.regionWidthPx,
      regionHeightPx: current.regionHeightPx,
      fit: current.fit,
      zoom: current.zoom,
      rotation: current.rotation,
      panX: current.panX,
      panY: current.panY,
      distanceRatio: current.distance > 0 ? distance / current.distance : 1,
      midpointDeltaXPx: slideX,
      midpointDeltaYPx: slideY,
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
    if (cancelCropGesture()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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

  // ---- The crop screen -------------------------------------------------------

  /** The clip on the crop screen, while it is open. */
  const cropItem = $derived(interactive ? (crop?.item ?? null) : null);
  const cropping = $derived(cropItem !== null);

  /** The canvas's own size: on the crop screen, the stage's. */
  let stageWidth = $state(0);
  let stageHeight = $state(0);

  // Measured as soon as the screen opens, so the window is in place before
  // the flight into it is measured.
  $effect(() => {
    if (!cropping || !root) return;
    stageWidth = root.clientWidth;
    stageHeight = root.clientHeight;
  });

  const cropWindowWidth = $derived(crop?.window?.width ?? 0);
  const cropWindowHeight = $derived(crop?.window?.height ?? 0);
  const cropPose = $derived(cropping ? (crop?.pose ?? null) : null);

  /**
   * Where the stage shows the clip's whole picture, with the window over its
   * part of it. Between gestures it follows the crop; while a drag, pinch or
   * handle runs it holds still, so the picture stays put and the frame moves.
   */
  let heldCamera = $state.raw<CropCamera | null>(null);
  const liveCamera = $derived.by((): CropCamera | null => {
    if (!cropPose || stageWidth <= 0 || stageHeight <= 0) return null;
    return cropCamera({
      stage: { width: stageWidth, height: stageHeight },
      pose: cropPose,
    });
  });
  const camera = $derived(heldCamera ?? liveCamera);

  /** Screen pixels per output pixel on the crop stage. */
  const displayScale = $derived.by(() => {
    if (!cropping || stageWidth <= 0 || stageHeight <= 0) return 0;
    if (cropPose && camera) return cameraDisplayScale(cropPose, camera);
    if (cropWindowWidth <= 0 || cropWindowHeight <= 0) return 0;
    return cropWindowScale({
      stage: { width: stageWidth, height: stageHeight },
      window: { width: cropWindowWidth, height: cropWindowHeight },
    });
  });

  interface ScreenRect {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  /**
   * The window on the stage, over its part of the picture; centred until the
   * footage's size is known.
   */
  const windowRect = $derived.by((): ScreenRect | null => {
    if (displayScale <= 0 || cropWindowWidth <= 0 || cropWindowHeight <= 0)
      return null;
    const width = cropWindowWidth * displayScale;
    const height = cropWindowHeight * displayScale;
    const center =
      cropPose && camera
        ? cameraWindowCenter(cropPose, camera)
        : { x: stageWidth / 2, y: stageHeight / 2 };
    return {
      left: center.x - width / 2,
      top: center.y - height / 2,
      width,
      height,
    };
  });

  /** Where a gesture measures from: the window as the gesture began. */
  interface GestureOrigin {
    /** The window's centre, in client pixels. */
    x: number;
    y: number;
    /** Screen pixels per output pixel. */
    scale: number;
  }

  interface CropDrag {
    pointerId: number;
    startX: number;
    startY: number;
    started: boolean;
    origin: GestureOrigin;
  }

  interface CropPinch {
    pointerA: number;
    pointerB: number;
    posA: PinchPoint;
    posB: PinchPoint;
    startDistance: number;
    /** Output pixels from the window's centre. */
    startMidpoint: CropPoint;
    started: boolean;
    origin: GestureOrigin;
  }

  interface HandleDrag {
    pointerId: number;
    handle: CropHandle;
    /** Where on the handle it was taken, from its point, in output pixels. */
    grab: CropPoint;
    range: { min: number; max: number };
    /** The window as the drag began, in output pixels. */
    window: CropSize;
    origin: GestureOrigin;
  }

  let cropDrag: CropDrag | null = null;
  let cropPinch: CropPinch | null = null;
  let handleDrag = $state<HandleDrag | null>(null);
  /** A drag, pinch or handle is moving: the thirds show clearly. */
  let cropActive = $state(false);
  /** How far past its limit the frame is pulled, in screen pixels. */
  let rubber = $state<CropPoint>({ x: 0, y: 0 });

  /** The furthest a pull past the limit still shows, in screen pixels. */
  const RUBBER_RANGE_PX = 64;
  /** + and - zoom by this much about the window's centre. */
  const CROP_ZOOM_STEP = 1.1;
  /** Pixels a wheel scrolls per line, for wheels that count in lines. */
  const WHEEL_LINE_PX = 16;
  /** A wheel this long idle has finished, and what it left is announced. */
  const WHEEL_SETTLE_MS = 400;

  /** The frame on the stage in whole pixels: the window, and any pull past it. */
  const frameRect = $derived.by((): ScreenRect | null => {
    const rect = windowRect;
    if (!rect) return null;
    const left = Math.round(rect.left + rubber.x);
    const top = Math.round(rect.top + rubber.y);
    return {
      left,
      top,
      width: Math.max(1, Math.round(rect.left + rubber.x + rect.width) - left),
      height: Math.max(1, Math.round(rect.top + rubber.y + rect.height) - top),
    };
  });

  // Leaving the crop screen ends whatever it was doing there; the editor's
  // session has already kept or dropped a drag in progress.
  $effect(() => {
    if (cropping) return;
    untrack(() => {
      cropDrag = null;
      cropPinch = null;
      handleDrag = null;
      cropActive = false;
      heldCamera = null;
      rubber = { x: 0, y: 0 };
    });
  });

  /** The window's centre and scale now, for a gesture to measure from. */
  function gestureOrigin(): GestureOrigin | null {
    const rect = windowRect;
    if (!root || !rect || displayScale <= 0) return null;
    const bounds = root.getBoundingClientRect();
    return {
      x: bounds.left + rect.left + rect.width / 2,
      y: bounds.top + rect.top + rect.height / 2,
      scale: displayScale,
    };
  }

  /** A client point in output pixels from the window's centre at `origin`. */
  function fromOrigin(
    origin: GestureOrigin,
    clientX: number,
    clientY: number
  ): CropPoint {
    return {
      x: (clientX - origin.x) / origin.scale,
      y: (clientY - origin.y) / origin.scale,
    };
  }

  /** A client point in output pixels from the window's centre. */
  function toWindowPoint(clientX: number, clientY: number): CropPoint | null {
    const origin = gestureOrigin();
    return origin ? fromOrigin(origin, clientX, clientY) : null;
  }

  function cropRegionElement(): HTMLElement | null {
    return root?.querySelector<HTMLElement>("[data-crop-region]") ?? null;
  }

  function cropFrameElement(): HTMLElement | null {
    return root?.querySelector<HTMLElement>("[data-crop-frame]") ?? null;
  }

  function rubberRange(): number {
    return reducedMotion() || displayScale <= 0
      ? 0
      : RUBBER_RANGE_PX / displayScale;
  }

  /** A new gesture takes the frame from wherever a flight or settle had it. */
  function stopCropMotion(): void {
    for (const element of [cropRegionElement(), cropFrameElement()]) {
      for (const animation of element?.getAnimations() ?? [])
        animation.cancel();
    }
  }

  /** Starts a gesture with the picture held where it is. */
  function beginCropGesture(range: number): boolean {
    if (!crop || !crop.startGesture(range)) return false;
    heldCamera = camera;
    cropActive = true;
    return true;
  }

  /**
   * Ends a gesture. A pull past the limit eases back to it, and where the
   * frame was left past the picture the stage eases to show both again.
   */
  function finishCropGesture(keep: boolean): void {
    const fromFrame = frameRect;
    const fromRegion = windowRect;
    cropActive = false;
    crop?.endGesture(keep);
    heldCamera = null;
    rubber = { x: 0, y: 0 };
    void settleCamera(fromFrame, fromRegion);
  }

  async function settleCamera(
    fromFrame: ScreenRect | null,
    fromRegion: ScreenRect | null
  ): Promise<void> {
    const duration = motionDuration(DURATION.emphasis);
    await tick();
    if (duration <= 0) return;
    for (const [element, from, to] of [
      [cropRegionElement(), fromRegion, windowRect],
      [cropFrameElement(), fromFrame, frameRect],
    ] as const) {
      if (!element || !from || !to || sameRect(from, to)) continue;
      element.animate([rectKeyframe(from), rectKeyframe(to)], {
        duration,
        easing: LAYOUT_MOTION_EASING,
      });
    }
  }

  function rectKeyframe(rect: ScreenRect): Keyframe {
    return {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }

  function sameRect(a: ScreenRect, b: ScreenRect): boolean {
    return (
      Math.abs(a.left - b.left) < 0.5 &&
      Math.abs(a.top - b.top) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      Math.abs(a.height - b.height) < 0.5
    );
  }

  /** What the stage last drew, for a press to glide from. */
  interface Drawn {
    pose: CropPose;
    mirror: boolean;
    presses: number;
  }
  let drawn: Drawn | null = null;
  /** The running glide; any other change to the framing ends it. */
  let glide: Animation[] = [];

  const STILL: StageTransform = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    mirror: false,
  };

  // Rotate, a shape and Reset draw their framing at once, and the picture and
  // its frame glide there from where they were. The stage is read before it
  // draws the press, so a press during a glide or a settle carries on from
  // there. Any other change moves them at once: a slider or a key follows
  // the hand.
  $effect.pre(() => {
    const presses = crop?.presses ?? 0;
    const pose = cropPose;
    untrack(() => {
      if (drawn && pose && presses !== drawn.presses) glideFrom(drawn);
      else stopGlide();
    });
  });

  $effect(() => {
    const pose = cropPose;
    const mirror = cropItem?.flip ?? false;
    const presses = crop?.presses ?? 0;
    drawn = pose ? { pose, mirror, presses } : null;
  });

  function stopGlide(): void {
    for (const animation of glide) animation.cancel();
    glide = [];
  }

  function styleRect(style: CSSStyleDeclaration): ScreenRect {
    return {
      left: Number.parseFloat(style.left),
      top: Number.parseFloat(style.top),
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    };
  }

  function rectCenter(rect: ScreenRect): CropPoint {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** Starts a press's glide from the picture and frame as they are drawn now. */
  function glideFrom(before: Drawn): void {
    const region = cropRegionElement();
    const frameElement = cropFrameElement();
    const duration = motionDuration(DURATION.emphasis);
    if (!region || !frameElement || duration <= 0) {
      stopGlide();
      return;
    }
    const regionStyle = getComputedStyle(region);
    const box = styleRect(regionStyle);
    const flight = transformOfStyle(regionStyle);
    const picture = transformPicture(
      boxPicture(
        before.pose,
        { center: rectCenter(box), width: box.width },
        before.mirror
      ),
      flight,
      rectCenter(box)
    );
    const frameStyle = getComputedStyle(frameElement);
    const shownFrame = styleRect(frameStyle);
    const frame: StageFrame = {
      center: rectCenter(shownFrame),
      width: shownFrame.width,
      height: shownFrame.height,
      rotation: transformOfStyle(frameStyle).rotation,
    };
    stopCropMotion();
    glide = [];
    void tick().then(() => {
      const pose = cropPose;
      const slot = windowRect;
      const to = frameRect;
      if (!pose || !camera || !slot || !to) return;
      const start = glideStart(
        picture,
        stagePicture(pose, camera, cropItem?.flip ?? false),
        rectCenter(slot),
        flight.rotation
      );
      const frameStart = frameGlideStart(frame, to, start.rotation);
      const frameEnd: StageFrame = {
        center: rectCenter(to),
        width: to.width,
        height: to.height,
        rotation: 0,
      };
      const options = { duration, easing: LAYOUT_MOTION_EASING };
      const regionNow = cropRegionElement();
      const frameNow = cropFrameElement();
      if (regionNow && !isStill(start)) {
        glide.push(
          regionNow.animate(
            [transformKeyframe(start), transformKeyframe(STILL)],
            options
          )
        );
      }
      if (frameNow && !sameFrame(frameStart, frameEnd)) {
        glide.push(
          frameNow.animate(
            [frameKeyframe(frameStart), frameKeyframe(frameEnd)],
            options
          )
        );
      }
    });
  }

  function isStill(transform: StageTransform): boolean {
    return (
      Math.abs(transform.x) < 0.5 &&
      Math.abs(transform.y) < 0.5 &&
      Math.abs(transform.rotation) < 0.01 &&
      Math.abs(transform.scale - 1) < 0.001 &&
      !transform.mirror
    );
  }

  function sameFrame(a: StageFrame, b: StageFrame): boolean {
    return (
      Math.abs(a.rotation - b.rotation) < 0.01 &&
      sameRect(frameBox(a), frameBox(b))
    );
  }

  function frameBox(frame: StageFrame): ScreenRect {
    return {
      left: frame.center.x - frame.width / 2,
      top: frame.center.y - frame.height / 2,
      width: frame.width,
      height: frame.height,
    };
  }

  /** CSS's own translate, rotate and scale, which a glide eases to none. */
  function transformKeyframe(transform: StageTransform): Keyframe {
    const across = transform.mirror ? -transform.scale : transform.scale;
    return {
      translate: `${transform.x}px ${transform.y}px`,
      rotate: `${transform.rotation}deg`,
      scale: `${across} ${transform.scale}`,
    };
  }

  function frameKeyframe(frame: StageFrame): Keyframe {
    return { ...rectKeyframe(frameBox(frame)), rotate: `${frame.rotation}deg` };
  }

  function isPinchPointer(
    state: { pointerA: number; pointerB: number },
    event: PointerEvent
  ): boolean {
    return (
      event.pointerId === state.pointerA || event.pointerId === state.pointerB
    );
  }

  /** A press anywhere on the stage takes the frame, ready to drag. */
  function pressCropStage(event: PointerEvent): void {
    if (!crop || event.button !== 0 || handleDrag) return;
    const origin = gestureOrigin();
    if (!origin) return;
    event.preventDefault();
    releaseCropDrag(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    cropDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      origin,
    };
  }

  /** The frame follows the pointer, and past its limit, with resistance. */
  function moveCropDrag(event: PointerEvent): void {
    const current = cropDrag;
    if (!current || !crop || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.started) {
      if (Math.hypot(dx, dy) < TAP_PIXELS) return;
      stopCropMotion();
      if (!beginCropGesture(rubberRange())) {
        cropDrag = null;
        return;
      }
      current.started = true;
    }
    const scale = current.origin.scale;
    const over = crop.dragTo({ x: dx / scale, y: dy / scale });
    rubber = { x: over.x * displayScale, y: over.y * displayScale };
  }

  function releaseCropDrag(keep: boolean): void {
    const current = cropDrag;
    if (!current) return;
    cropDrag = null;
    if (current.started) finishCropGesture(keep);
  }

  /** A second finger turns the drag into a pinch about the fingers. */
  function startCropPinch(): void {
    const [first, second] = [...touchPoints.entries()];
    if (!crop || touchPoints.size !== 2 || !first || !second) return;
    // A one-finger move or a corner already made is kept as its own step.
    releaseCropDrag(true);
    releaseHandleDrag(true);
    const origin = gestureOrigin();
    if (!origin) return;
    const [idA, posA] = first;
    const [idB, posB] = second;
    const mid = midpointOf(posA, posB);
    cropPinch = {
      pointerA: idA,
      pointerB: idB,
      posA,
      posB,
      startDistance: distanceBetween(posA, posB),
      startMidpoint: fromOrigin(origin, mid.x, mid.y),
      started: false,
      origin,
    };
  }

  function stepCropPinch(event: PointerEvent): void {
    const current = cropPinch;
    if (!current || !crop || !isPinchPointer(current, event)) return;
    const point = { x: event.clientX, y: event.clientY };
    if (event.pointerId === current.pointerA) current.posA = point;
    else current.posB = point;
    const mid = midpointOf(current.posA, current.posB);
    const midpoint = fromOrigin(current.origin, mid.x, mid.y);
    const distance = distanceBetween(current.posA, current.posB);
    if (!current.started) {
      const spread = Math.abs(distance - current.startDistance);
      const shift =
        Math.hypot(
          midpoint.x - current.startMidpoint.x,
          midpoint.y - current.startMidpoint.y
        ) * current.origin.scale;
      if (spread < TAP_PIXELS && shift < TAP_PIXELS) return;
      stopCropMotion();
      if (!beginCropGesture(rubberRange())) {
        cropPinch = null;
        return;
      }
      current.started = true;
    }
    const over = crop.pinchTo({
      startMidpoint: current.startMidpoint,
      midpoint,
      spread: current.startDistance > 0 ? distance / current.startDistance : 1,
    });
    rubber = { x: over.x * displayScale, y: over.y * displayScale };
  }

  function releaseCropPinch(keep: boolean): void {
    const current = cropPinch;
    if (!current) return;
    cropPinch = null;
    if (current.started) finishCropGesture(keep);
  }

  /** A corner or side takes the frame; the picture holds still under it. */
  function pressHandle(event: PointerEvent, handle: CropHandle): void {
    const pose = crop?.pose;
    const rect = windowRect;
    if (!crop || !pose || !rect || crop.locked || event.button !== 0) return;
    if (touchPoints.size > 1) return;
    const origin = gestureOrigin();
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    releaseCropDrag(true);
    stopCropMotion();
    const range = handleScaleRange({
      pose,
      handle,
      limit: crop.limit,
      displayScale,
      stage: { width: stageWidth, height: stageHeight },
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      free: crop.free,
    });
    if (!beginCropGesture(0)) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = fromOrigin(origin, event.clientX, event.clientY);
    const at = handlePoint(pose.window, handle, 1);
    handleDrag = {
      pointerId: event.pointerId,
      handle,
      grab: { x: point.x - at.x, y: point.y - at.y },
      range,
      window: pose.window,
      origin,
    };
  }

  function moveHandle(event: PointerEvent): void {
    const current = handleDrag;
    if (!current || !crop || event.pointerId !== current.pointerId) return;
    const point = fromOrigin(current.origin, event.clientX, event.clientY);
    const scale = handleScaleAt(current.window, current.handle, {
      x: point.x - current.grab.x,
      y: point.y - current.grab.y,
    });
    crop.handleTo(
      current.handle,
      Math.min(current.range.max, Math.max(current.range.min, scale))
    );
  }

  /** Let go, the frame stays where it was held: that is the crop. */
  function releaseHandleDrag(keep: boolean): void {
    if (!handleDrag) return;
    handleDrag = null;
    finishCropGesture(keep);
  }

  /** Escape during a crop gesture puts it back; true when one was running. */
  function cancelCropGesture(): boolean {
    if (handleDrag) {
      releaseHandleDrag(false);
      return true;
    }
    if (cropPinch?.started) {
      releaseCropPinch(false);
      return true;
    }
    if (cropDrag?.started) {
      releaseCropDrag(false);
      return true;
    }
    return false;
  }

  let wheelSettle: ReturnType<typeof setTimeout> | undefined;

  /** Ctrl or Cmd + scroll zooms about the pointer; a plain scroll moves the frame. */
  function cropWheel(event: WheelEvent): void {
    if (
      !crop ||
      displayScale <= 0 ||
      handleDrag ||
      cropPinch ||
      cropDrag?.started
    )
      return;
    event.preventDefault();
    const unit =
      event.deltaMode === 1
        ? WHEEL_LINE_PX
        : event.deltaMode === 2
          ? stageHeight
          : 1;
    stopCropMotion();
    if (event.ctrlKey || event.metaKey) {
      const pose = crop.pose;
      if (!pose) return;
      const zoom = zoomFromWheelDelta(
        pose.zoom,
        event.deltaY * unit,
        POST_MIN_ZOOM,
        POST_MAX_ZOOM
      );
      crop.zoomBy(
        zoom / pose.zoom,
        toWindowPoint(event.clientX, event.clientY) ?? undefined
      );
    } else {
      let dx = event.deltaX * unit;
      let dy = event.deltaY * unit;
      // A mouse wheel with Shift held scrolls sideways.
      if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0];
      crop.panBy({ x: -dx / displayScale, y: -dy / displayScale });
    }
    clearTimeout(wheelSettle);
    wheelSettle = setTimeout(() => crop?.announce(), WHEEL_SETTLE_MS);
  }

  $effect(() => () => clearTimeout(wheelSettle));

  /** On the frame: arrows move it, + and - zoom. */
  function cropKey(event: KeyboardEvent): void {
    if (!crop || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      stopCropMotion();
      crop.nudge({ x: direction[0], y: direction[1] }, event.shiftKey);
      return;
    }
    const factor =
      event.key === "+" || event.key === "="
        ? CROP_ZOOM_STEP
        : event.key === "-" || event.key === "_"
          ? 1 / CROP_ZOOM_STEP
          : null;
    if (factor === null) return;
    event.preventDefault();
    event.stopPropagation();
    stopCropMotion();
    if (crop.zoomBy(factor)) crop.announce();
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
    if (touchPoints.size !== 2 || pinch || cropPinch) return;
    if (cropping) startCropPinch();
    else startPinch();
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
    if (pinch || cropPinch) return;
    if (cropping) pressCropStage(event);
    else pressFrame(event);
  }

  function onLayerPointerMove(event: PointerEvent): void {
    if (cropPinch) {
      stepCropPinch(event);
      return;
    }
    if (handleDrag) {
      moveHandle(event);
      return;
    }
    if (cropDrag) {
      moveCropDrag(event);
      return;
    }
    if (pinch) {
      if (
        event.pointerId === pinch.pointerA ||
        event.pointerId === pinch.pointerB
      ) {
        stepPinch(event);
      }
      return;
    }
    moveDrag(event);
  }

  function onLayerPointerUp(event: PointerEvent): void {
    if (cropPinch) {
      if (isPinchPointer(cropPinch, event)) releaseCropPinch(true);
      return;
    }
    if (handleDrag) {
      if (event.pointerId === handleDrag.pointerId) releaseHandleDrag(true);
      return;
    }
    if (cropDrag) {
      if (event.pointerId === cropDrag.pointerId) releaseCropDrag(true);
      return;
    }
    if (pinch) {
      if (
        event.pointerId === pinch.pointerA ||
        event.pointerId === pinch.pointerB
      ) {
        endPinch();
      }
      return;
    }
    endDrag(event);
  }

  function onLayerPointerCancel(event: PointerEvent): void {
    if (cropPinch) {
      if (isPinchPointer(cropPinch, event)) releaseCropPinch(false);
      return;
    }
    if (handleDrag) {
      if (event.pointerId === handleDrag.pointerId) releaseHandleDrag(false);
      return;
    }
    if (cropDrag) {
      if (event.pointerId === cropDrag.pointerId) releaseCropDrag(false);
      return;
    }
    if (pinch) {
      if (
        event.pointerId === pinch.pointerA ||
        event.pointerId === pinch.pointerB
      ) {
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
  class:cropping
  bind:this={root}
  bind:clientWidth={stageWidth}
  bind:clientHeight={stageHeight}
  style:aspect-ratio={cropping
    ? undefined
    : `${outputSize.width} / ${outputSize.height}`}
  data-post-canvas
>
  {#if preset}
    {#if backdrop && !cropping}
      <PostStudioBackdrop
        {root}
        layer={backdrop}
        aspect={outputSize.width / outputSize.height}
      />
    {/if}
    {#each preset.regions as region (region.id)}
      {@const rect = editor.regionRects.get(region.id) ?? region}
      {@const cropRegion = cropping && region.id === cropItem?.id}
      {@const cropWindow = cropRegion ? windowRect : null}
      {@const edge = edgeStyle(region, rect, entries.get(region.id) ?? [])}
      <!-- A turned clip turns whole, but the crop screen frames it straight,
           and it cuts to the crop screen rather than flying. -->
      <div
        class="region"
        class:edged={edge !== null}
        class:crop-region={cropRegion}
        class:crop-hidden={cropping && !cropRegion}
        data-crop-region={cropRegion ? "" : undefined}
        data-crop-flip={region.id === (cropItem?.id ?? editor.selectedItemId) &&
        !rect.turn
          ? "region"
          : undefined}
        style:left={cropWindow ? `${cropWindow.left}px` : pct(rect.x)}
        style:top={cropWindow ? `${cropWindow.top}px` : pct(rect.y)}
        style:width={cropWindow ? `${cropWindow.width}px` : pct(rect.width)}
        style:height={cropWindow ? `${cropWindow.height}px` : pct(rect.height)}
        style:rotate={!cropRegion && rect.turn ? `${rect.turn}deg` : undefined}
        style:z-index={region.zIndex}
        style:border-radius={edge?.radius}
        style:box-shadow={edge?.shadow}
        style:--edge-border={edge?.border}
        style:--edge-color={edge?.color}
        style:--edge-opacity={edge?.opacity}
      >
        {#each entries.get(region.id) ?? [] as entry (entry.role)}
          {@const binding = bindingFor(entry.role)}
          {@const layer = entry.layer}
          {@const isVideo = binding?.renderMode === "external-media"}
          {#if binding?.status === "ready"}
            {#if binding.renderMode === "painted" && binding.painter}
              <!-- The crop screen shows the whole picture to frame, bare. -->
              <div
                class="painted"
                class:crop-bare={cropRegion &&
                  itemIdFromStaffEffectRole(entry.role) !== null}
                style:opacity={layer.opacity}
              >
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
                  opacity={cropRegion ? 1 : layer.opacity}
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
                  sourceGeometry={layer.sourceGeometry}
                  playbackRate={entry.clip.playbackRate}
                  previewGain={previewGain(entry)}
                  onSourceSize={(size) => onSourceSize?.(region.id, size)}
                />
              </div>
            {/if}
          {/if}
        {/each}
      </div>
    {/each}
    {#if stripGuideVisible && !cropping}
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
      class:crop={cropping}
      class:grabbing={cropActive && !handleDrag}
      bind:this={editLayer}
      role="presentation"
      onpointerdowncapture={countTouchDown}
      onpointermovecapture={countTouchMove}
      onpointerupcapture={countTouchUp}
      onpointercancelcapture={countTouchUp}
      onpointerdown={onLayerPointerDown}
      onpointermove={onLayerPointerMove}
      onpointerup={onLayerPointerUp}
      onpointercancel={onLayerPointerCancel}
    >
      {#if cropping && cropItem}
        {#if frameRect}
          <div
            class="crop-frame"
            class:active={cropActive}
            class:locked={crop?.locked}
            data-crop-frame
            data-crop-flip="frame"
            style:left="{frameRect.left}px"
            style:top="{frameRect.top}px"
            style:width="{frameRect.width}px"
            style:height="{frameRect.height}px"
            role="group"
            tabindex="0"
            aria-roledescription={t("post_crop_frame")}
            aria-label={labelFor(cropItem)}
            aria-describedby={hintId}
            onkeydown={cropKey}
          >
            <span class="thirds" aria-hidden="true"></span>
            {#if !crop?.locked}
              {#each CROP_SIDES as side (side)}
                <span
                  class="crop-side {side}"
                  aria-hidden="true"
                  onpointerdown={(event) => pressHandle(event, side)}
                ></span>
              {/each}
              {#each CROP_CORNERS as corner (corner)}
                <span
                  class="crop-corner {corner}"
                  aria-hidden="true"
                  onpointerdown={(event) => pressHandle(event, corner)}
                ></span>
              {/each}
            {/if}
          </div>
        {/if}
        <span class="sr-only" aria-live="polite"
          >{crop?.announcement ?? ""}</span
        >
      {:else}
        <div class="drag-grid" class:shown={dragging} aria-hidden="true">
          {#if safeArea}
            <div
              class="safe-area"
              style:left={pct(safeArea.x)}
              style:top={pct(safeArea.y)}
              style:width={pct(safeArea.width)}
              style:height={pct(safeArea.height)}
            >
              {#if guides.safeX}
                <span class="snap-line {guides.safeX}"></span>
              {/if}
              {#if guides.safeY}
                <span class="snap-line {guides.safeY}"></span>
              {/if}
            </div>
          {/if}
          <span class="thirds"></span>
          {#if safeArea}
            <span class="covered" style:top={pct(safeArea.y + safeArea.height)}
              >{t("post_editor_reels_covered")}</span
            >
          {/if}
        </div>
        {#if guides.vertical}
          <div class="guide vertical" aria-hidden="true"></div>
        {/if}
        {#if guides.horizontal}
          <div class="guide horizontal" aria-hidden="true"></div>
        {/if}
        {#if selected}
          {@const locked = trackLocked(selected.id)}
          {@const box = shownItemBox(selected, editor.previewSeconds)}
          {@const pictureMode = isPictureDragTarget(selected, box)}
          {@const turn = boxTurn(box)}
          {@const turnSide =
            turning?.side ??
            turnHandleSide(box, { width: stageWidth, height: stageHeight })}
          <div
            class="selection"
            class:dragging
            class:locked
            class:picture-mode={pictureMode}
            data-crop-flip={turn ? undefined : "frame"}
            style:left={pct(box.x)}
            style:top={pct(box.y)}
            style:width={pct(box.width)}
            style:height={pct(box.height)}
            style:rotate={turn ? `${turn}deg` : undefined}
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
                  style:cursor={turn ? handleCursor(corner, turn) : undefined}
                  onpointerdown={(event) => startDrag(event, selected, corner)}
                ></span>
              {/each}
              {#if !keepsShape(selected)}
                {#each BOX_SIDES as side (side)}
                  <span
                    class="handle side {side}"
                    aria-hidden="true"
                    style:cursor={turn ? handleCursor(side, turn) : undefined}
                    onpointerdown={(event) => startDrag(event, selected, side)}
                  ></span>
                {/each}
              {/if}
              <span
                class="turn-handle"
                aria-hidden="true"
                style:top={turnSide === "above"
                  ? `${-TURN_HANDLE_GAP}px`
                  : turnSide === "below"
                    ? `calc(100% + ${TURN_HANDLE_GAP}px)`
                    : `${TURN_HANDLE_GAP}px`}
                onpointerdown={(event) => startTurn(event, selected)}
              >
                <i class="fa-solid fa-rotate" aria-hidden="true"></i>
              </span>
            {/if}
          </div>
          {#if dragging && turning}
            <span
              class="turn-readout"
              aria-hidden="true"
              style:left={pct(box.x + box.width / 2)}
              style:top={pct(box.y + box.height / 2)}
              >{degreesLabel(turning.degrees)}</span
            >
          {/if}
        {/if}
      {/if}
      <span id={hintId} class="sr-only">
        {cropping
          ? t("post_crop_keys_hint")
          : selected &&
              isPictureDragTarget(
                selected,
                shownItemBox(selected, editor.previewSeconds)
              )
            ? t("post_editor_picture_hint")
            : t("post_editor_box_hint")}
      </span>
    </div>
  {/if}
</div>

<style>
  /* The layers' stacking stays inside the preview, under the editor's dock. */
  .post-canvas {
    position: relative;
    isolation: isolate;
    width: 100%;
    max-height: 100%;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #08080c;
    container-type: inline-size;
  }
  /* The crop stage fills the space the editor gives it; the window sits in
     its middle with the clip's whole picture around it. */
  .post-canvas.cropping {
    height: 100%;
    max-height: none;
  }
  .region {
    position: absolute;
    overflow: hidden;
  }
  .region.crop-region {
    overflow: visible;
  }
  .region.crop-hidden {
    visibility: hidden;
  }
  .layer,
  .painted {
    position: absolute;
    inset: 0;
  }
  .region.edged > .layer,
  .region.edged > .painted {
    z-index: 0;
  }
  /* The border lies over the clip's layers, inside its rounded edge. */
  .region.edged::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    box-sizing: border-box;
    border: var(--edge-border, 0) solid var(--edge-color, transparent);
    border-radius: inherit;
    opacity: var(--edge-opacity, 1);
    pointer-events: none;
  }
  .layer.parked,
  .painted.crop-bare {
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
  .edit-layer.crop {
    cursor: grab;
  }
  .edit-layer.crop.grabbing {
    cursor: grabbing;
  }
  /* The window: what the slot shows. Everything past it is dimmed. */
  .crop-frame {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid var(--theme-primary, #d4813a);
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.55);
    container-type: size;
  }
  .crop-frame:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 3px;
  }
  .crop-frame.locked {
    border-style: dashed;
  }
  .crop-frame .thirds {
    opacity: 0.4;
    transition: opacity var(--duration-fast, 150ms) ease;
  }
  .crop-frame.active .thirds {
    opacity: 1;
  }
  /* A bar in the middle of each side, with a 44px grab area that runs
     along the side, so the frame can be taken anywhere between corners. */
  .crop-side {
    position: absolute;
    display: grid;
    place-items: center;
  }
  .crop-side::before {
    content: "";
    background: #fff;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
  }
  .crop-side.n,
  .crop-side.s {
    left: 44px;
    right: 44px;
    height: 44px;
    cursor: ns-resize;
  }
  .crop-side.n {
    top: -22px;
  }
  .crop-side.s {
    bottom: -22px;
  }
  .crop-side.n::before,
  .crop-side.s::before {
    width: 28px;
    height: 4px;
  }
  .crop-side.e,
  .crop-side.w {
    top: 44px;
    bottom: 44px;
    width: 44px;
    cursor: ew-resize;
  }
  .crop-side.e {
    right: -22px;
  }
  .crop-side.w {
    left: -22px;
  }
  .crop-side.e::before,
  .crop-side.w::before {
    width: 4px;
    height: 28px;
  }
  /* A side too short to hold a bar between its corners drops the bar, and
     the corners take that side. */
  @container (height < 96px) {
    .crop-side.e,
    .crop-side.w {
      display: none;
    }
  }
  @container (width < 96px) {
    .crop-side.n,
    .crop-side.s {
      display: none;
    }
  }
  /* L-shaped marks on the corners, each with a 44px grab area. */
  .crop-corner {
    position: absolute;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
  .crop-corner::before,
  .crop-corner::after {
    content: "";
    position: absolute;
    background: #fff;
    border-radius: 1px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
  }
  .crop-corner::before {
    width: 22px;
    height: 4px;
  }
  .crop-corner::after {
    width: 4px;
    height: 22px;
  }
  .crop-corner.nw {
    left: 0;
    top: 0;
    cursor: nwse-resize;
  }
  .crop-corner.ne {
    left: 100%;
    top: 0;
    cursor: nesw-resize;
  }
  .crop-corner.sw {
    left: 0;
    top: 100%;
    cursor: nesw-resize;
  }
  .crop-corner.se {
    left: 100%;
    top: 100%;
    cursor: nwse-resize;
  }
  .crop-corner.nw::before,
  .crop-corner.nw::after {
    left: calc(50% - 2px);
    top: calc(50% - 2px);
  }
  .crop-corner.ne::before,
  .crop-corner.ne::after {
    right: calc(50% - 2px);
    top: calc(50% - 2px);
  }
  .crop-corner.sw::before,
  .crop-corner.sw::after {
    left: calc(50% - 2px);
    bottom: calc(50% - 2px);
  }
  .crop-corner.se::before,
  .crop-corner.se::after {
    right: calc(50% - 2px);
    bottom: calc(50% - 2px);
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
  /* Rule-of-thirds lines: on the crop frame, and over the post while
     something on it moves. */
  .thirds {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .thirds::before,
  .thirds::after {
    content: "";
    position: absolute;
    border: 0 solid rgb(255 255 255 / 0.55);
  }
  .thirds::before {
    top: 0;
    bottom: 0;
    left: calc(100% / 3);
    width: calc(100% / 3);
    border-left-width: 1px;
    border-right-width: 1px;
  }
  .thirds::after {
    left: 0;
    right: 0;
    top: calc(100% / 3);
    height: calc(100% / 3);
    border-top-width: 1px;
    border-bottom-width: 1px;
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
  /* A round grip past the box's edge, with a 44px grab area, that turns the
     whole box as the pointer goes round it. */
  .turn-handle {
    position: absolute;
    left: 50%;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
    cursor: grab;
  }
  .selection.dragging .turn-handle {
    cursor: grabbing;
  }
  .turn-handle i {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 2px solid var(--theme-primary, #d4813a);
    border-radius: 50%;
    background: #fff;
    color: #08080c;
    font-size: 0.75rem;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
  }
  /* The angle so far, upright over the box's centre while it turns. */
  .turn-readout {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    background: rgb(0 0 0 / 0.75);
    color: #fff;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
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
  /* While something moves: the thirds and, on a Reel, the part Instagram
     leaves clear, with what its header, buttons and caption cover dimmed. */
  .drag-grid {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast);
  }
  .drag-grid.shown {
    opacity: 1;
  }
  .safe-area {
    position: absolute;
    box-sizing: border-box;
    border: 1px dashed rgb(255 255 255 / 0.8);
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.3);
  }
  /* A safe side a box's edge rests on, lit like the centre guides. */
  .snap-line {
    position: absolute;
    background: var(--theme-primary, #d4813a);
  }
  .snap-line.left,
  .snap-line.right {
    top: -1px;
    bottom: -1px;
    width: 2px;
  }
  .snap-line.top,
  .snap-line.bottom {
    left: -1px;
    right: -1px;
    height: 2px;
  }
  .snap-line.left {
    left: -1px;
  }
  .snap-line.right {
    right: -1px;
  }
  .snap-line.top {
    top: -1px;
  }
  .snap-line.bottom {
    bottom: -1px;
  }
  .covered {
    position: absolute;
    left: 0;
    right: 0;
    padding: 0.25rem 0.5rem 0;
    color: #fff;
    font-size: 0.75rem;
    text-align: center;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
  }
  @media (prefers-reduced-motion: reduce) {
    .drag-grid {
      transition: none;
    }
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
