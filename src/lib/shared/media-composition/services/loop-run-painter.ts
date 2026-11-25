import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PreparedPictographData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
import type { PropPosition } from "#lib/shared/pictograph/prop/domain/models/prop-position.js";
import {
  Canvas2DDirectRenderer,
  type PreparedPropSprite,
} from "#lib/shared/render/services/canvas-2d-direct-renderer.js";
import { drawElementWithTransform } from "#lib/shared/render/services/canvas-2d-transform-helper.js";
import type { RenderCanvas } from "#lib/shared/render/services/types.js";
import { createRenderCanvas } from "#lib/shared/render/services/create-render-canvas.js";
import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";
import { buildNotationCells, type NotationCell } from "#lib/shared/timeline/notation-cell.js";
import { calculatePictographMotionPositions } from "#lib/shared/pictograph/prop/services/pictograph-motion-positioner.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { LOOP_ICON_PATHS } from "@tka/render-composition";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { propTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import { Canvas2DImageLoader } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-image-loader.js";
import { Canvas2DTrailRenderer } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer.js";
import {
  GRID_INK,
  drawPropSprite,
  propTransformOf,
  tintGridInk,
  type CanvasPropState,
} from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-scene-drawing.js";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { calculateInitialAngles, interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { calculateTrailSourceEndpoint } from "#lib/shared/animation-engine/services/prop-position-calculator.js";
import {
  resolveTrailPointConfig,
  type TrailPointSource,
} from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
  TrailEffect,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { QualityTier, type QualityHints } from "#lib/shared/animation-engine/domain/types/quality-types.js";
import { applyEffort } from "#lib/shared/effort/domain/effort-easing-unified.js";
import { loopLightPoints, type LoopLightTip } from "#lib/shared/media-composition/domain/loop-run-light.js";
import {
  loopRunBadgeAt,
  loopRunFrame,
  loopRunTurnDegrees,
  type LoopCanvasDraw,
  type LoopCopyDraw,
  type LoopFlareDraw,
  type LoopLightStroke,
  type LoopLineDraw,
  type LoopPropsDraw,
  type LoopRunPlan,
  type LoopStageDraw,
  type LoopStagePose,
  type LoopTileDraw,
  type LoopTilePlace,
  type LoopWayBackDraw,
} from "#lib/shared/media-composition/domain/loop-run.js";
import { paintSelectionRing, selectionGold } from "#lib/shared/media-composition/services/selection-ring.js";
import {
  nearestCachedSize,
  paintSizeBucket,
  type PaintFrame,
  type PaintRect,
  type PostStudioLayerPainter,
} from "@austencloud/video-editor/render";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type PropPositions = Partial<Record<HandSide, PropPosition>>;

/** The tile's own dark ground, as the app's dark pictographs draw it. */
const TILE_GROUND = "#0a0a0f";
const SLOT_INK = "rgba(255, 255, 255, 0.16)";
/** How strongly a waiting place's grid shows, against a tile's own. */
const WAITING_GRID_ALPHA = 0.4;
const HOME_INK = "#ffffff";
/** Rounded tile corners, as a share of the tile. */
const CORNER = 0.035;
/** The outline on a repeat: its width on a 1080 frame, and its strength. */
const OUTLINE_PX = 2;
const OUTLINE_ALPHA = 0.6;
/** The hairline round a pictograph in the card, as the app draws a sequence. */
const EDGE_INK = "rgba(255, 255, 255, 0.16)";
/** The one hairline of a plain tile (`plainTiles`): its width on a 1080 frame, and its ink. */
const PLAIN_EDGE_PX = 2;
const PLAIN_EDGE_INK = "rgba(255, 255, 255, 0.13)";
const MAX_CACHED_SIZES = 3;
/**
 * The home shadow (`shadow`): the props' silhouette in the big grid's grey
 * (the stage picture's dot colour; the renderer has no constant for it) at
 * this strength, flat, with no outline.
 */
const SHADOW_INK = "#e6e6ea";
const SHADOW_ALPHA = 0.17;
/** The way back at full strength: the card ring's border gold. */
const WAY_BACK_ALPHA = 0.9;
/** The flare's corners, as a share of its outline's shorter side. */
const FLARE_CORNER = 0.4;
/** The canvas stage's mirror line: 5 px of the ring's gold on a 1080 frame, at the way back's strength. */
const MIRROR_PX = 5;
const MIRROR_ALPHA = 0.9;
/**
 * The canvas stage's light in the animation canvas's own trail look: glow and
 * the props' own colours, widths and glow in its 500 px units (a 1240 px
 * stage draws the kept light about 7 px wide with a 15 px glow). The kept
 * light is one even strength head to tail; the comet over it thins and fades
 * towards its tail, as a live animation trail does.
 */
const KEPT_LIGHT: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.PERSISTENT,
  effect: TrailEffect.GLOW,
  lineWidth: 3,
  glowBlur: 1.2,
  minOpacity: 0.9,
  maxOpacity: 0.9,
};
const COMET_LIGHT: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.PERSISTENT,
  effect: TrailEffect.GLOW,
  lineWidth: 5,
  glowBlur: 1.8,
  minOpacity: 0,
  maxOpacity: 1,
};
/** The trail painter's smoothing at full quality; `uniformWidth` keeps a stroke one width end to end. */
const LIGHT_QUALITY: QualityHints = {
  tier: QualityTier.HIGH,
  targetSubdivisions: 150,
  maxSubdivisionsPerSegment: 10,
  glowEnabled: true,
  maxDpr: 1,
};
/** Light samples kept per drawing; the fixed sample grid repeats from frame to frame. */
const MAX_TIP_SAMPLES = 20000;

/** One prop as the animation canvas draws it on a canvas stage. */
interface CanvasProp {
  image: HTMLImageElement;
  dimensions: { width: number; height: number };
  type: string;
  /** The ends whose light it leaves, and the curve number each is drawn on. */
  ends: { source: TrailPointSource; tip: number }[];
}

interface PreparedCell {
  prepared: PreparedPictographData;
  sprites: Partial<Record<HandSide, PreparedPropSprite>>;
}

/** One size's rasters per cell: the tile's ground and grid, the grid alone, its letter, its arrows. */
interface SizeCache {
  ground: RenderCanvas[];
  grid: RenderCanvas[];
  letter: RenderCanvas[];
  arrows: RenderCanvas[];
}

/** Everything drawn from one sequence; built again when the clip's sequence changes. */
class LoopRunDrawing {
  private readonly renderer = new Canvas2DDirectRenderer();
  readonly cells: NotationCell[];
  readonly steps: number;
  readonly turn: number;
  private preparedCells: PreparedCell[] | null = null;
  private preparedTask: Promise<PreparedCell[]> | null = null;
  private readonly sizes = new Map<number, SizeCache>();
  private readonly pending = new Map<number, Promise<void>>();
  /** The canvas stage's props, its grid rasters by side in pixels, and its light samples. */
  private canvasProps: CanvasProp[] | null = null;
  private canvasTask: Promise<void> | null = null;
  private readonly canvasLoader = new Canvas2DImageLoader();
  private readonly canvasGrids = new Map<number, RenderCanvas>();
  private readonly visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  private readonly tipSamples = new Map<string, LoopLightTip[]>();

