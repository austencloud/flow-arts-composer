import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { Canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
import type { RenderCanvas } from "$lib/shared/render/services/types";
import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
import type { NotationCell } from "$lib/shared/timeline/notation-cell";
import {
  beatCarouselFocusSize,
  layoutBeatCarousel,
  type BeatCarouselBeat,
} from "./beat-carousel-layout";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "./post-studio-layer-painter";

const BACKGROUND = "#08080c";
const FOCUS = "#d4813a";

/** One instance belongs to one displayed sequence. The size cache serves both
 * the preview and export without letting a preview raster reach the export. */
class BeatCarouselPainter implements PostStudioLayerPainter {
  private readonly renderer = new Canvas2DDirectRenderer();
  private readonly cells: NotationCell[];
  private readonly cache = new Map<
    number,
    Map<BeatCarouselBeat, RenderCanvas>
  >();
  private readonly pending = new Map<number, Promise<void>>();

  constructor(private readonly sequence: SequenceData) {
    this.cells = buildNotationCells(sequence);
  }

  prepare(target: { width: number; height: number }): Promise<void> {
    const size = Math.max(1, Math.ceil(beatCarouselFocusSize(target)));
    if (this.cache.has(size)) return Promise.resolve();
    const existing = this.pending.get(size);
    if (existing) return existing;

    const task = this.renderAtSize(size).finally(() =>
      this.pending.delete(size)
    );
    this.pending.set(size, task);
    return task;
  }

  private async renderAtSize(size: number): Promise<void> {
    await this.renderer.initialize();
    // The direct renderer needs prepared arrows and props. Its global preparer
    // is optional, so pass the app's preparer explicitly here.
    const { pictographPreparer } =
      await import("$lib/shared/pictograph/shared/services/pictograph-preparer");
    const images = new Map<BeatCarouselBeat, RenderCanvas>();
    for (const cell of this.cells) {
      const pictograph = await pictographPreparer.prepareSingle(cell.data, {
        themeMode: "light",
      });
      const image = await this.renderer.renderPictograph(pictograph, {
        size,
        visibility: { darkMode: false },
      });
      images.set(cell.isStart ? "start" : cell.stepNumber, image);
    }
    this.cache.set(size, images);
  }

  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    frame: PaintFrame
  ): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    context.fillStyle = BACKGROUND;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);

    const layout = layoutBeatCarousel({
      rect,
      position: frame.carouselPosition ?? frame.sequencePosition ?? 0,
      beatCount: this.sequence.steps.length,
    });
    const images = this.cache.get(Math.max(1, Math.ceil(layout.focusSize)));
    const radius = Math.max(2, rect.width / 140);
    for (const cell of layout.cells) {
      const image = images?.get(cell.beat);
      if (!image) continue;
      const left = cell.x - cell.size / 2;
      const top = cell.y - cell.size / 2;
      context.save();
      context.globalAlpha *= cell.opacity;
      context.beginPath();
      context.roundRect(left, top, cell.size, cell.size, radius);
      context.clip();
      context.drawImage(image, left, top, cell.size, cell.size);
      context.restore();
      if (cell.isFocus) {
        context.strokeStyle = FOCUS;
        context.lineWidth = Math.max(1, (2 * rect.width) / 580);
        context.beginPath();
        context.roundRect(left, top, cell.size, cell.size, radius);
        context.stroke();
      }
    }

    const tickY = rect.y + rect.height - Math.max(4, rect.height * 0.035);
    const tickRadius = Math.max(
      1.5,
      Math.min(rect.width / 100, rect.height / 70)
    );
    const tickPitch = Math.min(
      rect.width / (layout.ticks.length + 1),
      tickRadius * 3.4
    );
    const tickStart =
      rect.x + rect.width / 2 - ((layout.ticks.length - 1) * tickPitch) / 2;
    layout.ticks.forEach((tick, index) => {
      context.fillStyle =
        tick.state === "current"
          ? FOCUS
          : tick.state === "landed"
            ? "rgba(255,255,255,0.45)"
            : "rgba(255,255,255,0.18)";
      context.beginPath();
      context.arc(
        tickStart + index * tickPitch,
        tickY,
        tickRadius,
        0,
        Math.PI * 2
      );
      context.fill();
    });
    context.restore();
  }
}

export function createBeatCarouselPainter(
  sequence: SequenceData
): PostStudioLayerPainter {
  return new BeatCarouselPainter(sequence);
}
