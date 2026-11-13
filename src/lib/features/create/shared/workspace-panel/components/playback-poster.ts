/**
 * Play's poster: the sequence's start picture, standing where the player's
 * canvas will be from the frame after the tap until the canvas has painted.
 *
 * On a slow phone the player takes from a few hundred ms to over a second to
 * mount and paint its first frame. Meanwhile the tools have folded away and
 * the step grid keeps its old, smaller box, so the stage under it would be
 * empty. The poster is a copy of the grid's own start pictograph (already
 * drawn, so no preparation work) that flies out of its cell to the canvas's
 * place on the compositor. The host keeps the player out until the poster
 * has landed, so the picture becomes the player rather than settling onto
 * one already there: the player's controls arrive around the landed picture,
 * and the poster dissolves into the live canvas once those have arrived.
 */
import { DURATION } from "#lib/shared/transitions/transitions.js";
import {
  EASE_STANDARD,
  EASE_STANDARD_OUT,
} from "#lib/shared/transitions/motion.js";

export interface PosterBox {
  left: number;
  top: number;
  size: number;
}

/**
 * Where WorkspacePlayback's canvas sits in a stage of this size, outside
 * theater mode. Mirrors `.playback-layout` (inset 4px 12px 8px) and
 * `.playback-media` (a square in the height the seek row and the notation
 * rail leave, the column centred) in WorkspacePlayback.svelte; change both
 * together. The rail opens at a layout height of 360px and is
 * clamp(72px, 14cqh, 104px) tall.
 */
export function playerCanvasBox(
  stageWidth: number,
  stageHeight: number,
  touchTarget = 44
): PosterBox | null {
  const width = stageWidth - 24;
  const height = stageHeight - 12;
  if (width <= 0 || height <= 0) return null;
  const rail = height >= 360 ? Math.min(104, Math.max(72, height * 0.14)) : 0;
  const size = Math.min(width, height - rail - touchTarget);
  if (size <= 0) return null;
  const columnHeight = size + touchTarget + rail;
  return {
    left: 12 + (width - size) / 2,
    top: 4 + (height - columnHeight) / 2,
    size,
  };
}

/** The grid's start pictograph, if it is on screen inside the stage. */
function findStartPicture(stage: HTMLElement): SVGSVGElement | null {
  // The step grid renders before the player in the stage's DOM, so the first
  // start tile is the grid's, not the notation rail's.
  return stage.querySelector<SVGSVGElement>(".start-tile.has-pictograph svg");
}

function readTouchTarget(stage: HTMLElement): number {
  const value = parseFloat(
    getComputedStyle(stage).getPropertyValue("--min-touch-target")
  );
  return Number.isFinite(value) && value > 0 ? value : 44;
}

export class PlaybackPoster {
  #el: HTMLDivElement | null = null;
  /** The transform that puts the poster over its grid cell, or null when it
   *  came in place (no cell on screen). */
  #home: string | null = null;
  #leaving = false;
  /** Dissolving into the player, which a Stop can still turn into a retreat. */
  #revealing = false;
  /** The flight into the canvas's place, while it runs. */
  #flight: Animation | null = null;
  #landed = false;
  #onLanded: (() => void) | null = null;

  get shown(): boolean {
    return this.#el !== null && !this.#leaving;
  }

