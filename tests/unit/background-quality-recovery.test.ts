import {
  BackgroundController,
  BackgroundFactory,
  BackgroundType,
} from "@austencloud/backgrounds";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installBackgroundQualityRecovery } from "../../src/lib/shared/background/shared/background-quality-recovery";

describe("cosmic adaptive quality recovery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("repairs quality changes after the frame, without disabling adaptation", async () => {
    const controller = new BackgroundController();
    let event!: Parameters<typeof controller.onEvent>[0];
    vi.spyOn(controller, "onEvent").mockImplementation((callback) => {
      event = callback;
    });
    const ready = vi.spyOn(controller, "isReady").mockReturnValue(false);
    const type = vi
      .spyOn(controller, "getCurrentType")
      .mockReturnValue(BackgroundType.COSMIC);
    const refresh = vi
      .spyOn(controller, "forceRefresh")
      .mockImplementation(() => {});
    const dispose = installBackgroundQualityRecovery(controller);
    ready.mockReturnValue(true);
    event({ type: "qualityChanged", quality: "low" });
    event({ type: "qualityChanged", quality: "medium" });
    expect(refresh).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    event({ type: "qualityChanged", quality: "low" });
    type.mockReturnValue(BackgroundType.OCEAN);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    type.mockReturnValue(BackgroundType.COSMIC);
    event({ type: "qualityChanged", quality: "medium" });
    dispose();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-seeds real cosmic stars at the adjusted quality", async () => {
    const system = await BackgroundFactory.createBackgroundSystem({
      type: BackgroundType.COSMIC,
      quality: "high",
    });
    const cosmic = system as typeof system & {
      parallaxStarSystem: { getAllBrightStars(): unknown[] };
    };
    const dimensions = { width: 1280, height: 720 };
    cosmic.initialize(dimensions, "high");
    expect(
      cosmic.parallaxStarSystem.getAllBrightStars().length
    ).toBeGreaterThan(0);
    cosmic.setQuality("low");
    // This is the package regression: the replacement has no stars. The host
    // now requests controller reinitialization at the new quality.
    expect(cosmic.parallaxStarSystem.getAllBrightStars()).toHaveLength(0);
    cosmic.initialize(dimensions, "low");
    expect(
      cosmic.parallaxStarSystem.getAllBrightStars().length
    ).toBeGreaterThan(0);
    cosmic.cleanup();
  });
});
