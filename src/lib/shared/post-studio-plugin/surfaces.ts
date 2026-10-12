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

/**
 * The DOM surfaces tka's preview mounts for a post: the sequence animation,
 * the choreo card and an arrangement's grid. Each call returns fresh surfaces
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
  ];
}

function createSequenceAnimationSurface(): SurfaceCapture {
  const pictographCapture = new PostStudioPictographCapture();
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
      const beat = layer.displayedBeatNumber ?? 0;
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
      drawSource(context, card, geometry);
    },
  };
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
