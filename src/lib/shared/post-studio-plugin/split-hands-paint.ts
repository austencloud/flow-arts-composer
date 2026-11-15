import {
  POST_SPLIT_DEFAULT_SPREAD,
  splitCanvasPlace,
  splitPlacementFrame,
  type SplitCanvasLift,
  type SplitPose,
} from "#lib/shared/media-composition/domain/post-animation-split.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { AdditionalLayerProps } from "#lib/shared/animation-engine/domain/types/trail-capture-types.js";

/**
 * Draws an animation's split hands onto one plain canvas: the left hand's
 * canvas and the right hand's, each repeating what its hidden animator
 * draws, placed by the pose, with the flash and the echo copies.
 *
 * The preview repaints on every frame. The export repaints right before it
 * captures the layer (`paintSplitHands`), so the file shows exactly what the
 * preview shows at that time. One flat canvas keeps the capture simple: it
 * never has to carry transforms, blending or filters through the DOM copy.
 *
 * This module must never import the plugin index by value: surfaces.ts
 * imports it, and the index re-exports surfaces.ts.
 */

/** What one hand's canvas draws. */
export interface SplitHandCast {
  left: PropState | null;
  right: PropState | null;
  colors: { left: string; right: string } | undefined;
  layers: AdditionalLayerProps[];
}

/**
 * The flags each hand's animator always takes, over the clip's own settings.
 * Nothing here may switch off what the single canvas draws per hand (the
 * mandala, trails, effects, path lines): a hand's canvas draws all of it for
 * that hand, as a one-hand clip does. The animator's own text (glyphs, beat
 * numbers, header) is DOM, drawn once by the single canvas, so it is hidden.
 */
export const SPLIT_HAND_ANIMATOR_FLAGS = Object.freeze({
  backgroundAlpha: 0,
  hideTkaGlyph: true,
  hideStepNumbers: true,
  hideElementalGlyph: true,
  hideHeader: true,
  hideProgressBar: true,
  fillContainer: true,
});

/** The clip's look, as far as each hand's canvas reads it. */
interface SplitClipLook {
  gridMode?: string | null;
  darkMode?: boolean | null;
  mandalaThickness?: number;
}

/**
 * The clip's own appearance settings, passed to each hand's animator just as
 * the single canvas gets them: grid, dark mode, mandala thickness and, for a
 * clip with its own look, its visibility (mandala and path toggles among
 * them), its effects and its trails. Without a look of its own the clip
 * follows the viewer's settings, and so do both hands.
 */
export function splitClipSettings<Visibility, Effects, Trail>(
  look: SplitClipLook | undefined,
  own: { visibility: Visibility; effects: Effects; trail: Trail }
) {
  return {
    gridVisible: look ? look.gridMode !== "none" : true,
    previewDarkMode: look?.darkMode ?? true,
    mandalaStrokeWidthOverride: look?.mandalaThickness,
    ...(look
      ? {
          visibilityManagerOverride: own.visibility,
          effectsConfigState: own.effects,
          trailSettings: own.trail,
        }
      : {}),
  };
}

/** Marks the hidden sources; the export capture leaves them out. */
export const SPLIT_SOURCE_ATTRIBUTE = "data-split-source";
const COMPOSITE_SELECTOR = "[data-split-composite]";
/** The sharpest the composite is drawn, in canvas pixels per CSS pixel. */
const MAX_PIXEL_RATIO = 4;

const painters = new WeakMap<Element, () => void>();

/** Lets `paintSplitHands` repaint this composite canvas on demand. */
export function registerSplitPainter(
  composite: HTMLCanvasElement,
  paint: () => void
): () => void {
  painters.set(composite, paint);
  return () => {
    if (painters.get(composite) === paint) painters.delete(composite);
  };
}

/** Repaints every split composite inside `root` now. */
export function paintSplitHands(root: Element): void {
  for (const composite of root.querySelectorAll(COMPOSITE_SELECTOR))
    painters.get(composite)?.();
}

/** The capture's node filter: true keeps a node. */
export function keepInCapture(node: Node): boolean {
  return !(
    node instanceof Element && node.hasAttribute(SPLIT_SOURCE_ATTRIBUTE)
  );
}

/** One hand's source: the element its animator draws into. */
export interface SplitHandSources {
  left: HTMLElement | null;
  right: HTMLElement | null;
}

