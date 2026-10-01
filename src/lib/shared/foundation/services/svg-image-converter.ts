/**
 * Gives the root `<svg>` the requested size so the HTMLImageElement is
 * created at it. Only the root tag changes: an inner element's width and
 * height are its geometry. Stripping them everywhere erased the `<rect>` that
 * draws the glyph composite's dash, so every dash letter (Ψ-, Φ-, Λ-, W-...)
 * rendered without its dash in painted labels and video exports.
 */
export function withRootSvgSize(
  svgString: string,
  width: number,
  height: number
): string {
  return svgString.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s+(?:width|height)="[^"]*"/g, "")
      .replace(/^<svg/, `<svg width="${width}" height="${height}"`)
  );
}

export class SvgImageConverter {
  private activeBlobUrls = new Set<string>();

  /**
   * Embeds width/height in SVG to ensure correct creation size of HTMLImageElement.
   */
  async convertSvgStringToImage(
    svgString: string,
    width: number,
    height: number
  ): Promise<HTMLImageElement> {
    if (!this.validateSvgString(svgString)) {
      throw new Error("Invalid SVG string provided");
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      let blobUrl: string | null = null;

      img.onerror = (error) => {
        this.cleanupBlobUrl(blobUrl);
        reject(new Error(`Failed to load SVG image: ${error}`));
      };

      img.onload = () => {
        this.cleanupBlobUrl(blobUrl);
        resolve(img);
      };

      try {
        const modifiedSvg = withRootSvgSize(svgString, width, height);

        const blob = new Blob([modifiedSvg], { type: "image/svg+xml" });
        blobUrl = URL.createObjectURL(blob);
        this.activeBlobUrls.add(blobUrl);

        img.src = blobUrl;
      } catch (error) {
        this.cleanupBlobUrl(blobUrl);
        reject(new Error(`Failed to create blob URL: ${error}`));
      }
    });
  }

  async convertMultipleSvgStringsToImages(
    svgData: Array<{
      svgString: string;
      width: number;
      height: number;
    }>
  ): Promise<HTMLImageElement[]> {
    const conversions = svgData.map(({ svgString, width, height }) =>
      this.convertSvgStringToImage(svgString, width, height)
    );

    try {
      return await Promise.all(conversions);
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  validateSvgString(svgString: string): boolean {
    if (!svgString || typeof svgString !== "string") {
      return false;
    }

    const trimmed = svgString.trim();
    if (!trimmed) {
      return false;
    }

    const hasSvgTag = trimmed.includes("<svg") && trimmed.includes("</svg>");
    if (!hasSvgTag) {
      return false;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(trimmed, "image/svg+xml");
      const parserError = doc.querySelector("parsererror");
      return !parserError;
    } catch {
      return false;
    }
  }

  private cleanupBlobUrl(blobUrl: string | null): void {
    if (blobUrl && this.activeBlobUrls.has(blobUrl)) {
      URL.revokeObjectURL(blobUrl);
      this.activeBlobUrls.delete(blobUrl);
    }
  }

  cleanup(): void {
    for (const blobUrl of this.activeBlobUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    this.activeBlobUrls.clear();
  }
}
