import { describe, expect, it } from "vitest";
import { shouldAutoplayViewer } from "#lib/shared/sequence-viewer/services/viewer-autoplay-policy.js";

describe("viewer autoplay policy", () => {
  it("allows animation and split surfaces to autoplay", () => {
    expect(
      shouldAutoplayViewer({
        viewMode: "animation",
        reducedMotionSetting: false,
        systemPrefersReducedMotion: false,
      })
    ).toBe(true);
    expect(
      shouldAutoplayViewer({
        viewMode: "split",
        reducedMotionSetting: false,
        systemPrefersReducedMotion: false,
      })
    ).toBe(true);
  });

  it("keeps an image-only preference still", () => {
    expect(
      shouldAutoplayViewer({
        viewMode: "image",
        reducedMotionSetting: false,
        systemPrefersReducedMotion: false,
      })
    ).toBe(false);
  });

  it("never forces playback for either reduced-motion preference", () => {
    expect(
      shouldAutoplayViewer({
        viewMode: "animation",
        reducedMotionSetting: true,
        systemPrefersReducedMotion: false,
      })
    ).toBe(false);
    expect(
      shouldAutoplayViewer({
        viewMode: "animation",
        reducedMotionSetting: false,
        systemPrefersReducedMotion: true,
      })
    ).toBe(false);
  });
});
