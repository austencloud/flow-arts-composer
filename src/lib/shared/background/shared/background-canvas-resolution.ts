import type { BackgroundController } from "@austencloud/backgrounds";
import { shouldReduceBackgroundResolution } from "$lib/shared/platform/network-conditions";

// backgrounds 0.7.12 has no public resolution option. Keep its private API
// adapter here so full-screen themes and previews use the same artwork scale.
interface BackgroundControllerResolution {
  canvasA: HTMLCanvasElement | null;
  canvasB: HTMLCanvasElement | null;
  container: HTMLElement | null;
  updateCanvasDimensions(): void;
}

const CONSTRAINED_MAX_DIMENSION = 960;

function updateCanvasDimensions(this: BackgroundControllerResolution): void {
  if (!this.canvasA || !this.canvasB || !this.container) return;

  const rect = this.container.getBoundingClientRect();
  let width = Math.max(1, Math.floor(rect.width));
  let height = Math.max(1, Math.floor(rect.height));
  // Preserve the app's data-saver policy; ordinary screens render one canvas
  // pixel per CSS pixel, avoiding the package's stretched 960 × 540 artwork.
  if (shouldReduceBackgroundResolution()) {
    const scale = Math.min(
      1,
      CONSTRAINED_MAX_DIMENSION / Math.max(width, height)
    );
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
  this.canvasA.width = width;
  this.canvasA.height = height;
  this.canvasB.width = width;
  this.canvasB.height = height;
}

export function mountBackgroundAtDisplayResolution(
  controller: BackgroundController,
  container: HTMLElement
): void {
  const adapted = controller as unknown as BackgroundControllerResolution;
  // Install before mounting so particles are seeded at the correct size too.
  adapted.updateCanvasDimensions = updateCanvasDimensions;
  controller.mount(container);
}
