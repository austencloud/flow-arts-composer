/**
 * shape-matrix-mandala-morph — runs a compact matrix↔detail navigation as a
 * native shared-element transition between the selected tile and the hero.
 *
 * Both compact panes stay mounted. The tile and the hero's cold floor are
 * two instances of ShapeMatrixMandalaArt; whichever pane the layout shows
 * holds the shared `view-transition-name`, so a view change moves the name
 * from one instance to the other and the browser morphs the box between
 * them. This helper owns the three things a plain `startMorph` call misses:
 *
 * 1. the hero floor must be VISIBLE and un-animated at both snapshots
 *    (`beginMandalaHandoff` / `endMandalaHandoff` on the app state);
 * 2. the PanelGroup slide must yield to the morph while it runs — the
 *    `shape-matrix-morph` root class lets the shell suppress that transition
 *    and style the morph's pseudo-elements;
 * 3. fallbacks (no View Transitions API, reduced motion, a morph already in
 *    flight) apply the mutation plainly and still restore the flags.
 *
 * `before` runs — flushed — ahead of the old-state snapshot. Selecting a new
 * tile uses it to make the clicked tile the name holder before the view
 * flips; otherwise the previously selected tile would be captured instead.
 *
 * 4. the destination must be laid out and painted before the new-state
 *    capture. Both compact panes stay mounted, so the pane the view flips
 *    TO was collapsed at 0x0; its tile or floor learns its raster size from
 *    a ResizeObserver, which cannot report while the transition suppresses
 *    rendering. `settleMandalaEndpoint` re-measures every art instance
 *    synchronously (forcing layout), flushes the paint that follows, and
 *    waits for the endpoint's raster to decode, so the browser captures a
 *    full-size picture and the morph is one mandala travelling.
 */
import { flushSync } from "svelte";
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import {
  measureMandalaArt,
  SHAPE_MATRIX_ACTIVE_MANDALA_NAME,
} from "../../services/shape-matrix-artwork";

export const SHAPE_MATRIX_MORPH_CLASS = "shape-matrix-morph";

export interface MandalaMorphHost {
  beginMandalaHandoff(): void;
  endMandalaHandoff(): void;
}

export interface MandalaMorphOptions {
  /** Applied (and flushed) before the old-state snapshot. */
  before?: () => void;
}

export interface MandalaMorphDependencies {
  startMorph: (
    mutate: () => void,
    settle: () => Promise<void>
  ) => ViewTransition | null;
  flush: (fn: () => void) => void;
  root: () => { classList: DOMTokenList } | null;
  /** Awaited inside the update callback, before the new-state capture. */
  settle: () => Promise<void>;
}

function activeMandalaImages(): HTMLImageElement[] {
  if (typeof document === "undefined") return [];
  const owners = [...document.querySelectorAll<HTMLElement>("[style]")].filter(
    (el) => el.style.viewTransitionName === SHAPE_MATRIX_ACTIVE_MANDALA_NAME
  );
  return owners.flatMap((owner) => [...owner.querySelectorAll("img")]);
}

/**
 * Size and paint the element that owns the shared name at its new box, then
 * wait for that image to decode, so the capture holds the real picture.
 */
export async function settleMandalaEndpoint(): Promise<void> {
  measureMandalaArt();
  flushSync();
  const images = activeMandalaImages().filter((img) => img.getAttribute("src"));
  await Promise.all(images.map((img) => img.decode().catch(() => {})));
}

const defaultDependencies: MandalaMorphDependencies = {
  startMorph,
  flush: (fn) => flushSync(fn),
  root: () =>
    typeof document === "undefined" ? null : document.documentElement,
  settle: settleMandalaEndpoint,
};

export function runMandalaMorph(
  host: MandalaMorphHost,
  mutate: () => void,
  options: MandalaMorphOptions = {},
  deps: MandalaMorphDependencies = defaultDependencies
): ViewTransition | null {
  const root = deps.root();
  root?.classList.add(SHAPE_MATRIX_MORPH_CLASS);
  deps.flush(() => {
    options.before?.();
    host.beginMandalaHandoff();
  });

  const finish = () => {
    host.endMandalaHandoff();
    root?.classList.remove(SHAPE_MATRIX_MORPH_CLASS);
  };

  let transition: ViewTransition | null;
  try {
    transition = deps.startMorph(mutate, deps.settle);
  } catch (error) {
    finish();
    throw error;
  }
  if (!transition) {
    finish();
    return null;
  }
  void transition.finished.catch(() => {}).finally(finish);
  return transition;
}
