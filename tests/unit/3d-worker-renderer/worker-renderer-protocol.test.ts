import { describe, expect, it } from "vitest";
import {
  clampWorkerViewport,
  isWorkerRendererOutMessage,
  resolveWorkerRenderQuality,
  WORKER_PREPARATION_VIEWPORT,
} from "#lib/shared/3d/worker-renderer/domain/worker-renderer-protocol.js";
import { QualityTier, TIER_CONFIGS } from "#lib/shared/3d/effects/types.js";

describe("worker renderer protocol", () => {
  it("accepts only known worker messages with numeric request ids", () => {
    expect(isWorkerRendererOutMessage({ type: "frame", requestId: 4 })).toBe(
      true
    );
    expect(isWorkerRendererOutMessage({ type: "surprise", requestId: 4 })).toBe(
      false
    );
    expect(isWorkerRendererOutMessage({ type: "frame", requestId: "4" })).toBe(
      false
    );
    expect(isWorkerRendererOutMessage(null)).toBe(false);
  });

  it("keeps viewport dimensions valid and caps prototype DPR", () => {
    expect(clampWorkerViewport({ width: 0, height: -4, dpr: 8 })).toEqual({
      width: 1,
      height: 1,
      dpr: 2,
    });
    expect(
      clampWorkerViewport({ width: 100.4, height: 200.6, dpr: 0.25 })
    ).toEqual({ width: 100, height: 201, dpr: 0.5 });
  });

  it("primes hidden replacement scenes against one physical pixel", () => {
    expect(WORKER_PREPARATION_VIEWPORT).toEqual({
      width: 1,
      height: 1,
      dpr: 1,
    });
  });

  it.each([
    [QualityTier.HIGH, true, true],
    [QualityTier.MEDIUM, true, false],
    [QualityTier.LOW, false, false],
  ] as const)(
    "uses the canonical %s tier for composer, bloom, and shadows",
    (tier, composerEnabled, enableShadows) => {
      const resolved = resolveWorkerRenderQuality(tier, true);
      const canonical = TIER_CONFIGS[tier];

      expect(resolved).toEqual({
        composerEnabled,
        tierBloom: canonical.enableBloom,
        enableShadows,
        bloomResolutionScale: canonical.bloomResolutionScale,
        bloomLevels: canonical.bloomLevels,
      });
    }
  );

  it("keeps low quality composer-free outside Ocean too", () => {
    expect(resolveWorkerRenderQuality("low", false).composerEnabled).toBe(
      false
    );
  });
});
