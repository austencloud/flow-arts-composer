/**
 * A decorative tunnel (the Create front door's Tunnel preview) sits inside a
 * card button, so it must offer no controls of its own: no tap to pause, no
 * hover badge, no corner toggle, and no context menu.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte"
  ),
  "utf8"
);

describe("TunnelArtView decorative mode", () => {
  it("declares the prop with a default of false", () => {
    expect(source).toMatch(/decorative = false,/);
    expect(source).toMatch(/decorative\?: boolean;/);
  });

  it("turns off every canvas control when decorative", () => {
    expect(source).toMatch(/tapToToggle=\{!decorative\}/);
    expect(source).toMatch(/hoverHint=\{decorative \? "none" : "badge"\}/);
    expect(source).toMatch(/cornerToggle=\{!decorative\}/);
    expect(source).toMatch(/disableContextMenu=\{decorative\}/);
  });
});
