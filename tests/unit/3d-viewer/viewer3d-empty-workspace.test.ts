// @vitest-environment jsdom

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { __resetWebGL2CapabilityForTests } from "#lib/shared/3d/capabilities/webgl-capabilities.js";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";

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
  localStorage.removeItem("tka-viewer3d-renderMode");
  __resetWebGL2CapabilityForTests();
});

afterAll(() => {
  restoreCreateElement?.();
  __resetWebGL2CapabilityForTests();
});

describe("viewer-3d empty workspace", () => {
  it("preserves Blossom's authored composition through the welcome camera handoff", () => {
    const { state, dispose } = createViewer3DStateForTest({
      environmentId: "blossom",
    });
    vi.stubGlobal("innerWidth", 375);
    vi.stubGlobal("innerHeight", 667);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    try {
      state.enter3D();
      const move = vi.fn();
      state.registerSnapTo(move);
      expect(move).toHaveBeenCalledWith(
        { x: 10, y: 9, z: -28 },
        { x: -3, y: 4, z: 6 },
        undefined,
        true,
        undefined
      );
    } finally {
      dispose();
      vi.unstubAllGlobals();
    }
  });

  it("keeps 3D active while choreography is cleared", () => {
    const { state, dispose } = createViewer3DStateForTest({});

    try {
      state.enter3D();
      const performer = state.performerManager.performers[0];
      expect(performer).toBeDefined();
      if (!performer) throw new Error("expected a neutral performer");

      const clearSequence = vi.spyOn(performer, "clearSequence");
      state.exit3D();

      state.enter3D();

      expect(state.renderMode).toBe("3d");
      expect(state.performerManager.performers).toHaveLength(1);
      expect(clearSequence).toHaveBeenCalledOnce();
    } finally {
      dispose();
    }
  });
});
