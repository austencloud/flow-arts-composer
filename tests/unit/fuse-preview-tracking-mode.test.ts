import { describe, expect, it } from "vitest";
import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { resolveFusePreviewTrackingMode } from "#lib/features/fuse/services/fuse-preview-trail-config.js";

describe("Fuse preview tracking mode", () => {
  it("uses one central tip when both props are unilateral", () => {
    expect(resolveFusePreviewTrackingMode("fan", "fan")).toBe(
      TrackingMode.RIGHT_END
    );
  });

  it("uses both central ends when the props are bilateral", () => {
    expect(resolveFusePreviewTrackingMode("staff", "staff")).toBe(
      TrackingMode.BOTH_ENDS
    );
  });

  it("preserves both ends for the bilateral prop in a mixed pair", () => {
    expect(resolveFusePreviewTrackingMode("fan", "staff")).toBe(
      TrackingMode.BOTH_ENDS
    );
  });
});
