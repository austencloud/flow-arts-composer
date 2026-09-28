import { t } from "$lib/shared/i18n/i18n.svelte.js";
import {
  POST_MAX_ZOOM,
  findItem,
  type PostBox,
  type PostClipShape,
  type PostClipShapeKind,
  type PostFraming,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  clipBox,
  clipShapeFor,
  shapedBox,
  type PostOutputSize,
} from "$lib/shared/media-composition/domain/post-canvas";
import {
  resetFraming,
  updateItem,
  updateItemAt,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  boxAt,
  framingAt,
  isAnimated,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import {
  STRAIGHTEN_LIMIT,
  clampToCoverage,
  coverZoom,
  cropLimitFor,
  cropPoseOf,
  fillPose,
  framePose,
  framingOfPose,
  handleFrame,
  handlePose,
  isCovered,
  isCropSide,
  joinRotation,
  limitPose,
  movePose,
  overshootOf,
  quarterLeft,
  reshapePose,
  sameFraming,
  splitRotation,
  turnPose,
  zoomFloor,
  zoomPoseAbout,
  type CropHandle,
  type CropLimit,
  type CropPoint,
  type CropPose,
  type CropSize,
} from "./post-crop-geometry";

/**
 * The crop screen's edits to one clip. Every control, key and gesture on the
 * screen goes through here, so each works out the same framing from the same
 * pose: the stored zoom, pan and turn as a picture placed under the slot's
 * window. On the stage the picture holds still and the window is the frame
 * that moves over it, so a drag moves the frame and a corner sizes it.
 * Writes land at the playhead, as keyframes when the framing is animated,
 * and a drag, pinch or corner is one undo step however long it runs.
 */

/** A clip's shape on the crop screen: Fill (its whole box) or a shape in it. */
export type CropShapeKind = PostClipShapeKind | "fill";

export interface CropSessionDeps {
  editor: PostEditorState;
  /** The clip on the crop screen, or null while none is. */
  getItemId: () => string | null;
  /** The footage's own size, once it has loaded. */
  getSource: () => CropSize | null;
  now?: () => number;
}

const CENTER: CropPoint = { x: 0, y: 0 };

/** A slider moved again within this long continues from where its drag began. */
const SLIDER_IDLE_MS = 800;

/** An arrow key moves the frame this share of the window; Shift, the larger. */
export const CROP_NUDGE = { step: 0.01, large: 0.1 } as const;

/** A framing read back from the project matches what was written this closely. */
const READBACK_TOLERANCE = 1e-6;

interface SliderBase {
  key: "zoom" | "straighten";
  itemId: string;
  pose: CropPose;
  wrote: PostFraming;
  at: number;
}

interface Gesture {
  itemId: string;
  start: CropPose;
  limit: CropLimit;
  seconds: number;
  /** How far past the limit a pull may still show, in output pixels. */
  range: number;
  /** The clip takes a free shape, so its sides reshape the frame. */
  free: boolean;
  /** The clip's box and the post's size, for a side that reshapes the frame. */
  spot: PostBox;
  output: PostOutputSize;
}

function sizeIn(
  box: Pick<PostBox, "width" | "height">,
  output: PostOutputSize
): CropSize | null {
  const width = box.width * output.width;
  const height = box.height * output.height;
  return width > 0 && height > 0 ? { width, height } : null;
}

function sameShape(a: PostClipShape | null, b: PostClipShape | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && Math.abs(a.ratio - b.ratio) < 1e-9;
}

/** The frame moves the opposite way to the picture under it. */
function framePull(over: CropPoint): CropPoint {
  return { x: -over.x || 0, y: -over.y || 0 };
}

function samePlacement(a: CropPose, b: CropPose): boolean {
  return (
    a.fit === b.fit &&
    a.window.width === b.window.width &&
    a.window.height === b.window.height &&
    a.source.width === b.source.width &&
    a.source.height === b.source.height
  );
}

export function createCropSession(deps: CropSessionDeps) {
  const { editor } = deps;
  const now = deps.now ?? (() => performance.now());

  const item = $derived.by((): PostVideoItem | null => {
    const id = deps.getItemId();
    const found = id ? findItem(editor.project, id)?.item : null;
    return found?.kind === "video" ? found : null;
  });
  const locked = $derived(item ? editor.isLocked(item.id) : true);
  const seconds = $derived(editor.previewSeconds);

  const output = $derived(editor.compiled?.preset.output ?? null);
  /** The clip's box at the playhead; its shape sits in the middle of it. */
  const spot = $derived(item ? boxAt(item, seconds) : null);

  /** The slot at the playhead, in output pixels: what the export fills. */
  const window = $derived.by((): CropSize | null => {
    if (!item || !output || !spot) return null;
    const rect = editor.regionRects.get(item.id) ?? clipBox(item, spot, output);
    return sizeIn(rect, output);
  });

  const framing = $derived(item ? framingAt(item, seconds) : null);
  const source = $derived(deps.getSource());
  const pose = $derived(
    item && framing && window
      ? cropPoseOf({ framing, fit: item.fit, window, source })
      : null
  );
  const limit = $derived<CropLimit>(pose ? cropLimitFor(pose) : "range");

  /** The quarter turn the controls last showed; see `splitRotation`. */
  let quarterHint = $state<number | null>(null);
  const parts = $derived(splitRotation(framing?.rotation ?? 0, quarterHint));

  /** The shape picked for the clip; null for an older Show all. */
  const shapeKind = $derived.by((): CropShapeKind | null => {
    if (!item) return null;
    if (item.shape) return item.shape.kind;
    return item.fit === "cover" ? "fill" : null;
  });

  const canReset = $derived(
    item !== null &&
      !locked &&
      !(
        !item.shape &&
        item.fit === "cover" &&
        item.zoom === 1 &&
        item.panX === 0 &&
        item.panY === 0 &&
        item.rotation === 0 &&
        !item.flip &&
        !isAnimated(item, "framing")
      )
  );

  let sliderBase: SliderBase | null = null;
  let gesture = $state.raw<Gesture | null>(null);
  let announcement = $state("");

  /** Whether an edit may land now: a clip, unlocked, with no drag running. */
  function editable(): PostVideoItem | null {
    if (!item || locked || gesture || editor.inGesture) return null;
    return item;
  }

  function announce(): void {
    const current = pose;
    if (!current) return;
    announcement = t(
      isCovered(current) ? "post_crop_status_filled" : "post_crop_status_gaps",
      {
        zoom: Math.round(current.zoom * 100),
        // Straighten moves in half degrees, so say the half the slider shows.
        degrees: Number(current.rotation.toFixed(1)),
      }
    );
  }

  /** One undo step for a single press: a turn, a fit, a corner. */
  function writeStep(target: PostVideoItem, next: CropPose): boolean {
    const value = framingOfPose(next);
    if (framing && sameFraming(value, framing)) return false;
    editor.pause();
    sliderBase = null;
    const id = target.id;
    const at = seconds;
    return editor.edit((project, ctx) =>
      updateItemAt(project, id, value, at, ctx)
    );
  }

  /** Repeats of one control in quick succession join one undo step. */
  function writeSetting(
    target: PostVideoItem,
    key: string,
    next: CropPose
  ): boolean {
    const value = framingOfPose(next);
    if (framing && sameFraming(value, framing)) return false;
    editor.pause();
    sliderBase = null;
    const id = target.id;
    const at = seconds;
    return editor.editSetting(`${id}:${key}`, (project, ctx) =>
      updateItemAt(project, id, value, at, ctx)
    );
  }

  /**
   * Where a slider drag works from: the pose when it began, so dragging back
   * lands exactly where it started even when a limit clipped the way out.
   * A pause, another edit or undo starts it afresh from what is on screen.
   */
  function sliderStart(
    key: SliderBase["key"],
    target: PostVideoItem,
    current: CropPose
  ): CropPose {
    const base = sliderBase;
    if (
      base &&
      framing &&
      base.key === key &&
      base.itemId === target.id &&
      now() - base.at < SLIDER_IDLE_MS &&
      samePlacement(base.pose, current) &&
      sameFraming(base.wrote, framing, READBACK_TOLERANCE)
    ) {
      return base.pose;
    }
    return current;
  }

  function writeSlider(
    key: SliderBase["key"],
    target: PostVideoItem,
    start: CropPose,
    next: CropPose
  ): void {
    const value = framingOfPose(next);
    const id = target.id;
    const at = seconds;
    editor.pause();
    if (!framing || !sameFraming(value, framing)) {
      editor.editSetting(`${id}:crop-${key}`, (project, ctx) =>
        updateItemAt(project, id, value, at, ctx)
      );
    }
    sliderBase = { key, itemId: id, pose: start, wrote: value, at: now() };
  }

  /** Until the footage's size is known there is no pose; the value is stored as is. */
  function writeRaw(
    target: PostVideoItem,
    key: string,
    patch: Partial<PostFraming>
  ): void {
    const id = target.id;
    const at = seconds;
    editor.pause();
    editor.editSetting(`${id}:${key}`, (project, ctx) =>
      updateItemAt(project, id, patch, at, ctx)
    );
  }

  /** The window a shape gives the clip at the playhead, in output pixels. */
  function windowFor(shape: PostClipShape | null): CropSize | null {
    if (!spot || !output) return null;
    return sizeIn(shape ? shapedBox(spot, shape.ratio, output) : spot, output);
  }

  /** One undo step for a turn that may turn the clip's shape too. */
  function writeShaped(
    target: PostVideoItem,
    shape: PostClipShape | null,
    framing: Partial<PostFraming>
  ): void {
    const id = target.id;
    const at = seconds;
    editor.pause();
    sliderBase = null;
    editor.edit((project, ctx) => {
      const shaped = shape ? updateItem(project, id, { shape }, ctx) : project;
      return updateItemAt(shaped, id, framing, at, ctx);
    });
  }

  // ---- Controls ---------------------------------------------------------------

  /** Zoom about the window's centre; Fill stops where the window would show a gap. */
  function setZoom(zoom: number): void {
    const target = editable();
    if (!target) return;
    const current = pose;
    if (!current) {
      writeRaw(target, "crop-zoom", { zoom });
      return;
    }
    const start = sliderStart("zoom", target, current);
    const startLimit = cropLimitFor(start);
    const zoomed = zoomPoseAbout(
      start,
      zoom,
      CENTER,
      zoomFloor(start, startLimit)
    );
    writeSlider("zoom", target, start, limitPose(zoomed, startLimit));
  }

  /** The fine turn, within a quarter; Fill zooms with it so no corner opens. */
  function setStraighten(degrees: number): void {
    const target = editable();
    if (!target) return;
    const quarter = parts.quarter;
    const straighten = Math.min(
      STRAIGHTEN_LIMIT,
      Math.max(-STRAIGHTEN_LIMIT, degrees)
    );
    const rotation = joinRotation(quarter, straighten);
    quarterHint = quarter;
    const current = pose;
    if (!current) {
      writeRaw(target, "crop-straighten", { rotation });
      return;
    }
    const start = sliderStart("straighten", target, current);
    const turned = turnPose(start, rotation);
    writeSlider(
      "straighten",
      target,
      start,
      limitPose(turned, cropLimitFor(start, turned))
    );
  }

  /**
   * A quarter turn anticlockwise, as Photos turns. A clip in its footage's
   * own shape turns its window with it, filled the way it was.
   */
  function rotateQuarter(): void {
    const target = editable();
    if (!target) return;
    const quarter = quarterLeft(parts.quarter);
    const rotation = joinRotation(quarter, parts.straighten);
    quarterHint = quarter;
    const shape =
      target.shape?.kind === "original"
        ? clipShapeFor("original", 1 / target.shape.ratio)
        : null;
    const current = pose;
    const nextWindow = shape ? windowFor(shape) : null;
    if (!current) {
      writeShaped(target, shape, { rotation });
      return;
    }
    const turned = turnPose(current, rotation);
    if (!shape || !nextWindow) {
      if (writeStep(target, limitPose(turned, cropLimitFor(current, turned))))
        announce();
      return;
    }
    // As far past covering the turned window as it was past covering this one.
    const placeIn = (zoom: number) =>
      cropPoseOf({
        framing: { ...framingOfPose(turned), zoom },
        fit: current.fit,
        window: nextWindow,
        source: current.source,
      })!;
    const resized = placeIn(
      (coverZoom(placeIn(1)) * current.zoom) / coverZoom(current)
    );
    const next = resized.fit === "cover" ? clampToCoverage(resized) : resized;
    writeShaped(target, shape, framingOfPose(next));
    announce();
  }

  /**
   * The clip's shape: Fill takes its whole box, Original the footage's own
   * shape as it is turned, Free the frame's shape now (its sides then change
   * it), and a ratio that ratio. The window fills, zooming up if it has to;
   * when the framing is animated only the shape changes.
   */
  function setShape(kind: CropShapeKind): void {
    const target = editable();
    if (!target) return;
    let shape: PostClipShape | null = null;
    if (kind === "original") {
      const footage = source;
      const turned = Math.abs(parts.quarter) % 2 === 1;
      shape = footage
        ? clipShapeFor(
            "original",
            turned ? footage.height / footage.width : footage.width / footage.height
          )
        : null;
      if (!shape) return;
    } else if (kind === "free") {
      shape = window ? clipShapeFor("free", window.width / window.height) : null;
      if (!shape) return;
    } else if (kind !== "fill") {
      shape = clipShapeFor(kind);
    }
    if (target.fit === "cover" && sameShape(target.shape ?? null, shape)) return;
    const id = target.id;
    editor.pause();
    sliderBase = null;
    const current = pose;
    const nextWindow = windowFor(shape);
    const filled =
      current && nextWindow && !isAnimated(target, "framing")
        ? framingOfPose(
            fillPose(
              cropPoseOf({
                framing: framingOfPose(current),
                fit: "cover",
                window: nextWindow,
                source: current.source,
              })!
            )
          )
        : {};
    editor.edit((project, ctx) =>
      updateItem(project, id, { shape, fit: "cover", ...filled }, ctx)
    );
    announce();
  }

  function toggleMirror(): void {
    const target = editable();
    if (!target) return;
    const id = target.id;
    const flip = !target.flip;
    editor.pause();
    editor.edit((project, ctx) => updateItem(project, id, { flip }, ctx));
  }

  /** Fill, no shape, no mirror, no zoom, move or turn, and no framing keyframes. */
  function reset(): void {
    const target = editable();
    if (!target || !canReset) return;
    const id = target.id;
    editor.pause();
    sliderBase = null;
    quarterHint = null;
    editor.edit((project, ctx) =>
      resetFraming(
        updateItem(project, id, { fit: "cover", flip: false, shape: null }, ctx),
        id,
        ctx
      )
    );
    announce();
  }

  // ---- Keys and the wheel -----------------------------------------------------

  /** Moves the picture by `delta` output pixels, within the limit. */
  function panBy(delta: CropPoint): boolean {
    const target = editable();
    const current = pose;
    if (!target || !current) return false;
    const moved = movePose(current, delta);
    return writeSetting(
      target,
      "crop-move",
      limitPose(moved, cropLimitFor(current, moved))
    );
  }

  /** An arrow key: the frame moves the way the key points. */
  function nudge(direction: CropPoint, large: boolean): boolean {
    const current = pose;
    if (!current) return false;
    const share = large ? CROP_NUDGE.large : CROP_NUDGE.step;
    const moved = panBy({
      x: -direction.x * share * current.window.width,
      y: -direction.y * share * current.window.height,
    });
    if (moved) announce();
    return moved;
  }

  /** Zoom by `factor` about `anchor` (output pixels from the window's centre). */
  function zoomBy(factor: number, anchor: CropPoint = CENTER): boolean {
    const target = editable();
    const current = pose;
    if (!target || !current || !(factor > 0)) return false;
    const currentLimit = cropLimitFor(current);
    const zoomed = zoomPoseAbout(
      current,
      current.zoom * factor,
      anchor,
      zoomFloor(current, currentLimit)
    );
    return writeSetting(target, "crop-zoom", limitPose(zoomed, currentLimit));
  }

  // ---- Drags and pinches ------------------------------------------------------

  /**
   * Starts a drag or pinch from the pose on screen. `rubberRange` is how far
   * past its limit a pull may still show, in output pixels; 0 stops it dead.
   */
  function startGesture(rubberRange: number): boolean {
    const target = editable();
    const current = pose;
    if (!target || !current || !spot || !output) return false;
    editor.pause();
    sliderBase = null;
    editor.beginGesture();
    gesture = {
      itemId: target.id,
      start: current,
      limit: cropLimitFor(current),
      seconds,
      range: Math.max(0, rubberRange),
      free: target.shape?.kind === "free",
      spot,
      output,
    };
    return true;
  }

  function stepGesture(active: Gesture, raw: CropPose): CropPoint {
    const limited = limitPose(raw, active.limit);
    const value = framingOfPose(limited);
    const id = active.itemId;
    const at = active.seconds;
    editor.gestureStep((project, ctx) =>
      updateItemAt(project, id, value, at, ctx)
    );
    return overshootOf(raw, limited, active.limit, active.range);
  }

  /**
   * The frame follows the pointer: `delta` output pixels from where the drag
   * began. Returns how far past the limit the frame's pull still shows.
   */
  function dragTo(delta: CropPoint): CropPoint {
    const active = gesture;
    if (!active) return CENTER;
    return framePull(
      stepGesture(active, movePose(active.start, { x: -delta.x, y: -delta.y }))
    );
  }

  /**
   * Two fingers from where they landed, in output pixels from the window's
   * centre as the pinch began. Spreading them zooms in, so the frame shrinks
   * about them; their travel moves it.
   */
  function pinchTo(input: {
    startMidpoint: CropPoint;
    midpoint: CropPoint;
    spread: number;
  }): CropPoint {
    const active = gesture;
    if (!active) return CENTER;
    const { start } = active;
    const spread = Number.isFinite(input.spread) && input.spread > 0 ? input.spread : 1;
    const zoom = Math.min(
      POST_MAX_ZOOM,
      Math.max(zoomFloor(start, active.limit), start.zoom * spread)
    );
    const scale = start.zoom / zoom;
    const center = {
      x: input.midpoint.x - scale * input.startMidpoint.x,
      y: input.midpoint.y - scale * input.startMidpoint.y,
    };
    return framePull(stepGesture(active, framePose(start, center, scale)));
  }

  /**
   * A corner or side held at `scale` of the window as the gesture began: the
   * frame it makes is the crop. A free clip's side changes the frame's shape,
   * and so the clip's.
   */
  function handleTo(handle: CropHandle, scale: number): void {
    const active = gesture;
    if (!active || !(scale > 0)) return;
    const { start } = active;
    if (!active.free || !isCropSide(handle)) {
      stepGesture(active, handlePose(start, handle, scale));
      return;
    }
    const frame = handleFrame(start.window, handle, scale, true);
    const shape = clipShapeFor("free", frame.width / frame.height);
    const next = shape
      ? sizeIn(shapedBox(active.spot, shape.ratio, active.output), active.output)
      : null;
    if (!shape || !next) return;
    const value = framingOfPose(
      limitPose(reshapePose(start, handle, scale, next), active.limit)
    );
    const id = active.itemId;
    const at = active.seconds;
    editor.gestureStep((project, ctx) =>
      updateItemAt(updateItem(project, id, { shape }, ctx), id, value, at, ctx)
    );
  }

  /** Ends the drag or pinch, keeping its move or putting the picture back. */
  function endGesture(keep: boolean): void {
    if (!gesture) return;
    gesture = null;
    if (keep) editor.endGesture();
    else editor.cancelGesture();
    announce();
  }

  /**
   * Forgets a drag the editor has already settled, as closing the screen
   * does: the editor's session ends a running drag itself.
   */
  function abandonGesture(): void {
    gesture = null;
  }

  return {
    get item() {
      return item;
    },
    get locked() {
      return locked;
    },
    /** The slot at the playhead, in output pixels. */
    get window() {
      return window;
    },
    get framing() {
      return framing;
    },
    /** Null until the footage's size is known. */
    get pose() {
      return pose;
    },
    get limit() {
      return limit;
    },
    /** The turn as quarter turns plus a straighten of -45..45 degrees. */
    get parts() {
      return parts;
    },
    get canReset() {
      return canReset;
    },
    /** The shape picked: Fill, Original, Free or a ratio; null for Show all. */
    get shapeKind() {
      return shapeKind;
    },
    /** The frame's sides change its shape. */
    get free() {
      return item?.shape?.kind === "free";
    },
    get inGesture() {
      return gesture !== null;
    },
    /** A drag, pinch or handle is running; Enter and Escape wait for it. */
    get busy() {
      return gesture !== null;
    },
    /** What the last settled change left, for a polite live region. */
    get announcement() {
      return announcement;
    },
    setZoom,
    setStraighten,
    rotateQuarter,
    setShape,
    toggleMirror,
    reset,
    panBy,
    nudge,
    zoomBy,
    startGesture,
    dragTo,
    pinchTo,
    handleTo,
    endGesture,
    abandonGesture,
    announce,
  };
}

export type CropSession = ReturnType<typeof createCropSession>;