  /**
   * Put the poster up for a Play that is being prepared. Returns false when
   * there is nothing to show (no start picture, or no room), and the stage
   * keeps today's behaviour. `onLanded` runs once the poster sits exactly in
   * the canvas's place: at once under reduced motion, otherwise when the
   * flight ends. A retreat before then never calls it.
   */
  show(stage: HTMLElement, reduced: boolean, onLanded?: () => void): boolean {
    if (this.shown) {
      this.#onLanded = onLanded ?? null;
      if (this.#landed) this.#land();
      return true;
    }
    const stageRect = stage.getBoundingClientRect();
    const box = playerCanvasBox(
      stageRect.width,
      stageRect.height,
      readTouchTarget(stage)
    );
    const picture = findStartPicture(stage);
    if (!box || !picture) return false;

    const tile = picture.getBoundingClientRect();
    const tileOnStage =
      tile.width > 0 &&
      tile.top >= stageRect.top &&
      tile.bottom <= stageRect.bottom &&
      tile.left >= stageRect.left &&
      tile.right <= stageRect.right;
    this.#home = tileOnStage
      ? `translate(${tile.left - stageRect.left - box.left}px, ${
          tile.top - stageRect.top - box.top
        }px) scale(${tile.width / box.size})`
      : null;

    // A Play during the retreat turns the same poster around.
    const el = this.#el ?? this.#create(stage, picture);
    Object.assign(el.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.size}px`,
      height: `${box.size}px`,
    });
    this.#leaving = false;
    this.#revealing = false;
    this.#landed = false;
    this.#onLanded = onLanded ?? null;

    if (reduced) {
      this.#settle(el);
      this.#land();
      return true;
    }
    const from = this.#present(el) ?? {
      transform: this.#home ?? "scale(0.94)",
      opacity: this.#home ? "1" : "0",
    };
    const flight = el.animate([from, { transform: "none", opacity: "1" }], {
      duration: DURATION.emphasis,
      easing: EASE_STANDARD,
    });
    this.#flight = flight;
    // A flight cancelled by anything but a retreat or a new flight leaves
    // the poster at its final place, so it counts as landed too.
    const landed = () => {
      if (this.#flight === flight && !this.#leaving) this.#land();
    };
    flight.finished.then(landed, landed);
    return true;
  }

  /** The player has started arriving under the landed poster: dissolve into
   *  it once its own fade (`after` ms) is done. The delay runs on the
   *  compositor's clock, so a busy main thread on a slow phone cannot hold
   *  the poster up. */
  reveal(reduced: boolean, after = 0): void {
    const el = this.#el;
    if (!el || this.#leaving) return;
    this.#leaving = true;
    this.#revealing = true;
    if (reduced) {
      this.dispose();
      return;
    }
    // Opacity only, so a flight still landing (reduced motion off, a host
    // that reveals early) keeps going.
    const motion = el.animate([{ opacity: "1" }, { opacity: "0" }], {
      duration: DURATION.fast,
      delay: after,
      easing: EASE_STANDARD_OUT,
      fill: "both",
    });
    motion.onfinish = () => {
      if (this.#el === el && this.#leaving) this.dispose();
    };
  }

  /** Play ended before the player had fully arrived, the poster still up
   *  or dissolving: back into the grid, and gone. */
  retreat(reduced: boolean): void {
    const el = this.#el;
    if (!el || (this.#leaving && !this.#revealing)) return;
    this.#leaving = true;
    this.#revealing = false;
    this.#flight = null;
    this.#onLanded = null;
    if (reduced) {
      this.dispose();
      return;
    }
    const from = this.#present(el) ?? { transform: "none", opacity: "1" };
    const motion = el.animate(
      [
        from,
        {
          transform: this.#home ?? "scale(0.94)",
          opacity: "0",
        },
      ],
      {
        duration: DURATION.normal,
        easing: EASE_STANDARD,
        fill: "forwards",
      }
    );
    motion.onfinish = () => {
      if (this.#el === el && this.#leaving) this.dispose();
    };
  }

  dispose(): void {
    this.#el?.remove();
    this.#el = null;
    this.#leaving = false;
    this.#revealing = false;
    this.#flight = null;
    this.#landed = false;
    this.#onLanded = null;
  }

  #land(): void {
    this.#flight = null;
    this.#landed = true;
    const landed = this.#onLanded;
    this.#onLanded = null;
    landed?.();
  }

  #create(stage: HTMLElement, picture: SVGSVGElement): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "playback-poster";
    el.setAttribute("aria-hidden", "true");
    el.dataset.playbackPoster = "";
    Object.assign(el.style, {
      position: "absolute",
      zIndex: "2",
      pointerEvents: "none",
      transformOrigin: "0 0",
      contain: "strict",
      willChange: "transform, opacity",
    });
    const copy = picture.cloneNode(true) as SVGSVGElement;
    // References inside resolve to the grid's originals, which stay mounted.
    for (const node of copy.querySelectorAll("[id]"))
      node.removeAttribute("id");
    copy.removeAttribute("id");
    copy.setAttribute("width", "100%");
    copy.setAttribute("height", "100%");
    copy.style.display = "block";
    el.append(copy);
    stage.append(el);
    this.#el = el;
    return el;
  }

  /** Where a running motion has the poster now; null when none is running.
   *  Cancels it, so the next motion starts from that spot. */
  #present(el: HTMLElement): { transform: string; opacity: string } | null {
    const running = el.getAnimations();
    if (running.length === 0) return null;
    const style = getComputedStyle(el);
    const present = { transform: style.transform, opacity: style.opacity };
    for (const motion of running) motion.cancel();
    return present;
  }

  #settle(el: HTMLElement): void {
    for (const motion of el.getAnimations()) motion.cancel();
  }
}
