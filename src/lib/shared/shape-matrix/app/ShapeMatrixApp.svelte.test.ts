import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

// The component harness stubs `browser` as false; this suite runs in one.
vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

import ShapeMatrixApp from "./ShapeMatrixApp.svelte";

/**
 * Regression for the "Cannot access 'z' before initialization" crash on
 * opening Create > Shape Engine. The shell's focus-mode `$effect.pre` ran
 * during component setup and read `focusMode` before its declaration. Mounting
 * the real app is the only way to catch an ordering mistake like that: it
 * throws at mount, not at type-check or build time.
 */
describe("ShapeMatrixApp mount", () => {
  it.each(["standalone", "embedded"] as const)(
    "mounts the %s shell without throwing",
    (variant) => {
      const view = render(ShapeMatrixApp, {
        target: document.body,
        props: { variant },
      });
      expect(
        view.container.querySelector(".shape-matrix-app-host")
      ).not.toBeNull();
      view.unmount();
    }
  );
});
