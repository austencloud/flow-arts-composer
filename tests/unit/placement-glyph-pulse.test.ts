import { describe, expect, it, vi } from "vitest";
import { DURATION, EASE_STANDARD_OUT } from "@austencloud/motion";
import { createPlacementPulse } from "../../src/lib/shared/pictograph/shared/components/placement-pulse.js";

function fakeTarget() {
  const first = { cancel: vi.fn() };
  const second = { cancel: vi.fn() };
  const animate = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second);
  const target = { animate } as unknown as SVGGElement;
  return { target, animate, first, second };
}

describe("placement glyph pulse", () => {
  it("restarts with one animation and cancels the previous pulse first", () => {
    const { target, animate, first, second } = fakeTarget();
    const pulse = createPlacementPulse();

    pulse.play(target, false);
    expect(animate).toHaveBeenCalledExactlyOnceWith(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.91)" },
        { transform: "scale(1)" },
      ],
      { duration: DURATION.dramatic, easing: EASE_STANDARD_OUT }
    );
    pulse.play(target, false);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(first.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      animate.mock.invocationCallOrder[1]!
    );
    expect(second.cancel).not.toHaveBeenCalled();
  });

  it("cancels the current animation on destroy and releases it", () => {
    const { target, first, second } = fakeTarget();
    const pulse = createPlacementPulse();
    pulse.play(target, false);
    pulse.play(target, false);

    pulse.destroy();
    pulse.destroy();

    expect(first.cancel).toHaveBeenCalledOnce();
    expect(second.cancel).toHaveBeenCalledOnce();
  });

  it("starts no animation under reduced motion, including a retrigger", () => {
    const { target, animate, first } = fakeTarget();
    const pulse = createPlacementPulse();

    pulse.play(target, true);
    expect(animate).not.toHaveBeenCalled();
    pulse.play(target, false);
    pulse.play(target, true);

    expect(animate).toHaveBeenCalledOnce();
    expect(first.cancel).toHaveBeenCalledOnce();
  });

  it("does not let one glyph cancel another glyph's pulse", () => {
    const left = fakeTarget();
    const right = fakeTarget();
    const leftPulse = createPlacementPulse();
    const rightPulse = createPlacementPulse();
    leftPulse.play(left.target, false);
    rightPulse.play(right.target, false);

    leftPulse.destroy();

    expect(left.first.cancel).toHaveBeenCalledOnce();
    expect(right.first.cancel).not.toHaveBeenCalled();
  });

  it("cancels the previous pulse when its target disappears", () => {
    const { target, animate, first } = fakeTarget();
    const pulse = createPlacementPulse();
    pulse.play(target, false);

    pulse.play(null, false);

    expect(first.cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
  });
});
