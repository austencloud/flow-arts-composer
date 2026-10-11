/**
 * Turns an `LedPatternSource` into a concrete `StripPattern` and caches it.
 *
 * Materializing is expensive (ledCount x frameCount pixels) so it happens
 * once per config change, never in the frame loop. Generators resolve
 * synchronously; an image source resolves asynchronously and reads black
 * until its load lands.
 */

import type { PatternParams, StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import { BUILT_IN_PRESETS } from "#lib/shared/poi/domain/pattern-presets.js";
import { imageDataToStripPattern } from "#lib/shared/poi/domain/strip-pattern-image.js";
import type { LedPatternSource } from "../../domain/types/led-types";
import {
  DEFAULT_LED_INTENT,
  LED_PATTERN_FRAME_COUNT,
} from "../../domain/types/led-types";

/** Resolves a library entry id to decoded pixels, or null when unavailable. */
export type LedImageLoader = (libraryEntryId: string) => Promise<ImageData | null>;

const FALLBACK_GENERATOR_ID = "prop-colors";

const FALLBACK_PARAMS: PatternParams =
  DEFAULT_LED_INTENT.pattern.source === "generator"
    ? DEFAULT_LED_INTENT.pattern.params
    : { primaryColor: { r: 255, g: 255, b: 255 }, speed: 1, brightness: 1 };

function sourceKey(source: LedPatternSource, ledCount: number): string {
  return source.source === "generator"
    ? `gen:${ledCount}:${source.generatorId}:${JSON.stringify(source.params)}`
    : `img:${ledCount}:${source.libraryEntryId}`;
}

/**
 * Generate a pattern from a built-in preset. An unknown generator id falls
 * back to prop-colors rather than rendering nothing.
 */
export function materializeGeneratorPattern(
  generatorId: string,
  params: PatternParams | undefined,
  ledCount: number,
  frameCount: number = LED_PATTERN_FRAME_COUNT
): StripPattern {
  const preset =
    BUILT_IN_PRESETS.find((p) => p.id === generatorId) ??
    BUILT_IN_PRESETS.find((p) => p.id === FALLBACK_GENERATOR_ID)!;
  return preset.generate(
    Math.max(1, ledCount),
    frameCount,
    params?.primaryColor ? params : FALLBACK_PARAMS
  );
}

export class LedPatternMaterializer {
  private key = "";
  private pattern: StripPattern | null = null;
  /** Set while an image load is in flight so we don't refire it every frame. */
  private pendingKey: string | null = null;
  private readonly loadImage: LedImageLoader;

  constructor(loadImage: LedImageLoader = defaultImageLoader) {
    this.loadImage = loadImage;
  }

  /**
   * The pattern for this source at this LED count, or null while an image
   * source is still loading. Cheap to call every frame.
   */
  resolve(source: LedPatternSource, ledCount: number): StripPattern | null {
    const key = sourceKey(source, ledCount);
    if (key === this.key) return this.pattern;

    if (source.source === "generator") {
      this.key = key;
      this.pendingKey = null;
      this.pattern = materializeGeneratorPattern(
        source.generatorId,
        source.params,
        ledCount
      );
      return this.pattern;
    }

    // Image source: nothing to show until the bytes arrive.
    this.key = key;
    this.pattern = null;
    if (this.pendingKey !== key) {
      this.pendingKey = key;
      const entryId = source.libraryEntryId;
      void this.loadImage(entryId)
        .then((image) => {
          // A later config change may have superseded this load.
          if (this.pendingKey !== key) return;
          this.pendingKey = null;
          if (!image) return;
          this.pattern = imageDataToStripPattern(
            image,
            ledCount,
            LED_PATTERN_FRAME_COUNT,
            entryId
          );
        })
        .catch(() => {
          if (this.pendingKey === key) this.pendingKey = null;
        });
    }
    return null;
  }

  /** Drop the cache so the next resolve rebuilds (used on renderer reset). */
  reset(): void {
    this.key = "";
    this.pattern = null;
    this.pendingKey = null;
  }
}

/**
 * Production loader. Imported lazily so the render loop never pulls Firebase
 * into its chunk for the far more common generator case.
 */
async function defaultImageLoader(libraryEntryId: string): Promise<ImageData | null> {
  try {
    const library = await import("#lib/shared/poi/services/poi-image-library.js");
    const entry = await library.getEntry(libraryEntryId);
    if (!entry) return null;
    return await library.loadAsImageData(entry);
  } catch (error) {
    console.warn("[LedPatternMaterializer] image load failed:", error);
    return null;
  }
}
