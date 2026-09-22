import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { InstagramMediaItem } from "../domain/models/instagram-media";
import type { ShareOptions } from "../domain/models/share-options";
import {
  INSTAGRAM_MEDIA_CONSTRAINTS,
  validateMediaItem,
} from "../domain/models/instagram-media";
import type { Sharer } from "./sharer";

export class MediaBundler {
  constructor(private shareService: Sharer) {}

  async bundleSequenceMedia(
    sequence: SequenceData,
    options: ShareOptions
  ): Promise<InstagramMediaItem[]> {
    const items: InstagramMediaItem[] = [];

    try {
      const imageBlob = await this.generateSequenceImage(sequence, options);
      const imageItem = await this.createMediaItemFromBlob(
        imageBlob,
        "IMAGE",
        items.length,
        `${sequence.word}_sequence.png`
      );
      items.push(imageItem);

      return items;
    } catch (error: unknown) {
      console.error("Failed to bundle sequence media:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Media bundling failed: ${errorMessage}`);
    }
  }

  async createVideoMediaItem(
    videoFile: File,
    order: number
  ): Promise<InstagramMediaItem> {
    if (!videoFile.type.startsWith("video/")) {
      throw new Error("File must be a video");
    }

    const url = URL.createObjectURL(videoFile);

    const mediaItem: InstagramMediaItem = {
      type: "VIDEO",
      blob: videoFile,
      url,
      filename: videoFile.name,
      order,
    };

    const validation = validateMediaItem(mediaItem);
    if (!validation.isValid) {
      URL.revokeObjectURL(url);
      throw new Error(validation.error);
    }

    return mediaItem;
  }

  async createCarouselBundle(
    sequence: SequenceData,
    videoFile: File,
    options: ShareOptions,
    layout: "video-first" | "sequence-first" = "video-first"
  ): Promise<InstagramMediaItem[]> {
    try {
      const sequenceMedia = await this.bundleSequenceMedia(sequence, options);

      const videoMedia = await this.createVideoMediaItem(videoFile, 0);

      let items: InstagramMediaItem[];
      if (layout === "video-first") {
        items = [videoMedia, ...sequenceMedia];
      } else {
        items = [...sequenceMedia, videoMedia];
      }

      items = items.map((item, index) => ({
        ...item,
        order: index,
      }));

      const validation = this.validateBundle(items);
      if (!validation.isValid) {
        throw new Error(
          `Invalid carousel bundle: ${validation.errors.join(", ")}`
        );
      }

      return items;
    } catch (error: unknown) {
      console.error("Failed to create carousel bundle:", error);
      throw error;
    }
  }

  reorderMediaItems(
    items: InstagramMediaItem[],
    fromIndex: number,
    toIndex: number
  ): InstagramMediaItem[] {
    if (
      fromIndex < 0 ||
      fromIndex >= items.length ||
      toIndex < 0 ||
      toIndex >= items.length
    ) {
      return items;
    }

    const reordered = [...items];

    const [movedItem] = reordered.splice(fromIndex, 1);
    if (!movedItem) return items;

    reordered.splice(toIndex, 0, movedItem);

    return reordered.map((item, index) => ({
      ...item,
      order: index,
    }));
  }

  removeMediaItem(
    items: InstagramMediaItem[],
    index: number
  ): InstagramMediaItem[] {
    if (index < 0 || index >= items.length) {
      return items;
    }

    const itemToRemove = items[index];
    if (itemToRemove?.url.startsWith("blob:")) {
      URL.revokeObjectURL(itemToRemove.url);
    }

    const filtered = items.filter((_, i) => i !== index);

    return filtered.map((item, idx) => ({
      ...item,
      order: idx,
    }));
  }

  validateBundle(items: InstagramMediaItem[]): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const count = items.length;
    if (count < INSTAGRAM_MEDIA_CONSTRAINTS.CAROUSEL_MIN_ITEMS) {
      errors.push(
        `Carousel must have at least ${INSTAGRAM_MEDIA_CONSTRAINTS.CAROUSEL_MIN_ITEMS} items`
      );
    }
    if (count > INSTAGRAM_MEDIA_CONSTRAINTS.CAROUSEL_MAX_ITEMS) {
      errors.push(
        `Carousel cannot exceed ${INSTAGRAM_MEDIA_CONSTRAINTS.CAROUSEL_MAX_ITEMS} items`
      );
    }

    items.forEach((item, index) => {
      const validation = validateMediaItem(item);
      if (!validation.isValid) {
        errors.push(`Item ${index + 1}: ${validation.error}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async generateSequenceImage(
    sequence: SequenceData,
    options: ShareOptions
  ): Promise<Blob> {
    return await this.shareService.getImageBlob(sequence, options);
  }

  private createMediaItemFromBlob(
    blob: Blob,
    type: "IMAGE" | "VIDEO",
    order: number,
    filename: string
  ): InstagramMediaItem {
    const url = URL.createObjectURL(blob);

    return {
      type,
      blob,
      url,
      filename,
      order,
    };
  }
}