  constructor(readonly sequence: SequenceData, seed: number) {
    this.cells = buildNotationCells(sequence);
    this.steps = Math.max(0, this.cells.length - 1);
    this.turn = loopRunTurnDegrees([
      sequence.steps[0]?.motions?.[HandSide.LEFT]?.startLocation,
      sequence.steps[seed]?.motions?.[HandSide.LEFT]?.startLocation,
    ]);
  }

  prepare(size: number): Promise<void> {
    const cached = this.sizes.get(size);
    if (cached) {
      this.sizes.delete(size);
      this.sizes.set(size, cached);
      return Promise.resolve();
    }
    const existing = this.pending.get(size);
    if (existing) return existing;
    const task = this.prepareAt(size).finally(() => this.pending.delete(size));
    this.pending.set(size, task);
    return task;
  }

  private loadCells(): Promise<PreparedCell[]> {
    if (this.preparedCells) return Promise.resolve(this.preparedCells);
    this.preparedTask ??= (async () => {
      await this.renderer.initialize();
      const { pictographPreparer } = await import(
        "#lib/shared/pictograph/shared/services/pictograph-preparer.js"
      );
      const cells: PreparedCell[] = [];
      for (const cell of this.cells) {
        const prepared = await pictographPreparer.prepareSingle(cell.data, { themeMode: "dark" });
        const sprites: PreparedCell["sprites"] = {};
        if (prepared._prepared) {
          for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
            const sprite = await this.renderer.preparePropSprite(prepared._prepared, hand, prepared, {
              size: VIEWBOX_SIZE,
              visibility: { darkMode: true },
            });
            if (sprite) sprites[hand] = sprite;
          }
        }
        cells.push({ prepared, sprites });
      }
      this.preparedCells = cells;
      return cells;
    })();
    return this.preparedTask;
  }

  private async prepareAt(size: number): Promise<void> {
    const cells = await this.loadCells();
    const none = {
      showBackground: false,
      showGrid: false,
      showProps: false,
      showArrows: false,
      showTKA: false,
      showTnD: false,
      showElemental: false,
      showPropTnD: false,
      showPlacements: false,
      showReversals: false,
    };
    const cache: SizeCache = { ground: [], grid: [], letter: [], arrows: [] };
    for (const { prepared } of cells) {
      const render = (visibility: Partial<typeof none>) =>
        this.renderer.renderPictograph(prepared, { size, visibility: { darkMode: true, ...none, ...visibility } });
      cache.ground.push(await render({ showBackground: true, showGrid: true }));
      cache.grid.push(await render({ showGrid: true }));
      cache.letter.push(await render({ showTKA: true }));
      cache.arrows.push(await render({ showArrows: true }));
    }
    this.sizes.set(size, cache);
    for (const stale of [...this.sizes.keys()].slice(0, -MAX_CACHED_SIZES)) this.sizes.delete(stale);
  }

  cache(size: number): SizeCache | null {
    const exact = this.sizes.get(size);
    if (exact) return exact;
    const near = nearestCachedSize(this.sizes.keys(), size);
    return near === null ? null : (this.sizes.get(near) ?? null);
  }

  ready(): PreparedCell[] | null {
    return this.preparedCells;
  }

  /**
   * Loads the canvas stage's prop sprites and its grid at each of `sides`
   * pixels, one after another. Every side a clip needs is loaded before its
   * first frame, so which raster a frame draws never depends on load timing.
   */
  async prepareCanvas(sides: readonly number[]): Promise<void> {
    this.canvasTask ??= this.loadCanvasProps();
    await this.canvasTask;
    for (const side of sides) {
      if (side <= 0 || this.canvasGrids.has(side)) continue;
      const image = await this.canvasLoader.loadGridImage(String(this.sequence.gridMode ?? "diamond"), side, true);
      const canvas = createRenderCanvas(side, side);
      if (tintGridInk(canvas, image, side, GRID_INK.dark)) this.canvasGrids.set(side, canvas);
    }
  }

  private async loadCanvasProps(): Promise<void> {
    const cells = await this.loadCells();
    const assets = cells[1]?.prepared._prepared?.propAssets ?? cells[0]?.prepared._prepared?.propAssets;
    const types = [HandSide.LEFT, HandSide.RIGHT].map((hand) => String(assets?.[hand]?.propType ?? "staff"));
    const images = await this.canvasLoader.loadPerColorPropImages(types[0]!, types[1]!, true);
    const dimensions = [this.canvasLoader.getLeftPropDimensions(), this.canvasLoader.getRightPropDimensions()];
    this.canvasProps = [images.left, images.right].map((image, i) => ({
      image,
      dimensions: { ...dimensions[i]! },
      type: types[i]!,
      ends: trailEnds(types[i]!),
    }));
  }

  /** The canvas stage's grid at `side` pixels, or the nearest side loaded. */
  canvasGrid(side: number): RenderCanvas | null {
    const exact = this.canvasGrids.get(side);
    if (exact) return exact;
    const near = nearestCachedSize(this.canvasGrids.keys(), side);
    return near === null ? null : (this.canvasGrids.get(near) ?? null);
  }

  canvasReady(): CanvasProp[] | null {
    return this.canvasProps;
  }

  /**
   * The props as the animation canvas places them `progress` of the way
   * through step `step`'s move (its default effort, arcs); step -1 is the
   * start position, read from the first step that moves, as the animation does.
   */
  canvasStates(step: number, progress: number): (CanvasPropState | null)[] {
    const steps = this.sequence.steps;
    let result: ReturnType<typeof calculateInitialAngles> | null = null;
    if (step < 0) {
      const first = steps.find((s) => isVisibleMotion(s?.motions?.left) || isVisibleMotion(s?.motions?.right));
      result = first ? calculateInitialAngles(first) : null;
    } else if (steps[step]) {
      result = interpolatePropAngles(
        steps[step]!,
        applyEffort(this.visibility.getEffortPreset(), progress),
        this.visibility
      );
    }
    if (!result?.isValid) return [null, null];
    return [result.leftAngles, result.rightAngles];
  }

  /** The props' ends at that moment, in the canvas's 950 view box: where the light is laid. */
  canvasTips(step: number, progress: number): LoopLightTip[] {
    const key = `${step}:${progress}`;
    const known = this.tipSamples.get(key);
    if (known) return known;
    const tips: LoopLightTip[] = [];
    const props = this.canvasProps;
    if (props) {
      const states = this.canvasStates(step, progress);
      props.forEach((prop, i) => {
        const state = states[i];
        if (!state) return;
        for (const end of prop.ends) {
          const at = calculateTrailSourceEndpoint(
            state,
            { canvasSize: VIEWBOX_SIZE, propDimensions: prop.dimensions },
            end.source,
            prop.type
          );
          if (at) tips.push({ prop: i === 0 ? 0 : 1, tip: at.tipIndex ?? end.tip, x: at.x, y: at.y });
        }
      });
    }
    if (this.tipSamples.size >= MAX_TIP_SAMPLES) this.tipSamples.clear();
    this.tipSamples.set(key, tips);
    return tips;
  }

  /**
   * Where tile `step`'s props stand `progress` of the way through its move.
   * `continued` starts step 0 from the last step's end, as a second round
   * does, rather than from the start position: the two can part props that
   * share a point the other way round, which swapped them for a frame.
   */
  positions(step: number, progress: number, continued = false): PropPositions | null {
    const cells = this.preparedCells;
    const end = cells?.[step + 1]?.prepared._prepared;
    if (end && progress >= 1) return end.propPositions as PropPositions;
    const from = continued && step === 0 && cells ? cells.length - 1 : step;
    const start = cells?.[from]?.prepared._prepared;
    const data = this.cells[step + 1]?.data as StepData | undefined;
    if (!end || !start || !data) return null;
    return calculatePictographMotionPositions({
      step: data,
      progress,
      gridMode: end.gridMode,
      leftPropType: String(end.propAssets[HandSide.LEFT]?.propType ?? "staff"),
      rightPropType: String(end.propAssets[HandSide.RIGHT]?.propType ?? "staff"),
      startPlacements: start.propPositions,
      endPlacements: end.propPositions,
    });
  }
}

