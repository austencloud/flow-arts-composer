import { getContext, setContext } from "svelte";
import type {
  ElementIcons,
  FlowerPair,
  TurnValue,
  VtgMode,
} from "@tka/shape-domain";

/**
 * Who mounted the engine and what it wants back. "standalone" is the public
 * /shape-engine route, "embedded" the Create module's Shape tab, and "mirror"
 * a host outside the Composer (the Poi Mirror demo) that takes a pick and
 * traces it itself, so the Composer's own Open, Save, Share and Customize
 * give way to one Trace this action.
 */
export type ShapeEngineVariant = "standalone" | "embedded" | "mirror";

/**
 * The selection a mirror host traces: the cell's two flowers, its hands mode,
 * and the matrix's [leftTurn, rightTurn] ("fl" on a float axis).
 */
export interface TracePick {
  pair: FlowerPair;
  mode: VtgMode;
  turns: [TurnValue, TurnValue];
}

/** The pick on screen, or null until a cell and a hands mode are both chosen. */
export function currentTracePick(state: {
  readonly selectedPair: FlowerPair | null;
  readonly selectedMode: VtgMode | null;
  readonly leftTurn: TurnValue;
  readonly rightTurn: TurnValue;
}): TracePick | null {
  if (!state.selectedPair || !state.selectedMode) return null;
  return {
    pair: state.selectedPair,
    mode: state.selectedMode,
    turns: [state.leftTurn, state.rightTurn],
  };
}

export interface ShapeEngineHost {
  readonly variant: ShapeEngineVariant;
  readonly icons: ElementIcons;
  readonly onTrace?: (pick: TracePick) => void;
  readonly onBack?: () => void;
}

/** Where the Composer keeps the element icons; any host without its own uses these. */
export const DEFAULT_ELEMENT_ICONS: ElementIcons = {
  water: "/images/elements/norm/water.png",
  earth: "/images/elements/norm/earth.png",
  sun: "/images/elements/norm/sun.png",
  fire: "/images/elements/norm/fire.png",
  air: "/images/elements/norm/air.png",
  moon: "/images/elements/norm/moon.png",
};

const DEFAULT_HOST: ShapeEngineHost = {
  variant: "standalone",
  icons: DEFAULT_ELEMENT_ICONS,
};

const SHAPE_ENGINE_HOST_CONTEXT = Symbol("shape-engine-host");

export function setShapeEngineHostContext(host: ShapeEngineHost): void {
  setContext(SHAPE_ENGINE_HOST_CONTEXT, host);
}

/** The mounting host, or the standalone defaults for a chip row used on its own. */
export function getShapeEngineHostContext(): ShapeEngineHost {
  return (
    getContext<ShapeEngineHost | undefined>(SHAPE_ENGINE_HOST_CONTEXT) ??
    DEFAULT_HOST
  );
}

/**
 * The icon for an element name. The Composer's element records widen the name
 * to any string (the store's "cover" frame), so an unknown name gets no icon.
 */
export function elementIcon(icons: ElementIcons, element: string): string {
  return (icons as Readonly<Record<string, string>>)[element] ?? "";
}
