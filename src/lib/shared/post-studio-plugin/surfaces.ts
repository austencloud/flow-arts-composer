import {
  sampleEasing,
  tunnelHookPanelOpacity,
} from "@austencloud/video-editor/core";
import {
  applyLayerTransform,
  drawSource,
  resolveFrameLayerGeometry,
  type SurfaceCapture,
  type SurfaceDrawInput,
} from "@austencloud/video-editor/render";
import { POST_STUDIO_DOM_CAPTURE_OPTIONS } from "#lib/shared/media-composition/services/post-studio-dom-capture.js";
import { PostStudioPictographCapture } from "#lib/shared/media-composition/services/post-studio-pictograph-capture.js";
import { createArrangementSurface } from "./arrangement-surface";
import { keepInCapture, paintSplitHands } from "./split-hands-paint";
import { createShiftingMandalaSurface } from "./shifting-mandala-surface";
import { createStage3DSurface } from "./stage-3d-surface";
import {
  cardEndingFrame,
  qrLandingBox,
  lerpBox,
  type PostCardEnding,
} from "./card-ending";
import {
  drawCardEnding,
  measureCardLayout,
  paintQrFlight,
  type MeasuredCardLayout,
} from "./card-ending-draw";
import { loadBrandSerif } from "#lib/shared/media-composition/services/brand-serif.js";

/**
 * The DOM surfaces tka's preview mounts for a post: the sequence animation,
 * the choreo card, an arrangement's grid, a shifting mandala and a 3D clip. Each call returns fresh surfaces
 * for one render; the sequence animation keeps its screenshot setup across
 * that render's frames and frees it in `release()`.
 *
 * This module and everything it reaches must never import the plugin index by
 * value: the index re-exports this module.
 * tests/unit/video-editor-value-closure.test.ts guards it.
 */
export function createTkaSurfaces(): SurfaceCapture[] {
  return [
    createSequenceAnimationSurface(),
    createChoreoCardSurface(),
    createArrangementSurface(),
    createShiftingMandalaSurface(),
    createStage3DSurface(),
  ];
}

function createSequenceAnimationSurface(): SurfaceCapture {
  // The split's hidden sources are drawn through its composite; leave them out.
  const pictographCapture = new PostStudioPictographCapture(keepInCapture);
  return {
    renderMode: "sequence-animation",
    async draw(input: SurfaceDrawInput): Promise<void> {
      const { context, layerElement, layer, region, regionPixels } = input;
      // The preview lays this surface out to fill its region box, and a DOM
      // surface has no footage size to fit. Fitting a 1x1 stand-in with the
      // region's own "contain" drew the capture as a centred square, so a
      // non-square region came out narrower than on screen.
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region: { ...region, fit: "fill" },
        sourceWidth: 1,
        sourceHeight: 1,
        transform: layer.transform,
      });
      applyLayerTransform(context, geometry);
      // Footage behind a tunnel intro shows through the panel until the canvas
      // settles, as it does on the live surface captured below.
      context.globalAlpha =
        layer.opacity * tunnelHookPanelOpacity(layer.tunnelHook, sampleEasing);
      context.fillStyle = input.preset.output.backgroundColor;
      context.fillRect(
        geometry.region.x,
        geometry.region.y,
        geometry.region.width,
        geometry.region.height
      );
      context.globalAlpha = layer.opacity;
      const animation = layerElement.querySelector<HTMLElement>(
        "[data-sequence-progress-visible]"
      );
      if (!animation) {
        throw new Error("Sequence animation export surface is missing");
      }
      await waitForTunnelHookArtwork(layerElement);
      if (animation.querySelector("[data-pictograph-motion]")) {
        await waitForPictographMotion(layerElement);
      }
      const bounds = animation.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        throw new Error("Sequence animation export surface has no size");
      }
      // The preview owns the label, path, header, effects, and progress layout.
      // Capturing its visible surface keeps every enabled layer in its real order.
      // Split hands are composited onto one canvas; paint it for this exact
      // frame so the file matches the preview.
      paintSplitHands(animation);
      const scale = Math.max(1, regionPixels.width / bounds.width);
      const image = await pictographCapture.capture(
        animation,
        bounds.width,
        bounds.height,
        scale
      );
      drawSource(context, image, geometry);
    },
    release(): void {
      pictographCapture.dispose();
    },
  };
}

