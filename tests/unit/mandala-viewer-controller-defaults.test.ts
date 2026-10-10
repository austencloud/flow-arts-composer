import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { effect_root } from "svelte/internal/client";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  MandalaViewerController,
  type MandalaViewState,
} from "#lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.js";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

const VIEW_STORAGE_KEY = "tka_mandala_view_state";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MandalaViewerController view overrides", () => {
  it("uses local color defaults without replacing the saved viewer palette", () => {
    const savedView: MandalaViewState = {
      rotation: 45,
      speed: 1.5,
      depth: 80,
      colorMode: "flow",
      preset: "custom",
      customLeft: "#123456",
      customRight: "#654321",
      lineWeight: 4,
    };
    const legacySavedView = { ...savedView, pathShape: "arc" as const };
    const storage = new Map([
      [VIEW_STORAGE_KEY, JSON.stringify(legacySavedView)],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
    pathPolicy.setPathPolicy({
      pathShape: "concave",
      motionAwarePaths: false,
    });

    let controller!: MandalaViewerController;
    const cleanup = effect_root(() => {
      controller = new MandalaViewerController(
        {
          getSequence: () => ({ steps: [] }) as SequenceData,
          getLeftPropType: () => "staff",
          getRightPropType: () => "staff",
          pathPolicy,
        },
        {
          viewOverrides: {
            colorMode: "solid",
            preset: "custom",
            customLeft: "#0000ff",
            customRight: "#ff0000",
          },
          persistViewState: false,
        }
      );
    });

    expect(controller.colorMode).toBe("solid");
    expect(controller.show).toBe("both");
    expect(controller.customLeft).toBe("#0000ff");
    expect(controller.customRight).toBe("#ff0000");
    expect(controller.pathShape).toBe("concave");

    controller.customLeft = "#00ffff";
    controller.show = "left";
    flushSync();
    expect(controller.show).toBe("left");
    expect(JSON.parse(storage.get(VIEW_STORAGE_KEY)!)).toEqual(legacySavedView);

    cleanup();
  });

  it("keeps path shape out of the private mandala view preference", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
    let controller!: MandalaViewerController;
    const cleanup = effect_root(() => {
      controller = new MandalaViewerController({
        getSequence: () => ({ steps: [] }) as SequenceData,
        getLeftPropType: () => "staff",
        getRightPropType: () => "staff",
        pathPolicy,
      });
    });
    flushSync();

    controller.pathShape = "concave";
    flushSync();

    expect(JSON.parse(storage.get(VIEW_STORAGE_KEY)!)).not.toHaveProperty(
      "pathShape"
    );
    expect(pathPolicy.getPathShape()).toBe("concave");

    cleanup();
  });

  it("shares path-shape changes with the animation policy in both directions", () => {
    const pathPolicy = new AnimationVisibilityStateManager({ ephemeral: true });
    let controller!: MandalaViewerController;
    const cleanup = effect_root(() => {
      controller = new MandalaViewerController({
        getSequence: () => ({ steps: [] }) as SequenceData,
        getLeftPropType: () => "staff",
        getRightPropType: () => "staff",
        pathPolicy,
      });
    });
    flushSync();

    pathPolicy.setPathPolicy({
      pathShape: "concave",
      motionAwarePaths: false,
    });
    expect(controller.pathShape).toBe("concave");

    controller.pathShape = "hybrid";
    expect(pathPolicy.getPathPolicy()).toEqual({
      pathShape: "concave",
      motionAwarePaths: true,
    });

    controller.pathShape = "linear";
    expect(pathPolicy.getPathPolicy()).toEqual({
      pathShape: "linear",
      motionAwarePaths: false,
    });

    cleanup();
  });
});
