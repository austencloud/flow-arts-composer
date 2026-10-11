/**
 * Canvas2D Application Manager
 *
 * Handles canvas lifecycle:
 * - Initialization and configuration
 * - Canvas management
 * - Resize operations
 * - Cleanup and disposal
 *
 * Single Responsibility: Canvas setup and lifecycle
 */

// Dark Mode background color (near-black)
export const DARK_MODE_BACKGROUND = "#0a0a0f";
// Light Mode background - 85% off-white to reduce eye strain
export const LIGHT_MODE_BACKGROUND = "#f5f5f5";
// Transition duration synced with pictograph transitions (150ms)
const BACKGROUND_TRANSITION_DURATION = 150;

/**
 * Parse hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result?.[1] || !result[2] || !result[3]) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

/**
 * Interpolate between two colors
 */
function interpolateColor(from: string, to: string, progress: number): string {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  return rgbToHex(
    fromRgb.r + (toRgb.r - fromRgb.r) * progress,
    fromRgb.g + (toRgb.g - fromRgb.g) * progress,
    fromRgb.b + (toRgb.b - fromRgb.b) * progress
  );
}

export class Canvas2DApplicationManager {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentSize: number = 500;
  private dpr: number = 1;
  private maxDpr: number = Infinity;
  private backgroundAlpha: number = 1;
  private paintBackground: boolean = true;
  private isInitialized: boolean = false;
  private darkModeEnabled: boolean = false;

  // Background transition state
  private bgTransitionStartTime: number = 0;
  private bgTransitionFromColor: string = LIGHT_MODE_BACKGROUND;
  private bgTransitionToColor: string = LIGHT_MODE_BACKGROUND;
  private currentBgColor: string = LIGHT_MODE_BACKGROUND;

  async initialize(
    container: HTMLElement,
    size: number,
    backgroundAlpha: number = 1,
    paintBackground: boolean = true
  ): Promise<void> {
    if (this.isInitialized) {
      console.warn("[Canvas2DApplicationManager] Already initialized");
      return;
    }

    this.currentSize = size;
    this.backgroundAlpha = backgroundAlpha;
    this.paintBackground = paintBackground;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);

    // Create canvas element with DPI-aware backing store
    // Physical pixels = logical size * devicePixelRatio for sharp rendering on high-DPI screens
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.animationLayer = "props";
    this.canvas.width = Math.floor(size * this.dpr);
    this.canvas.height = Math.floor(size * this.dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    // When the canvas is transparent (paintBackground=false) it needs to be a
    // positioned stacking context so overlay canvases at z<3 render *below*
    // it in non-prop pixels. The wrapper supplies the background color.
    if (!paintBackground) {
      this.canvas.style.position = "relative";
      this.canvas.style.zIndex = "3";
      this.canvas.style.background = "transparent";
    }

    // Get 2D context with alpha support based on backgroundAlpha
    // NOTE: desynchronized intentionally omitted - it causes visible tearing
    // (colored strip artifacts) on Android Chrome PWA due to front-buffer rendering
    // When paintBackground=false the canvas must have an alpha channel so
    // non-prop pixels stay transparent (so overlays behind props show through).
    this.ctx = this.canvas.getContext("2d", {
      alpha: backgroundAlpha < 1 || !paintBackground,
    });

    if (!this.ctx) {
      throw new Error("Failed to get 2D rendering context");
    }

    // Scale context so all drawing operations use logical pixels
    // The DPR scaling is transparent to all consumers of getCurrentSize()
    this.ctx.scale(this.dpr, this.dpr);

    // Enable high-quality image rendering
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    // Append canvas to container
    container.appendChild(this.canvas);

    this.isInitialized = true;
  }

