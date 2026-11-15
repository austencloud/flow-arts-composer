import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The sheet's swipe handler ignores `data-swipe-block`, so the marker alone
 * does nothing: the 3D view's root also has to stop the press itself
 * (block-sheet-swipe.ts, proven in DrawerSwipeBlock.svelte.test.ts). Dropping
 * the action is silent until someone drags down to orbit the camera and the
 * whole sequence viewer slides away.
 */
describe("3D viewer root and the sheet's swipe-to-close", () => {
  it("stops presses at the element it marks as not-a-swipe", () => {
    const source = readFileSync(
      resolve("src/lib/shared/3d/components/Viewer3DCanvas.svelte"),
      "utf8"
    );
    // The tag holds an arrow function, so it ends at the first line that is
    // only `>`, not at the first `>`.
    const start = source.indexOf('class="viewer-3d-canvas"');
    const end = source.indexOf("\n>", start);
    const rootTag = start < 0 || end < 0 ? "" : source.slice(start, end);

    expect(rootTag, "found the viewer root tag").not.toBe("");
    expect(rootTag).toContain("data-swipe-block");
    expect(rootTag).toMatch(/use:blockSheetSwipe\b/);
  });
});
