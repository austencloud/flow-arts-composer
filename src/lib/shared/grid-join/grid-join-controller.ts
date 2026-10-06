/**
 * Grid join controller: how a surface reads and changes the join of the
 * sequence it shows.
 *
 * The join (`SequenceData.conjoined`) belongs to the sequence, so every right
 * click menu that offers it edits the same value through one of these. A host
 * (the sequence viewer, the Create workspace) provides the controller over its
 * own sequence; a surface with no controller offers no join choice but still
 * draws the join the sequence has.
 */
import { getContext, setContext } from "svelte";
import type { GridJoin } from "@tka/tka-types";

export interface GridJoinController {
  /** The sequence's join, or null for one grid. Reads reactive state. */
  current(): GridJoin | null;
  /** Sets the join; null returns the sequence to one grid. */
  set(join: GridJoin | null): void;
  /**
   * The sequence's grid mode, which decides the directions a join can take
   * (see `GRID_JOIN_DIRECTIONS`). Absent reads as diamond.
   */
  gridMode(): string | null | undefined;
  /**
   * Calls `listener` after the join changes, for menus that rebuild from a
   * version counter. Returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void;
}

/** Same join (both null counts as the same). */
export function gridJoinsEqual(
  a: GridJoin | null | undefined,
  b: GridJoin | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  return a.toward === b.toward && a.steps === b.steps;
}

/**
 * Builds a controller over a getter and a setter, with the change signal the
 * menus need. `set` ignores a join equal to the current one.
 */
export function createGridJoinController(options: {
  get: () => GridJoin | null;
  apply: (join: GridJoin | null) => void;
  gridMode?: () => string | null | undefined;
}): GridJoinController {
  const listeners = new Set<() => void>();
  return {
    current: options.get,
    gridMode: options.gridMode ?? (() => undefined),
    set(join) {
      if (gridJoinsEqual(join, options.get())) return;
      options.apply(join);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const KEY = Symbol("grid-join-controller");

/** Provide the controller to every menu below this component. */
export function setGridJoinContext(controller: GridJoinController): void {
  setContext(KEY, controller);
}

/** The surrounding controller, or null where the join cannot be changed. */
export function tryGetGridJoinContext(): GridJoinController | null {
  try {
    return getContext<GridJoinController | undefined>(KEY) ?? null;
  } catch {
    return null;
  }
}
