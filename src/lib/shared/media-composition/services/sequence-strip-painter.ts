import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PreparedPictographData } from "$lib/shared/pictograph/shared/domain/models/prepared-pictograph-data";
import type { PropPosition } from "$lib/shared/pictograph/prop/domain/models/prop-position";
import {
  Canvas2DDirectRenderer,
  type PreparedPropSprite,
} from "$lib/shared/render/services/canvas-2d-direct-renderer";
import { drawElementWithTransform } from "$lib/shared/render/services/canvas-2d-transform-helper";
import type { RenderCanvas } from "$lib/shared/render/services/types";
import { VIEWBOX_SIZE } from "$lib/shared/render/core/constants/viewbox";
import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
import type { NotationCell } from "$lib/shared/timeline/notation-cell";
import { calculatePictographMotionPositions } from "$lib/shared/pictograph/prop/services/pictograph-motion-positioner";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { MandalaPathPreparer } from "$lib/shared/mandala/services/mandala-path-preparer";
import { computeEngineAlignedMandalaScale } from "$lib/shared/mandala/services/mandala-path-preparer";
import type { PreparedMandalaPath } from "$lib/shared/mandala/services/types";
import { BASE_SAMPLES_PER_BEAT } from "$lib/shared/mandala/domain/mandala-constants";
import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";
import {
  arrowOpacity,
  type SequenceFrame,
} from "$lib/shared/media-composition/domain/sequence-frame";
import {
  mandalaPrefixFraction,
  resolveStripView,
  type StripMode,
} from "$lib/shared/media-composition/domain/strip-view";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "./post-studio-layer-painter";

const BACKGROUND = "#08080c";

type PropPositions = Partial<Record<HandSide, PropPosition>>;

/** One cell's rendering inputs, cached once (position-independent of the
 * target pixel size - only the raster caches below are per-size). */
interface PreparedCell {
  prepared: PreparedPictographData;
  sprites: Partial<Record<HandSide, PreparedPropSprite>>;
}

/**
 * Every raster a target size needs, cached together so a resize or an export
 * at a different resolution from the preview never mixes sizes.
 */
interface SizeCache {
  /** Index 0 is the full start-position pictograph (grid, glyph, static
   * props - no arrows). Indices 1..N are move g's backdrop: grid, glyph,
   * turns, elemental - props and arrows both withheld, since the arrows view
   * draws those itself (interpolated props, then the fading arrows layer). */
  under: Map<number, RenderCanvas>;
  /** Move g's arrows alone, transparent elsewhere, faded in by arrowOpacity. */
  arrows: Map<number, RenderCanvas>;
}

/** Parses a motion's turns the same way MandalaPathPreparer's geometry does
 * (turns may arrive as a string from older data). Kept in sync with
 * mandala-geometry-calculator.ts's own parsing by hand, since that file isn't
 * this painter's to change - see the sampling comment below for why. */
function motionTurns(
  motion: { turns?: number | string } | null | undefined
): number {
  if (!motion) return 0;
  const raw =
    typeof motion.turns === "string"
      ? parseFloat(motion.turns)
      : (motion.turns ?? 0);
  return Number.isNaN(raw) ? 0 : raw;
}

/**
 * How many points MandalaPathPreparer's geometry samples for one hand at each
 * move, in move order (index i = move i + 1). A move with more turns samples
 * more densely (`BASE_SAMPLES_PER_BEAT * ceil(max(1, turns))`, then +1 for the
 * inclusive endpoint - see generatePathPoints in mandala-geometry-calculator.ts),
 * and a move where this hand has no visible motion contributes nothing. This
 * mirrors that formula rather than importing it because the calculator only
 * exposes the finished Path2D, not the per-move sample counts the progressive
 * reveal needs; the two must be kept in sync if that sampling ever changes.
 */
function mandalaSampleCounts(
  steps: readonly StepData[],
  hand: HandSide
): number[] {
  return steps.map((step) => {
    const motion = step.motions?.[hand];
    if (!isVisibleMotion(motion)) return 0;
    const samples =
      BASE_SAMPLES_PER_BEAT * Math.ceil(Math.max(1, motionTurns(motion)));
    return samples + 1;
  });
}

function stripSquareSize(dims: { width: number; height: number }): number {
  return Math.max(1, Math.ceil(Math.min(dims.width, dims.height)));
}

/**
 * Paints the slow-section strip square: a pictograph tracing each move's
 * arrows as the performer makes it, or the mandala shape the pass traces,
 * or both by alternating pass-to-pass - identically whether the preview or
 * the MP4 export is the one asking. Reads nothing from the DOM; every pixel
 * comes from `sequence` and the evaluated `frame`.
 */
class SequenceStripPainter implements PostStudioLayerPainter {
  private readonly renderer = new Canvas2DDirectRenderer();
  private readonly mandalaPreparer = new MandalaPathPreparer();
  private readonly cells: NotationCell[];
  /** Number of moves in one pass (cells.length - 1; cells[0] is the start). */
  private readonly moveCount: number;
  private readonly leftSampleCounts: number[];
  private readonly rightSampleCounts: number[];

