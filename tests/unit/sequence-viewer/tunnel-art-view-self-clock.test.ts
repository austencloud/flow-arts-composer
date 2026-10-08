/**
 * TunnelArtView's self-clock advances the playhead only while the tunnel
 * plays, and keeps no frame loop while paused. A paused tunnel (a gallery
 * preview, or a Create method preview between turns) then costs no frames.
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

describe("TunnelArtView self-clock", () => {
  it("starts its frame loop only while playing", () => {
    expect(source).toMatch(/if \(!playing \|\| stepCount === 0\) return;/);
  });

  it("no longer ticks through pauses", () => {
    expect(source).not.toMatch(/if \(stepCount > 0 && playing\)/);
  });
});
