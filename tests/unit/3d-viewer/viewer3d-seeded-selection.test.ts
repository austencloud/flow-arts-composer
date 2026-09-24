// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { __resetWebGL2CapabilityForTests } from "$lib/shared/3d/capabilities/webgl-capabilities";
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
  localStorage.removeItem("tka-viewer3d-selectedIndices");
  localStorage.removeItem("tka-viewer3d-selectedIndex");
  __resetWebGL2CapabilityForTests();
});

afterAll(() => {
  restoreCreateElement?.();
  __resetWebGL2CapabilityForTests();
});

// The real viewer persists "[]" after "No performers" is chosen. A seeded
// preview must not inherit that: the seed contract says a seeded field is used
// INSTEAD OF storage, and seeded viewers never write back, so an inherited
// empty selection would survive every reload and silently drop every edit.
function leaveEmptySelectionInStorage(): void {
  localStorage.setItem("tka-viewer3d-selectedIndices", "[]");
  localStorage.setItem("tka-viewer3d-selectedIndex", "null");
}

describe("viewer-3d seeded performer selection", () => {
  it("uses a seeded single index instead of the stored multi-selection", () => {
    leaveEmptySelectionInStorage();
    const { state, dispose } = createViewer3DStateForTest({
      selectedPerformerIndex: 0,
    });
    try {
      state.enter3D();
      expect(state.selectedPerformerIndices).toEqual([0]);
    } finally {
      dispose();
    }
  });

  it("treats a seeded null index as every performer", () => {
    leaveEmptySelectionInStorage();
    const { state, dispose } = createViewer3DStateForTest({
      selectedPerformerIndex: null,
    });
    try {
      state.enter3D();
      expect(state.selectedPerformerIndices).toEqual([0]);
      expect(state.selectedPerformerIndex).toBeNull();
    } finally {
      dispose();
    }
  });

  it("still restores the stored selection when nothing is seeded", () => {
    leaveEmptySelectionInStorage();
    const { state, dispose } = createViewer3DStateForTest({ persistent: true });
    try {
      state.enter3D();
      expect(state.selectedPerformerIndices).toEqual([]);
    } finally {
      dispose();
    }
  });
});
