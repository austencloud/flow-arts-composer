/**
 * rasterize-node.ts
 *
 * Generic offscreen rasterizer: mounts a Svelte component into a fixed,
 * off-screen container, waits for fonts + one animation frame, snapshots it
 * with modern-screenshot's domToCanvas, and returns an ImageBitmap.
 *
 * Modeled on card-back-dom-renderer.ts, but with two deliberate differences:
 *   1. Output is an ImageBitmap (worker-transferable), not an HTMLCanvasElement.
 *   2. Settling waits on `document.fonts.ready` + one rAF instead of a fixed
 *      setTimeout(200) — deterministic, no arbitrary delay.
 *
 * The container is given `container-type: inline-size` and an explicit
 * `containerWidth` so that `cqi`-based CSS inside the mounted markup resolves
 * against the real card render width. The output crop is governed by `w`/`h`
 * (the element's own layout box), independent of `containerWidth`.
 */

import { mount, unmount } from "svelte";

export interface RasterizeOptions {
  /**
   * Inline-size of the container for `cqi` resolution. Defaults to `w`.
   * For card-back brand/url/loop elements pass the real card render width
   * (1644) so cqi units match the live card.
   */
  containerWidth?: number;
  /** Output device pixel scale passed to domToCanvas. Defaults to 1. */
  scale?: number;
  /**
   * Number of animation frames to wait AFTER `document.fonts.ready` before
   * snapshotting. Defaults to 1 (the original behavior). Components that mount
   * a child which itself kicks off async work in an `$effect` (e.g.
   * StartPlacementPictograph → PictographRenderer, which loads grid/prop/arrow
   * SVGs after its prep `$effect` resolves) need more frames so the downstream
   * markup is in the DOM before the screenshot. Each extra frame also lets any
   * pending microtask-resolved `$state` (resolved-from-cache prepares) flush.
   */
  settleFrames?: number;
  /**
   * Extra milliseconds to wait after the settle frames before snapshotting.
   * Defaults to 0. The production full-card renderer
   * (card-back-dom-renderer.ts) uses `2 rAF + setTimeout(200)` to let the async
   * pictograph finish loading its grid/prop/arrow SVGs; pass `settleMs: 200`
   * (with `settleFrames: 2`) to match that budget for the standalone
   * pictograph rasterizer.
   */
  settleMs?: number;
  /**
   * When true, ignore the passed `h` crop and snapshot the mounted root at its
   * NATURAL content height (measured via the container's `scrollHeight` /
   * mounted root `getBoundingClientRect().height` after settle). Use this for
   * flex-column slots whose block size is text-flow driven (brand / url): a
   * fixed `h` crops the last line. The returned bitmap's `.height` reflects the
   * measured content height so callers can anchor by it.
   */
  naturalHeight?: boolean;
  /**
   * CSS custom properties to set on the container, inherited by the mounted
   * component. The live card sets `--card-text` / `--card-text-muted` on `.back`;
   * components mounted bare (ReversalPatternGlyph empty dots, StartPlacementPictograph
   * border) otherwise fall back to a near-white value and vanish on the white proof
   * background. Pass the proof theme's muted/text colors here.
   */
  cssVars?: Record<string, string>;
  /**
   * Replicate the `.glyph-box` flex context (align-items:flex-end;
   * justify-content:center) so a corner glyph sits bottom-center within its box,
   * matching CardBack.svelte. Default "none" = top-left natural flow.
   */
  align?: "none" | "end-center";
}

/** Resolve after `frames` consecutive animation frames. */
async function waitFrames(frames: number): Promise<void> {
  for (let i = 0; i < Math.max(0, frames); i++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }
}

/**
 * Mount `Comp` with `props`, rasterize a `w`×`h` region to an ImageBitmap.
 *
 * @param Comp   A Svelte 5 component (mount-compatible).
 * @param props  Props passed to the component.
 * @param w      Output crop width in px (the element's layout box width).
 * @param h      Output crop height in px (the element's layout box height).
 * @param opts   See RasterizeOptions.
 */
export async function rasterizeComponent(
  Comp: unknown,
  props: Record<string, unknown>,
  w: number,
  h: number,
  opts: RasterizeOptions = {},
): Promise<ImageBitmap> {
  const containerWidth = opts.containerWidth ?? w;
  const scale = opts.scale ?? 1;
  const settleFrames = opts.settleFrames ?? 1;
  const settleMs = opts.settleMs ?? 0;
  const naturalHeight = opts.naturalHeight ?? false;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "-99999px";
  container.style.width = `${containerWidth}px`;
  // Natural-height mode lets the mounted content drive the box height: don't pin
  // a fixed height and don't crop, so the full flex-column (incl. the last line)
  // is laid out and measurable. Fixed-height mode keeps the original crop box.
  if (!naturalHeight) {
    container.style.height = `${h}px`;
    container.style.overflow = "hidden";
  }
  container.style.containerType = "inline-size";
  if (opts.align === "end-center") {
    container.style.display = "flex";
    container.style.alignItems = "flex-end";
    container.style.justifyContent = "center";
  }
  if (opts.cssVars) {
    for (const [k, v] of Object.entries(opts.cssVars)) {
      container.style.setProperty(k, v);
    }
  }
  document.body.appendChild(container);

  let component: ReturnType<typeof mount> | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component = mount(Comp as any, { target: container, props });

    // Deterministic settle: fonts loaded + `settleFrames` paint frames.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    await waitFrames(settleFrames);
    if (settleMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, settleMs));
    }

    // In natural-height mode, measure the laid-out content and snapshot at that
    // height so nothing is cropped. The mounted root is the container's first
    // element child (the slot's root <div>); fall back to the container box.
    let cropH = h;
    if (naturalHeight) {
      const root = container.firstElementChild as HTMLElement | null;
      const measured =
        root?.getBoundingClientRect().height ||
        root?.offsetHeight ||
        container.scrollHeight ||
        h;
      cropH = Math.ceil(measured);
    }

    const { domToCanvas } = await import("modern-screenshot");
    const canvas = await domToCanvas(container, { width: w, height: cropH, scale });

    return await createImageBitmap(canvas);
  } finally {
    if (component) {
      try {
        unmount(component);
      } catch {
        /* component already torn down */
      }
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}
