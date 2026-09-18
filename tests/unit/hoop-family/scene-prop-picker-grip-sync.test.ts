import { afterEach, describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import { propFinishState } from "@austencloud/scene-3d";

import {
  getSettings,
  updateSettings,
} from "$lib/shared/application/state/app-state.svelte";
import { initializeAppServices } from "$lib/shared/application/state/services.svelte";
import { mountGripSync } from "./scene-prop-picker-grip-sync-harness.svelte";

/**
 * Proves CRITICAL 1: syncTriangleGripToScene (the effect ScenePropPicker.svelte
 * mounts with `$effect(syncTriangleGripToScene)`) writes the scene default from
 * AppSettings unconditionally now that the old `if (buildOverride) return;`
 * guard is gone. Mounting the real ScenePropPicker component under jsdom would
 * pull in BentoPropGrid, image loading, gamification/subscription state, and
 * the chirality seam with no existing precedent for stubbing that surface, so
 * this drives the real production effect body directly through
 * scene-prop-picker-grip-sync-harness.svelte.ts's `$effect.root` wrapper
 * instead (the fallback route the task explicitly allows). The function takes
 * no build/override argument at all post-fix, which is itself the point: the
 * old guard's `buildOverride` check is gone, so nothing about a performer
 * override can make this sync inert any more.
 */
describe("ScenePropPicker triangle grip sync (settings to scene, one way)", () => {
  afterEach(async () => {
    propFinishState.setTriangleGrip("corner");
    await updateSettings({ triangleGrip: "corner" });
  });

  it("writes AppSettings.triangleGrip to the scene default", async () => {
    await initializeAppServices();
    const harness = mountGripSync();
    try {
      expect(getSettings().triangleGrip).not.toBe("side");

      await updateSettings({ triangleGrip: "side" });
      flushSync();

      expect(propFinishState.triangleGrip).toBe("side");
    } finally {
      harness.dispose();
    }
  });
});
