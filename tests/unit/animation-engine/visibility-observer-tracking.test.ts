import { describe, expect, it } from "vitest";
import { runPolicyEffectWithCountingObserver } from "./visibility-observer-tracking.svelte";

// Opening a mandala from the Create workspace froze the page on 2026-10-26:
// the viewer's effect set the path policy, the manager called its observers
// inside that effect, and an observer's own state read became a dependency of
// the viewer's effect. Every notification re-ran the effect until Svelte gave
// up with effect_update_depth_exceeded and the route fell to its error screen.
describe("animation visibility observers", () => {
  it("do not become dependencies of the effect that notified them", () => {
    const { effectRuns, error } = runPolicyEffectWithCountingObserver({
      pathShape: "linear",
      motionAwarePaths: false,
    });

    expect(error).toBeNull();
    expect(effectRuns).toBe(1);
  });
});
