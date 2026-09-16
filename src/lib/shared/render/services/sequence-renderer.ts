import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import { getBaseBeatSize } from "./layout-calculator";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import { ImageComposer } from "./image-composer";
import type { CompositionProgressCallback, RenderCanvas } from "./types";
import type { ImageFormatConverter } from "./image-format-converter";

export class SequenceRenderer {
  constructor(
    private compositionService: ImageComposer,
    private formatService: ImageFormatConverter
  ) {}

  async renderSequenceToCanvas(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions> = {},
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal
  ): Promise<RenderCanvas> {
    if (!sequence) {
      throw new Error("Sequence data is required for rendering");
    }

    try {
      const fullOptions = this.mergeWithDefaults(options);

      const validation = this.validateRender(sequence, fullOptions);
      if (!validation.valid) {
        throw new Error(
          `Render validation failed: ${validation.errors.join(", ")}`
        );
      }

      const canvas = fullOptions.cardMode
        ? await this.compositionService.composeCardImage(
            sequence,
            fullOptions,
            onProgress,
            signal
          )
        : await this.compositionService.composeSequenceImage(
            sequence,
            fullOptions,
            onProgress,
            signal
          );

      return canvas;
    } catch (error) {
      throw new Error(
        `Sequence rendering failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async renderSequenceToBlob(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions> = {},
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal
  ): Promise<Blob> {
    if (!sequence) {
      throw new Error("Sequence data is required for rendering");
    }

    try {
      const fullOptions = this.mergeWithDefaults(options);

      const canvas = await this.renderSequenceToCanvas(
        sequence,
        fullOptions,
        onProgress,
        signal
      );

      let blob: Blob;
      if (canvas instanceof OffscreenCanvas) {
        const fmt = fullOptions.format.toLowerCase();
        const mimeType = fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
        blob = await canvas.convertToBlob({ type: mimeType, quality: fullOptions.quality });
      } else {
        blob = await this.formatService.canvasToBlob(canvas as HTMLCanvasElement, {
          format: fullOptions.format.toLowerCase() as "png" | "jpeg" | "webp",
          quality: fullOptions.quality,
          ...(fullOptions.width !== undefined
            ? { width: fullOptions.width }
            : {}),
          ...(fullOptions.height !== undefined
            ? { height: fullOptions.height }
            : {}),
        });
      }

      return blob;
    } catch (error) {
      throw new Error(
        `Blob rendering failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async generatePreview(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions> = {}
  ): Promise<string> {
    if (!sequence) {
      throw new Error("Sequence data is required for preview generation");
    }

    try {
      const previewOptions = this.mergeWithDefaults({
        stepScale: options.stepScale ?? 0.5, 
        quality: options.quality ?? 0.8, 
        ...options, 
      });

      const canvas = await this.renderSequenceToCanvas(
        sequence,
        previewOptions
      );

      if (canvas instanceof OffscreenCanvas) {
        const fmt = previewOptions.format.toLowerCase();
        const mimeType = fmt === "jpeg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
        const blob = await canvas.convertToBlob({ type: mimeType, quality: previewOptions.quality });
        return URL.createObjectURL(blob);
      }
      return this.formatService.canvasToDataURL(canvas as HTMLCanvasElement, {
        format: previewOptions.format.toLowerCase() as "png" | "jpeg" | "webp",
        quality: previewOptions.quality,
        ...(previewOptions.width !== undefined
          ? { width: previewOptions.width }
          : {}),
        ...(previewOptions.height !== undefined
          ? { height: previewOptions.height }
          : {}),
      });
    } catch (error) {
      throw new Error(
        `Preview generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  validateRender(
    sequence: SequenceData,
    options: SequenceExportOptions
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!sequence) {
      errors.push("Sequence data is required");
    } else {
      if (!sequence.steps || sequence.steps.length === 0) {
        errors.push("Sequence must contain at least one beat");
      }
    }

    if (options.width && options.width <= 0) {
      errors.push("Width must be positive");
    }
    if (options.height && options.height <= 0) {
      errors.push("Height must be positive");
    }
    if (options.quality && (options.quality < 0 || options.quality > 1)) {
      errors.push("Quality must be between 0 and 1");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getDefaultOptions(): SequenceExportOptions {
    return {
      includeStartPlacement: true,
      addStepNumbers: true,
      addReversalSymbols: true,
      addUserInfo: true,
      showNotes: true,
      addWord: true,
      combinedGrids: false,
      addDifficultyLevel: true,

      stepScale: 1.0,
      stepSize: getBaseBeatSize(),
      margin: 0, 

      rightVisible: true,
      leftVisible: true,

      notes: "",

      format: "PNG",
      quality: 1.0,
      scale: 1.0,
      backgroundColor: "#FFFFFF",
    };
  }

  async batchRender(
    sequences: SequenceData[],
    options: SequenceExportOptions
  ): Promise<RenderCanvas[]> {
    if (!sequences || sequences.length === 0) {
      throw new Error("At least one sequence is required for batch rendering");
    }

    try {
      const canvases: RenderCanvas[] = [];

      for (const sequence of sequences) {
        const canvas = await this.renderSequenceToCanvas(sequence, options);
        canvases.push(canvas);
      }

      return canvases;
    } catch (error) {
      throw new Error(
        `Batch rendering failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private mergeWithDefaults(
    options: Partial<SequenceExportOptions>
  ): SequenceExportOptions {
    const defaults = this.getDefaultOptions();
    return { ...defaults, ...options };
  }
}

import { imageFormatConverter } from "./image-format-converter";
import { textRenderer } from "./text-renderer";
import { pictographKeyHasher } from "./pictograph-key-hasher";
import { pictographMemoryCache } from "./pictograph-memory-cache";
import { canvas2DDirectRenderer } from "./canvas-2d-direct-renderer";
import { layerCompositor } from "./layer-compositor";
import { pictographBlobCache } from "./pictograph-blob-cache";

export const sequenceRenderer = new SequenceRenderer(
  new ImageComposer(
    textRenderer,
    pictographBlobCache,
    pictographKeyHasher,
    pictographMemoryCache,
    canvas2DDirectRenderer,
    layerCompositor
  ),
  imageFormatConverter
);
