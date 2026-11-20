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
 * The flower's two pictures are rasters of different sizes, so which one shows
 * depends on the way it is flying (`back`), and the stage's still has to land
 * on, or leave from, the strength it really rests at on the page
 * (`--shape-matrix-floor-rest`), which is zero under a live canvas.
 *
 * 4. the destination must be laid out and painted before the new-state
 *    capture. Both compact panes stay mounted, so the pane the view flips
 *    TO was collapsed at 0x0; its tile or floor learns its raster size from
 *    a ResizeObserver, which cannot report while the transition suppresses
 *    rendering. `settleMandalaEndpoint` re-measures every art instance
 *    synchronously (forcing layout), flushes the paint that follows, and
 *    waits for the endpoint's raster to decode, so the browser captures a
 *    full-size picture and the morph is one mandala travelling.
 *
 * 5. the grid folds into the back chip's grid glyph opening and grows out of
 *    it going back. The pane and the glyph exist on opposite sides of the
 *    mutation, so one box is read before it and the other inside the update
 *    callback. The vector and scale are `--shape-matrix-fold-x/-y/-scale`,
 *    with the `shape-matrix-morph-fold` class on the root; if either box is
 *    missing nothing is set and the shell's plain recede/return runs.
 *
 * 6. the tap is on the clock. On each side every box and style is read before
 *    anything more is written: the old side's box and rest strength straight
 *    after the handoff, the new side's right after the art is measured and
 *    before its pictures are flushed. A read after a write makes the browser
 *    lay the page out again, once per read, while the screen waits. And the
 *    flight's own values (`--shape-matrix-floor-rest` and the fold) go on the
 *    `::view-transition` tree through a small stylesheet, never on the root:
 *    a custom property on the root is inherited by every element, so setting
 *    one re-styles the whole page inside the capture window.
 *
 * Both surfaces fly with this one helper and one set of names: the Level
 * Matrix's grid and drill, and the Ratio Playground's grid and stage. All four
 * stay mounted, so each claim is gated on the surface showing, and the helper
 * reads the rest strength from the floor that holds the name
 * (`claimedMandalaFloor`), never merely the first floor in the page.
 */
import { flushSync } from "svelte";
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import {
  measureMandalaArt,
  SHAPE_MATRIX_ACTIVE_MANDALA_NAME,
  SHAPE_MATRIX_BAR_LEAD_NAME,
  SHAPE_MATRIX_PANE_NAME,
} from "../../services/shape-matrix-artwork";

export const SHAPE_MATRIX_MORPH_CLASS = "shape-matrix-morph";
export const SHAPE_MATRIX_MORPH_BACK_CLASS = "shape-matrix-morph-back";
export const SHAPE_MATRIX_FLOOR_REST_VAR = "--shape-matrix-floor-rest";
export const SHAPE_MATRIX_MORPH_FOLD_CLASS = "shape-matrix-morph-fold";
export const SHAPE_MATRIX_FOLD_X_VAR = "--shape-matrix-fold-x";
export const SHAPE_MATRIX_FOLD_Y_VAR = "--shape-matrix-fold-y";
export const SHAPE_MATRIX_FOLD_SCALE_VAR = "--shape-matrix-fold-scale";

export interface FoldBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the grid pane and the back chip's grid glyph sit right now. */
export interface FoldBoxes {
  pane: () => FoldBox | null;
  glyph: () => FoldBox | null;
}

export interface FoldVector {
  x: number;
  y: number;
  scale: number;
}

export interface MandalaMorphHost {
  beginMandalaHandoff(): void;
  endMandalaHandoff(): void;
}

export interface MandalaMorphOptions {
  /** Applied (and flushed) before the old-state snapshot. */
  before?: () => void;
  /** The flower is flying from the stage back to its place in the Matrix. */
  back?: boolean;
}

/** The flight's own custom properties, scoped to the transition's pseudo-elements. */
export interface FlightVars {
  set(vars: Record<string, string>): void;
  clear(): void;
}