/** The content of one tile, in a square from (0, 0) to (size, size). */
interface TileContent {
  step: number;
  letter: number;
  arrows: number;
  props: LoopPropsDraw | null;
  /** Degrees the props and arrows are turned about the centre. */
  turn?: number;
  /** 1 as it is, -1 reflected left to right. */
  flip?: number;
  /** 1 with rounded corners, 0 square. */
  corner?: number;
  /** The pictograph alone: its grid, letter, arrows and props, with no tile ground. */
  bare?: boolean;
}

/** The silhouette of the props in one pose, cached: it does not change while a pose holds. */
interface ShadowRaster {
  key: string;
  canvas: RenderCanvas;
  /** Its top left in the frame, in whole pixels, so the props land on it exactly. */
  x: number;
  y: number;
}

/** A box: a prop sprite's ink in its own view box's units, or a prop's ink on the stage. */
interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Paints a LOOP run: the frame `loopRunFrame` describes, tile by tile, in the
 * app's dark pictographs. Reads nothing but the clip's plan and the post
 * time, so a paused preview frame is the exported frame.
 */
class LoopRunPainter implements PostStudioLayerPainter {
  private drawing: LoopRunDrawing | null = null;
  private drawingKey = "";
  private drawingSequence: unknown = null;
  private shadow: ShadowRaster | null = null;
  private shadowDrawing: LoopRunDrawing | null = null;
  /** A frame-sized canvas a bare copy is painted on whole, then faded on to the frame in one go. */
  private group: RenderCanvas | null = null;
  private readonly inks = new WeakMap<object, InkBox | null>();
  private readonly trails = new Canvas2DTrailRenderer();

  constructor(private readonly getPlan: () => LoopRunPlan | null) {}

  private drawingFor(plan: LoopRunPlan): LoopRunDrawing {
    const sequence = plan.sequence.sequence;
    if (this.drawing && this.drawingSequence === sequence) return this.drawing;
    const key = `${plan.settings.seed}:${JSON.stringify(sequence)}`;
    if (!this.drawing || key !== this.drawingKey) {
      this.drawing = new LoopRunDrawing(sequence, plan.settings.seed);
      this.drawingKey = key;
    }
    this.drawingSequence = sequence;
    return this.drawing;
  }

  async prepare(target: { width: number; height: number }): Promise<void> {
    const plan = this.getPlan();
    if (!plan) return;
    const drawing = this.drawingFor(plan);
    await drawing.prepare(rasterSize(target));
    const sides = canvasSides(plan, target.width);
    if (sides.length) await drawing.prepareCanvas(sides);
  }

  paint(context: Context, rect: PaintRect, frame: PaintFrame): void {
    const plan = this.getPlan();
    if (!plan || rect.width <= 0 || rect.height <= 0) return;
    const seconds = frame.projectTimeSeconds ?? plan.start + frame.projectProgress * (plan.end - plan.start);
    if (seconds < plan.start || seconds > plan.end) return;
    const drawing = this.drawingFor(plan);
    const size = rasterSize(rect);
    const cache = drawing.cache(size);
    if (!cache || !drawing.ready()) {
      void drawing.prepare(size);
      return;
    }
    const sides = canvasSides(plan, rect.width);
    if (sides.length && !drawing.canvasReady()) {
      void drawing.prepareCanvas(sides);
      return;
    }
    const scene = loopRunFrame(plan.settings, drawing.steps, rect, seconds - plan.start, drawing.turn);
    const pixel = Math.min(rect.width, rect.height) / 1080;

    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();

    const plain = plan.settings.plainTiles === true;
    const waitingGrids = plan.settings.waitingGrids === true;
    scene.slots.forEach((slot, s) => {
      if (slot.opacity <= 0) return;
      if (plain) {
        // The tile's own empty frame: its ground and its hairline, no grid, no dashes.
        // Once the tile is in, it is the frame, so none is left behind when the tiles move off.
        if (slot.waiting <= 0) return;
        context.save();
        context.globalAlpha *= slot.opacity;
        context.fillStyle = TILE_GROUND;
        context.fillRect(slot.x - slot.size / 2, slot.y - slot.size / 2, slot.size, slot.size);
        drawPlainEdge(context, slot, pixel);
        context.restore();
        return;
      }
      if (waitingGrids) {
        // The step's own grid, faint, until its tile comes in over it.
        const grid = cache.grid[s + 1];
        const strength = slot.opacity * slot.waiting * WAITING_GRID_ALPHA;
        if (!grid || strength <= 0) return;
        context.save();
        context.globalAlpha *= strength;
        context.drawImage(grid, slot.x - slot.size / 2, slot.y - slot.size / 2, slot.size, slot.size);
        context.restore();
        return;
      }
      context.save();
      context.globalAlpha *= slot.opacity;
      context.strokeStyle = SLOT_INK;
      context.lineWidth = 1.5 * pixel;
      context.setLineDash([6 * pixel, 5 * pixel]);
      roundedSquare(context, slot);
      context.stroke();
      context.restore();
    });
    const bare = plan.settings.bareCopies === true;
    if (scene.line && !bare) drawLine(context, scene.line, plan.settings.colour, 2 * pixel);
    if (scene.home) drawLine(context, scene.home, HOME_INK, 2 * pixel);

    // A bare copy landing on its tile carries the pictograph until it is gone; the tile
    // shows only its box meanwhile, so the pictograph is never drawn twice over itself.
    const landing = new Set(bare ? scene.copies.map((copy) => copy.to) : []);
    for (const tile of scene.tiles)
      this.drawTile(context, drawing, cache, tile, plan.settings.colour, pixel, plain, landing.has(tile.step));
    if (scene.start && scene.start.opacity > 0) {
      // Step -1 is the sequence's start position: its grid, its letter and its staffs at rest.
      const start = scene.start;
      context.save();
      context.globalAlpha *= start.opacity;
      this.drawContent(context, drawing, cache, start, {
        step: -1,
        letter: 1,
        arrows: 0,
        props: { step: -1, progress: 1, opacity: 1 },
        corner: 0,
      });
      if (plain) drawPlainEdge(context, start, pixel);
      else drawEdge(context, start, 1, pixel);
      context.restore();
    }
    if (scene.stage) this.drawStage(context, drawing, cache, scene.stage, pixel);
    for (const ghost of scene.ghosts) {
      context.save();
      context.globalAlpha *= ghost.opacity;
      this.drawProps(context, drawing, ghost, { step: ghost.step, progress: 1, opacity: 1 });
      context.restore();
    }
    for (const copy of scene.copies) {
      if (bare) this.drawBareCopy(context, drawing, cache, copy, rect, scene.tiles[copy.to]?.opacity ?? 0);
      else this.drawCopy(context, drawing, cache, copy, rect, plain ? pixel : null);
    }
    // Bare copies cross the line with no box of their own, so the line draws over them.
    if (scene.line && bare) drawLine(context, scene.line, plan.settings.colour, 2 * pixel);
    const badge = loopRunBadgeAt(plan.settings, seconds - plan.start);
    if (badge) drawBadge(context, rect, badge);
    context.restore();
  }