/** A source's drawing that the composite repeats: a canvas or the path lines. */
export interface SplitSourceLayer {
  side: "left" | "right";
  /** Stacking order inside the animator. */
  z: number;
  /** Document order inside its source, for layers on the same z. */
  order: number;
  element: HTMLCanvasElement | SVGSVGElement;
}

/** The path-lines overlay each animator draws over its props, as SVG. */
const PATH_LINES_SELECTOR = "svg.path-lines-overlay";

function zIndexOf(element: Element): number {
  const value = Number.parseInt(getComputedStyle(element).zIndex, 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Everything both sources draw, in the order the single canvas stacks it:
 * by z-index, the left hand before the right on the same z (the engine
 * paints the left props first), then document order. Covers every canvas
 * the animator mounts (props, trails, mandala, effects, LED) and its path
 * lines. Its glyphs and labels are DOM text and stay on the single canvas.
 */
export function splitSourceLayers(
  sources: SplitHandSources
): SplitSourceLayer[] {
  const layers: SplitSourceLayer[] = [];
  for (const side of ["left", "right"] as const) {
    const source = sources[side];
    if (!source) continue;
    const elements = source.querySelectorAll<HTMLCanvasElement | SVGSVGElement>(
      `canvas, ${PATH_LINES_SELECTOR}`
    );
    elements.forEach((element, order) => {
      if (
        element instanceof HTMLCanvasElement &&
        (element.width <= 0 || element.height <= 0)
      )
        return;
      layers.push({ side, z: zIndexOf(element), order, element });
    });
  }
  return layers.sort(
    (a, b) =>
      a.z - b.z ||
      (a.side === b.side ? 0 : a.side === "left" ? -1 : 1) ||
      a.order - b.order
  );
}

/** Where a picture `w` by `h` lands inside its element (contain, centred). */
function containRect(w: number, h: number, box: DOMRect) {
  const fit = Math.min(box.width / w, box.height / h);
  const width = w * fit;
  const height = h * fit;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/** The path lines' scene, the animator's 950-unit square. */
const PATH_SCENE_SIZE = 950;
const TRANSLATE = /translate\(\s*([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/;

/**
 * One hand's path line, stroked as the SVG draws it. Only the path for
 * `side` is drawn: each animator shows both hands' lines whatever props it
 * holds, as a one-hand clip does today.
 */
function strokePathLines(
  context: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  side: "left" | "right",
  origin: DOMRect
): void {
  const shown = Number.parseFloat(getComputedStyle(svg).opacity);
  const opacity = Number.isFinite(shown) ? shown : 1;
  if (opacity <= 0) return;
  const rect = containRect(
    PATH_SCENE_SIZE,
    PATH_SCENE_SIZE,
    svg.getBoundingClientRect()
  );
  const unit = rect.width / PATH_SCENE_SIZE;
  for (const path of svg.querySelectorAll<SVGPathElement>(
    `path[data-hand="${side}"]`
  )) {
    const d = path.getAttribute("d");
    if (!d) continue;
    const shift = TRANSLATE.exec(path.getAttribute("transform") ?? "");
    context.save();
    context.translate(rect.x - origin.x, rect.y - origin.y);
    context.scale(unit, unit);
    if (shift) context.translate(Number(shift[1]), Number(shift[2]));
    context.globalAlpha *=
      opacity * Number.parseFloat(path.getAttribute("opacity") ?? "1");
    context.strokeStyle = path.getAttribute("stroke") ?? "#fff";
    context.lineWidth = Number.parseFloat(
      path.getAttribute("stroke-width") ?? "1"
    );
    context.lineCap =
      (path.getAttribute("stroke-linecap") as CanvasLineCap | null) ?? "butt";
    const dash = path.getAttribute("stroke-dasharray");
    context.setLineDash(dash ? dash.split(/[\s,]+/).map(Number) : []);
    context.stroke(new Path2D(d));
    context.restore();
  }
}

/** Draws one layer where it sits, in CSS pixels from `origin`. */
function drawLayer(
  context: CanvasRenderingContext2D,
  layer: SplitSourceLayer,
  origin: DOMRect
): void {
  if (layer.element instanceof HTMLCanvasElement) {
    const canvas = layer.element;
    const rect = containRect(
      canvas.width,
      canvas.height,
      canvas.getBoundingClientRect()
    );
    context.drawImage(
      canvas,
      rect.x - origin.x,
      rect.y - origin.y,
      rect.width,
      rect.height
    );
    return;
  }
  strokePathLines(context, layer.element, layer.side, origin);
}

/** Scratch canvases the caller keeps between frames. */
export interface SplitScratch {
  /** Both hands, each at its place, stacked as the single canvas stacks them. */
  main: HTMLCanvasElement;
  /** Each hand flattened in place, for the echo copies. */
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
}

/**
 * Paints one frame. The two hands are stacked layer by layer as the single
 * canvas stacks them, with normal blending, then shown at the pose's
 * strength and flash, so at the instant the split starts the two canvases
 * together look like the single one. Echo copies go behind, lightening
 * where they overlap, and are only built while the pose has any.
 */
export function paintSplitComposite(
  composite: HTMLCanvasElement,
  sources: SplitHandSources,
  pose: SplitPose,
  spread: number | undefined,
  scratch: SplitScratch,
  lift?: SplitCanvasLift | null
): void {
  const box = composite.getBoundingClientRect();
  const context = composite.getContext("2d");
  if (!context || box.width <= 0 || box.height <= 0) return;

  const layers = splitSourceLayers(sources);
  // As sharp as the sharpest layer, so the export's capture is not blurred.
  let ratio = 0;
  for (const layer of layers) {
    if (!(layer.element instanceof HTMLCanvasElement)) continue;
    const canvas = layer.element;
    const rect = containRect(
      canvas.width,
      canvas.height,
      canvas.getBoundingClientRect()
    );
    if (rect.width > 0) ratio = Math.max(ratio, canvas.width / rect.width);
  }
  if (ratio <= 0) ratio = globalThis.devicePixelRatio || 1;
  ratio = Math.min(MAX_PIXEL_RATIO, ratio);
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  const echoing = pose.echoes.length > 0;
  const sized = echoing
    ? [composite, scratch.main, scratch.left, scratch.right]
    : [composite, scratch.main];
  for (const canvas of sized) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  if (pose.show <= 0) return;

  // Each hand's animator draws the canvas where it rests; a lifted panel has
  // moved the single canvas, so the hands part from where it is now.
  const frame = splitPlacementFrame(box.width, box.height, lift);
  const rest = frame.rest;
  const reach = spread ?? POST_SPLIT_DEFAULT_SPREAD;
  /** Maps a point p of the box to place + (p - rest) * size, in canvas pixels. */
  const placeHand = (
    target: CanvasRenderingContext2D,
    side: "left" | "right",
    apart: number,
    scale: number
  ) => {
    const place = splitCanvasPlace(
      frame.centre,
      box.width,
      side === "left" ? -1 : 1,
      apart,
      scale,
      reach
    );
    const size = scale * frame.scale;
    target.setTransform(
      ratio * size,
      0,
      0,
      ratio * size,
      ratio * (place.x - rest.x * size),
      ratio * (place.y - rest.y * size)
    );
  };

  context.filter = pose.flash > 1 ? `brightness(${pose.flash})` : "none";

  if (echoing) {
    // Each hand flattened in place, then repeated at each copy's place.
    for (const side of ["left", "right"] as const) {
      const flat = scratch[side].getContext("2d");
      if (!flat) continue;
      flat.setTransform(1, 0, 0, 1, 0, 0);
      flat.clearRect(0, 0, width, height);
      flat.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (const layer of layers)
        if (layer.side === side) drawLayer(flat, layer, box);
    }
    // Light over light: where copies overlap, the brighter wins.
    context.globalCompositeOperation = "lighten";
    for (const echo of pose.echoes) {
      context.globalAlpha = pose.show * echo.strength;
      for (const side of ["left", "right"] as const) {
        placeHand(context, side, echo.apart, echo.scale);
        context.drawImage(scratch[side], 0, 0, box.width, box.height);
      }
    }
  }

  // The two hands, layer by layer, at full strength; shown once at `show`.
  const main = scratch.main.getContext("2d");
  if (main) {
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.clearRect(0, 0, width, height);
    for (const layer of layers) {
      placeHand(main, layer.side, pose.apart, pose.scale);
      drawLayer(main, layer, box);
    }
    main.setTransform(1, 0, 0, 1, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = pose.show;
    context.drawImage(scratch.main, 0, 0);
  }

  context.filter = "none";
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.setTransform(1, 0, 0, 1, 0, 0);
}
