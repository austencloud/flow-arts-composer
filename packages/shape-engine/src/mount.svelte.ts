/**
 * The two ways a page outside the Composer puts the engine on screen: the
 * whole matrix app, or the six-mode strip for a pick the host already holds.
 * Each returns a handle whose `update` swaps options in place (the props are
 * one `$state`, which is why this file is `.svelte.ts`) and whose `destroy`
 * leaves the host element empty.
 */
import { flushSync, mount, unmount } from "svelte";
import type {
  ElementIcons,
  FlowerPair,
  TurnValue,
  VtgMode,
} from "@tka/shape-domain";
import ShapeMatrixApp from "./app/ShapeMatrixApp.svelte";
import ElementStrip from "./components/ElementStrip.svelte";
import type {
  ShapeMatrixAppPersistence,
  ShapeMatrixAppSnapshot,
} from "./app/state/shape-matrix-app-state.svelte.js";
import type {
  ShapeEngineVariant,
  TracePick,
} from "./app/context/shape-engine-host-context.js";
import type { ShapeEngineStrings } from "./strings.svelte.js";

export type { ShapeEngineVariant, TracePick };

export interface MountShapeEngineOptions {
  variant: ShapeEngineVariant;
  persistence?: ShapeMatrixAppPersistence;
  initial?: Partial<ShapeMatrixAppSnapshot>;
  icons: ElementIcons;
  strings?: Partial<ShapeEngineStrings>;
  onTrace?: (pick: TracePick) => void;
  onBack?: () => void;
}

export interface MountHandle<O> {
  update(options: O): void;
  destroy(): void;
}

export function mountShapeEngine(
  host: HTMLElement,
  options: MountShapeEngineOptions
): MountHandle<MountShapeEngineOptions> {
  const props = $state({ ...options });
  const app = mount(ShapeMatrixApp, { target: host, props });
  // mount() defers effects and onMount; the host gets a drawn app back.
  flushSync();
  return {
    update(next) {
      Object.assign(props, next);
      flushSync();
    },
    destroy() {
      void unmount(app);
    },
  };
}

export interface MountElementStripOptions {
  pair: FlowerPair;
  mode: VtgMode;
  turns: [TurnValue, TurnValue];
  icons: ElementIcons;
  strings?: Partial<ShapeEngineStrings>;
  onChange: (mode: VtgMode) => void;
}

export function mountElementStrip(
  host: HTMLElement,
  options: MountElementStripOptions
): MountHandle<MountElementStripOptions> {
  const props = $state({ ...options });
  const strip = mount(ElementStrip, { target: host, props });
  flushSync();
  return {
    update(next) {
      Object.assign(props, next);
      flushSync();
    },
    destroy() {
      void unmount(strip);
    },
  };
}
