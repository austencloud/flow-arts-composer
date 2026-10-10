import { describe, expect, it } from "vitest";
import * as featureVideo from "#lib/shared/media-composition/domain/feature-video.js";
import * as featureVideoUrl from "#lib/shared/media-composition/domain/feature-video-url.js";

/** What feature-video.ts keeps exporting, now from the URL module. */
const NAMES = [
  "FEATURE_VIDEO_API",
  "FEATURE_VIDEO_SLUG_PATTERN",
  "featureVideoMediaUrl",
  "isFeatureVideoMediaUrl",
  "isFeatureVideoSlug",
] as const;

describe("feature video media URLs", () => {
  it.each(NAMES)("%s is the same from both modules", (name) => {
    expect(featureVideo[name]).toBe(featureVideoUrl[name]);
  });

  it("makes and knows a music file's URL", () => {
    const url = featureVideoUrl.featureVideoMediaUrl(
      "promo-1-0",
      "music/Derail Theme.wav"
    );
    expect(url).toBe(
      "/api/dev/feature-videos/promo-1-0/media/music/Derail%20Theme.wav"
    );
    expect(featureVideoUrl.isFeatureVideoMediaUrl(url)).toBe(true);
    expect(
      featureVideoUrl.isFeatureVideoMediaUrl("https://example.test/a.wav")
    ).toBe(false);
  });
});
