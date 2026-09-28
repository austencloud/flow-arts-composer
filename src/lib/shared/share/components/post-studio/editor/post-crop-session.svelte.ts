import { t } from "$lib/shared/i18n/i18n.svelte.js";
import {
  findItem,
  type PostFraming,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
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
  cropLimitFor,
  cropPoseOf,
  fillPose,
  framingOfPose,
  isCovered,
  joinRotation,
  limitPose,
  movePose,
  overshootOf,
  pinchPose,
  quarterLeft,
  releaseHandle,
  sameFraming,
  splitRotation,
  turnPose,
  zoomFloor,
  zoomPoseAbout,
  type CropHandle,
  type CropFit,
  type CropLimit,
  type CropPoint,
  type CropPose,
  type CropSize,
} from "./post-crop-geometry";

/**
 * The crop screen's edits to one clip. Every control, key and gesture on the
 * screen goes through here, so each works out the same framing from the same
 * pose: the stored zoom, pan and turn as a picture placed under the slot's
 * window. Writes land at the playhead, as keyframes when the framing is
 * animated, and a drag or pinch is one undo step however long it runs.
 */

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

/** An arrow key moves the picture this share of the window; Shift, the larger. */
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

  /** The slot at the playhead, in output pixels: what the export fills. */
  const window = $derived.by((): CropSize | null => {
    const output = editor.compiled?.preset.output;
    if (!item || !output) return null;
    const rect = editor.regionRects.get(item.id) ?? boxAt(item, seconds);
    const width = rect.width * output.width;
    const height = rect.height * output.height;
    return width > 0 && height > 0 ? { width, height } : null;
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

  const canReset = $derived(
    item !== null &&
      !locked &&
      !(
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
  /** A handle is held on the stage; nothing is written until it is let go. */
  let handleHeld = $state(false);
  let announcement = $state("");

  /** Whether an edit may land now: a clip, unlocked, with no drag running. */
  function editable(): PostVideoItem | null {
    if (!item || locked || gesture || handleHeld || editor.inGesture)
      return null;
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

  /** A quarter turn anticlockwise, as Photos turns. */
  function rotateQuarter(): void {
    const target = editable();
    if (!target) return;
    const quarter = quarterLeft(parts.quarter);
    const rotation = joinRotation(quarter, parts.straighten);
    quarterHint = quarter;
    const current = pose;
    if (!current) {
      const id = target.id;
      const at = seconds;
      editor.pause();
      sliderBase = null;
      editor.edit((project, ctx) =>
        updateItemAt(project, id, { rotation }, at, ctx)
      );
      return;
    }
    const turned = turnPose(current, rotation);
    if (writeStep(target, limitPose(turned, cropLimitFor(current, turned))))
      announce();
  }

  /**
   * Fill zooms the picture up to cover the window if it has to. When the
   * framing is animated only the fit changes, so no keyframe is written
   * behind the user's back.
   */
  function setFit(fit: CropFit): void {
    const target = editable();
    if (!target || target.fit === fit) return;
    const id = target.id;
    editor.pause();
    sliderBase = null;
    const current = pose;
    if (fit === "cover" && current && !isAnimated(target, "framing")) {
      const filled = framingOfPose(fillPose(current));
      editor.edit((project, ctx) =>
        updateItem(project, id, { fit, ...filled }, ctx)
      );
    } else {
      editor.edit((project, ctx) => updateItem(project, id, { fit }, ctx));
    }
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

  /** Fill, no mirror, no zoom, move or turn, and no framing keyframes. */
  function reset(): void {
    const target = editable();
    if (!target || !canReset) return;
    const id = target.id;
    editor.pause();
    sliderBase = null;
    quarterHint = null;
    editor.edit((project, ctx) =>
      resetFraming(
        updateItem(project, id, { fit: "cover", flip: false }, ctx),
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

  /** An arrow key: the picture moves the way the key points. */
  function nudge(direction: CropPoint, large: boolean): boolean {
    const current = pose;
    if (!current) return false;
    const share = large ? CROP_NUDGE.large : CROP_NUDGE.step;
    const moved = panBy({
      x: direction.x * share * current.window.width,
      y: direction.y * share * current.window.height,
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
    if (!target || !current) return false;
    editor.pause();
    sliderBase = null;
    editor.beginGesture();
    gesture = {
      itemId: target.id,
      start: current,
      limit: cropLimitFor(current),
      seconds,
      range: Math.max(0, rubberRange),
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
   * The picture follows the pointer: `delta` output pixels from where the
   * drag began. Returns how far past the limit the pull still shows.
   */
  function dragTo(delta: CropPoint): CropPoint {
    const active = gesture;
    if (!active) return CENTER;
    return stepGesture(active, movePose(active.start, delta));
  }

  /** Two fingers from where they landed: spread zooms, travel moves. */
  function pinchTo(input: {
    startMidpoint: CropPoint;
    midpoint: CropPoint;
    spread: number;
  }): CropPoint {
    const active = gesture;
    if (!active) return CENTER;
    return stepGesture(
      active,
      pinchPose(active.start, {
        ...input,
        floor: zoomFloor(active.start, active.limit),
      })
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
    handleHeld = false;
  }

  /** The stage holds a corner or side, or lets it go without a crop. */
  function holdHandle(held: boolean): void {
    handleHeld = held && item !== null && !locked;
  }

  /**
   * A corner or side let go at `scale` of the window: what the dragged frame
   * held now fills the slot. Returns the poses either side, for the settle.
   */
  function releaseHandleAt(
    handle: CropHandle,
    scale: number
  ): { before: CropPose; after: CropPose } | null {
    handleHeld = false;
    const target = editable();
    const current = pose;
    if (!target || !current || !(scale > 0) || Math.abs(scale - 1) < 1e-6)
      return null;
    const released = releaseHandle(current, handle, scale);
    const next = limitPose(released, cropLimitFor(current, released));
    if (!writeStep(target, next)) return null;
    announce();
    return { before: current, after: pose ?? next };
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
    get inGesture() {
      return gesture !== null;
    },
    /** A drag, pinch or held handle is running; Enter and Escape wait for it. */
    get busy() {
      return gesture !== null || handleHeld;
    },
    /** What the last settled change left, for a polite live region. */
    get announcement() {
      return announcement;
    },
    setZoom,
    setStraighten,
    rotateQuarter,
    setFit,
    toggleMirror,
    reset,
    panBy,
    nudge,
    zoomBy,
    startGesture,
    dragTo,
    pinchTo,
    endGesture,
    abandonGesture,
    holdHandle,
    releaseHandle: releaseHandleAt,
    announce,
  };
}

export type CropSession = ReturnType<typeof createCropSession>;
