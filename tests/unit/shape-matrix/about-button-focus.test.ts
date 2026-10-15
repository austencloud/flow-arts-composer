import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("Shape Matrix About button", () => {
  it("opens general help without storing the click event as its focus", () => {
    const source = readFileSync(
      "src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte",
      "utf8"
    );
    const button = source.match(
      /<button\b[^>]*aria-label=\{t\("shape_engine_about_name"\)\}[^]*?<\/button>/
    )?.[0];
    const expression = button?.match(/onclick=\{([^]*?)\}\s*>/)?.[1];
    expect(expression).toBeDefined();

    // Exercise the actual event binding: passing openAbout directly would save
    // the MouseEvent in aboutFocus instead of using the general-help default.
    const openAbout = vi.fn();
    const click: (event: MouseEvent) => void = runInNewContext(
      `(${expression})`,
      { appState: { openAbout } }
    );
    click(new MouseEvent("click"));
    expect(openAbout).toHaveBeenCalledExactlyOnceWith();
  });
});
