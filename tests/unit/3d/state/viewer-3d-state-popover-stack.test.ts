import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createViewer3DStateForTest } from "../../3d-viewer/viewer3d-test-helpers.svelte";
import { __resetWebGL2CapabilityForTests } from "#lib/shared/3d/capabilities/webgl-capabilities.js";

beforeAll(() => {
  const originalCreateElement = document.createElement as unknown as (tag: string) => unknown;
  (document as unknown as { createElement: (tag: string) => unknown }).createElement = (tag: string) => {
    const base = originalCreateElement(tag) as Record<string, unknown>;
    if (tag === "canvas") {
      base.getContext = () => null;
    }
    return base;
  };
  __resetWebGL2CapabilityForTests();
});

function stubDeps() {
  return {};
}

const cleanups: Array<() => void> = [];
function makeState() {
  const { state, dispose } = createViewer3DStateForTest(stubDeps());
  cleanups.push(dispose);
  return state;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("viewer-3d-state popover stack", () => {
  it("starts with no popover open", () => {
    const s = makeState();
    expect(s.activePopover).toBeNull();
  });

  it("openPopover sets the active popover", () => {
    const s = makeState();
    s.openPopover("performers");
    expect(s.activePopover).toBe("performers");
  });

  it("openPopover replaces the currently-open popover (exclusive)", () => {
    const s = makeState();
    s.openPopover("performers");
    s.openPopover("tempo");
    expect(s.activePopover).toBe("tempo");
  });

  it("closePopover clears the active popover", () => {
    const s = makeState();
    s.openPopover("export");
    s.closePopover();
    expect(s.activePopover).toBeNull();
  });

  it("openPopover with null is equivalent to closePopover", () => {
    const s = makeState();
    s.openPopover("gear");
    s.openPopover(null);
    expect(s.activePopover).toBeNull();
  });
});
