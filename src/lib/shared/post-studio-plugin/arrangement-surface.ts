import {
  applyLayerTransform,
  drawSource,
  resolveFrameLayerGeometry,
  type FrameLayerGeometry,
  type SurfaceCapture,
  type SurfaceDrawInput,
} from "@austencloud/video-editor/render";
import { PostStudioPictographCapture } from "#lib/shared/media-composition/services/post-studio-pictograph-capture.js";

/**
 * An arrangement's grid in the exported file. The preview mounts the grid's
 * cells as live canvases; a grid of animation cells is drawn from those
 * canvases' pixels, and any other grid is captured from the DOM.
 *
 * This module must never import the plugin index by value: the index
 * re-exports surfaces.ts, which imports this.
 */

/**
 * How long a frame waits for the grid's canvases to be rebuilt at the size the
 * export lays them out at. One that never catches up, such as a canvas whose
 * pane is inert, is drawn as it stands rather than failing the file.
 */
const ARRANGEMENT_RASTER_GRACE_MS = 3_000;

/** Every cell canvas is rasterized at the square its box now has. */
function arrangementRastersSettled(surface: HTMLElement): boolean {
  return Array.from(
    surface.querySelectorAll<HTMLElement>(".canvas-wrapper")
  ).every((wrapper) => {
    const size = Math.min(wrapper.clientWidth, wrapper.clientHeight);
    return size <= 0 || wrapper.dataset.rasterSize === String(size);
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The grid mounts canvas engines asynchronously, including on its first export frame. */
function waitForArrangementSurface(
  layerElement: HTMLElement
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let waitedForRasters = false;
    let rasterTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(check);
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Arrangement preview did not finish rendering before export"
          )
        ),
      15_000
    );

    function finish(error?: Error, surface?: HTMLElement) {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      if (rasterTimer) clearTimeout(rasterTimer);
      if (error) reject(error);
      else if (!waitedForRasters) resolve(surface!);
      // A rebuilt canvas starts blank; the engines repaint the pose next frame.
      else
        void nextAnimationFrame()
          .then(nextAnimationFrame)
          .then(() => resolve(surface!));
    }

    function check() {
      const surface = layerElement.querySelector<HTMLElement>(
        "[data-arrangement-surface]"
      );
      if (!surface) return;
      if (surface.querySelector("[data-arrangement-cell-error]")) {
        finish(new Error("An arrangement cell failed to render for export"));
        return;
      }
      const expected = Number(surface.dataset.arrangementCellCount);
      const cells = surface.querySelectorAll("[data-arrangement-cell-ready]");
      if (Number.isFinite(expected) && cells.length < expected) return;
      if (surface.querySelector('[data-arrangement-cell-ready="false"]'))
        return;
      if (!arrangementRastersSettled(surface)) {
        if (!waitedForRasters) {
          waitedForRasters = true;
          rasterTimer = setTimeout(
            () => finish(undefined, surface),
            ARRANGEMENT_RASTER_GRACE_MS
          );
        }
        return;
      }
      finish(undefined, surface);
    }

    observer.observe(layerElement, {
      childList: true,
      attributes: true,
      subtree: true,
    });
    check();
  });
}

/**
 * The animation cells already contain their finished canvas frames. Drawing
 * those pixels directly avoids cloning a whole grid into a large SVG/image on
 * every video frame. Other media types still use the DOM capture.
 */
