import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
import type { SequenceRenderer } from "$lib/shared/render/services/sequence-renderer";
import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { ShareOptions } from "../domain/models/share-options";
import { PreviewCache } from "./preview-cache";
import { sanitizeFilename } from "$lib/shared/foundation/services/file-downloader";
import { buildCardRenderOptions } from "./card-render-options";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import { hashString } from "$lib/shared/foundation/services/content-hasher";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import type { CardPresentation } from "$lib/shared/share/domain/models/card-presentation";

export const CARD_BLOB_CACHE_MAX_ENTRIES = 3;
export const CARD_BLOB_CACHE_MAX_BYTES = 24 * 1024 * 1024;

export class Sharer {
  private previewCache = new PreviewCache();
  private cardBlobCache = new Map<string, Blob>();
  private cardBlobCacheBytes = 0;
  private cardBlobInFlight = new Map<string, Promise<Blob>>();

  constructor(private renderService: SequenceRenderer) {}

  async generatePreview(
    sequence: SequenceData,
    options: ShareOptions,
    forceRegenerate = false
  ): Promise<string> {
    if (!forceRegenerate) {
      const cachedUrl = await this.previewCache.getCachedPreview(
        sequence,
        options
      );
      if (cachedUrl) {
        return cachedUrl;
      }
    }

    const renderOptions = this.convertToPreviewOptions(options);

    const previewUrl = await this.renderService.generatePreview(
      sequence,
      renderOptions
    );

    try {
      const blob = await this.dataUrlToBlob(previewUrl);
      await this.previewCache.setCachedPreview(sequence, options, blob);
    } catch (error) {
      console.warn("Failed to cache preview:", error);
    }

    return previewUrl;
  }

  async downloadImage(
    sequence: SequenceData,
    options: ShareOptions,
    filename?: string
  ): Promise<void> {
    const blob = await this.getImageBlob(sequence, options);

    const finalFilename = filename || this.generateFilename(sequence, options);

    this.triggerDownload(blob, finalFilename);
  }

  async getImageBlob(
    sequence: SequenceData,
    options: ShareOptions,
    onProgress?: ImageGenerationProgressCallback
  ): Promise<Blob> {
    const renderOptions = this.convertToRenderOptions(options);

    return await this.renderService.renderSequenceToBlob(
      sequence,
      renderOptions,
      onProgress
    );
  }

  /**
   * Render the user's CARD (front) as a blob, funnelled through
   * buildCardRenderOptions — the single source of truth shared with the viewer
   * export, the QR scan page, copy/download/share, and the save-panel preview.
   * Unlike getImageBlob (the legacy ShareOptions path) this honors every card
   * toggle: prop type, QR, mandala, LOOP glyph, grid, columns, start-layout and
   * footer. Used by the library save thumbnail so the saved PNG matches what the
   * preview shows.
   */
  async getCardImageBlob(
    sequence: SequenceData,
    opts: {
      propConfig?: ResolvedPropConfig;
      darkMode: boolean;
      /**
       * Geometry the live card preview measured. Auto columns have no fixed
       * shape, so without it the file re-derives its own and stops matching the
       * card on screen. Callers with a preview pass theirs.
       */
      resolvedAutoLayout?: ResolvedAutoLayout | null;
      /** Current card or one-share footer override. */
      cardPresentation?: CardPresentation;
    },
    onProgress?: ImageGenerationProgressCallback
  ): Promise<Blob> {
    const renderOptions = {
      stepSize: 240,
      format: "PNG" as const,
      quality: 1.0,
      ...buildCardRenderOptions(sequence, {
        propConfig: opts.propConfig,
        darkMode: opts.darkMode,
        isHandPath: !!sequence.metadata?.isHandPathVisualization,
        resolvedAutoLayout: opts.resolvedAutoLayout ?? null,
        cardPresentation: opts.cardPresentation,
      }),
    };

    // The visibility snapshot belongs in the key even though most of it never
    // reaches renderOptions: buildCardRenderOptions deliberately leaves TKA,
    // TnD, positions and non-radial points undefined so the composer inherits
    // them from the global manager at render time. That makes them real inputs
    // to the image and invisible to a key built from the options alone — toggle
    // TKA off and the cache hands back the card that still has it. (The same
    // reasoning already put leftPropType/rightPropType in the options object.)
    const cacheKey = hashString(
      `${JSON.stringify(sequence)}\n${JSON.stringify(renderOptions)}\n${JSON.stringify(
        getVisibilityStateManager().getState()
      )}`
    );
    const cached = this.cardBlobCache.get(cacheKey);
    if (cached) {
      // Refresh insertion order so the small cache keeps the cards used most
      // recently by the workspace, viewer, and library save paths.
      this.cardBlobCache.delete(cacheKey);
      this.cardBlobCache.set(cacheKey, cached);
      return cached;
    }

    const pending = this.cardBlobInFlight.get(cacheKey);
    if (pending) return pending;

    const renderPromise = this.renderService
      .renderSequenceToBlob(sequence, renderOptions, onProgress)
      .then((blob) => {
        // A single pathological render must not pin more memory than the
        // entire workspace cache budget. Callers still receive the blob; it is
        // simply not retained.
        if (blob.size > CARD_BLOB_CACHE_MAX_BYTES) {
          return blob;
        }

        const replaced = this.cardBlobCache.get(cacheKey);
        if (replaced) {
          this.cardBlobCacheBytes -= replaced.size;
          this.cardBlobCache.delete(cacheKey);
        }

        this.cardBlobCache.set(cacheKey, blob);
        this.cardBlobCacheBytes += blob.size;

        while (
          this.cardBlobCache.size > CARD_BLOB_CACHE_MAX_ENTRIES ||
          this.cardBlobCacheBytes > CARD_BLOB_CACHE_MAX_BYTES
        ) {
          const oldestKey = this.cardBlobCache.keys().next().value;
          if (oldestKey === undefined) break;
          const oldestBlob = this.cardBlobCache.get(oldestKey);
          this.cardBlobCache.delete(oldestKey);
          if (oldestBlob) {
            this.cardBlobCacheBytes -= oldestBlob.size;
          }
        }
        return blob;
      })
      .finally(() => {
        this.cardBlobInFlight.delete(cacheKey);
      });

    this.cardBlobInFlight.set(cacheKey, renderPromise);
    return renderPromise;
  }

