import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { tick } from "svelte";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { __resetWebGL2CapabilityForTests } from "#lib/shared/3d/capabilities/webgl-capabilities.js";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import { normalizeComposer3DDemoState } from "../../src/routes/(public)/composer/_components/composer-3d-demo-state";
import { createComposerViewerStateForTest } from "./composer-presentation-viewer-state.svelte";

const SAVED_STATE = {
  "tka-viewer3d-activeFormation": "circle",
  "tka-viewer3d-defaultProp": "club",
  "tka-viewer3d-effectToggles": JSON.stringify({ fire: true, trails: true }),
  "tka-viewer3d-environment": SceneEnvironmentId.OCEAN,
  "tka-viewer3d-performers": JSON.stringify(
    Array.from({ length: 8 }, (_, index) => ({
      position: { x: index, z: index },
      facingAngle: index * 10,
      customLeftPlane: "wall",
      customRightPlane: "wall",
      settings: {
        prop: "club",
        effortId: "elastic",
        effect: "fire",
        staffLengthCm: null,
      },
    }))
  ),
  "tka-viewer3d-selectedIndex": "7",
} as const;

let restoreCreateElement: (() => void) | undefined;

beforeAll(() => {
  const original = document.createElement.bind(document);
  document.createElement = ((
    tagName: string,
    options?: ElementCreationOptions
  ) => {
    const element = original(tagName, options);
    if (tagName.toLowerCase() === "canvas") {
      Object.defineProperty(element, "getContext", {
        configurable: true,
        value: (kind: string) =>
          kind === "webgl2" ? { getExtension: () => null } : null,
      });
    }
    return element;
  }) as typeof document.createElement;
  restoreCreateElement = () => {
    document.createElement = original;
  };
  __resetWebGL2CapabilityForTests();
});

afterEach(() => {
  for (const key of Object.keys(SAVED_STATE)) localStorage.removeItem(key);
  __resetWebGL2CapabilityForTests();
});

afterAll(() => {
  restoreCreateElement?.();
  __resetWebGL2CapabilityForTests();
});

describe("Composer 3D presentation isolation", () => {
  it("ignores and preserves a saved eight-performer scene", async () => {
    for (const [key, value] of Object.entries(SAVED_STATE)) {
      localStorage.setItem(key, value);
    }
    const before = Object.fromEntries(
      Object.keys(SAVED_STATE).map((key) => [key, localStorage.getItem(key)])
    );
    const { state, dispose } = createComposerViewerStateForTest();

    try {
      state.enter3D(
        createSequenceData({
          id: "composer-viewer-isolation",
          name: "Viewer isolation",
          word: "",
          steps: [],
        })
      );
      normalizeComposer3DDemoState(state);
      await tick();

      expect(state.performerManager.performers).toHaveLength(1);
      expect(state.selectedPerformerIndex).toBeNull();
      expect(state.activeFormation).toBe("line");
      expect(state.environmentId).toBe(SceneEnvironmentId.COSMIC);
      expect(state.effectToggles).toEqual({
        charcoal: false,
        fire: false,
        led: false,
        trails: false,
      });

      state.setEnvironmentId(SceneEnvironmentId.FOREST);
      state.spawnPerformerFromUI();
      await tick();

      expect(state.environmentId).toBe(SceneEnvironmentId.FOREST);
      expect(state.performerManager.performers).toHaveLength(2);
      expect(
        Object.fromEntries(
          Object.keys(SAVED_STATE).map((key) => [
            key,
            localStorage.getItem(key),
          ])
        )
      ).toEqual(before);
    } finally {
      dispose();
    }
  });
});