  /** The LOOP played: the grid and the props on the frame's own ground, and the app's gold ring on the tile being played. */
  private drawStage(context: Context, drawing: LoopRunDrawing, cache: SizeCache, stage: LoopStageDraw, pixel: number) {
    for (const ring of stage.rings) paintSelectionRing(context, ring, ring.strength, ring.look);
    if (stage.wayBack) drawWayBack(context, stage.wayBack);
    if (stage.opacity <= 0) return;
    if (stage.canvas) {
      this.drawCanvasStage(context, drawing, stage, stage.canvas, pixel);
      return;
    }
    const grid = cache.grid[0];
    context.save();
    context.globalAlpha *= stage.opacity;
    if (grid && stage.grid > 0) {
      context.save();
      context.globalAlpha *= stage.grid;
      context.drawImage(grid, stage.x - stage.size / 2, stage.y - stage.size / 2, stage.size, stage.size);
      context.restore();
    }
    if (stage.shadow) this.drawShadow(context, drawing, stage, stage.shadow);
    if (stage.flares?.length) {
      // The flares carry the stage's strength in their own.
      context.restore();
      for (const flare of stage.flares) this.drawFlare(context, drawing, stage, flare, pixel);
      context.save();
      context.globalAlpha *= stage.opacity;
    }
    this.drawProps(context, drawing, stage, { ...stage.props, opacity: 1 });
    context.restore();
  }

  /**
   * The stage as the 2D animation canvas draws it (`canvas`): its grid in its
   * off-white ink, its props overlapping where they meet with no parting,
   * and the light their ends have drawn in its glowing trail, worked out
   * afresh for this moment. Over it, the mirror line and the flares.
   */
  private drawCanvasStage(
    context: Context,
    drawing: LoopRunDrawing,
    stage: LoopStageDraw,
    canvas: LoopCanvasDraw,
    pixel: number
  ) {
    const props = drawing.canvasReady();
    if (!props) return;
    const left = stage.x - stage.size / 2;
    const top = stage.y - stage.size / 2;
    context.save();
    context.globalAlpha *= stage.opacity;
    const grid = drawing.canvasGrid(Math.round(stage.size));
    if (grid && stage.grid > 0) {
      context.save();
      context.globalAlpha *= stage.grid;
      context.drawImage(grid, left, top, stage.size, stage.size);
      context.restore();
    }
    if (canvas.mirror) drawLine(context, canvas.mirror, selectionGold(MIRROR_ALPHA), MIRROR_PX * pixel);
    context.restore();

    // The trail painter sets its own strength per stretch, so the stage's fade goes into the light's settings.
    const even = (settings: TrailSettings, strength: number): TrailSettings => ({
      ...settings,
      minOpacity: strength * stage.opacity,
      maxOpacity: strength * stage.opacity,
    });
    this.drawLight(context, drawing, stage, canvas.light, even(KEPT_LIGHT, KEPT_LIGHT.maxOpacity), true);
    const ghost = canvas.ghost;
    if (ghost && ghost.strokes.length && ghost.opacity > 0) {
      const c = VIEWBOX_SIZE / 2;
      const a = (ghost.turn * Math.PI) / 180;
      const turnAbout = (x: number, y: number) => {
        const dx = (x - c) * ghost.flip;
        const dy = y - c;
        return { x: c + dx * Math.cos(a) - dy * Math.sin(a), y: c + dx * Math.sin(a) + dy * Math.cos(a) };
      };
      this.drawLight(context, drawing, stage, ghost.strokes, even(KEPT_LIGHT, ghost.opacity), true, turnAbout);
    }
    if (canvas.comet) {
      const comet = { ...COMET_LIGHT, maxOpacity: COMET_LIGHT.maxOpacity * stage.opacity };
      this.drawLight(context, drawing, stage, [canvas.comet], comet, false);
    }

    // The flares carry the stage's strength in their own.
    for (const flare of stage.flares ?? []) this.drawFlare(context, drawing, stage, flare, pixel, true);

    context.save();
    context.globalAlpha *= stage.opacity;
    const states = drawing.canvasStates(stage.props.step, stage.props.progress);
    props.forEach((prop, i) => {
      const state = states[i];
      if (!state) return;
      const transform = propTransformOf(state, prop.dimensions, stage.size, prop.type);
      drawPropSprite(
        context,
        prop.image,
        prop.dimensions,
        { ...transform, centerX: left + transform.centerX, centerY: top + transform.centerY },
        false,
        prop.type
      );
    });
    context.restore();
  }

