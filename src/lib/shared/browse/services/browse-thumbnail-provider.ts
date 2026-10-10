/**
 * Thumbnail Service Implementation
 *
 * Handles loading and serving thumbnail images for sequence browsing.
 * Manages caching and provides URLs for thumbnail access.
 */

import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export class BrowseThumbnailProvider {
  private thumbnailCache = new Map<string, Promise<void>>();
  private metadataCache = new Map<string, { width: number; height: number }>();
  private baseUrl = "/gallery";

  getThumbnailUrl(_sequenceId: string, thumbnailPath: string): string {
    // Handle different thumbnail path formats

    // Convert legacy /Browse/ paths to /gallery/ paths
    if (thumbnailPath.startsWith("/Browse/")) {
      const correctedPath = thumbnailPath.replace(/^\/Browse\//, "/gallery/");
      return this.getOptimizedUrl(correctedPath);
    }

    // If path starts with /gallery/, it's already a complete path - return optimized version
    if (thumbnailPath.startsWith("/gallery/")) {
      return this.getOptimizedUrl(thumbnailPath);
    }

    // If path starts with /, it's already absolute - return optimized version
    if (thumbnailPath.startsWith("/")) {
      return this.getOptimizedUrl(thumbnailPath);
    }

    // If thumbnailPath is just a filename, construct the full URL and optimize
    if (!thumbnailPath.includes("/")) {
      const fullUrl = `${this.baseUrl}/${thumbnailPath}`;
      return this.getOptimizedUrl(fullUrl);
    }

    // If thumbnailPath is relative, prepend base URL and optimize
    const fullUrl = `${this.baseUrl}/${thumbnailPath}`;
    return this.getOptimizedUrl(fullUrl);
  }

  /**
   * Get prop-specific thumbnail URL
   * Returns path to pre-rendered gallery image for a specific prop type
   *
   * Structure: /gallery/{propType}/{sequenceName}_{mode}.webp
   * Example: /gallery/staff/Butterfly_dark.webp
   */
  getPropSpecificThumbnailUrl(
    sequenceName: string,
    propType: PropType,
    lightMode: boolean = false
  ): string {
    const modeSuffix = lightMode ? "_light" : "_dark";
    return `${this.baseUrl}/${propType}/${sequenceName}${modeSuffix}.webp`;
  }

  /**
   * Get optimized image URL - WebP-first approach (clean, no redundancy)
   */
  private getOptimizedUrl(originalUrl: string): string {
    // Always serve WebP first (97% browser support)
    // Component handles PNG fallback if WebP fails to load
    const webpUrl = originalUrl.replace(/\.png$/i, ".webp");
    return webpUrl;
  }

  async preloadThumbnail(
    sequenceId: string,
    thumbnailPath: string
  ): Promise<void> {
    const cacheKey = `${sequenceId}-${thumbnailPath}`;

    // Return existing promise if already loading
    if (this.thumbnailCache.has(cacheKey)) {
      return this.thumbnailCache.get(cacheKey);
    }

    // Create new preload promise
    const preloadPromise = this.loadThumbnailImage(sequenceId, thumbnailPath);
    this.thumbnailCache.set(cacheKey, preloadPromise);

    try {
      await preloadPromise;
    } catch (error) {
      // Remove failed attempts from cache
      this.thumbnailCache.delete(cacheKey);
      throw error;
    }
  }

  async getThumbnailMetadata(
    sequenceId: string
  ): Promise<{ width: number; height: number } | null> {
    const cacheKey = sequenceId;

    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey) ?? null;
    }

    try {
      // Try to get thumbnail path for this sequence
      const thumbnailPath = await this.getThumbnailPathForSequence(sequenceId);
      if (!thumbnailPath) {
        return null;
      }

      const metadata = await this.loadImageMetadata(thumbnailPath);
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      console.warn(
        `Failed to get thumbnail metadata for ${sequenceId}:`,
        error
      );
      return null;
    }
  }

  clearThumbnailCache(): void {
    this.thumbnailCache.clear();
    this.metadataCache.clear();
  }

  // Additional helper methods for thumbnail management
  async validateThumbnailExists(
    sequenceId: string,
    thumbnailPath: string
  ): Promise<boolean> {
    try {
      const url = this.getThumbnailUrl(sequenceId, thumbnailPath);
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getThumbnailsForSequence(sequenceId: string): Promise<string[]> {
    // This would ideally scan the thumbnail directory for files matching the sequence
    // For now, return common thumbnail patterns, trying both ver1 and ver2
    const commonPatterns = [
      `${sequenceId}_ver1.png`,
      `${sequenceId.toUpperCase()}_ver1.png`,
      `${sequenceId.toLowerCase()}_ver1.png`,
      `${sequenceId}_ver2.png`,
      `${sequenceId.toUpperCase()}_ver2.png`,
      `${sequenceId.toLowerCase()}_ver2.png`,
    ];

    const validThumbnails: string[] = [];

    for (const pattern of commonPatterns) {
      if (await this.validateThumbnailExists(sequenceId, pattern)) {
        validThumbnails.push(pattern);
      }
    }

    return validThumbnails;
  }

  getOptimizedThumbnailUrl(
    sequenceId: string,
    thumbnailPath: string,
    targetWidth?: number
  ): string {
    // Get the optimized URL with WebP support
    const optimizedUrl = this.getThumbnailUrl(sequenceId, thumbnailPath);

    if (targetWidth) {
      // Future enhancement: Could append query parameters for resizing if server supports it
      // return `${optimizedUrl}?w=${targetWidth}`;
    }

    return optimizedUrl;
  }

  // Private helper methods
  private async loadThumbnailImage(
    sequenceId: string,
    thumbnailPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = this.getThumbnailUrl(sequenceId, thumbnailPath);

      img.onload = () => {
        // Store metadata if successful
        this.metadataCache.set(sequenceId, {
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        resolve();
      };

      img.onerror = () => {
        reject(new Error(`Failed to load thumbnail: ${url}`));
      };

      img.src = url;
    });
  }

  private async loadImageMetadata(
    thumbnailPath: string
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image metadata: ${thumbnailPath}`));
      };

      img.src = thumbnailPath;
    });
  }

  private async getThumbnailPathForSequence(
    sequenceId: string
  ): Promise<string | null> {
    // Try common thumbnail naming patterns, trying both ver1 and ver2
    const patterns = [
      `${sequenceId}_ver1.png`,
      `${sequenceId.toUpperCase()}_ver1.png`,
      `${sequenceId.toLowerCase()}_ver1.png`,
      `${sequenceId}_ver2.png`,
      `${sequenceId.toUpperCase()}_ver2.png`,
      `${sequenceId.toLowerCase()}_ver2.png`,
    ];

    for (const pattern of patterns) {
      if (await this.validateThumbnailExists(sequenceId, pattern)) {
        return pattern;
      }
    }

    return null;
  }

  // Batch operations for performance
  async preloadThumbnails(
    thumbnails: Array<{ sequenceId: string; thumbnailPath: string }>
  ): Promise<void> {
    const preloadPromises = thumbnails.map((thumb) =>
      this.preloadThumbnail(thumb.sequenceId, thumb.thumbnailPath).catch(
        (error) => {
          console.warn(
            `Failed to preload thumbnail ${thumb.sequenceId}/${thumb.thumbnailPath}:`,
            error
          );
        }
      )
    );

    await Promise.all(preloadPromises);
  }

  getThumbnailCacheStats(): {
    cached: number;
    metadataCached: number;
  } {
    return {
      cached: this.thumbnailCache.size,
      metadataCached: this.metadataCache.size,
    };
  }
}
