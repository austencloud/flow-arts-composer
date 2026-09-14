import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SELECTIVE_COLOR_PROP_TYPES,
  applyMotionColorToSvg,
  getMotionColor,
} from "$lib/shared/utils/svg-color-utils";

// The "buttons" family deliberately diverges from every other renderer: it
// crops the viewBox down to the painted artwork so the family-tile picker
// doesn't draw the prop at half size inside its icon (see commit
// b267e856d5). Everything after the `<svg ...>` opening tag stays identical
// to the canonical artwork -- only the viewBox window changes -- so the
// silhouette and material split are still shared, just re-windowed.
const FULL_SILHOUETTE_FAMILIES = [
  "static/images/props",
  "static/images/props/animated",
  "static/images/props/pictograph",
  "mcp-server-pkg/assets/images/props",
  "mcp-server-pkg/assets/images/props/animated",
  "mcp-server-pkg/assets/images/props/pictograph",
] as const;

const BUTTON_TILE_FAMILIES = [
  "static/images/props/buttons",
  "mcp-server-pkg/assets/images/props/buttons",
] as const;

const CLUB_ASSETS = FULL_SILHOUETTE_FAMILIES.map(
  (family) => `${family}/club.svg`
);
const CLASSIC_CLUB_ASSETS = FULL_SILHOUETTE_FAMILIES.map(
  (family) => `${family}/classic_club.svg`
);
const CLUB_BUTTON_ASSETS = BUTTON_TILE_FAMILIES.map(
  (family) => `${family}/club.svg`
);
const CLASSIC_CLUB_BUTTON_ASSETS = BUTTON_TILE_FAMILIES.map(
  (family) => `${family}/classic_club.svg`
);

function readAsset(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function clubPart(svg: string, part: string): string {
  const tag = new RegExp(
    `<[^>]+data-club-part=["']${part}["'][^>]*>`,
    "i"
  ).exec(svg)?.[0];
  if (!tag) throw new Error(`Missing club part: ${part}`);
  return tag;
}

/** Strips the opening `<svg ...>` tag's viewBox so a cropped icon tile can
 * be compared against the full-canvas canonical render without the crop
 * itself registering as a mismatch. */
function withoutViewBox(svg: string): string {
  return svg.replace(/(<svg\b[^>]*)\sviewBox="[^"]*"/, "$1");
}

describe("regular 2D club artwork", () => {
  it("keeps every renderer on the same measured silhouette and material split", () => {
    const canonical = readAsset(CLUB_ASSETS[0]!);

    expect(canonical).toContain('viewBox="0 0 258.67 34.17"');
    expect(canonical).toContain('data-club-art="regular"');
    for (const part of ["knob", "handle", "marker", "body", "cap"]) {
      expect(clubPart(canonical, part)).toBeTruthy();
    }
    for (const path of CLUB_ASSETS.slice(1)) {
      expect(readAsset(path)).toBe(canonical);
    }

    // The button-tile crop re-windows the same artwork -- same silhouette
    // and material split, cropped viewBox -- and both button copies (main
    // app + mcp-server-pkg mirror) must stay in lockstep with each other.
    const buttonCanonical = readAsset(CLUB_BUTTON_ASSETS[0]!);
    expect(buttonCanonical).toContain('viewBox="125 0 133.67 34.17"');
    expect(withoutViewBox(buttonCanonical)).toBe(withoutViewBox(canonical));
    for (const path of CLUB_BUTTON_ASSETS.slice(1)) {
      expect(readAsset(path)).toBe(buttonCanonical);
    }
  });

  it.each(["blue", "red"] as const)(
    "colors only the club body %s",
    (motionColor) => {
      const original = readAsset(CLUB_ASSETS[0]!);
      const colored = applyMotionColorToSvg(original, motionColor, {
        selectiveColorMode: true,
        themeMode: "dark",
      });

      expect(SELECTIVE_COLOR_PROP_TYPES as readonly string[]).toContain("club");
      expect(clubPart(colored, "body")).toContain(
        `fill="${getMotionColor(motionColor, "dark")}"`
      );
      expect(clubPart(colored, "knob")).toContain('fill="#7B8798"');
      expect(clubPart(colored, "handle")).toContain('fill="#BAC5D4"');
      expect(clubPart(colored, "marker")).toContain('fill="#141416"');
      expect(clubPart(colored, "cap")).toContain('fill="#7B8798"');
    }
  );

  it("keeps the original flat scan as a separate, synchronized Classic Club build", () => {
    const canonical = readAsset(CLASSIC_CLUB_ASSETS[0]!);

    expect(canonical).toContain('viewBox="0 0 258.67 34.17"');
    expect(canonical).toContain('data-club-art="classic"');
    for (const path of CLASSIC_CLUB_ASSETS.slice(1)) {
      expect(readAsset(path)).toBe(canonical);
    }

    // Same button-tile crop as the regular club, mirrored in lockstep.
    const buttonCanonical = readAsset(CLASSIC_CLUB_BUTTON_ASSETS[0]!);
    expect(buttonCanonical).toContain('viewBox="125 0 133.67 34.17"');
    expect(withoutViewBox(buttonCanonical)).toBe(withoutViewBox(canonical));
    for (const path of CLASSIC_CLUB_BUTTON_ASSETS.slice(1)) {
      expect(readAsset(path)).toBe(buttonCanonical);
    }
  });

  it.each(["blue", "red"] as const)(
    "colors the complete Classic Club silhouette %s",
    (motionColor) => {
      const original = readAsset(CLASSIC_CLUB_ASSETS[0]!);
      const colored = applyMotionColorToSvg(original, motionColor, {
        selectiveColorMode: false,
        themeMode: "dark",
      });

      expect(SELECTIVE_COLOR_PROP_TYPES as readonly string[]).not.toContain(
        "classic_club"
      );
      expect(clubPart(colored, "body")).toContain(
        `fill="${getMotionColor(motionColor, "dark")}"`
      );
    }
  );
});
