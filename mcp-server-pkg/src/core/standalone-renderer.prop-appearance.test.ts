import { createCanvas, loadImage } from "@napi-rs/canvas/node-canvas.js";
import { describe, expect, it } from "vitest";
import { getStandaloneRenderer, type PictographInput } from "./standalone-renderer.js";

const input: PictographInput = {
  letter: "A",
  gridMode: "diamond",
  leftMotion: {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    hand: "left",
    turns: 1,
  },
  rightMotion: {
    motionType: "anti",
    rotationDirection: "ccw",
    startLocation: "s",
    endLocation: "w",
    startOrientation: "in",
    hand: "right",
    turns: 1,
  },
};

async function pixels(png: Buffer): Promise<Uint8ClampedArray> {
  const canvas = createCanvas(280, 280);
  const context = canvas.getContext("2d");
  context.drawImage(await loadImage(png), 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function changedPixels(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < left.length; index += 4) {
    if (
      left[index] !== right[index] ||
      left[index + 1] !== right[index + 1] ||
      left[index + 2] !== right[index + 2] ||
      left[index + 3] !== right[index + 3]
    ) {
      changed++;
    }
  }
  return changed;
}

describe("packaged standalone prop appearances", () => {
  it("rasterizes the app's pale dark-mode grid treatment", async () => {
    const rendered = await pixels(
      await getStandaloneRenderer().renderToPng(input, {
        darkMode: true,
        size: 280,
        showGrid: true,
        showTKA: false,
      })
    );
    let paleGridPixels = 0;
    for (let index = 0; index < rendered.length; index += 4) {
      if (
        rendered[index] >= 210 &&
        rendered[index + 1] >= 210 &&
        rendered[index + 2] >= 210
      ) {
        paleGridPixels++;
      }
    }

    // The canonical canvas applies white at 85% opacity over #0a0a0f, which
    // lands around #d9d9d9. The old #d0 source composited to about #b3b3b3.
    expect(paleGridPixels).toBeGreaterThan(10);
  });

  it("rasterizes canonical physical fan artwork and keeps each hand's prop independent", async () => {
    const renderer = getStandaloneRenderer();
    const shared = {
      darkMode: true,
      size: 280,
      showGrid: false,
      showTKA: false,
      leftPropType: "fan",
      rightPropType: "staff",
    } as const;

    const fire = await pixels(
      await renderer.renderToPng(input, {
        ...shared,
        fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      })
    );
    const day = await pixels(
      await renderer.renderToPng(input, {
        ...shared,
        fanAppearance: { build: "day", frameColor: "white", cover: "covered" },
      })
    );
    const staffOnly = await pixels(
      await renderer.renderToPng(input, {
        ...shared,
        leftPropType: "staff",
      })
    );

    // This checks rendered pixels rather than SVG text: the selected fan build
    // must survive the Node raster path, and changing only the left prop must
    // not replace the right-hand staff.
    expect(changedPixels(fire, day)).toBeGreaterThan(1_000);
    expect(changedPixels(fire, staffOnly)).toBeGreaterThan(1_000);
  });
});
