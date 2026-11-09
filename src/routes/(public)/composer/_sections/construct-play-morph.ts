/**
 * The /composer Construct demo's switch between building and the full-card
 * player, in both directions.
 *
 * Play rebuilds the card: the step tiles leave the grid above the options and
 * line up in the strip beside the canvas, the options give way to the player,
 * and the action row drops to the card's bottom edge. Keep building, Build
 * another, undo, redo and the eighth step all cross the same line. Swapping
 * the parts in place would teleport each one, so the switch runs as a
 * same-document view transition through `startMorph`:
 *
 * - every step tile on screen carries `construct-step-<n>` (0 is the start),
 *   so the tile itself travels between the grid and the strip; the build
 *   grid's mandala cell is `construct-step-mandala` and resolves in with them;
 * - the old picker pane is named for what it holds (`construct-options`,
 *   `construct-starts`, `construct-stage`) and recedes where it was, while the
 *   new one comes into focus live where it lands;
 * - the action row carries `construct-actions` and glides to its new edge.
 *
 * Names exist only while the morph runs, and each is given twice: to the old
 * parts before the old frame is captured, and to the new parts inside the
 * update callback once the tiles have drawn. The root is left out of the capture,
 * as in the start placement morph, so the page under the flight stays live.
 * Timing lives in view-transitions.css.
 */
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

export const CONSTRUCT_PLAY_MORPH_CLASS = "construct-play-morph";
const TILE_CLASS = "construct-tile";
const FLIGHT_GROUP = /^::view-transition-group\((construct-step-\d+|construct-actions)\)$/;

/**
 * How long the page may stay frozen on the old frame while the new phase
 * mounts and draws. Past this the morph captures whatever is there; the new
 * side is live, so anything still drawing finishes inside the flight.
 */
const SETTLE_CAP_MS = DURATION.normal;
/** Poll on a timer: no animation frames run while the update callback waits. */
const SETTLE_POLL_MS = 16;
/** The new pane waits for the old one to clear, then comes into focus. */
const PANE_ARRIVE_DELAY_MS = 140;
const PANE_ARRIVE_MS = 420;

export interface ConstructPlayMorphParts {
  /** The sequence frame: the build grid, or the play strip. */
  frame: () => HTMLElement | null;
  pane: () => HTMLElement | null;
  actions: () => HTMLElement | null;
  /** The pane's name for the phase on screen right now. */
  paneName: () => string;
  /** True once the new phase's pictures have drawn. */
  settled: () => boolean;
}

/**
 * The step tiles the frame shows, keyed by step number, and whether each sits
 * wholly inside the frame's visible box. A view-transition snapshot ignores
 * its scroller's clip, so a tile scrolled part or all of the way out of the
 * strip would fly in from outside the card. Only the tiles inside take part.
 */
function frameTiles(frame: HTMLElement): Array<[string, HTMLElement, boolean]> {
  const strip = frame.querySelector<HTMLElement>(".play-strip");
  const clip = (strip ?? frame).getBoundingClientRect();
  const tiles: Array<[number | "mandala", HTMLElement]> = [];
  if (strip) {
    for (const tile of strip.querySelectorAll<HTMLElement>(".tile[data-step]")) {
      tiles.push([Number(tile.dataset.step), tile]);
    }
  } else {
    for (const cell of frame.querySelectorAll<HTMLElement>(".step-container")) {
      const shell = cell.querySelector<HTMLElement>(
        ":scope > .history-layout-shell"
      );
      if (!shell) continue;
      const step = cell.hasAttribute("data-history-start-placement")
        ? 0
        : Number(cell.dataset.stepNumber);
      tiles.push([step, shell]);
    }
    // The live mandala cell closes the grid. It is a tile like the others, so
    // it resolves in with them instead of sitting there from the first frame.
    const mandala = frame.querySelector<HTMLElement>(".mandala-layout-item");
    if (mandala) tiles.push(["mandala", mandala]);
  }
  return tiles
    .filter(([step]) => step === "mandala" || Number.isFinite(step))
    .map(([step, el]) => {
      const box = el.getBoundingClientRect();
      const inside =
        box.width > 0 &&
        box.left >= clip.left - 1 &&
        box.right <= clip.right + 1 &&
        box.top >= clip.top - 1 &&
        box.bottom <= clip.bottom + 1;
      return [String(step), el, inside];
    });
}

/**
 * The arriving pane stays out of the capture and comes into view live. The
 * options and start tiles draw over a few hundred milliseconds; a snapshot
 * would either hold the click until they finish or freeze an empty grid that
 * the real one replaces at the end. Live, each picture appears as it draws,
 * under the same fade. The player's canvas keeps animating the same way.
 * Opacity and scale only, so the compositor runs it.
 */
