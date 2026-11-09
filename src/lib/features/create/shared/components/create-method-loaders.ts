/**
 * The code each Create method needs before its workspace can be shown.
 *
 * The workspace layout and the method panels are separate chunks, so the
 * Create front door paints without any editor code. Fetched only when a card
 * was tapped, they arrived while the fade was already running: the fade landed
 * on a loading bar, then a spinner, then the panel. The front door warms them
 * ahead of the tap instead (one at a time on idle, or at once when a card is
 * pointed at), and the panel slot mounts through the same loaders, so a warmed
 * chunk is the module that mounts.
 *
 * Construct has no entry: its panel is part of the layout chunk.
 */
import type { Component } from "svelte";
import { whenMotionSettled } from "#lib/shared/foundation/utils/background-scheduling.js";

type ComponentModule = { default: Component<any> };

export const loadWorkspaceLayout = () =>
  import("./StandardWorkspaceLayout.svelte");

export const CREATE_METHOD_PANEL_LOADERS: Readonly<
  Record<string, () => Promise<ComponentModule>>
> = {
  generate: () => import("../../generate/components/GeneratePanel.svelte"),
  assemble: () => import("../../assemble/components/AssembleToolPanel.svelte"),
  fuse: () => import("#lib/features/fuse/FuseTab.svelte"),
  tunnel: () => import("../../tunnel/TunnelTab.svelte"),
  "shape-engine": () => import("../../shape-engine/ShapeEngineTab.svelte"),
};

// Browsers keep a module once imported; these only remember which warms have
// started and which have landed, so a card hovered twice fetches once and the
// slot can tell a landed chunk from one still on the way.
const started = new Map<string, Promise<unknown>>();
const landed = new Set<string>();

function warm(key: string, load: () => Promise<unknown>): Promise<unknown> {
  let pending = started.get(key);
  if (!pending) {
    pending = load().then(
      () => {
        landed.add(key);
      },
      () => {
        // A failed warm is forgotten so the real mount retries and owns the
        // visible error state.
        started.delete(key);
      }
    );
    started.set(key, pending);
  }
  return pending;
}

export function warmWorkspaceLayout(): Promise<unknown> {
  return warm("layout", loadWorkspaceLayout);
}

/**
 * The sequence area under the layout. The layout prefetches it once mounted,
 * which used to be just after the tap: its stylesheet then landed mid-entry
 * and restyled the whole page under the arriving pieces.
 */
export function warmWorkspaceArea(): Promise<unknown> {
  return warm("workspace-area", () => import("./CreationWorkspaceArea.svelte"));
}

export function warmCreateMethod(methodId: string): Promise<unknown> {
  const loader = CREATE_METHOD_PANEL_LOADERS[methodId];
  // Construct (and an unknown id) needs only the layout.
  return loader ? warm(methodId, loader) : warmWorkspaceLayout();
}

/** True once this method's panel chunk is in the browser's module map. */
export function isCreateMethodWarm(methodId: string): boolean {
  return landed.has(methodId);
}

/**
 * Runs warms one after another, each in its own idle period, so the front
 * door's turning previews never share a frame with two chunk evaluations.
 * Returns a cancel for the warms not yet started.
 */
export function warmInIdleSequence(
  warms: readonly (() => Promise<unknown>)[]
): () => void {
  let cancelled = false;
  let cancelPending = (): void => {};
  const next = (index: number): void => {
    const run = warms[index];
    if (cancelled || !run) return;
    const go = () =>
      void whenMotionSettled()
        .then(run)
        .finally(() => next(index + 1));
    if (typeof requestIdleCallback === "undefined") {
      const handle = setTimeout(go, 200);
      cancelPending = () => clearTimeout(handle);
      return;
    }
    const handle = requestIdleCallback(go, { timeout: 2000 });
    cancelPending = () => cancelIdleCallback(handle);
  };
  next(0);
  return () => {
    cancelled = true;
    cancelPending();
  };
}
