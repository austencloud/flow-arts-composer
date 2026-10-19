import {
  applyLayerTransform,
  drawSource,
  resolveFrameLayerGeometry,
  type SurfaceCapture,
  type SurfaceDrawInput,
} from "@austencloud/video-editor/render";

/**
 * A shifting mandala clip in the exported file. The preview draws each frame
 * into one canvas and stamps it with the source time it shows; the surface
 * waits for the stamp of the frame being exported and copies the pixels.
 *
 * This module must never import the plugin index by value: the index
 * re-exports surfaces.ts, which imports this.
 */
const FRAME_WAIT_MS = 10_000;

function waitForFrame(
  layerElement: HTMLElement,
  stamp: string
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      const canvas = layerElement.querySelector<HTMLCanvasElement>(
        "canvas[data-shifting-mandala]"
      );
      if (canvas && canvas.dataset.frame === stamp && canvas.width > 0) {
        resolve(canvas);
        return;
      }
      if (performance.now() - started > FRAME_WAIT_MS) {
        reject(
          new Error(
            `The shifting mandala did not draw its frame at ${stamp} s before export`
          )
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export function createShiftingMandalaSurface(): SurfaceCapture {
  return {
    renderMode: "mandala",
    async draw(input: SurfaceDrawInput): Promise<void> {
      const { context, layerElement, layer, region } = input;
      const canvas = await waitForFrame(
        layerElement,
        String(layer.sourceTimeSeconds)
      );
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region: { ...region, fit: "fill" },
        sourceWidth: canvas.width,
        sourceHeight: canvas.height,
        transform: layer.transform,
      });
      context.save();
      applyLayerTransform(context, geometry);
      drawSource(context, canvas, geometry);
      context.restore();
    },
  };
}