  /**
   * Light along `strokes` through the animation canvas's trail painter, on
   * the stage's square; `map` moves each point in the 950 view box first.
   */
  private drawLight(
    context: Context,
    drawing: LoopRunDrawing,
    stage: LoopTilePlace,
    strokes: readonly LoopLightStroke[],
    settings: TrailSettings,
    uniformWidth: boolean,
    map?: (x: number, y: number) => { x: number; y: number }
  ) {
    if (strokes.length === 0 || settings.maxOpacity <= 0) return;
    const scale = stage.size / VIEWBOX_SIZE;
    const points = loopLightPoints(
      strokes,
      (step, progress) => drawing.canvasTips(step, progress),
      (x, y) => {
        const at = map ? map(x, y) : { x, y };
        return { x: at.x * scale, y: at.y * scale };
      }
    );
    if (points.left.length === 0 && points.right.length === 0) return;
    context.save();
    context.translate(stage.x - stage.size / 2, stage.y - stage.size / 2);
    this.trails.renderTrails(
      context as CanvasRenderingContext2D,
      points.left,
      points.right,
      settings,
      0,
      points.left.length > 0,
      points.right.length > 0,
      stage.size,
      { ...LIGHT_QUALITY, uniformWidth }
    );
    context.restore();
  }

  /**
   * The props' silhouette in `pose`: both drawn into one canvas exactly as
   * `drawProps` draws them, tinted flat, then laid down once, so where they
   * overlap the grey does not double.
   */
  private drawShadow(context: Context, drawing: LoopRunDrawing, stage: LoopTilePlace, pose: LoopStagePose) {
    const raster = this.shadowRaster(drawing, stage, pose);
    if (!raster) return;
    context.save();
    context.globalAlpha *= SHADOW_ALPHA;
    context.drawImage(raster.canvas, raster.x, raster.y);
    context.restore();
  }

  private shadowRaster(drawing: LoopRunDrawing, stage: LoopTilePlace, pose: LoopStagePose): ShadowRaster | null {
    const key = `${pose.step}:${pose.progress}:${pose.continued}:${stage.x}:${stage.y}:${stage.size}`;
    if (this.shadow?.key === key && this.shadowDrawing === drawing) return this.shadow;
    if (!drawing.ready()) return null;
    // The stage's square and a margin for props that reach past its outer points, in whole pixels.
    const margin = Math.ceil(stage.size * 0.25);
    const x = Math.floor(stage.x - stage.size / 2) - margin;
    const y = Math.floor(stage.y - stage.size / 2) - margin;
    const side = Math.ceil(stage.size) + 2 * margin + 1;
    const canvas = createRenderCanvas(side, side);
    const ink = canvas.getContext("2d") as Context | null;
    if (!ink) return null;
    this.drawProps(ink, drawing, { x: stage.x - x, y: stage.y - y, size: stage.size }, { ...pose, opacity: 1 });
    ink.globalCompositeOperation = "source-in";
    ink.fillStyle = SHADOW_INK;
    ink.fillRect(0, 0, side, side);
    this.shadow = { key, canvas, x, y };
    this.shadowDrawing = drawing;
    return this.shadow;
  }

  /**
   * One flare: a rounded outline `clearance` clear of the props, round both
   * together when they stand at one point and round each when they stand
   * apart, squared to the props' own angle when they share one.
   */
  private drawFlare(
    context: Context,
    drawing: LoopRunDrawing,
    stage: LoopTilePlace,
    flare: LoopFlareDraw,
    pixel: number,
    canvas = false
  ) {
    if (flare.strength <= 0) return;
    const placed = canvas ? canvasSprites(drawing, stage, flare.pose) : pictographSprites(drawing, stage, flare.pose);
    const shape = placed ? this.propBoxes(stage, placed) : null;
    if (!shape) return;
    const boxes = joinBoxes(shape.boxes, 2 * flare.join);
    context.save();
    context.translate(stage.x, stage.y);
    context.rotate((shape.angle * Math.PI) / 180);
    context.strokeStyle = selectionGold(flare.strength);
    context.lineWidth = Math.max(pixel, flare.width);
    for (const box of boxes) {
      const width = box.x1 - box.x0 + 2 * flare.clearance;
      const height = box.y1 - box.y0 + 2 * flare.clearance;
      context.beginPath();
      context.roundRect(
        box.x0 - flare.clearance,
        box.y0 - flare.clearance,
        width,
        height,
        FLARE_CORNER * Math.min(width, height)
      );
      context.stroke();
    }
    context.restore();
  }

  /**
   * Each prop's ink as a box in a frame turned to `angle` about the stage's
   * centre: the props' own angle when every prop sits square to it, else the
   * frame's own axes.
   */
  private propBoxes(stage: LoopTilePlace, placed: readonly PlacedSprite[]): { angle: number; boxes: InkBox[] } | null {
    const props: { sprite: PlacedSprite; ink: InkBox }[] = [];
    for (const sprite of placed) {
      const ink = this.inkOf(sprite);
      if (ink) props.push({ sprite, ink });
    }
    if (props.length === 0) return null;
    const first = props[0]!.sprite.rotation;
    const square = props.every(({ sprite }) => {
      const off = (((sprite.rotation - first) % 90) + 90) % 90;
      return off < 0.5 || off > 89.5;
    });
    const angle = square ? first : 0;
    const turn = (-angle * Math.PI) / 180;
    const boxes = props.map(({ sprite, ink }) => {
      // The ink's corners where the sprite was drawn, then in the turned frame.
      const a = (sprite.rotation * Math.PI) / 180;
      const scale = sprite.scale;
      const mirror = sprite.mirror ? -1 : 1;
      const xs: number[] = [];
      const ys: number[] = [];
      const corners: [number, number][] = [
        [ink.x0, ink.y0],
        [ink.x1, ink.y0],
        [ink.x0, ink.y1],
        [ink.x1, ink.y1],
      ];
      for (const [u, v] of corners) {
        const lx = (u - sprite.centerX) * scale * mirror;
        const ly = (v - sprite.centerY) * scale;
        const fx = sprite.x + lx * Math.cos(a) - ly * Math.sin(a) - stage.x;
        const fy = sprite.y + lx * Math.sin(a) + ly * Math.cos(a) - stage.y;
        xs.push(fx * Math.cos(turn) - fy * Math.sin(turn));
        ys.push(fx * Math.sin(turn) + fy * Math.cos(turn));
      }
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    });
    return { angle, boxes };
  }

