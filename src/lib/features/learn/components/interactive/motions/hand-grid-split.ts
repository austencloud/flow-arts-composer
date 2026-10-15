/**
 * The Hand Motions lesson's one-hand map splitting into the two-hand grids,
 * and back (Austen, 2026-10-13: crossfading the stages showed the big map and
 * the two small grids over each other). The map, each hand's grid and
 * backdrop and the side panels take view-transition names while
 * `html.hand-grid-split` is set (view-transitions.css), so the stage change
 * runs as a same-document view transition through `startMorph`. The blue grid
 * and its backdrop leave the map's box for the left spot, the red ones slide
 * out from under them to the right, and merging runs the same flight in
 * reverse. Reduced motion and browsers without view transitions swap at once.
 */
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import { LAYOUT_MOTION_EASING } from "#lib/shared/transitions/layout-flip.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

const SPLIT_CLASS = "hand-grid-split";
const MAP = "map";
/** Each hand's pieces, listed in the order they stack (red under blue). */
const PIECES = ["red-backdrop", "red", "blue-backdrop", "blue"] as const;
type Piece = (typeof PIECES)[number];

export const HAND_GRID_SPLIT_DURATION = DURATION.dramatic;

function rectOf(root: HTMLElement, piece: string): DOMRect | null {
  return (
    root
      .querySelector<HTMLElement>(`[data-hand-grid="${piece}"]`)
      ?.getBoundingClientRect() ?? null
  );
}

function box(rect: DOMRect): Keyframe {
  return {
    transform: `translate(${rect.left}px, ${rect.top}px)`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function fly(name: string, from: DOMRect, to: DOMRect): void {
  document.documentElement.animate([box(from), box(to)], {
    duration: HAND_GRID_SPLIT_DURATION,
    easing: LAYOUT_MOTION_EASING,
    fill: "both",
    pseudoElement: `::view-transition-group(hand-grid-${name})`,
  });
}

/**
 * Runs `mutate`, which swaps the map stage for the pairs stage ("split") or
 * back ("merge"), with the grids flying between their spots.
 */
export function runHandGridSplit(
  root: HTMLElement,
  direction: "split" | "merge",
  mutate: () => void
): void {
  const html = document.documentElement;
  html.classList.add(SPLIT_CLASS, `${SPLIT_CLASS}-${direction}`);
  const release = () =>
    html.classList.remove(SPLIT_CLASS, `${SPLIT_CLASS}-${direction}`);

  const before = new Map<string, DOMRect | null>(
    [MAP, ...PIECES].map((piece) => [piece, rectOf(root, piece)])
  );
  const transition = startMorph(mutate);
  if (!transition) {
    release();
    return;
  }
  void transition.finished.then(release, release);
  void transition.ready.then(
    () => {
      const after = new Map<string, DOMRect | null>(
        [MAP, ...PIECES].map((piece) => [piece, rectOf(root, piece)])
      );
      if (direction === "split") {
        const map = before.get(MAP);
        if (!map) return;
        for (const piece of PIECES) {
          const to = after.get(piece);
          if (to) fly(piece, map, to);
        }
        const blue = after.get("blue-backdrop" satisfies Piece);
        if (blue) fly(MAP, map, blue);
      } else {
        const map = after.get(MAP);
        if (!map) return;
        for (const piece of PIECES) {
          const from = before.get(piece);
          if (from) fly(piece, from, map);
        }
      }
    },
    () => {}
  );
}

const GROW_CLASS = "hand-grid-grow";

/**
 * Runs `mutate`, which swaps the first stage for the motion map or back, with
 * the Start picture growing into the map (Austen, 2026-10-15: "blow it up to
 * be the main one on the left with the hand staying in the same place"). The
 * two share one view-transition name while `html.hand-grid-grow` is set
 * (view-transitions.css); both show the blue hand on West of a diamond grid,
 * so the group's box carries one picture between the two sizes.
 */
export function runHandGridGrow(mutate: () => void): void {
  const html = document.documentElement;
  html.classList.add(GROW_CLASS);
  const release = () => html.classList.remove(GROW_CLASS);
  const transition = startMorph(mutate);
  if (!transition) {
    release();
    return;
  }
  void transition.finished.then(release, release);
}

const SETTLE_PARTS = ["cell", "picture", "label"] as const;

/** Names each combination cell's box, picture and label for the morph. */
function nameBoardParts(root: HTMLElement): void {
  for (const part of SETTLE_PARTS) {
    for (const element of root.querySelectorAll<HTMLElement>(
      `[data-combination-${part}]`
    )) {
      const id = element.getAttribute(`data-combination-${part}`);
      element.style.viewTransitionName = `hand-board-${part}-${id}`;
      element.style.setProperty("view-transition-class", `hand-board-${part}`);
    }
  }
}

function unnameBoardParts(root: HTMLElement): void {
  for (const part of SETTLE_PARTS) {
    for (const element of root.querySelectorAll<HTMLElement>(
      `[data-combination-${part}]`
    )) {
      element.style.viewTransitionName = "";
      element.style.removeProperty("view-transition-class");
    }
  }
}

/**
 * Runs `mutate`, which swaps the finished quiz for the full board, with each
 * combination's cell, picture and label moving from its quiz slot into its
 * board slot (Austen, 2026-10-15: "morphed all of the corresponding hand
 * motions neatly and nicely so the same component could be reused into its
 * new slot"). The quiz's own picture and prompt fade with the page.
 */
export function runBoardSettle(root: HTMLElement, mutate: () => void): void {
  nameBoardParts(root);
  const transition = startMorph(mutate, async () => nameBoardParts(root));
  if (!transition) {
    unnameBoardParts(root);
    return;
  }
  const release = () => unnameBoardParts(root);
  void transition.finished.then(release, release);
}
