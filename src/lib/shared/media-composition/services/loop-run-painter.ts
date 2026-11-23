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
import { VIEWBOX_SIZE } from "#lib/shared/render/core/constants/viewbox.js";
import { buildNotationCells, type NotationCell } from "#lib/shared/timeline/notation-cell.js";
import { calculatePictographMotionPositions } from "#lib/shared/pictograph/prop/services/pictograph-motion-positioner.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { LOOP_ICON_PATHS } from "@tka/render-composition";
import {
  loopRunBadgeAt,
  loopRunFrame,
  loopRunTurnDegrees,
  type LoopCopyDraw,
  type LoopLineDraw,
  type LoopPropsDraw,
  type LoopRunPlan,
  type LoopStageDraw,
  type LoopTileDraw,
  type LoopTilePlace,
} from "#lib/shared/media-composition/domain/loop-run.js";
import { paintSelectionRing } from "#lib/shared/media-composition/services/selection-ring.js";
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
    await this.drawingFor(plan).prepare(rasterSize(target));
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
    if (scene.line) drawLine(context, scene.line, plan.settings.colour, 2 * pixel);
    if (scene.home) drawLine(context, scene.home, HOME_INK, 2 * pixel);

    for (const tile of scene.tiles) this.drawTile(context, drawing, cache, tile, plan.settings.colour, pixel, plain);
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
    if (scene.stage) this.drawStage(context, drawing, cache, scene.stage);
    for (const ghost of scene.ghosts) {
      context.save();
      context.globalAlpha *= ghost.opacity;
      this.drawProps(context, drawing, ghost, { step: ghost.step, progress: 1, opacity: 1 });
      context.restore();
    }
    for (const copy of scene.copies) this.drawCopy(context, drawing, cache, copy, rect, plain ? pixel : null);
    const badge = loopRunBadgeAt(plan.settings, seconds - plan.start);
    if (badge) drawBadge(context, rect, badge);
    context.restore();
  }

  /** The LOOP played: the grid and the props on the frame's own ground, and the app's gold ring on the tile being played. */
  private drawStage(context: Context, drawing: LoopRunDrawing, cache: SizeCache, stage: LoopStageDraw) {
    for (const ring of stage.rings) paintSelectionRing(context, ring, ring.strength, ring.look);
    if (stage.opacity <= 0) return;
    const grid = cache.grid[0];
    context.save();
    context.globalAlpha *= stage.opacity;
    if (grid && stage.grid > 0) {
      context.save();
      context.globalAlpha *= stage.grid;
      context.drawImage(grid, stage.x - stage.size / 2, stage.y - stage.size / 2, stage.size, stage.size);
      context.restore();
    }
    this.drawProps(context, drawing, stage, { ...stage.props, opacity: 1 });
    context.restore();
  }

  private drawTile(
    context: Context,
    drawing: LoopRunDrawing,
    cache: SizeCache,
    tile: LoopTileDraw,
    colour: string,
    pixel: number,
    plain: boolean
  ): void {
    if (tile.opacity <= 0) return;
    const place = { x: tile.x, y: tile.y, size: tile.size * tile.scale };
    context.save();
    context.globalAlpha *= tile.opacity;
    this.drawContent(context, drawing, cache, place, tile);
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
    context.fillStyle = TILE_GROUND;
    context.fillRect(left, top, place.size, place.size);
    context.drawImage(ground, left, top, place.size, place.size);
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
