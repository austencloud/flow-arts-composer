import { flushSync } from "svelte";
import { ignoreViewTransitionSkip } from "#lib/shared/transitions/named-route-morph-state.svelte.js";

export type DeckReleaserMotionKind = "stage" | "source" | "sidebar" | "content";
export type DeckReleaserMotionDirection = "forward" | "backward";

let transitionActive = false;

function motionUnavailable(): boolean {
  if (typeof document === "undefined") return true;
  if (typeof document.startViewTransition !== "function") return true;
  if (transitionActive) return true;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Give the releaser's existing state mutations a visible path through the UI.
 * Named View Transitions keep the live Gallery, print preview, and sidebar
 * mounted normally while the browser carries their before/after frames between
 * states. Unsupported browsers and reduced-motion users get the same mutation
 * immediately, with no animation dependency in the product logic.
 */
export function runDeckReleaserTransition(
  kind: DeckReleaserMotionKind,
  direction: DeckReleaserMotionDirection,
  mutate: () => void
): ViewTransition | null {
  if (motionUnavailable()) {
    mutate();
    return null;
  }

  const root = document.documentElement;
  const kindClass = `deck-motion-${kind}`;
  const directionClass = `deck-motion-${direction}`;
  let mutationRan = false;

  root.classList.add(kindClass, directionClass);
  transitionActive = true;

  try {
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        mutationRan = true;
        mutate();
      });
    });
    ignoreViewTransitionSkip(transition);
    void transition.finished
      .catch(() => {})
      .finally(() => {
        root.classList.remove(kindClass, directionClass);
        transitionActive = false;
      });
    return transition;
  } catch {
    root.classList.remove(kindClass, directionClass);
    transitionActive = false;
    if (!mutationRan) mutate();
    return null;
  }
}
