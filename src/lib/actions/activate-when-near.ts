/**
 * One-shot viewport activation for expensive, below-the-fold UI.
 *
 * IntersectionObserver decides when the node is close enough to matter. If a
 * named route morph is still taking snapshots, activation waits for that
 * transition to finish so module parsing and canvas setup cannot contend with
 * the shared-element animation.
 */

import {
  runAfterNamedRouteMorph,
  runAfterNamedRouteMorphIdle,
} from "#lib/shared/transitions/named-route-morph-state.svelte.js";

export interface ActivateWhenNearOptions {
  readonly activate: () => void;
  readonly rootMargin?: string;
  /** Also wait for a quiet browser turn before importing or initializing UI. */
  readonly deferUntilIdle?: boolean;
  readonly idleTimeout?: number;
  readonly fallbackDelay?: number;
}

export function activateWhenNear(
  node: HTMLElement,
  {
    activate,
    rootMargin = "0px",
    deferUntilIdle = false,
    idleTimeout,
    fallbackDelay,
  }: ActivateWhenNearOptions
) {
  let destroyed = false;
  let scheduled = false;
  let cancelScheduled = () => {};

  const scheduleActivation = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      if (!destroyed) activate();
    };
    cancelScheduled = deferUntilIdle
      ? runAfterNamedRouteMorphIdle(run, {
          timeout: idleTimeout,
          fallbackDelay,
        })
      : runAfterNamedRouteMorph(run);
  };

  if (typeof IntersectionObserver === "undefined") {
    scheduleActivation();
    return {
      destroy() {
        destroyed = true;
        cancelScheduled();
      },
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      scheduleActivation();
    },
    { rootMargin }
  );
  observer.observe(node);

  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      cancelScheduled();
    },
  };
}
