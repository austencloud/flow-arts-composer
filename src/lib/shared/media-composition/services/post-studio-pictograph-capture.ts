import type * as ModernScreenshot from "modern-screenshot";

/** Reuses screenshot setup while cloning the current motion DOM for every frame. */
export class PostStudioPictographCapture {
  private context: ModernScreenshot.Context<HTMLElement> | null = null;
  private screenshot: typeof ModernScreenshot | null = null;

  async capture(
    element: HTMLElement,
    width: number,
    height: number,
    scale: number
  ): Promise<HTMLCanvasElement> {
    try {
      if (
        this.context &&
        (this.context.node !== element ||
          this.context.width !== width ||
          this.context.height !== height ||
          this.context.scale !== scale)
      ) {
        this.dispose();
      }

      const screenshot =
        this.screenshot ??
        (this.screenshot = await import("modern-screenshot"));
      if (!this.context) {
        this.context = await screenshot.createContext(element, {
          width,
          height,
          scale,
        });
      }
      return await screenshot.domToCanvas(this.context);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.context && this.screenshot) {
      this.screenshot.destroyContext(this.context);
    }
    this.context = null;
  }
}