function createChoreoCardSurface(): SurfaceCapture {
  return {
    renderMode: "choreo-card",
    async draw(input: SurfaceDrawInput): Promise<void> {
      const { context, layerElement, layer, region, regionPixels } = input;
      const ending = cardEndingIn(layerElement);
      // A ringed card never shows the beat's own highlight, so one capture
      // serves the whole clip.
      const beat = ending?.ending.ring ? "still" : (layer.displayedBeatNumber ?? 0);
      // The capture is cached for the whole render, so a card whose box is
      // keyframed is captured at the frame's full width: one capture then
      // stays sharp at every size the move reaches.
      const boxAnimated = (input.preset.regionKeyframes ?? []).some(
        (track) => track.regionId === layer.regionId
      );
      const card = await captureCardLayer(
        layerElement,
        boxAnimated ? input.preset.output.width : regionPixels.width,
        `${layer.clipId}:${beat}`,
        input.cache
      );
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region,
        sourceWidth: card.width,
        sourceHeight: card.height,
        transform: layer.transform,
      });
      applyLayerTransform(context, geometry);
      const layout = ending ? cardLayouts.get(card) : undefined;
      if (!ending || !layout) {
        drawSource(context, card, geometry);
        return;
      }
      const frame = cardEndingFrame(
        ending.ending,
        layer.sourceTimeSeconds,
        layout,
        ending.beatSeconds
      );
      if (frame.plain) {
        drawSource(context, card, geometry);
      } else {
        const drawn = document.createElement("canvas");
        drawn.width = card.width;
        drawn.height = card.height;
        const drawnContext = drawn.getContext("2d");
        if (!drawnContext) throw new Error("No 2D context for the card's ending");
        drawCardEnding(drawnContext, card, card.width, card.height, frame, layout);
        drawSource(context, drawn, geometry);
      }
      if (frame.qr && layout.qr && layout.qrImage) {
        drawQrFlight(context, input, geometry.drawRect, layout, ending.ending, frame.qr);
      }
    },
  };
}

/** What the preview layer wrote on the card for the export to read. */
interface CardEndingData {
  ending: PostCardEnding;
  beatSeconds: number | null;
}

function cardEndingIn(layerElement: HTMLElement): CardEndingData | null {
  const raw = layerElement.querySelector<HTMLElement>(".choreo-layer")?.dataset
    .cardEnding;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CardEndingData;
  } catch {
    return null;
  }
}

/** Each card capture's measured layout, taken from the same drawing. */
const cardLayouts = new WeakMap<HTMLCanvasElement, MeasuredCardLayout>();

/**
 * The QR's flight leaves the card's box, so it is drawn on the whole frame:
 * out of the compositor's clip to the card's region, then back into a fresh
 * state the compositor's own restore pops. Its start is the QR's place on
 * the card as drawn this frame, mapped through the card's transform.
 */
function drawQrFlight(
  context: CanvasRenderingContext2D,
  input: SurfaceDrawInput,
  drawRect: { x: number; y: number; width: number; height: number },
  layout: MeasuredCardLayout,
  ending: PostCardEnding,
  flight: NonNullable<ReturnType<typeof cardEndingFrame>["qr"]>
): void {
  const qr = layout.qr!;
  const onCard = context.getTransform();
  context.restore();
  const base = context.getTransform();
  const toFrame = base.inverse().multiply(onCard);
  const corners = [
    [qr.x, qr.y],
    [qr.x + qr.width, qr.y + qr.height],
  ].map(([fx, fy]) =>
    toFrame.transformPoint(
      new DOMPoint(drawRect.x + fx! * drawRect.width, drawRect.y + fy! * drawRect.height)
    )
  );
  const { width, height } = input.preset.output;
  const from = {
    x: Math.min(corners[0]!.x, corners[1]!.x) / width,
    y: Math.min(corners[0]!.y, corners[1]!.y) / height,
    width: Math.abs(corners[1]!.x - corners[0]!.x) / width,
    height: Math.abs(corners[1]!.y - corners[0]!.y) / height,
  };
  context.save();
  try {
    context.globalAlpha = input.layer.opacity;
    paintQrFlight(context, width, height, {
      image: layout.qrImage!,
      box: lerpBox(from, qrLandingBox(ending.qrExit!, width / height), flight.progress),
      plate: layout.qrPlate,
      qrExit: ending.qrExit!,
      flight,
    });
  } finally {
    context.restore();
    // The compositor restores once after this surface; give it a state to pop.
    context.save();
  }
}