  private preparedCells: PreparedCell[] | null = null;
  private preparedCellsTask: Promise<PreparedCell[]> | null = null;
  private mandalaPaths: PreparedMandalaPath[] | null = null;

  private readonly sizeCaches = new Map<number, SizeCache>();
  private readonly pendingSizes = new Map<number, Promise<void>>();

  constructor(
    private readonly sequence: SequenceData,
    private readonly mode: StripMode
  ) {
    this.cells = buildNotationCells(sequence);
    this.moveCount = Math.max(0, this.cells.length - 1);
    this.leftSampleCounts = mandalaSampleCounts(sequence.steps, HandSide.LEFT);
    this.rightSampleCounts = mandalaSampleCounts(
      sequence.steps,
      HandSide.RIGHT
    );
  }

  async prepare(target: { width: number; height: number }): Promise<void> {
    const size = stripSquareSize(target);
    if (this.sizeCaches.has(size)) return;
    const existing = this.pendingSizes.get(size);
    if (existing) return existing;

    const task = this.prepareAtSize(size).finally(() =>
      this.pendingSizes.delete(size)
    );
    this.pendingSizes.set(size, task);
    return task;
  }

  private async loadPreparedCells(): Promise<PreparedCell[]> {
    if (this.preparedCells) return this.preparedCells;
    if (this.preparedCellsTask) return this.preparedCellsTask;

    const task = (async () => {
      await this.renderer.initialize();
      const { pictographPreparer } =
        await import("$lib/shared/pictograph/shared/services/pictograph-preparer");

      const prepared: PreparedCell[] = [];
      for (const cell of this.cells) {
        const preparedData = await pictographPreparer.prepareSingle(cell.data, {
          themeMode: "light",
        });
        const sprites: Partial<Record<HandSide, PreparedPropSprite>> = {};
        if (preparedData._prepared) {
          for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
            const sprite = await this.renderer.preparePropSprite(
              preparedData._prepared,
              hand,
              preparedData,
              { size: VIEWBOX_SIZE, visibility: { darkMode: false } }
            );
            if (sprite) sprites[hand] = sprite;
          }
        }
        prepared.push({ prepared: preparedData, sprites });
      }
      this.preparedCells = prepared;
      return prepared;
    })();
    this.preparedCellsTask = task;
    return task;
  }

  private async prepareAtSize(size: number): Promise<void> {
    const preparedCells = await this.loadPreparedCells();

    const under = new Map<number, RenderCanvas>();
    const arrows = new Map<number, RenderCanvas>();
    for (let index = 0; index < preparedCells.length; index++) {
      const { prepared } = preparedCells[index]!;
      const isStart = index === 0;
      const underImage = await this.renderer.renderPictograph(prepared, {
        size,
        visibility: {
          darkMode: false,
          // The start pose is never animated into - show its own static
          // props directly rather than caching a bare backdrop for it.
          showProps: isStart,
          showArrows: false,
        },
      });
      under.set(index, underImage);

      if (!isStart) {
        const arrowsImage = await this.renderer.renderPictograph(prepared, {
          size,
          visibility: {
            darkMode: false,
            showBackground: false,
            showGrid: false,
            showProps: false,
            showArrows: true,
            showTKA: false,
            showTnD: false,
            showElemental: false,
            showPropTnD: false,
            showPlacements: false,
            showReversals: false,
          },
        });
        arrows.set(index, arrowsImage);
      }
    }
    this.sizeCaches.set(size, { under, arrows });

    if (this.mode !== "arrows" && !this.mandalaPaths) {
      this.mandalaPaths = this.prepareMandalaPaths();
    }
  }

  /**
   * Path2D geometry doesn't depend on pixel size (MandalaGeometryCalculator
   * works in an abstract "mandala space"); only the on-screen scale does, and
   * that's recomputed at paint time from the actual rect. So the geometry -
   * the expensive part, one DOM path-length measurement per traced arm - is
   * prepared once regardless of how many target sizes this painter serves.
   */
  private prepareMandalaPaths(): PreparedMandalaPath[] {
    const prepared = this.mandalaPreparer.prepare(
      this.sequence.steps,
      VIEWBOX_SIZE,
      {
        show: "both",
        leftPropType: undefined,
        rightPropType: undefined,
        trackingMode: DEFAULT_TRAIL_SETTINGS.trackingMode,
        leftColor: DEFAULT_TRAIL_SETTINGS.leftColor,
        rightColor: DEFAULT_TRAIL_SETTINGS.rightColor,
      }
    );
    return prepared?.paths ?? [];
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

    const sequenceFrame = frame.sequenceFrame;
    if (!sequenceFrame || this.moveCount === 0) {
      context.restore();
      return;
    }

    const view = resolveStripView(this.mode, sequenceFrame);
    if (view === "arrows") {
      this.paintArrows(context, rect, sequenceFrame);
    } else {
      this.paintMandala(context, rect, sequenceFrame);
    }
    context.restore();
  }

  private paintArrows(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    sequenceFrame: SequenceFrame
  ): void {
    const size = stripSquareSize(rect);
    const cache = this.sizeCaches.get(size);
    const preparedCells = this.preparedCells;
    if (!cache || !preparedCells) return; // Not ready yet - background only.

    const side = Math.min(rect.width, rect.height);
    const left = rect.x + (rect.width - side) / 2;
    const top = rect.y + (rect.height - side) / 2;

    context.save();
    context.translate(left, top);

    if (sequenceFrame.phase === "opening") {
      const startImage = cache.under.get(0);
      if (startImage) context.drawImage(startImage, 0, 0, side, side);
      context.restore();
      return;
    }

    const moveIndex = sequenceFrame.move;
    const underImage = cache.under.get(moveIndex);
    if (underImage) context.drawImage(underImage, 0, 0, side, side);

    const endCell = preparedCells[moveIndex];
    // A pass wraps: move 1 of pass >= 1 flies out of the pass's own last
    // landing, not the sequence's opening pose - the performer never returns
    // to the start position between repetitions of a LOOP.
    const startIndex =
      moveIndex === 1 && sequenceFrame.pass >= 1
        ? this.moveCount
        : moveIndex - 1;
    const startCell = preparedCells[startIndex];
    const stepData = this.cells[moveIndex]?.data as StepData | undefined;

    if (
      endCell?.prepared._prepared &&
      startCell?.prepared._prepared &&
      stepData
    ) {
      const positions = calculatePictographMotionPositions({
        step: stepData,
        progress: sequenceFrame.moveProgress,
        gridMode: endCell.prepared._prepared.gridMode,
        leftPropType: String(
          endCell.prepared._prepared.propAssets[HandSide.LEFT]?.propType ??
            "staff"
        ),
        rightPropType: String(
          endCell.prepared._prepared.propAssets[HandSide.RIGHT]?.propType ??
            "staff"
        ),
        startPlacements: startCell.prepared._prepared.propPositions,
        endPlacements: endCell.prepared._prepared.propPositions,
      });
      this.drawInterpolatedProps(context, side, endCell.sprites, positions);
    }

    const arrowsImage = cache.arrows.get(moveIndex);
    if (arrowsImage) {
      context.save();
      context.globalAlpha *= arrowOpacity(sequenceFrame);
      context.drawImage(arrowsImage, 0, 0, side, side);
      context.restore();
    }

    context.restore();
  }

  private drawInterpolatedProps(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    side: number,
    sprites: Partial<Record<HandSide, PreparedPropSprite>>,
    positions: PropPositions
  ): void {
    const scale = side / VIEWBOX_SIZE;
    for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
      const position = positions[hand];
      const sprite = sprites[hand];
      if (!position || !sprite) continue;
      drawElementWithTransform(context, sprite.img, {
        x: position.x * scale,
        y: position.y * scale,
        rotation: position.rotation,
        centerX: sprite.centerX,
        centerY: sprite.centerY,
        viewBoxWidth: sprite.viewBoxWidth,
        viewBoxHeight: sprite.viewBoxHeight,
        scale,
        shouldMirror: sprite.mirror,
      });
    }
  }

  private paintMandala(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    sequenceFrame: SequenceFrame
  ): void {
    const paths = this.mandalaPaths;
    if (!paths || paths.length === 0) return; // Not ready yet - background only.

    const side = Math.min(rect.width, rect.height);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const scale = computeEngineAlignedMandalaScale(side);

    const leftFraction = mandalaPrefixFraction(
      this.leftSampleCounts,
      sequenceFrame
    );
    const rightFraction = mandalaPrefixFraction(
      this.rightSampleCounts,
      sequenceFrame
    );

    context.save();
    context.translate(centerX, centerY);
    context.scale(scale, scale);
    context.lineWidth = 2.5 / scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const path of paths) {
      const fraction = path.hand === "left" ? leftFraction : rightFraction;
      // The complete path gives the mandala its shape; its bright leading
      // portion records how far this hand has actually traced it so far.
      context.strokeStyle = path.color;
      context.globalAlpha = 0.25;
      context.setLineDash([]);
      context.stroke(path.path2d);
      context.globalAlpha = 1;
      context.setLineDash([path.totalLength * fraction, path.totalLength]);
      context.stroke(path.path2d);
    }
    context.setLineDash([]);
    context.globalAlpha = 1;
    context.restore();
  }
}

export function createSequenceStripPainter(input: {
  sequence: SequenceData;
  mode: StripMode;
}): PostStudioLayerPainter {
  return new SequenceStripPainter(input.sequence, input.mode);
}