export interface MandalaMorphDependencies {
  startMorph: (
    mutate: () => void,
    settle: () => Promise<void>
  ) => ViewTransition | null;
  flush: (fn: () => void) => void;
  root: () => { classList: DOMTokenList } | null;
  /**
   * Awaited inside the update callback, before the new-state capture. It calls
   * `read` once the new side is laid out and before it writes anything more.
   */
  settle: (read: () => void) => Promise<void>;
  /** Where the flight's values go; defaults to the page's flight stylesheet. */
  vars?: FlightVars;
  /** Reads the fold's two boxes; defaults to the live page. */
  foldBoxes?: FoldBoxes;
  /** Reads the claimed floor's resting opacity; defaults to the live page. */
  floorRest?: () => string | null;
}

/**
 * The trip from the pane to the glyph: centre to centre, and the glyph's width
 * as a share of the pane's. Null when either box is missing or empty.
 */
export function foldVector(
  pane: FoldBox | null,
  glyph: FoldBox | null
): FoldVector | null {
  if (!pane || !glyph) return null;
  if (pane.width <= 0 || pane.height <= 0) return null;
  if (glyph.width <= 0 || glyph.height <= 0) return null;
  return {
    x: glyph.left + glyph.width / 2 - (pane.left + pane.width / 2),
    y: glyph.top + glyph.height / 2 - (pane.top + pane.height / 2),
    scale: glyph.width / pane.width,
  };
}

function namedElement(name: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    [...document.querySelectorAll<HTMLElement>("[style]")].find(
      (el) => el.style.viewTransitionName === name
    ) ?? null
  );
}

