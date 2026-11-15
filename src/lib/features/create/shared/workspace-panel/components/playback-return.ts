/**
 * Stop's return: the player as a whole shrinks into the step grid's box, and
 * the grid comes in at the matching size around it, so the two read as one
 * object turning from the player back into the grid.
 *
 * Both of DualSourceCrossfade's sources scale by the same ratio about the
 * same travelling centre. The player goes from its own size to "its canvas
 * square just fits the grid's box", and the grid goes from "its box is the
 * size of the canvas square" to its own size. At every instant the canvas
 * square and the grid's box share a centre and their tighter side.
 *
 * It starts in the same update that ends playback: by then the crossfade has
 * flipped to the grid and pinned the leaving player, so both are at rest and
 * can be measured. The animations hold no fill. When they end, each source
 * falls back to what the crossfade already gives it (grid shown, player
 * hidden), so nothing is left behind.
 */
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { EASE_STANDARD_OUT } from "#lib/shared/transitions/motion.js";

// The motion decelerates, so most of the shrink happens in the first frames
// while only the player shows. The grid, which draws on top, then fades in
// over it at close to its own size, and the player goes once it is covered,
// so nothing behind the two shows through.
// The grid stays hidden until here, so the first frames read as the player.
const GRID_APPEARS_AT = 0.15;
// The grid is fully in from here.
const GRID_SHOWN_AT = 0.5;
// The player holds until here, by which time the grid nearly covers it.
const PLAYER_LEAVES_AT = 0.35;
// The player is gone by this point of the motion.
const PLAYER_GONE_AT = 0.55;
// The largest shrink factor the return accepts; past it the grid is bigger
// than the canvas and the motion would read as a zoom out, not a return.
const MAX_SCALE = 1.5;

export interface ReturnRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ReturnGeometry {
  /** The canvas square: its side is `width`. */
  canvas: ReturnRect;
  /** The grid's visible box. */
  grid: ReturnRect;
  /** The player source's box, untransformed. */
  playerSource: ReturnRect;
  /** The grid source's box, untransformed. */
  gridSource: ReturnRect;
}

export interface ReturnTransforms {
  /** How much the canvas square shrinks to fit the grid's box. */
  scale: number;
  /** The player source's transform at the end of the return. */
  player: string;
  /** The grid source's transform at the start of the return. */
  grid: string;
}

function centre(rect: ReturnRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The transform, about `element`'s own centre (the default origin), that
 *  scales by `scale` and puts point `from` on point `to`. */
function moveScaled(
  element: ReturnRect,
  from: { x: number; y: number },
  to: { x: number; y: number },
  scale: number
): string {
  const origin = centre(element);
  const x = to.x - origin.x - scale * (from.x - origin.x);
  const y = to.y - origin.y - scale * (from.y - origin.y);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

/**
 * The two transforms of the return, or null when it should not run (no
 * size, or a shrink factor outside (0, 1.5]). Pure, on viewport numbers.
 */
export function returnTransforms(
  geometry: ReturnGeometry
): ReturnTransforms | null {
  const { canvas, grid, playerSource, gridSource } = geometry;
  const scale = Math.min(grid.width, grid.height) / canvas.width;
  if (!Number.isFinite(scale) || scale <= 0 || scale > MAX_SCALE) return null;
  const canvasCentre = centre(canvas);
  const gridCentre = centre(grid);
  return {
    scale,
    player: moveScaled(playerSource, canvasCentre, gridCentre, scale),
    grid: moveScaled(gridSource, gridCentre, canvasCentre, 1 / scale),
  };
}

function hasSize(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** The grid surface's box, cut to what its scroll container shows. */
function visibleGridBox(surface: HTMLElement): DOMRect | null {
  const box = surface.getBoundingClientRect();
  const clip = surface.closest<HTMLElement>(".scroll-wrapper");
  if (!clip) return hasSize(box) ? box : null;
  const view = clip.getBoundingClientRect();
  const left = Math.max(box.left, view.left);
  const top = Math.max(box.top, view.top);
  const right = Math.min(box.right, view.right);
  const bottom = Math.min(box.bottom, view.bottom);
  if (right <= left || bottom <= top) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

export class PlaybackReturn {
  #motions: Animation[] = [];

  /**
   * Start the return in `stage`. Returns false when it cannot run (reduced
   * motion, a missing or empty element, a shrink factor out of range), and
   * the host keeps the plain crossfade.
   */
  start(stage: HTMLElement, reduced: boolean): boolean {
    this.finish();
    if (reduced) return false;
    const sources = stage.querySelectorAll<HTMLElement>(
      ".dual-source > .source"
    );
    const gridSource = sources[0];
    const playerSource = sources[1];
    const media = stage.querySelector<HTMLElement>(".playback-media");
    const surface = stage.querySelector<HTMLElement>(".grid-surface");
    if (!gridSource || !playerSource || !media || !surface) return false;

    // Measured before any transform starts, while both sources are at rest.
    const canvas = media.getBoundingClientRect();
    const grid = visibleGridBox(surface);
    const playerBox = playerSource.getBoundingClientRect();
    const gridBox = gridSource.getBoundingClientRect();
    if (!grid || !hasSize(canvas) || !hasSize(playerBox) || !hasSize(gridBox))
      return false;
    const transforms = returnTransforms({
      // The canvas is the square at the top of .playback-media; the seek row
      // and the notation rail hang under it.
      canvas: {
        left: canvas.left,
        top: canvas.top,
        width: canvas.width,
        height: canvas.width,
      },
      grid,
      playerSource: playerBox,
      gridSource: gridBox,
    });
    if (!transforms) return false;

    const timing = {
      duration: DURATION.dramatic,
      easing: EASE_STANDARD_OUT,
    };
    this.#motions = [
      playerSource.animate(
        [
          // `scale` is held at 1 so the crossfade's own small recede on the
          // leaving player cannot end, and pop, in the middle of this.
          { transform: "none", scale: "1", opacity: "1" },
          { opacity: "1", offset: PLAYER_LEAVES_AT },
          { opacity: "0", offset: PLAYER_GONE_AT },
          { transform: transforms.player, scale: "1", opacity: "0" },
        ],
        timing
      ),
      gridSource.animate(
        [
          { transform: transforms.grid, opacity: "0" },
          { opacity: "0", offset: GRID_APPEARS_AT },
          { opacity: "1", offset: GRID_SHOWN_AT },
          { transform: "none", opacity: "1" },
        ],
        timing
      ),
    ];
    return true;
  }

  /** End the return at once, both sources back at rest. Safe when idle. */
  finish(): void {
    const motions = this.#motions;
    this.#motions = [];
    for (const motion of motions) motion.cancel();
  }
}