function drawArrangementCanvases(
  context: CanvasRenderingContext2D,
  surface: HTMLElement,
  geometry: FrameLayerGeometry
): boolean {
  const cells = Array.from(
    surface.querySelectorAll<HTMLElement>(".arrangement-cell")
  );
  if (
    !cells.length ||
    cells.some((cell) => cell.dataset.mediaType !== "animation")
  )
    return false;

  const bounds = surface.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0)
    throw new Error("Arrangement export surface has no size");
  const scaleX = geometry.region.width / bounds.width;
  const scaleY = geometry.region.height / bounds.height;
  const x = (clientX: number) =>
    geometry.region.x + (clientX - bounds.left) * scaleX;
  const y = (clientY: number) =>
    geometry.region.y + (clientY - bounds.top) * scaleY;
  const rect = (element: Element) => {
    const box = element.getBoundingClientRect();
    return {
      x: x(box.left),
      y: y(box.top),
      width: box.width * scaleX,
      height: box.height * scaleY,
    };
  };

  // Verify every engine is mounted before painting any cells. A missing GPU
  // surface should fail visibly instead of silently exporting a blank slot.
  const cellCanvases = cells.map((cell) => {
    const canvases = Array.from(
      cell.querySelectorAll<HTMLCanvasElement>(".canvas-wrapper canvas")
    );
    if (
      !canvases.length ||
      canvases.some((canvas) => !canvas.width || !canvas.height)
    )
      throw new Error("An arrangement canvas was not ready for export");
    return canvases;
  });

  context.save();
  applyLayerTransform(context, geometry);
  context.beginPath();
  context.rect(
    geometry.region.x,
    geometry.region.y,
    geometry.region.width,
    geometry.region.height
  );
  context.clip();
  context.fillStyle = getComputedStyle(surface).backgroundColor || "#101018";
  context.fillRect(
    geometry.region.x,
    geometry.region.y,
    geometry.region.width,
    geometry.region.height
  );

  for (const [index, cell] of cells.entries()) {
    const cellCanvas = cell.querySelector<HTMLElement>(".cell-canvas");
    if (!cellCanvas) continue;
    const cellRect = rect(cellCanvas);
    context.save();
    context.beginPath();
    context.rect(cellRect.x, cellRect.y, cellRect.width, cellRect.height);
    context.clip();
    const style = getComputedStyle(cellCanvas);
    context.fillStyle = style.backgroundColor;
    context.fillRect(cellRect.x, cellRect.y, cellRect.width, cellRect.height);

    const wrapper = cellCanvas.querySelector<HTMLElement>(".canvas-wrapper");
    if (wrapper) {
      const wrapperRect = rect(wrapper);
      context.fillStyle = getComputedStyle(wrapper).backgroundColor;
      context.fillRect(
        wrapperRect.x,
        wrapperRect.y,
        wrapperRect.width,
        wrapperRect.height
      );
    }
    for (const canvas of cellCanvases[index] ?? []) {
      const canvasRect = rect(canvas);
      if (canvasRect.width > 0 && canvasRect.height > 0) {
        context.drawImage(
          canvas,
          canvasRect.x,
          canvasRect.y,
          canvasRect.width,
          canvasRect.height
        );
      }
    }
    const border = Number.parseFloat(style.borderTopWidth) * scaleY;
    if (border > 0) {
      context.strokeStyle = style.borderTopColor;
      context.lineWidth = border;
      context.strokeRect(
        cellRect.x + border / 2,
        cellRect.y + border / 2,
        cellRect.width - border,
        cellRect.height - border
      );
    }
    context.restore();
  }
  context.restore();
  return true;
}

export function createArrangementSurface(): SurfaceCapture {
  let capture: PostStudioPictographCapture | null = null;
  return {
    renderMode: "arrangement",
    async draw(input: SurfaceDrawInput): Promise<void> {
      const { context, layerElement, layer, region, regionPixels } = input;
      const surface = await waitForArrangementSurface(layerElement);
      const bounds = surface.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0)
        throw new Error("Arrangement export surface has no size");
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region: { ...region, fit: "fill" },
        sourceWidth: 1,
        sourceHeight: 1,
        transform: layer.transform,
      });
      if (drawArrangementCanvases(context, surface, geometry)) return;
      const scale = Math.max(
        1,
        regionPixels.width / bounds.width,
        regionPixels.height / bounds.height
      );
      capture ??= new PostStudioPictographCapture();
      const image = await capture.capture(
        surface,
        bounds.width,
        bounds.height,
        scale
      );
      applyLayerTransform(context, geometry);
      drawSource(context, image, geometry);
    },
    release(): void {
      capture?.dispose();
      capture = null;
    },
  };
}