function boxOf(el: Element | null | undefined): FoldBox | null {
  if (!el) return null;
  const { left, top, width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

/** The pane and the glyph as the page holds them, by their claimed names. */
const pageFoldBoxes: FoldBoxes = {
  pane: () => boxOf(namedElement(SHAPE_MATRIX_PANE_NAME)),
  glyph: () =>
    boxOf(
      namedElement(SHAPE_MATRIX_BAR_LEAD_NAME)?.querySelector(
        ".fa-table-cells-large"
      )
    ),
};

/** Every element holding the flower's shared name right now (one, in a flight). */
function activeMandalaOwners(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[style]")].filter(
    (el) => el.style.viewTransitionName === SHAPE_MATRIX_ACTIVE_MANDALA_NAME
  );
}

function activeMandalaImages(): HTMLImageElement[] {
  if (typeof document === "undefined") return [];
  return activeMandalaOwners(document).flatMap((owner) => [
    ...owner.querySelectorAll("img"),
  ]);
}

/**
 * The still floor that owns the flower's name. Both surfaces keep a stage
 * mounted, each with a floor (the Level Matrix drill's and the Ratio
 * Playground's), so the first floor in the page is often the hidden one; the
 * one the flight leaves from or lands on is the one holding the name.
 */
export function claimedMandalaFloor(root: ParentNode): Element | null {
  for (const owner of activeMandalaOwners(root)) {
    const floor = owner.closest("[data-mandala-floor]");
    if (floor) return floor;
  }
  return null;
}

/** How strongly the stage's still rests on the page, from the claimed floor. */
function pageFloorRest(): string | null {
  if (typeof document === "undefined") return null;
  const floor = claimedMandalaFloor(document);
  return floor ? getComputedStyle(floor).opacity : null;
}

/**
 * Size the art at its new box (the one layout pass the new side needs), let
 * the caller read the page while that layout is fresh, then paint the element
 * that owns the shared name and wait for its picture to decode, so the capture
 * holds the real picture.
 */
export async function settleMandalaEndpoint(
  read: () => void = () => {}
): Promise<void> {
  measureMandalaArt();
  read();
  flushSync();
  const images = activeMandalaImages().filter((img) => img.getAttribute("src"));
  await Promise.all(images.map((img) => img.decode().catch(() => {})));
}

/**
 * One `<style>` in the head whose only rule targets `::view-transition`. The
 * transition's pseudo-elements inherit from it, so the keyframes see the
 * values, and no element in the page does, so writing it re-styles nothing
 * but the transition.
 */
function pageFlightVars(): FlightVars {
  let sheet: HTMLStyleElement | null = null;
  return {
    set(vars) {
      if (typeof document === "undefined") return;
      const body = Object.entries(vars)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ");
      if (!sheet) {
        sheet = document.createElement("style");
        sheet.dataset.shapeMatrixFlight = "";
        document.head.append(sheet);
      }
      sheet.textContent = `:root::view-transition { ${body} }`;
    },
    clear() {
      if (sheet) sheet.textContent = "";
    },
  };
}

const defaultDependencies: MandalaMorphDependencies = {
  startMorph,
  flush: (fn) => flushSync(fn),
  root: () =>
    typeof document === "undefined" ? null : document.documentElement,
  settle: settleMandalaEndpoint,
  vars: pageFlightVars(),
  floorRest: pageFloorRest,
};

export function runMandalaMorph(
  host: MandalaMorphHost,
  mutate: () => void,
  options: MandalaMorphOptions = {},
  deps: MandalaMorphDependencies = defaultDependencies
): ViewTransition | null {
  const root = deps.root();
  const boxes = deps.foldBoxes ?? pageFoldBoxes;
  const readFloorRest = deps.floorRest ?? (() => null);
  root?.classList.add(SHAPE_MATRIX_MORPH_CLASS);
  if (options.back) root?.classList.add(SHAPE_MATRIX_MORPH_BACK_CLASS);
  deps.flush(() => {
    options.before?.();
    host.beginMandalaHandoff();
  });
  // The old side, read now and before anything more is written. The pane and
  // the chip take their names in the handoff, so this is the earliest they can
  // be found; the layout the read forces is the one the old snapshot needs
  // anyway, done a moment early rather than twice.
  //
  // Opening, the pane is on the old side and the glyph on the new; going back,
  // the other way round. Going back the flight also leaves from the floor as
  // it stands now, in handoff (never quite zero, so its snapshot paints);
  // going forward it lands on the floor as the stage shows it, read inside
  // the callback.
  const oldBox = options.back ? boxes.glyph() : boxes.pane();
  let floorRest = options.back ? readFloorRest() : null;
  let newBox: FoldBox | null = null;
  const readNewSide = () => {
    newBox = options.back ? boxes.pane() : boxes.glyph();
    if (!options.back) floorRest = readFloorRest();
  };
  const writeFlight = () => {
    const vars: Record<string, string> = {};
    if (floorRest !== null) vars[SHAPE_MATRIX_FLOOR_REST_VAR] = floorRest;
    const fold = options.back
      ? foldVector(newBox, oldBox)
      : foldVector(oldBox, newBox);
    if (fold) {
      vars[SHAPE_MATRIX_FOLD_X_VAR] = `${fold.x}px`;
      vars[SHAPE_MATRIX_FOLD_Y_VAR] = `${fold.y}px`;
      vars[SHAPE_MATRIX_FOLD_SCALE_VAR] = `${fold.scale}`;
      root?.classList.add(SHAPE_MATRIX_MORPH_FOLD_CLASS);
    }
    if (Object.keys(vars).length > 0) deps.vars?.set(vars);
  };

  const finish = () => {
    host.endMandalaHandoff();
    root?.classList.remove(
      SHAPE_MATRIX_MORPH_CLASS,
      SHAPE_MATRIX_MORPH_BACK_CLASS,
      SHAPE_MATRIX_MORPH_FOLD_CLASS
    );
    deps.vars?.clear();
  };

  let transition: ViewTransition | null;
  try {
    transition = deps.startMorph(mutate, async () => {
      await deps.settle(readNewSide);
      writeFlight();
    });
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
