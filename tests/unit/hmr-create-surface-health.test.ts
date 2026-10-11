import { describe, expect, it } from "vitest";
import { isCreateSurfaceCollapsed } from "#lib/shared/hmr-helper.js";

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function createSurfaceRoot(
  surfaceSize: { width: number; height: number },
  hostSize: { width: number; height: number }
): ParentNode {
  const host = {
    getBoundingClientRect: () => rect(hostSize.width, hostSize.height),
  } as HTMLElement;
  const surface = {
    parentElement: host,
    getBoundingClientRect: () => rect(surfaceSize.width, surfaceSize.height),
  } as HTMLElement;

  return {
    querySelector: () => surface,
  } as unknown as ParentNode;
}

describe("Create HMR surface health", () => {
  it("detects the collapsed root that leaves only the background visible", () => {
    const root = createSurfaceRoot(
      { width: 1821, height: 1.2 },
      { width: 1821, height: 1005 }
    );

    expect(isCreateSurfaceCollapsed(root)).toBe(true);
  });

  it("accepts a Create root that fills its module host", () => {
    const root = createSurfaceRoot(
      { width: 1821, height: 1005 },
      { width: 1821, height: 1005 }
    );

    expect(isCreateSurfaceCollapsed(root)).toBe(false);
  });

  it("does not treat an unmounted or hidden module host as a failure", () => {
    const unmountedRoot = {
      querySelector: () => null,
    } as unknown as ParentNode;
    expect(isCreateSurfaceCollapsed(unmountedRoot)).toBe(false);

    const hiddenRoot = createSurfaceRoot(
      { width: 0, height: 0 },
      { width: 0, height: 0 }
    );

    expect(isCreateSurfaceCollapsed(hiddenRoot)).toBe(false);
  });
});