  /** Where a sprite has ink, in its view box's units, read once from its own pixels. */
  private inkOf(sprite: PlacedSprite): InkBox | null {
    const known = this.inks.get(sprite.key);
    if (known !== undefined) return known;
    const w = Math.max(1, Math.ceil(sprite.width));
    const h = Math.max(1, Math.ceil(sprite.height));
    const canvas = createRenderCanvas(w, h);
    const context = canvas.getContext("2d") as Context | null;
    let box: InkBox | null = null;
    if (context) {
      context.drawImage(sprite.img, 0, 0, sprite.width, sprite.height);
      const { data } = context.getImageData(0, 0, w, h);
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3]! < 8) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      box = x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
    }
    this.inks.set(sprite.key, box);
    return box;
  }

  private drawTile(
    context: Context,
    drawing: LoopRunDrawing,
    cache: SizeCache,
    tile: LoopTileDraw,
    colour: string,
    pixel: number,
    plain: boolean,
    boxOnly = false
  ): void {
    if (tile.opacity <= 0) return;
    const place = { x: tile.x, y: tile.y, size: tile.size * tile.scale };
    context.save();
    context.globalAlpha *= tile.opacity;
    if (tile.fold !== undefined && tile.fold < 1) {
      // Folding in: the tile opens out from a line through its middle.
      context.translate(place.x, place.y);
      context.scale(1, tile.fold);
      context.translate(-place.x, -place.y);
    }
    if (boxOnly) {
      context.save();
      roundedSquare(context, place, tile.corner);
      context.clip();
      context.fillStyle = TILE_GROUND;
      context.fillRect(place.x - place.size / 2, place.y - place.size / 2, place.size, place.size);
      context.restore();
    } else {
      this.drawContent(context, drawing, cache, place, tile);
    }
    if (plain) drawPlainEdge(context, place, pixel);
    else drawEdge(context, place, 1 - tile.corner, pixel);
    if (tile.outline > 0) {
      // Drawn inside the tile, so neighbours edge to edge in the card never share a line.
      context.globalAlpha *= tile.outline * OUTLINE_ALPHA;
      context.strokeStyle = colour;
      context.lineWidth = OUTLINE_PX * pixel;
      roundedSquare(context, place, tile.corner, (OUTLINE_PX * pixel) / 2);
      context.stroke();
    }
    context.restore();
  }

  /**
   * A repeat on its way in: turned, reflected, or wiped through the line into
   * its twin. `plainPixel` is set for plain tiles: square, with their hairline.
   */
  private drawCopy(
    context: Context,
    drawing: LoopRunDrawing,
    cache: SizeCache,
    copy: LoopCopyDraw,
    rect: PaintRect,
    plainPixel: number | null
  ) {
    if (copy.opacity <= 0) return;
    context.save();
    context.globalAlpha *= copy.opacity;
    const corner = plainPixel === null ? {} : { corner: 0 };
    const source: TileContent = {
      step: copy.from,
      letter: 1,
      arrows: 1,
      props: { step: copy.from, progress: 1, opacity: 1 },
      turn: copy.turn,
      flip: copy.flip,
      ...corner,
    };
    if (copy.wipe === null) {
      this.drawContent(context, drawing, cache, copy, source);
    } else {
      const target: TileContent = {
        step: copy.to,
        letter: 1,
        arrows: 1,
        props: { step: copy.to, progress: 1, opacity: 1 },
        ...corner,
      };
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, copy.wipe - rect.x, rect.height);
      context.clip();
      this.drawContent(context, drawing, cache, copy, source);
      context.restore();
      context.save();
      context.beginPath();
      context.rect(copy.wipe, rect.y, rect.x + rect.width - copy.wipe, rect.height);
      context.clip();
      this.drawContent(context, drawing, cache, copy, target);
      context.restore();
    }
    if (plainPixel !== null) drawPlainEdge(context, copy, plainPixel);
    context.restore();
  }

  /**
   * A repeat in flight with no box (`bareCopies`): the pictograph alone,
   * painted whole on its own canvas and faded on to the frame in one go, so
   * as it fades over its landed twin the two never thin each other out. It
   * stays whole once its tile starts showing (`landed`), since the tile shows
   * only its box until the copy is gone.
   */
  private drawBareCopy(
    context: Context,
    drawing: LoopRunDrawing,
    cache: SizeCache,
    copy: LoopCopyDraw,
    rect: PaintRect,
    landed: number
  ) {
    const opacity = landed > 0 ? 1 : copy.opacity;
    if (opacity <= 0) return;
    const x = Math.floor(rect.x);
    const y = Math.floor(rect.y);
    const width = Math.ceil(rect.x + rect.width) - x;
    const height = Math.ceil(rect.y + rect.height) - y;
    if (!this.group || this.group.width !== width || this.group.height !== height)
      this.group = createRenderCanvas(width, height);
    const layer = this.group.getContext("2d") as Context | null;
    if (!layer) return;
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(0, 0, width, height);
    layer.translate(-x, -y);
    const content = (step: number, turned: boolean): TileContent => ({
      step,
      letter: 1,
      arrows: 1,
      props: { step, progress: 1, opacity: 1 },
      corner: 0,
      bare: true,
      ...(turned ? { turn: copy.turn, flip: copy.flip } : {}),
    });
    if (copy.wipe === null) {
      this.drawContent(layer, drawing, cache, copy, content(copy.from, true));
    } else {
      layer.save();
      layer.beginPath();
      layer.rect(rect.x, rect.y, copy.wipe - rect.x, rect.height);
      layer.clip();
      this.drawContent(layer, drawing, cache, copy, content(copy.from, true));
      layer.restore();
      layer.save();
      layer.beginPath();
      layer.rect(copy.wipe, rect.y, rect.x + rect.width - copy.wipe, rect.height);
      layer.clip();
      this.drawContent(layer, drawing, cache, copy, content(copy.to, false));
      layer.restore();
    }
    context.save();
    context.globalAlpha *= opacity;
    context.drawImage(this.group, x, y);
    context.restore();
  }

  private drawContent(
    context: Context,
    drawing: LoopRunDrawing,
    cache: SizeCache,
    place: LoopTilePlace,
    content: TileContent
  ): void {
    const cell = content.step + 1;
    const ground = cache.ground[cell];
    if (!ground) return;
    const left = place.x - place.size / 2;
    const top = place.y - place.size / 2;
    context.save();
    roundedSquare(context, place, content.corner ?? 1);
    context.clip();
    if (content.bare) {
      const grid = cache.grid[cell];
      if (grid) context.drawImage(grid, left, top, place.size, place.size);
    } else {
      context.fillStyle = TILE_GROUND;
      context.fillRect(left, top, place.size, place.size);
      context.drawImage(ground, left, top, place.size, place.size);
    }
    const letter = cache.letter[cell];
    if (letter && content.letter > 0) {
      context.save();
      context.globalAlpha *= content.letter;
      context.drawImage(letter, left, top, place.size, place.size);
      context.restore();
    }
    // Turned or reflected, the props and arrows move about the tile's centre.
    context.save();
    context.translate(place.x, place.y);
    if (content.turn) context.rotate((content.turn * Math.PI) / 180);
    if (content.flip !== undefined && content.flip !== 1) context.scale(content.flip, 1);
    context.translate(-place.x, -place.y);
    const arrows = cache.arrows[cell];
    if (arrows && content.arrows > 0) {
      context.save();
      context.globalAlpha *= content.arrows;
      context.drawImage(arrows, left, top, place.size, place.size);
      context.restore();
    }
    if (content.props) this.drawProps(context, drawing, place, content.props);
    context.restore();
    context.restore();
  }

  private drawProps(context: Context, drawing: LoopRunDrawing, place: LoopTilePlace, props: LoopPropsDraw): void {
    if (props.opacity <= 0) return;
    const positions = drawing.positions(props.step, props.progress, props.continued);
    const sprites = drawing.ready()?.[props.step + 1]?.sprites;
    if (!positions || !sprites) return;
    const scale = place.size / VIEWBOX_SIZE;
    const left = place.x - place.size / 2;
    const top = place.y - place.size / 2;
    context.save();
    context.globalAlpha *= props.opacity;
    for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
      const position = positions[hand];
      const sprite = sprites[hand];
      if (!position || !sprite) continue;
      drawElementWithTransform(context, sprite.img, {
        x: left + position.x * scale,
        y: top + position.y * scale,
        rotation: position.rotation,
        centerX: sprite.centerX,
        centerY: sprite.centerY,
        viewBoxWidth: sprite.viewBoxWidth,
        viewBoxHeight: sprite.viewBoxHeight,
        scale,
        shouldMirror: sprite.mirror,
      });
    }
    context.restore();
  }
}

