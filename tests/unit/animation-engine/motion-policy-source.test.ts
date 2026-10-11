// @vitest-environment jsdom

/**
 * A scoped canvas (Fuse) keeps its own display flags but must share ONE motion
 * policy with the manager the orchestrator interpolates against. When it kept
 * a private copy, picking Arc on the Fuse canvas changed the copy while the
 * props kept travelling on the shared concave/By Motion setting.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

describe("motion policy source", () => {
  let shared: AnimationVisibilityStateManager;
  let scoped: AnimationVisibilityStateManager;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    shared = new AnimationVisibilityStateManager({ ephemeral: true });
    scoped = new AnimationVisibilityStateManager({ ephemeral: true });
    scoped.setMotionPolicySource(shared);
  });

  it("reads path policy through the source", () => {
    shared.setPathPolicy({ pathShape: "concave", motionAwarePaths: true });

    expect(scoped.getPathShape()).toBe("concave");
    expect(scoped.getMotionAwarePaths()).toBe(true);
    expect(scoped.getPathPolicy()).toEqual({
      pathShape: "concave",
      motionAwarePaths: true,
    });
    expect(scoped.getSettings().pathShape).toBe("concave");
  });

  it("writes a canvas-menu path choice through to the source", () => {
    shared.setPathPolicy({ pathShape: "concave", motionAwarePaths: true });

    // What the "Arc" entry in the canvas context menu does.
    scoped.setPathPolicy({ pathShape: "arc", motionAwarePaths: false });

    expect(shared.getPathPolicy()).toEqual({
      pathShape: "arc",
      motionAwarePaths: false,
    });
    expect(scoped.getPathPolicy()).toEqual({
      pathShape: "arc",
      motionAwarePaths: false,
    });
  });

  it("shares the effort preset in both directions", () => {
    shared.setEffortPreset("bounce");
    expect(scoped.getEffortPreset()).toBe("bounce");
    expect(scoped.getSettings().effortPreset).toBe("bounce");

    scoped.setEffortPreset("punch");
    expect(shared.getEffortPreset()).toBe("punch");
  });

  it("keeps display flags scoped", () => {
    scoped.setVisibility("elementalGlyph", true);

    expect(scoped.getVisibility("elementalGlyph")).toBe(true);
    expect(shared.getVisibility("elementalGlyph")).toBe(false);
  });

  it("notifies the scoped canvas when it writes through", () => {
    let notifications = 0;
    scoped.registerObserver(() => notifications++);

    scoped.setPathShape("linear");

    expect(notifications).toBeGreaterThan(0);
    expect(shared.getPathShape()).toBe("linear");
  });

  it("ignores a self-reference", () => {
    shared.setMotionPolicySource(shared);
    shared.setPathShape("concave");

    expect(shared.getPathShape()).toBe("concave");
  });
});
