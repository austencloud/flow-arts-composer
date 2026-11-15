import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PropType } from "../enums/prop-type";
import { TORCH_CONTRAST_PALETTE } from "../torch-contrast";
import { colorPropPreview, previewArtworkPath } from "../prop-preview-color";

// Resolved from the repo root, as in prop-preview-color.test.ts.
const read = (path: string) => readFileSync(resolve(`static${path}`), "utf8");
const BLUE = "#3b82f6";

describe("torch tile artwork", () => {
  it.each([
    [PropType.TORCH, "torch"],
    [PropType.BIGTORCH, "bigtorch"],
  ])("draws %s with the dark palette's shaft and a flame", (type, stem) => {
    const fetched = previewArtworkPath(`/images/props/buttons/${stem}.svg`);
    expect(fetched).toBe(`/images/props/pictograph/${stem}.svg`);

    const art = colorPropPreview(read(fetched), type, BLUE);
    expect(art.toLowerCase()).toContain(TORCH_CONTRAST_PALETTE.dark.shaft);
    expect(art).toContain('data-torch-flame="true"');
  });

  it("frames the torch from its own left end through the flame", () => {
    const art = colorPropPreview(
      read("/images/props/pictograph/torch.svg"),
      PropType.TORCH,
      BLUE
    );
    // Tile box 146.5..300, grown 30 on each side for the flame, left trimmed.
    expect(art).toMatch(/viewBox="176.5 0 183.5 /);
  });

  it("leaves other props' artwork and paths untouched", () => {
    const href = "/images/props/buttons/club.svg";
    expect(previewArtworkPath(href)).toBe(href);

    const source = read("/images/props/pictograph/club.svg");
    const art = colorPropPreview(source, PropType.CLUB, BLUE);
    expect(art).not.toContain("data-torch-flame");
    expect(art).not.toContain("data-torch-contrast-frame");
  });
});