/** A prop sprite where it was drawn: `x`, `y` in the frame, `rotation` in degrees, `scale` from its own units. */
interface PlacedSprite {
  /** What its ink is cached under. */
  key: object;
  img: CanvasImageSource;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  mirror: boolean;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

/** The pictograph props in `pose`, where `drawProps` puts them. */
function pictographSprites(drawing: LoopRunDrawing, stage: LoopTilePlace, pose: LoopStagePose): PlacedSprite[] | null {
  const positions = drawing.positions(pose.step, pose.progress, pose.continued);
  const sprites = drawing.ready()?.[pose.step + 1]?.sprites;
  if (!positions || !sprites) return null;
  const scale = stage.size / VIEWBOX_SIZE;
  const left = stage.x - stage.size / 2;
  const top = stage.y - stage.size / 2;
  const placed: PlacedSprite[] = [];
  for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
    const position = positions[hand];
    const sprite = sprites[hand];
    if (!position || !sprite) continue;
    placed.push({
      key: sprite,
      img: sprite.img,
      width: sprite.viewBoxWidth,
      height: sprite.viewBoxHeight,
      centerX: sprite.centerX,
      centerY: sprite.centerY,
      mirror: sprite.mirror,
      x: left + position.x * scale,
      y: top + position.y * scale,
      rotation: position.rotation,
      scale,
    });
  }
  return placed;
}

/** The canvas stage's props in `pose`, where the animation canvas puts them. */
function canvasSprites(drawing: LoopRunDrawing, stage: LoopTilePlace, pose: LoopStagePose): PlacedSprite[] | null {
  const props = drawing.canvasReady();
  if (!props) return null;
  const states = drawing.canvasStates(pose.step, pose.progress);
  const left = stage.x - stage.size / 2;
  const top = stage.y - stage.size / 2;
  const placed: PlacedSprite[] = [];
  props.forEach((prop, i) => {
    const state = states[i];
    if (!state) return;
    const transform = propTransformOf(state, prop.dimensions, stage.size, prop.type);
    placed.push({
      key: prop.image,
      img: prop.image,
      width: prop.dimensions.width,
      height: prop.dimensions.height,
      centerX: prop.dimensions.width / 2,
      centerY: prop.dimensions.height / 2,
      mirror: false,
      x: left + transform.centerX,
      y: top + transform.centerY,
      rotation: (transform.angle * 180) / Math.PI,
      scale: transform.scaleFactor,
    });
  });
  return placed;
}

/** The ends a prop leaves light from, as the animation canvas's trail picks them with both ends tracked. */
function trailEnds(type: string): CanvasProp["ends"] {
  const config = resolveTrailPointConfig(type, TrackingMode.BOTH_ENDS);
  const candidates: { source: TrailPointSource; end: number }[] =
    propTipEnds(type) === 1
      ? [{ source: config.right, end: 1 }]
      : [
          { source: config.left, end: 0 },
          { source: config.right, end: 1 },
        ];
  const ends = new Map<string, CanvasProp["ends"][number]>();
  for (const { source, end } of candidates) {
    if (source.type === "none") continue;
    const key = source.type === "tip" ? `tip-${source.index}` : `custom-${source.dx}-${source.dy}`;
    if (!ends.has(key)) ends.set(key, { source, tip: source.type === "tip" ? source.index : end });
  }
  return [...ends.values()];
}

/** The pixel sides the canvas stage is drawn at on a frame `width` wide: each canvas play's stage and where it glides to. */
function canvasSides(plan: LoopRunPlan, width: number): number[] {
  const sides = new Set<number>();
  for (const event of plan.settings.events) {
    if (event.kind !== "play" || !event.canvas) continue;
    sides.add(Math.round(event.stage.size * width));
    if (event.move) sides.add(Math.round(event.move.size * width));
  }
  return [...sides].filter((side) => side > 0);
}

/** The raster side for a target: half its shorter side, on the shared size ladder. */
function rasterSize(target: { width: number; height: number }): number {
  return paintSizeBucket(Math.max(64, Math.min(target.width, target.height) * 0.5));
}

/** The tile's square, `inset` pixels in; `corner` 1 rounds it fully, 0 leaves it square. */
function roundedSquare(context: Context, place: LoopTilePlace, corner = 1, inset = 0): void {
  const side = Math.max(0, place.size - 2 * inset);
  const half = side / 2;
  context.beginPath();
  context.roundRect(place.x - half, place.y - half, side, side, Math.max(0, place.size * CORNER * corner - inset));
}

/** The card's hairline just inside a tile, at `strength` of its full ink. */
function drawEdge(context: Context, place: LoopTilePlace, strength: number, pixel: number): void {
  if (strength <= 0) return;
  context.save();
  context.globalAlpha *= strength;
  context.strokeStyle = EDGE_INK;
  context.lineWidth = pixel;
  roundedSquare(context, place, 1 - strength, pixel / 2);
  context.stroke();
  context.restore();
}

/** A plain tile's one hairline, square, just inside its edge. */
function drawPlainEdge(context: Context, place: LoopTilePlace, pixel: number): void {
  const width = PLAIN_EDGE_PX * pixel;
  const side = Math.max(0, place.size - width);
  context.save();
  context.strokeStyle = PLAIN_EDGE_INK;
  context.lineWidth = width;
  context.strokeRect(place.x - side / 2, place.y - side / 2, side, side);
  context.restore();
}

function drawLine(context: Context, line: LoopLineDraw, colour: string, width: number): void {
  if (line.opacity <= 0) return;
  context.save();
  context.globalAlpha *= line.opacity;
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(line.x0, line.y0);
  context.lineTo(line.x1, line.y1);
  context.stroke();
  context.restore();
}

/**
 * The way back: down from the last tile, left 30 units under the row with
 * rounded corners, and up into the first tile with an open arrowhead, drawn
 * on from the last tile as `drawn` goes from 0 to 1. Units are 1/254 of a tile.
 */
