import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { Canvas2DDirectRenderer } from "#lib/shared/render/services/canvas-2d-direct-renderer.js";
import type { RenderCanvas } from "#lib/shared/render/services/types.js";
import { buildNotationCells } from "#lib/shared/timeline/notation-cell.js";
import type { NotationCell } from "#lib/shared/timeline/notation-cell.js";
import {
  beatCarouselFocusSize,
  layoutBeatCarousel,
  transposeBeatCarouselRect,
  type BeatCarouselBeat,
  type BeatCarouselOrientation,
} from "./beat-carousel-layout";
import {
  nearestCachedSize,
  paintSizeBucket,
  type PaintFrame,
  type PaintRect,
  type PostStudioLayerPainter,
} from "@austencloud/video-editor/render";

const FOCUS = "#d4813a";

/**
 * `studio` is the Post Studio breakdown look. A downloaded video's band takes
 * `dark` or `light` from the video itself: the word header's colors behind
 * cards drawn in the same theme, with a faint outline so a card stays visible
 * against a background of its own color.
 */
export type BeatCarouselPalette = "studio" | "dark" | "light";

interface PaletteColors {
  background: string;
  darkCards: boolean;
  outline: string | null;
  landedTick: string;
  upcomingTick: string;
}

const PALETTES: Record<BeatCarouselPalette, PaletteColors> = {
  studio: {
    background: "#08080c",
    darkCards: false,
    outline: null,
    landedTick: "rgba(255,255,255,0.45)",
    upcomingTick: "rgba(255,255,255,0.18)",
  },
  dark: {
    background: "#0a0a0f",
    darkCards: true,
    outline: "rgba(255,255,255,0.16)",
    landedTick: "rgba(255,255,255,0.45)",
    upcomingTick: "rgba(255,255,255,0.18)",
  },
  light: {
    background: "#f5f5f5",
    darkCards: false,
    outline: "rgba(35,31,32,0.14)",
    landedTick: "rgba(35,31,32,0.5)",
    upcomingTick: "rgba(35,31,32,0.18)",
  },
};

export interface BeatCarouselPainterOptions {
  /** Which way the row runs; horizontal unless set. */
  orientation?: BeatCarouselOrientation;
  palette?: BeatCarouselPalette;
}

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
  private readonly vertical: boolean;
  private readonly colors: PaletteColors;

  constructor(
    private readonly sequence: SequenceData,
    options: BeatCarouselPainterOptions = {}
  ) {
    this.cells = buildNotationCells(sequence);
    this.vertical = options.orientation === "vertical";
    this.colors = PALETTES[options.palette ?? "studio"];
  }

  prepare(target: { width: number; height: number }): Promise<void> {
    const size = paintSizeBucket(
      beatCarouselFocusSize(target, this.vertical ? "vertical" : "horizontal")
    );
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
      await import("#lib/shared/pictograph/shared/services/pictograph-preparer.js");
    const images = new Map<BeatCarouselBeat, RenderCanvas>();
    const darkMode = this.colors.darkCards;
    for (const cell of this.cells) {
      const pictograph = await pictographPreparer.prepareSingle(cell.data, {
        themeMode: darkMode ? "dark" : "light",
      });
      const image = await this.renderer.renderPictograph(pictograph, {
        size,
        visibility: { darkMode },
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
    const { colors, vertical } = this;
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    context.fillStyle = colors.background;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Everything below is measured in the row's own space, where it runs
    // along x; a vertical band swaps each point back as it is drawn.
    const space = vertical ? transposeBeatCarouselRect(rect) : rect;
    const at = (x: number, y: number) => (vertical ? { x: y, y: x } : { x, y });
    const layout = layoutBeatCarousel({
      rect: space,
      position: frame.carouselPosition ?? frame.sequencePosition ?? 0,
      beatCount: this.sequence.steps.length,
    });
    const bucket = paintSizeBucket(layout.focusSize);
    const nearest = this.cache.has(bucket)
      ? bucket
      : nearestCachedSize(this.cache.keys(), bucket);
    const images = nearest !== null ? this.cache.get(nearest) : undefined;
    const radius = Math.max(2, space.width / 140);
    const strokeWidth = Math.max(1, (2 * space.width) / 580);
    for (const cell of layout.cells) {
      const image = images?.get(cell.beat);
      if (!image) continue;
      const center = at(cell.x, cell.y);
      const left = center.x - cell.size / 2;
      const top = center.y - cell.size / 2;
      context.save();
      context.globalAlpha *= cell.opacity;
      context.beginPath();
      context.roundRect(left, top, cell.size, cell.size, radius);
      context.clip();
      context.drawImage(image, left, top, cell.size, cell.size);
      context.restore();
      if (colors.outline && !cell.isFocus) {
        context.save();
        context.globalAlpha *= cell.opacity;
        context.strokeStyle = colors.outline;
        context.lineWidth = strokeWidth / 2;
        context.beginPath();
        context.roundRect(left, top, cell.size, cell.size, radius);
        context.stroke();
        context.restore();
      }
      if (cell.isFocus) {
        context.strokeStyle = FOCUS;
        context.lineWidth = strokeWidth;
        context.beginPath();
        context.roundRect(left, top, cell.size, cell.size, radius);
        context.stroke();
      }
    }

    const tickY = space.y + space.height - Math.max(4, space.height * 0.035);
    const tickRadius = Math.max(
      1.5,
      Math.min(space.width / 100, space.height / 70)
    );
    const tickPitch = Math.min(
      space.width / (layout.ticks.length + 1),
      tickRadius * 3.4
    );
    const tickStart =
      space.x + space.width / 2 - ((layout.ticks.length - 1) * tickPitch) / 2;
    layout.ticks.forEach((tick, index) => {
      context.fillStyle =
        tick.state === "current"
          ? FOCUS
          : tick.state === "landed"
            ? colors.landedTick
            : colors.upcomingTick;
      const dot = at(tickStart + index * tickPitch, tickY);
      context.beginPath();
      context.arc(dot.x, dot.y, tickRadius, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }
}

export function createBeatCarouselPainter(
  sequence: SequenceData,
  options?: BeatCarouselPainterOptions
): PostStudioLayerPainter {
  return new BeatCarouselPainter(sequence, options);
}
