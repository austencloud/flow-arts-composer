import { paintCardFrame, type CardFrameOptions } from "@tka/render-composition";
import { createRenderCanvas } from "$lib/shared/render/services/create-render-canvas";
import type { RenderCanvas } from "$lib/shared/render/services/types";

export {
  getCardFrameContentInset,
  type CardFrameOptions,
} from "@tka/render-composition";

export function wrapContentInCardFrame(
  content: CanvasImageSource,
  opts: CardFrameOptions,
  createCanvas: (w: number, h: number) => RenderCanvas = createRenderCanvas
): RenderCanvas {
  const canvas = createCanvas(
    opts.canvasWidth ?? 822,
    opts.canvasHeight ?? 1122
  );
  paintCardFrame(
    canvas.getContext("2d") as CanvasRenderingContext2D,
    content,
    opts
  );
  return canvas;
}
