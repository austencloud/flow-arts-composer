import { describe, it, expect } from "vitest";
import { createAnimatorState } from "#lib/shared/animation-engine/state/animator-state.svelte.js";

describe("AnimatorState", () => {
  it("exposes defaults and is independent per instance", () => {
    const a = createAnimatorState();
    const b = createAnimatorState();

    expect(a.isInitialized).toBe(false);
    expect(a.currentLeftPropType).toBe("staff");
    expect(a.visibilityState.mandala).toBe(true);

    a.setInitialized(true);
    a.setLeftPropType("fan");

    expect(a.isInitialized).toBe(true);
    expect(a.currentLeftPropType).toBe("fan");
    expect(b.isInitialized).toBe(false);
    expect(b.currentLeftPropType).toBe("staff");
  });

  it("keeps the object-dimension reference stable on an equal-value set", () => {
    const s = createAnimatorState();
    const before = s.leftPropDimensions;
    s.setLeftPropDimensions({ ...before }); // new ref, equal w/h
    expect(s.leftPropDimensions).toBe(before); // guard suppressed the reassignment
  });
});
