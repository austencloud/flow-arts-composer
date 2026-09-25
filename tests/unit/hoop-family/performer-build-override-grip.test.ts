import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import { propFinishState } from "@austencloud/scene-3d";

import { updateSettings } from "$lib/shared/application/state/app-state.svelte";
import { initializeAppServices } from "$lib/shared/application/state/services.svelte";
import { __resetWebGL2CapabilityForTests } from "$lib/shared/3d/capabilities/webgl-capabilities";
import {
  writeFanAppearance,
  writeFinish,
} from "$lib/shared/3d/components/controls/scene-prop-build-writes";
import { createViewer3DStateForTest } from "../3d-viewer/viewer3d-test-helpers.svelte";
import { mountGripSync } from "./scene-prop-picker-grip-sync-harness.svelte";

/**
 * The Grip pills in PropGrid are the only triangle grip control, and they
 * write the scene default. A performer who picked a finish in the Prop Studio
 * used to pin the whole effective build (grip included) as an override, so
 * the pills stopped reaching that performer. These tests drive the picker's
 * real write functions through the viewer's scoped writer, the same route
 * PerformerHubDetail takes, and assert the grip still follows the scene.
 */

// The viewer factory probes WebGL2 through document.createElement("canvas");
// the global test stub returns plain objects, so give canvases a getContext.
beforeAll(() => {
  const originalCreateElement = document.createElement.bind(
    document
  ) as unknown as (tag: string) => unknown;
  (
    document as unknown as { createElement: (tag: string) => unknown }
  ).createElement = (tag: string) => {
    const base = originalCreateElement(tag) as Record<string, unknown>;
    if (tag === "canvas") base.getContext = () => null;
    return base;
  };
  __resetWebGL2CapabilityForTests();
});

const cleanups: Array<() => void> = [];

afterEach(async () => {
  while (cleanups.length) cleanups.pop()!();
  propFinishState.set("fire");
  propFinishState.setTriangleGrip("corner");
  await updateSettings({ triangleGrip: "corner" });
});

function makePerformer() {
  const { state, dispose } = createViewer3DStateForTest({});
  cleanups.push(dispose);
  state.performerManager.initialize();
  const performer = state.performerManager.performers[0]!;
  const onBuildChange = (
    patch: Parameters<typeof state.mergePropBuildScoped>[0]
  ) => state.mergePropBuildScoped(patch);
  return { performer, onBuildChange };
}

describe("a performer's build override leaves the grip on the scene default", () => {
  it("stores only the finish when a performer picks one", () => {
    const { performer, onBuildChange } = makePerformer();

    writeFinish("day", onBuildChange);

    expect(performer.settings.propBuild).toEqual({ finish: "day" });
  });

  it("follows a scene grip change after a finish override", () => {
    const { performer, onBuildChange } = makePerformer();
    propFinishState.setTriangleGrip("corner");
    writeFinish("day", onBuildChange);

    propFinishState.setTriangleGrip("side");

    expect(performer.effectivePropBuild.triangleGrip).toBe("side");
    expect(performer.effectivePropBuild.finish).toBe("day");
  });

  it("follows the Grip pills' setting through the picker's grip sync", async () => {
    await initializeAppServices();
    const { performer, onBuildChange } = makePerformer();
    const sync = mountGripSync();
    cleanups.push(sync.dispose);
    writeFinish("day", onBuildChange);

    await updateSettings({ triangleGrip: "side" });
    flushSync();

    expect(performer.effectivePropBuild.triangleGrip).toBe("side");
  });

  it("keeps an earlier finish override when the fan appearance changes", () => {
    const { performer, onBuildChange } = makePerformer();
    writeFinish("day", onBuildChange);

    writeFanAppearance(
      { build: "lotus", frameColor: "white", cover: "covered" },
      onBuildChange
    );

    expect(performer.settings.propBuild).toEqual({
      finish: "day",
      fanBuild: "lotus",
      fanFrameColor: "white",
      fanCover: "covered",
    });
  });
});