  generateFilename(sequence: SequenceData, options: ShareOptions): string {
    const sequenceName = sequence.word || sequence.name || "sequence";
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const extension = options.format.toLowerCase();

    // Keep the real Greek glyphs (Σ, Φ, Λ…). sanitizeFilename preserves Unicode
    // and strips only illegal path chars — the old [^a-zA-Z0-9-_] regex turned
    // every Greek letter into "_".
    const cleanName = sanitizeFilename(sequenceName) || "sequence";

    return `${cleanName}_${date}.${extension}`;
  }

  validateOptions(options: ShareOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!["PNG", "JPEG", "WebP"].includes(options.format)) {
      errors.push(`Invalid format: ${options.format}`);
    }

    if (options.quality < 0 || options.quality > 1) {
      errors.push(`Quality must be between 0 and 1, got: ${options.quality}`);
    }

    if (options.stepSize <= 0) {
      errors.push(`Beat size must be positive, got: ${options.stepSize}`);
    }

    if (options.margin < 0) {
      errors.push(`Margin must be non-negative, got: ${options.margin}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async getCachedBlobIfAvailable(
    sequence: SequenceData,
    options: ShareOptions
  ): Promise<Blob | null> {
    return await this.previewCache.getCachedBlob(sequence, options);
  }

  private convertToRenderOptions(shareOptions: ShareOptions) {
    const showNotes = shareOptions.showNotes ?? shareOptions.addUserInfo;

    return {
      includeStartPosition: shareOptions.includeStartPosition,
      addStepNumbers: shareOptions.addStepNumbers,
      addReversalSymbols: true,
      addUserInfo: showNotes,
      addWord: shareOptions.addWord,
      combinedGrids: false,
      addDifficultyLevel: shareOptions.addDifficultyLevel,

      stepScale: 1.0,
      stepSize: shareOptions.stepSize,
      margin: shareOptions.margin,

      rightVisible: true,
      leftVisible: true,
      visibilityOverrides: {
        darkMode: shareOptions.darkMode,
      },

      notes:
        shareOptions.customNotesText ||
        shareOptions.notes ||
        "Created with Flow Arts Composer",

      showNotes,

      format: shareOptions.format,
      quality: shareOptions.quality,
      scale: 1.0,
      backgroundColor: shareOptions.backgroundColor,
    };
  }

  private convertToPreviewOptions(shareOptions: ShareOptions) {
    const showNotes = shareOptions.showNotes ?? shareOptions.addUserInfo;

    return {
      includeStartPosition: shareOptions.includeStartPosition,
      addStepNumbers: shareOptions.addStepNumbers,
      addReversalSymbols: true,
      addUserInfo: showNotes,
      addWord: shareOptions.addWord,
      combinedGrids: false,
      addDifficultyLevel: shareOptions.addDifficultyLevel,

      stepScale: 0.15,
      stepSize: shareOptions.stepSize,
      margin: shareOptions.margin,

      rightVisible: true,
      leftVisible: true,
      visibilityOverrides: {
        darkMode: shareOptions.darkMode,
      },

      notes:
        shareOptions.customNotesText ||
        shareOptions.notes ||
        "Created with Flow Arts Composer",

      showNotes,

      format: "JPEG" as const,
      quality: 0.4,
      scale: 0.15,
      backgroundColor: shareOptions.backgroundColor,
    };
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return await response.blob();
  };
}

import type { ImageGenerationProgressCallback } from "./types";