function arriveLive(pane: HTMLElement): void {
  pane.animate(
    [
      { opacity: 0, transform: "scale(0.96)" },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: PANE_ARRIVE_MS,
      delay: PANE_ARRIVE_DELAY_MS,
      easing: "cubic-bezier(0, 0, 0.2, 1)",
      fill: "backwards",
    }
  );
}

function waitUntil(ready: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    (function check() {
      if (ready() || performance.now() - startedAt >= SETTLE_CAP_MS) resolve();
      else setTimeout(check, SETTLE_POLL_MS);
    })();
  });
}

/**
 * Re-key each flight as translate + scale so the compositor runs it. The
 * browser animates a group's width and height on the main thread, and the
 * player and the option picker both mount in long tasks right as the flight
 * starts; the tiles would stall mid-air. Tiles are square at both ends, and
 * the action row keeps the card's width, so the scale reads as the same box.
 */
function flyOnCompositor(): void {
  for (const animation of document.getAnimations()) {
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect)) continue;
    if (!FLIGHT_GROUP.test(effect.pseudoElement ?? "")) continue;
    const frames = effect.getKeyframes();
    const from = frames[0];
    const to = frames.at(-1);
    const scaleX =
      parseFloat(String(from?.width)) / parseFloat(String(to?.width));
    const scaleY =
      parseFloat(String(from?.height)) / parseFloat(String(to?.height));
    if (
      typeof from?.transform !== "string" ||
      typeof to?.transform !== "string" ||
      !Number.isFinite(scaleX) ||
      !Number.isFinite(scaleY)
    ) {
      continue;
    }
    // A CSS animation's timing function lives on its keyframes, so the new
    // first keyframe carries it over or the flight would run linear.
    effect.setKeyframes([
      {
        transform: `${from.transform} scale(${scaleX}, ${scaleY})`,
        easing: from.easing ?? "linear",
      },
      { transform: to.transform },
    ]);
  }
}

/**
 * Run a phase change through the morph. Returns the running transition, or
 * null when it ran plainly (reduced motion, no API, another morph in flight),
 * in which case the caller's CSS arrival plays instead. `mutate` has run by
 * the time `updateCallbackDone` settles.
 */
export function morphConstructPhase(
  parts: ConstructPlayMorphParts,
  mutate: () => void
): ViewTransition | null {
  const root = document.documentElement;
  const named: HTMLElement[] = [];

  const name = (el: HTMLElement | null, value: string, cls?: string) => {
    if (!el) return;
    el.style.setProperty("view-transition-name", value);
    if (cls) el.style.setProperty("view-transition-class", cls);
    named.push(el);
  };
  // A tile cut by the strip's edge stays out of the flight. In the new phase
  // it would otherwise sit there from the first frame while the others are
  // still on their way, so it waits hidden and fades in once they land.
  const waiting: HTMLElement[] = [];
  const nameAll = (arriving: boolean) => {
    const frame = parts.frame();
    if (frame) {
      for (const [step, tile, inside] of frameTiles(frame)) {
        if (inside) name(tile, `construct-step-${step}`, TILE_CLASS);
        else if (arriving) {
          tile.style.setProperty("opacity", "0");
          waiting.push(tile);
        }
      }
    }
    const pane = parts.pane();
    if (!arriving) name(pane, parts.paneName());
    else if (pane) arriveLive(pane);
    name(parts.actions(), "construct-actions");
  };
  const clearAll = () => {
    for (const el of named.splice(0)) {
      el.style.removeProperty("view-transition-name");
      el.style.removeProperty("view-transition-class");
    }
  };
  const release = () => {
    clearAll();
    root.classList.remove(CONSTRUCT_PLAY_MORPH_CLASS);
    for (const tile of waiting.splice(0)) {
      tile.style.removeProperty("opacity");
      tile.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: DURATION.normal,
        easing: "ease-out",
      });
    }
  };

  root.classList.add(CONSTRUCT_PLAY_MORPH_CLASS);
  nameAll(false);
  let transition: ViewTransition | null;
  try {
    transition = startMorph(
      () => {
        clearAll();
        mutate();
      },
      async () => {
        await waitUntil(parts.settled);
        nameAll(true);
      }
    );
  } catch (error) {
    release();
    throw error;
  }
  if (!transition) {
    release();
    return null;
  }
  void transition.ready.then(flyOnCompositor, () => {});
  void transition.finished.then(release, release);
  return transition;
}
