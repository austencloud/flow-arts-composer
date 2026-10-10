// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

describe("animation path policy", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("copies fixed and By Motion paths as one policy", () => {
    const shared = new AnimationVisibilityStateManager({ ephemeral: true });
    const preview = new AnimationVisibilityStateManager({ ephemeral: true });

    shared.setPathPolicy({ pathShape: "concave", motionAwarePaths: false });
    preview.setPathPolicy(shared.getPathPolicy());
    expect(preview.getPathPolicy()).toEqual({
      pathShape: "concave",
      motionAwarePaths: false,
    });

    shared.setPathPolicy({ pathShape: "linear", motionAwarePaths: true });
    preview.setPathPolicy(shared.getPathPolicy());
    expect(preview.getPathPolicy()).toEqual({
      pathShape: "linear",
      motionAwarePaths: true,
    });
  });

  it("notifies a receiving canvas once for a changed path policy", () => {
    const preview = new AnimationVisibilityStateManager({ ephemeral: true });
    let notifications = 0;
    preview.registerObserver(() => notifications++);

    preview.setPathPolicy({ pathShape: "linear", motionAwarePaths: true });

    expect(notifications).toBe(1);
  });
});