export async function captureCardLayer(
  layerElement: HTMLElement,
  targetWidth: number,
  cacheKey: string,
  cache: Map<string, HTMLCanvasElement>
): Promise<HTMLCanvasElement> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cardElement = layerElement.querySelector<HTMLElement>(".choreo-layer");
  if (!cardElement) throw new Error("Choreo card export surface is missing");
  await waitForChoreoCardQr(cardElement);
  // The QR's caption draws in the brand serif, which a canvas only has once
  // it is loaded.
  if (cardElement.dataset.cardEnding) await loadBrandSerif();
  const bounds = cardElement.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("Choreo card export surface has no size");
  }

  const { domToCanvas } = await import("modern-screenshot");
  const canvas = await domToCanvas(cardElement, {
    width: bounds.width,
    height: bounds.height,
    scale: targetWidth / bounds.width,
    ...POST_STUDIO_DOM_CAPTURE_OPTIONS,
  });
  cache.set(cacheKey, canvas);
  if (cardElement.dataset.cardEnding)
    cardLayouts.set(canvas, measureCardLayout(cardElement));
  return canvas;
}

/**
 * Wait until the opening hook's extra performers have their prop artwork, so a
 * frame never captures the ring half-drawn. Only the first hook frame waits;
 * the artwork stays loaded after that.
 */
export async function waitForTunnelHookArtwork(
  layerElement: HTMLElement,
  timeoutMs = 10_000
): Promise<void> {
  const pending = () =>
    layerElement.querySelector('[data-tunnel-hook-pending="true"]') !== null;
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  while (pending()) {
    if (performance.now() > deadline)
      throw new Error(
        "The opening hook's performers were not ready to render."
      );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
  // The renderer redraws once the artwork lands; let that frame paint.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait until a card has its QR code drawn. A card mounts on the frame it first
 * shows and mints its code a moment later, and the render keeps one capture
 * per beat, so capturing early showed a mandala in the QR cell for the whole
 * card.
 */
export async function waitForChoreoCardQr(
  cardElement: HTMLElement,
  timeoutMs = 10_000
): Promise<void> {
  const pending = () =>
    cardElement.querySelector('[data-qr-pending="true"]') !== null;
  if (!pending()) return;
  const deadline = performance.now() + timeoutMs;
  while (pending()) {
    if (performance.now() > deadline)
      throw new Error("The card's QR code was not ready to render.");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
  // The code fades in; capture it once it has landed.
  await Promise.allSettled(
    [...cardElement.querySelectorAll("img")].map((image) => image.decode())
  );
  await Promise.allSettled(
    cardElement
      .getAnimations({ subtree: true })
      .filter(
        (animation) => animation.effect?.getTiming().iterations !== Infinity
      )
      .map((animation) => animation.finished)
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Wait for the current pictograph's preparation, grid, and layout to commit. */
export function waitForPictographMotion(
  layerElement: HTMLElement,
  timeoutMs = 5_000
): Promise<{ element: HTMLElement; bounds: DOMRect }> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    let timer = 0;
    let settled = false;
    const observer = new MutationObserver(check);
    const cleanup = () => {
      settled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    function check() {
      if (settled) return;
      const element = layerElement.querySelector<HTMLElement>(
        "[data-pictograph-motion]"
      );
      const requiredContainers = [
        ...(element?.querySelectorAll<HTMLElement>(
          "[data-pictograph-render-ready]"
        ) ?? []),
      ].filter(
        (container) =>
          !container.closest('[data-pictograph-capture-required="false"]')
      );
      if (
        !element ||
        requiredContainers.length === 0 ||
        requiredContainers.some(
          (container) => container.dataset.pictographRenderReady !== "true"
        )
      )
        return;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      cleanup();
      resolve({ element, bounds });
    }
    function checkLayout() {
      check();
      if (!settled) frame = requestAnimationFrame(checkLayout);
    }
    observer.observe(layerElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-pictograph-render-ready",
        "data-pictograph-capture-required",
      ],
    });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The pictograph motion layer was not ready to render."));
    }, timeoutMs);
    check();
    if (!settled) frame = requestAnimationFrame(checkLayout);
  });
}
