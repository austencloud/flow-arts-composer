import { describe, expect, it, vi } from "vitest";
import { selectBeatPlaneStep } from "#lib/shared/3d/domain/beat-plane-step-selection.js";

describe("3D beat-plane step analytics", () => {
  it("moves the editor once and reports its local step selection", () => {
    const goToStep = vi.fn();
    const sink = vi.fn();

    expect(
      selectBeatPlaneStep({
        currentStep: 1,
        targetStep: 4,
        goToStep,
        onSettingChange: sink,
      })
    ).toBe(true);

    expect(goToStep).toHaveBeenCalledOnce();
    expect(goToStep).toHaveBeenCalledWith(4);
    expect(sink).toHaveBeenCalledWith(
      "viewer_3d_planes",
      "beat_step",
      1,
      4,
      undefined
    );
  });

  it("preserves the editor callback without emitting a no-op transition", () => {
    const goToStep = vi.fn();
    const sink = vi.fn();

    expect(
      selectBeatPlaneStep({
        currentStep: 2,
        targetStep: 2,
        goToStep,
        onSettingChange: sink,
      })
    ).toBe(false);

    expect(goToStep).toHaveBeenCalledOnce();
    expect(sink).not.toHaveBeenCalled();
  });
});