  resize(newSize: number): void {
    if (!this.isInitialized || !this.canvas || !this.ctx) return;

    this.currentSize = newSize;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.canvas.width = Math.floor(newSize * this.dpr);
    this.canvas.height = Math.floor(newSize * this.dpr);

    // Re-apply context settings after resize (they reset when canvas dimensions change)
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  /**
   * Cap the device pixel ratio for quality adaptation.
   * Lower DPR = fewer pixels to render = faster frames.
   * Triggers a resize to apply immediately.
   */
  setMaxDpr(maxDpr: number): void {
    if (maxDpr === this.maxDpr) return;
    this.maxDpr = maxDpr;
    // Re-apply if already initialized
    if (this.isInitialized) {
      this.resize(this.currentSize);
    }
  }

  /**
   * Clear the canvas and optionally fill with background
   * Uses interpolated background color during dark mode transitions
   */
  clear(): void {
    if (!this.ctx || !this.canvas) return;

    // Clear entire canvas using logical size (context is DPR-scaled)
    this.ctx.clearRect(0, 0, this.currentSize, this.currentSize);

    // Update background color transition if in progress
    this.updateBackgroundTransition();

    // Fill with current (possibly transitioning) background color.
    // Skipped when paintBackground=false - the wrapper provides the background
    // color via CSS so overlay canvases placed underneath (z<3) show through
    // non-prop areas of this canvas.
    if (this.paintBackground && this.backgroundAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = this.backgroundAlpha;
      this.ctx.fillStyle = this.currentBgColor;
      this.ctx.fillRect(0, 0, this.currentSize, this.currentSize);
      this.ctx.restore();
    }
  }

  /**
   * Update background color transition progress
   * Uses ease-out timing to match CSS transitions
   */
  private updateBackgroundTransition(): void {
    if (this.bgTransitionStartTime === 0) return;

    const elapsed = performance.now() - this.bgTransitionStartTime;
    const progress = Math.min(elapsed / BACKGROUND_TRANSITION_DURATION, 1);

    // Apply ease-out timing function: 1 - (1 - t)^2
    const easedProgress = 1 - Math.pow(1 - progress, 2);

    this.currentBgColor = interpolateColor(
      this.bgTransitionFromColor,
      this.bgTransitionToColor,
      easedProgress
    );

    // Clear transition state when complete
    if (progress >= 1) {
      this.bgTransitionStartTime = 0;
      this.currentBgColor = this.bgTransitionToColor;
    }
  }

  /**
   * Check if background transition is in progress
   */
  isBackgroundTransitioning(): boolean {
    return this.bgTransitionStartTime > 0;
  }

  /**
   * Set Dark Mode (dark background)
   * Initiates a smooth background color transition
   * @param enabled - Whether dark mode is enabled
   * @param animate - Whether to animate the transition (default: true)
   *                  Set to false for initial sync to avoid flash
   */
  setDarkMode(enabled: boolean, animate: boolean = true): void {
    if (this.darkModeEnabled === enabled) return;

    this.darkModeEnabled = enabled;

    // Determine target color
    const targetColor = enabled ? DARK_MODE_BACKGROUND : LIGHT_MODE_BACKGROUND;

    if (animate && this.currentBgColor !== targetColor) {
      // Animate transition
      this.bgTransitionFromColor = this.currentBgColor;
      this.bgTransitionToColor = targetColor;
      this.bgTransitionStartTime = performance.now();
    } else {
      // Instant change (for initial sync)
      this.currentBgColor = targetColor;
      this.bgTransitionStartTime = 0;
    }
  }

  /**
   * Check if Dark Mode is enabled
   */
  isDarkModeEnabled(): boolean {
    return this.darkModeEnabled;
  }

  getContext(): CanvasRenderingContext2D | null {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  getCurrentSize(): number {
    return this.currentSize;
  }

  isReady(): boolean {
    return this.isInitialized && this.canvas !== null && this.ctx !== null;
  }

  /**
   * Capture current canvas as ImageBitmap
   */
  async captureFrame(): Promise<ImageBitmap> {
    if (!this.canvas) {
      throw new Error("Canvas not initialized");
    }
    return createImageBitmap(this.canvas);
  }

  destroy(): void {
    if (!this.canvas) return;

    // Remove from DOM
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }

    // CRITICAL: Set dimensions to 0 to release pixel buffer memory
    this.canvas.width = 0;
    this.canvas.height = 0;

    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
  }
}
