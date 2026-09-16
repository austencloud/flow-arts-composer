import { describe, expect, it } from "vitest";
import { calculateHandColorKeyLayout } from "@tka/render-core";
import {
  getStandaloneRenderer,
  type PictographInput,
} from "../src/core/standalone-renderer.js";

// Real start position: alpha1, both hands static and pointing in.
const START_PLACEMENT: PictographInput = {
  letter: "α",
  startPlacement: "alpha1",
  endPlacement: "alpha1",
  gridMode: "diamond",
  leftMotion: {
    motionType: "static",
    startLocation: "s",
    endLocation: "s",
    rotationDirection: "no_rotation",
    hand: "left",
    turns: 0,
    startOrientation: "in",
  },
  rightMotion: {
    motionType: "static",
    startLocation: "n",
    endLocation: "n",
    rotationDirection: "no_rotation",
    hand: "right",
    turns: 0,
    startOrientation: "in",
  },
} as PictographInput;

function keyGroup(svg: string): string | null {
  const match = svg.match(/<g class="hand-color-key"[^>]*>[\s\S]*?<\/g>/);
  return match ? match[0] : null;
}

describe("standalone renderer hand colour key", () => {
  it("omits the key unless the caller marks a start position", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(START_PLACEMENT, {
      showTKA: false,
    });
    expect(keyGroup(svg)).toBeNull();
  });

  it("bakes both swatches into the start position with the shared geometry", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(START_PLACEMENT, {
      showTKA: false,
      showHandColorKey: true,
      primaryPropColors: { left: "#00ffaa", right: "#ff8800" },
    });
    const group = keyGroup(svg);
    expect(group).not.toBeNull();
    const layout = calculateHandColorKeyLayout(true, true);
    const [left, right] = layout.entries;
    expect(group).toContain(`translate(475, 0)`);
    expect(group).toContain(`font-family="Georgia, serif"`);
    expect(group).toContain(
      `<circle cx="${left.swatchX}" cy="${layout.centerY}" r="${layout.swatchRadius}" fill="#00ffaa"/>`
    );
    expect(group).toContain(
      `<circle cx="${right.swatchX}" cy="${layout.centerY}" r="${layout.swatchRadius}" fill="#ff8800"/>`
    );
    expect(group).toContain(`<text x="${left.labelX}" y="${layout.baselineY}">L</text>`);
    expect(group).toContain(`<text x="${right.labelX}" y="${layout.baselineY}">R</text>`);
  });

  it("drops a hidden hand and recentres the remaining pair", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(START_PLACEMENT, {
      showTKA: false,
      showHandColorKey: true,
      showLeftMotion: false,
    });
    const group = keyGroup(svg);
    expect(group).not.toBeNull();
    expect(group).not.toContain(">L<");
    const lone = calculateHandColorKeyLayout(false, true);
    const [only] = lone.entries;
    expect(group).toContain(`<text x="${only.labelX}" y="${lone.baselineY}">R</text>`);
  });
});
