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
