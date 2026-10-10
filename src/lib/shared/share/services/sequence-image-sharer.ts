/**
 * SequenceImageSharer - Share sequence images via various methods
 *
 * Provides unified image sharing using the sequence renderer
 * and image composition settings.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceRenderer } from "#lib/shared/render/services/sequence-renderer.js";
import type { ShareResult } from "./types";
import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
import { buildCardRenderOptions } from "./card-render-options";

export class SequenceImageSharer {
  constructor(private readonly renderer: SequenceRenderer) {}

  async copyToClipboard(sequence: SequenceData): Promise<ShareResult> {
    try {
      const blob = await this.renderImage(sequence);

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      return { success: true };
    } catch (error) {
      console.error("[SequenceImageSharer] Failed to copy image:", error);
      return { success: false, error: error as Error };
    }
  }

  async downloadImage(sequence: SequenceData): Promise<ShareResult> {
    try {
      const blob = await this.renderImage(sequence);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sequence.word || sequence.name || "sequence"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      console.error("[SequenceImageSharer] Failed to download image:", error);
      return { success: false, error: error as Error };
    }
  }

  async nativeShare(sequence: SequenceData): Promise<ShareResult> {
    try {
      const blob = await this.renderImage(sequence);
      const file = new File(
        [blob],
        `${sequence.word || "sequence"}.png`,
        { type: "image/png" }
      );

      if (this.canNativeShare() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: sequence.word || sequence.name || "Sequence",
          files: [file],
        });
        return { success: true };
      } else {
        // Fall back to clipboard copy
        return this.copyToClipboard(sequence);
      }
    } catch (error) {
      // User cancelled share is not an error
      if ((error as Error).name === "AbortError") {
        return { success: true };
      }
      console.error("[SequenceImageSharer] Failed to share:", error);
      return { success: false, error: error as Error };
    }
  }

  canNativeShare(): boolean {
    return typeof navigator !== "undefined" && "share" in navigator;
  }

  /**
   * Render image with current composition settings
   */
  private async renderImage(sequence: SequenceData): Promise<Blob> {
    const imageSettings = getImageCompositionManager();

    // One builder for every card render — copy/download/share now honor the same
    // LOOP/mandala/QR/grid/columns/start-layout toggles as the export panel and
    // the live preview, instead of the word/difficulty/footer subset this path
    // used to thread.
    return this.renderer.renderSequenceToBlob(sequence, {
      stepSize: 240,
      format: "PNG",
      quality: 1.0,
      ...buildCardRenderOptions(sequence, {
        darkMode: imageSettings.darkMode,
        isHandPath: !!sequence.metadata?.isHandPathVisualization,
      }),
    });
  }
}
