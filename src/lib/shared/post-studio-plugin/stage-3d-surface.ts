import {
  applyLayerTransform,
  drawSource,
  resolveFrameLayerGeometry,
  type SurfaceCapture,
  type SurfaceDrawInput,
} from "@austencloud/video-editor/render";
import {
  stage3DFrameSourceIn,
  type Stage3DFrameSource,
} from "./stage-3d-registry";

/**
 * A 3D animation clip in the exported file. The export seeks the post, so the
 * clip's stage already holds every performer's step and the shot's camera for
 * that time; the stage then renders one frame on demand with its own loop
 * paused (the offline 3D exporter's method) at the region's pixel size, and
 * this draws it with the cover fit the preview's full-box canvas shows.
 *
 * This module must never import the plugin index by value: the index
 * re-exports surfaces.ts, which imports this.
 */
const STAGE_WAIT_MS = 60_000;

function waitForStage(layerElement: HTMLElement): Promise<Stage3DFrameSource> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      const source = stage3DFrameSourceIn(layerElement);
      if (source?.ready()) {
        resolve(source);
        return;
      }
      if (performance.now() - started > STAGE_WAIT_MS) {
        reject(new Error("The 3D stage was not ready to render."));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export function createStage3DSurface(): SurfaceCapture {
  const used = new Set<Stage3DFrameSource>();
  return {
    renderMode: "scene-3d",
    async draw(input: SurfaceDrawInput): Promise<void> {
      const { context, layerElement, layer, region, regionPixels } = input;
      const source = await waitForStage(layerElement);
      used.add(source);
      const frame = await source.render(
        Math.max(2, Math.round(regionPixels.width)),
        Math.max(2, Math.round(regionPixels.height))
      );
      const geometry = resolveFrameLayerGeometry({
        preset: input.preset,
        region: { ...region, fit: "cover" },
        sourceWidth: frame.width,
        sourceHeight: frame.height,
        transform: layer.transform,
      });
      context.save();
      applyLayerTransform(context, geometry);
      drawSource(context, frame, geometry);
      context.restore();
    },
    release(): void {
      for (const source of used) source.finish();
      used.clear();
    },
  };
}