function drawWayBack(context: Context, way: LoopWayBackDraw): void {
  if (way.drawn <= 0 || way.strength <= 0) return;
  const u = way.unit;
  const xL = way.from.x;
  const xF = way.to.x;
  const row = way.from.y;
  const r = 16 * u;
  const level = row + 30 * u;
  const run = Math.max(0, xL - xF - 2 * r);
  // Two lines, two quarter arcs and one more line.
  const length = 8 * u + (Math.PI / 2) * r + run + (Math.PI / 2) * r + 2 * u;
  context.save();
  context.strokeStyle = selectionGold(WAY_BACK_ALPHA * way.strength);
  context.lineWidth = 5 * u;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(xL, row + 6 * u);
  context.lineTo(xL, level - r);
  context.arc(xL - r, level - r, r, 0, Math.PI / 2);
  context.lineTo(xF + r, level);
  context.arc(xF + r, level - r, r, Math.PI / 2, Math.PI);
  context.lineTo(xF, row + 12 * u);
  if (way.drawn < 1) {
    context.setLineDash([length, length]);
    context.lineDashOffset = length * (1 - way.drawn);
  }
  context.stroke();
  // The arrowhead comes in over the last fifth.
  const head = Math.min(1, Math.max(0, (way.drawn - 0.8) / 0.2));
  if (head > 0) {
    context.setLineDash([]);
    context.globalAlpha *= head;
    context.beginPath();
    context.moveTo(xF - 14 * u, row + 20 * u);
    context.lineTo(xF, row + 5 * u);
    context.lineTo(xF + 14 * u, row + 20 * u);
    context.stroke();
  }
  context.restore();
}

/** Boxes closer than `reach` merge into one, so props standing together get one outline. */
function joinBoxes(boxes: readonly InkBox[], reach: number): InkBox[] {
  const out = boxes.map((box) => ({ ...box }));
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i]!;
        const b = out[j]!;
        const gapX = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
        const gapY = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
        if (Math.hypot(gapX, gapY) > reach) continue;
        out[i] = {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
        };
        out.splice(j, 1);
        merged = true;
      }
  }
  return out;
}

export function createLoopRunPainter(getPlan: () => LoopRunPlan | null): PostStudioLayerPainter {
  return new LoopRunPainter(getPlan);
}

// ─── The name badge ─────────────────────────────────────────────────────────

/** The app's staff outline (static/images/props/staff.svg), for the badge that names the staffs. */
const STAFF_PATH =
  "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
const STAFF_VIEWBOX: [number, number] = [252.8, 77.8];
/** The badge's measures, as shares of the frame's width (the reference's 4rem chip on a phone-wide frame). */
const BADGE = { height: 0.085, top: 0.022, pad: 0.03, gap: 0.02, icon: 0.047, staff: 0.026, ring: 0.044, text: 0.036, corner: 0.022 };
const BADGE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BADGE_INK = "#f2f2f6";

const iconPaths = new Map<string, Path2D>();
function iconPath(d: string): Path2D {
  let path = iconPaths.get(d);
  if (!path) iconPaths.set(d, (path = new Path2D(d)));
  return path;
}

/** The app's own path for a badge icon, LOOP types under the names render-composition gives them. */
function badgeIcon(icon: string): { d: string; viewBox: [number, number] } | null {
  if (icon === "staff") return { d: STAFF_PATH, viewBox: STAFF_VIEWBOX };
  const key = icon === "reflected" ? "mirrored" : icon;
  return (LOOP_ICON_PATHS as Record<string, { d: string; viewBox: [number, number] }>)[key] ?? null;
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The chip's top edge in pixels: `top` of the clip's height, or today's place at the top of the frame. */
function badgeTop(rect: PaintRect, w: number, top: number | undefined): number {
  return top === undefined ? rect.y + BADGE.top * w : rect.y + top * rect.height;
}

/** The chip: the type's icon and name in its colour, on a light wash of it, nothing glowing. */
function drawBadge(
  context: Context,
  rect: PaintRect,
  badge: {
    text: string;
    icon: string;
    colour: string;
    opacity: number;
    top: { from: number | undefined; to: number | undefined; glide: number };
    left?: { from: number | undefined; to: number | undefined; glide: number };
  }
): void {
  const w = Math.min(rect.width, rect.height * (9 / 16));
  const height = BADGE.height * w;
  const pad = BADGE.pad * w;
  const gap = BADGE.gap * w;
  const icon = badgeIcon(badge.icon);
  const iconHeight = (badge.icon === "staff" ? BADGE.staff : BADGE.icon) * w;
  const iconWidth =
    badge.icon === "ring" ? BADGE.ring * w : badge.icon === "none" || !icon ? 0 : (iconHeight * icon.viewBox[0]) / icon.viewBox[1];
  context.save();
  context.font = `650 ${BADGE.text * w}px ${BADGE_FONT}`;
  const textWidth = context.measureText(badge.text).width;
  const width = pad * 2 + iconWidth + (iconWidth > 0 ? gap : 0) + textWidth;
  const centred = rect.x + (rect.width - width) / 2;
  const leftAt = (left: number | undefined) => (left === undefined ? centred : rect.x + left * rect.width);
  const fromX = leftAt(badge.left?.from);
  const x = fromX + (leftAt(badge.left?.to) - fromX) * (badge.left?.glide ?? 1);
  const from = badgeTop(rect, w, badge.top.from);
  const y = from + (badgeTop(rect, w, badge.top.to) - from) * badge.top.glide;
  context.globalAlpha *= badge.opacity;
  const wash = context.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, withAlpha(badge.colour, 0.3));
  wash.addColorStop(1, withAlpha(badge.colour, 0.09));
  context.beginPath();
  context.roundRect(x, y, width, height, BADGE.corner * w);
  context.fillStyle = wash;
  context.fill();
  context.lineWidth = Math.max(1, (2 * w) / 1080);
  context.strokeStyle = withAlpha(badge.colour, 0.7);
  context.stroke();
  let cursor = x + pad;
  const middle = y + height / 2;
  if (badge.icon === "ring") {
    const r = iconWidth / 2;
    context.beginPath();
    context.arc(cursor + r, middle, r - (3 * w) / 1080, 0, Math.PI * 2);
    context.lineWidth = (5 * w) / 1080;
    context.strokeStyle = badge.colour;
    context.stroke();
  } else if (icon && iconWidth > 0) {
    context.save();
    context.translate(cursor, middle - iconHeight / 2);
    context.scale(iconHeight / icon.viewBox[1], iconHeight / icon.viewBox[1]);
    context.fillStyle = badge.colour;
    context.fill(iconPath(icon.d));
    context.restore();
  }
  if (iconWidth > 0) cursor += iconWidth + gap;
  context.fillStyle = BADGE_INK;
  context.textBaseline = "middle";
  context.fillText(badge.text, cursor, middle);
  context.restore();
}
