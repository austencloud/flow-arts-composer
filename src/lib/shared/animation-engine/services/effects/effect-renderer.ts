import { computeEffectScale } from "$lib/shared/effects/renderers/scale";

/**
 * Structural contract every effect renderer satisfies — canvas2d overlays
 * (via the EffectRenderer base), WebGL fire/charcoal/led, and the trail
 * overlay. Promoted from the inline OverlayRenderer interface that lived in
 * EffectRendererManager so the registry can hold every renderer uniformly.
 */
export interface EffectRendererLike {
  initialize(container: HTMLElement, w: number, h: number): boolean;
  dispose(): void;
  isInitialized(): boolean;
  resize?(w: number, h: number): void;
  setCanvasZIndex?(z: number): void;
}

/**
 * Abstract base for absolutely-positioned Canvas2D overlay renderers.
 *
 * Owns the canvas lifecycle that all 12 canvas2d overlays previously
 * copy-pasted (create/style/append/resize/clear/visibility/z-index/dispose).
 * Subclasses implement renderFrame() and may override the onInitialized /
 * onClear / onDispose hooks and the zIndex getter for the small per-effect
 * variations (inner-renderer disposal, z-index band, post-init seeding).
 */
export abstract class EffectRenderer implements EffectRendererLike {
  protected canvas: HTMLCanvasElement | null = null;
  protected ctx: CanvasRenderingContext2D | null = null;
  protected width = 0;
  protected height = 0;
  protected scale = 1;

  /** z-index band; bloom/echo/sparkles overlays composite at "2". Override if needed. */
  protected get zIndex(): string {
    return "2";
  }

  initialize(container: HTMLElement, width: number, height: number): boolean {
    this.dispose();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.animationLayer = "effect";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = this.zIndex;
    canvas.style.background = "transparent";

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.scale = computeEffectScale(width, height);
    this.onInitialized();
    return true;
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
    this.scale = computeEffectScale(width, height);
  }

  clear(): void {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.onClear();
  }

  setVisible(visible: boolean): void {
    if (!this.canvas) return;
    this.canvas.style.display = visible ? "" : "none";
  }

  setCanvasZIndex(z: number): void {
    if (this.canvas) this.canvas.style.zIndex = String(z);
  }

  dispose(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.onDispose();
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.scale = 1;
  }

  isInitialized(): boolean {
    return this.canvas !== null && this.ctx !== null;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** Hook: end of a successful initialize(). Override to seed inner-renderer state. */
  protected onInitialized(): void {}
  /** Hook: called by clear() after clearRect. Override to reset the inner renderer. */
  protected onClear(): void {}
  /** Hook: called by dispose() before refs are nulled. Override to dispose the inner renderer. */
  protected onDispose(): void {}
}
