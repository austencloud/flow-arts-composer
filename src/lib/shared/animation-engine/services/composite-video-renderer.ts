/**
 * Composite Video Renderer Implementation
 *
 * Renders composite video frames with animation + grid side-by-side
 * and synchronized gold beat highlighting.
 *
 * Performance Optimization:
 * - Grid is rendered once and cached in an offscreen canvas
 * - Each frame only composites cached grid + current animation + highlight
 */

export interface CompositeDimensions {
  width: number;
  height: number;
}

export interface CompositeLayoutOptions {
  orientation: "horizontal" | "vertical";
  gridStepSize: number; // Size of each beat cell in pixels
  includeStartPlacement: boolean;
  showStepNumbers: boolean;
}

export interface StepGridPlacement {
  col: number; // Column index (0-based)
  row: number; // Row index (0-based)
  x: number; // Pixel X coordinate
  y: number; // Pixel Y coordinate
  width: number; // Beat cell width
  height: number; // Beat cell height
}
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ImageComposer } from "../../render/services/image-composer";
import { calculateLayout } from "$lib/shared/render/services/layout-calculator";

export class CompositeVideoRenderer {
  private sequence: SequenceData | null = null;
  private options: CompositeLayoutOptions | null = null;
  private cachedGridCanvas: HTMLCanvasElement | null = null;
  private dimensions: CompositeDimensions | null = null;
  private gridDimensions: { width: number; height: number } | null = null;
  private gridLayout: [number, number] | null = null; // [columns, rows] from layout-calculator

  constructor(
    private imageComposer: ImageComposer
  ) {}

  async initialize(
    sequence: SequenceData,
    options: CompositeLayoutOptions
  ): Promise<void> {
    this.sequence = sequence;
    this.options = options;

    // Calculate grid layout using the same LayoutCalculator as ImageComposer
    // This ensures consistent grid dimensions between what we expect and what ImageComposer renders
    const stepCount = sequence.steps.length;
    const cellSize = options.gridStepSize;

    // Use LayoutCalculator to get exact same [columns, rows] as ImageComposer
    const [cols, rows] = calculateLayout(
      stepCount,
      options.includeStartPlacement
    );
    this.gridLayout = [cols, rows];

    this.gridDimensions = {
      width: cols * cellSize,
      height: rows * cellSize,
    };

    // Calculate composite dimensions based on orientation
    if (options.orientation === "horizontal") {
      // Side-by-side: [animation | grid]
      // Use 1:1 aspect ratio for each pane
      const paneSize = Math.max(
        this.gridDimensions.width,
        this.gridDimensions.height
      );
      this.dimensions = {
        width: paneSize * 2, // Two panes
        height: paneSize,
      };
    } else {
      // Stacked: [animation] / [grid]
      const paneSize = Math.max(
        this.gridDimensions.width,
        this.gridDimensions.height
      );
      this.dimensions = {
        width: paneSize,
        height: paneSize * 2, // Two panes
      };
    }
  }

  async cacheStaticGrid(): Promise<void> {
    if (!this.sequence || !this.options || !this.gridDimensions) {
      throw new Error("CompositeVideoRenderer not initialized");
    }

    // Create offscreen canvas for grid
    this.cachedGridCanvas = document.createElement("canvas");
    this.cachedGridCanvas.width = this.gridDimensions.width;
    this.cachedGridCanvas.height = this.gridDimensions.height;

    // Render grid using ImageComposer
    // Options match SequenceExportOptions interface to ensure no header/footer is added
    const renderOptions = {
      stepSize: this.options.gridStepSize,
      addStepNumbers: this.options.showStepNumbers,
      includeStartPlacement: this.options.includeStartPlacement,
      // Disable header (word/difficulty) and footer (user info) to get grid-only output
      addWord: false,
      addDifficultyLevel: false,
      addUserInfo: false,
      showNotes: false,
      // Other required fields with sensible defaults
      addReversalSymbols: true,
      combinedGrids: false,
      stepScale: 1,
      margin: 0,
      rightVisible: true,
      leftVisible: true,
      notes: "",
      format: "PNG" as const,
      quality: 1,
      scale: 1,
    };

    const renderedGrid = await this.imageComposer.composeSequenceImage(
      this.sequence,
      renderOptions
    );

    // Copy to cached canvas
    const ctx = this.cachedGridCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");

    ctx.drawImage(renderedGrid, 0, 0);
  }

