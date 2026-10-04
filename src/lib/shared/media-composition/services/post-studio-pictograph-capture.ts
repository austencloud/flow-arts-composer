import type * as ModernScreenshot from "modern-screenshot";
import { POST_STUDIO_DOM_CAPTURE_OPTIONS } from "$lib/shared/media-composition/services/post-studio-dom-capture";

function resolvedStyleProperties(element: HTMLElement): string[] {
  const computed = getComputedStyle(element);
  const properties: string[] = [];
  for (let index = 0; index < computed.length; index++) {
    const name = computed.item(index);
    if (name && !name.startsWith("--")) properties.push(name);
  }
  return properties;
}

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
          // Computed standard properties already contain resolved var() values.
          // Copying inherited custom tokens into every cloned child dominates
          // capture time without changing those painted values.
          includeStyleProperties: resolvedStyleProperties(element),
          ...POST_STUDIO_DOM_CAPTURE_OPTIONS,
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