  renderCompositeFrame(
    animationCanvas: HTMLCanvasElement,
    currentStep: number,
    targetCanvas: HTMLCanvasElement
  ): void {
    if (!this.cachedGridCanvas || !this.dimensions || !this.options) {
      throw new Error(
        "CompositeVideoRenderer not initialized or grid not cached"
      );
    }

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");

    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

    // Set black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    if (this.options.orientation === "horizontal") {
      // Horizontal layout: [animation | grid]
      const halfWidth = this.dimensions.width / 2;

      // Draw animation on left half (centered and scaled to fit)
      this.drawCenteredImage(
        ctx,
        animationCanvas,
        0,
        0,
        halfWidth,
        this.dimensions.height
      );

      // Draw grid on right half
      this.drawCenteredImage(
        ctx,
        this.cachedGridCanvas,
        halfWidth,
        0,
        halfWidth,
        this.dimensions.height
      );

      // Draw beat highlight on grid pane
      const stepPos = this.getStepGridPlacement(currentStep);
      this.drawStepHighlight(ctx, stepPos, halfWidth, 0);
    } else {
      // Vertical layout: [animation] / [grid]
      const halfHeight = this.dimensions.height / 2;

      // Draw animation on top half
      this.drawCenteredImage(
        ctx,
        animationCanvas,
        0,
        0,
        this.dimensions.width,
        halfHeight
      );

      // Draw grid on bottom half
      this.drawCenteredImage(
        ctx,
        this.cachedGridCanvas,
        0,
        halfHeight,
        this.dimensions.width,
        halfHeight
      );

      // Draw beat highlight on grid pane
      const stepPos = this.getStepGridPlacement(currentStep);
      this.drawStepHighlight(ctx, stepPos, 0, halfHeight);
    }
  }

  getStepGridPlacement(stepIndex: number): StepGridPlacement {
    if (!this.sequence || !this.options || !this.gridDimensions || !this.gridLayout) {
      throw new Error("CompositeVideoRenderer not initialized");
    }

    const cellSize = this.options.gridStepSize;

    // Use the stored grid layout from LayoutCalculator (same as ImageComposer uses)
    const [cols] = this.gridLayout;

    // Account for start position offset if included
    const offset = this.options.includeStartPlacement ? 1 : 0;
    const adjustedStepIndex = stepIndex + offset;

    // Calculate column and row
    const col = adjustedStepIndex % cols;
    const row = Math.floor(adjustedStepIndex / cols);

    // Calculate pixel coordinates
    const x = col * cellSize;
    const y = row * cellSize;

    return {
      col,
      row,
      x,
      y,
      width: cellSize,
      height: cellSize,
    };
  }

  getCompositeDimensions(): CompositeDimensions {
    if (!this.dimensions) {
      throw new Error("CompositeVideoRenderer not initialized");
    }
    return { ...this.dimensions };
  }

  dispose(): void {
    this.cachedGridCanvas = null;
    this.sequence = null;
    this.options = null;
    this.dimensions = null;
    this.gridDimensions = null;
    this.gridLayout = null;
  }


  /**
   * Draw an image centered within a bounding box (maintains aspect ratio)
   */
  private drawCenteredImage(
    ctx: CanvasRenderingContext2D,
    image: HTMLCanvasElement,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number
  ): void {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    const offsetX = x + (maxWidth - scaledWidth) / 2;
    const offsetY = y + (maxHeight - scaledHeight) / 2;

    ctx.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight);
  }

  /**
   * Draw gold highlight around current beat cell
   * Matches workspace preview styling (gold stroke + subtle fill)
   */
  private drawStepHighlight(
    ctx: CanvasRenderingContext2D,
    stepPos: StepGridPlacement,
    offsetX: number,
    offsetY: number
  ): void {
    if (!this.gridDimensions || !this.dimensions) return;

    // Calculate scale factor for grid within composite pane
    const paneWidth =
      this.options!.orientation === "horizontal"
        ? this.dimensions.width / 2
        : this.dimensions.width;
    const paneHeight =
      this.options!.orientation === "horizontal"
        ? this.dimensions.height
        : this.dimensions.height / 2;

    const scale = Math.min(
      paneWidth / this.gridDimensions.width,
      paneHeight / this.gridDimensions.height
    );

    // Center offset for scaled grid
    const gridOffsetX =
      offsetX + (paneWidth - this.gridDimensions.width * scale) / 2;
    const gridOffsetY =
      offsetY + (paneHeight - this.gridDimensions.height * scale) / 2;

    // Calculate highlight position and size
    const highlightX = gridOffsetX + stepPos.x * scale;
    const highlightY = gridOffsetY + stepPos.y * scale;
    const highlightWidth = stepPos.width * scale;
    const highlightHeight = stepPos.height * scale;

    // Gold highlight (matching workspace style)
    const goldColor = "#FFD700"; // Gold
    const padding = 4;

    // Draw subtle fill
    ctx.fillStyle = `${goldColor}20`; // 20 = ~12% opacity
    ctx.fillRect(
      highlightX + padding,
      highlightY + padding,
      highlightWidth - padding * 2,
      highlightHeight - padding * 2
    );

    // Draw gold stroke
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(
      highlightX + padding,
      highlightY + padding,
      highlightWidth - padding * 2,
      highlightHeight - padding * 2
    );
  }
}
