/**
 * Generate a showcase grid of 6 pictographs demonstrating all elemental types
 */
import { writeFileSync } from "fs";
import { getStandaloneRenderer } from "./src/core/standalone-renderer.js";
import { Resvg } from "@resvg/resvg-js";

// Real pictograph data from the TKA database
const pictographs = [
  {
    name: "A - Water (SS)",
    data: {
      letter: "A",
      startPlacement: "alpha3",
      endPlacement: "alpha5",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "w",
        endLocation: "n",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
  {
    name: "D - Fire (SO)",
    data: {
      letter: "D",
      startPlacement: "beta3",
      endPlacement: "alpha5",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "ccw",
        startLocation: "e",
        endLocation: "n",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
  {
    name: "G - Earth (TS)",
    data: {
      letter: "G",
      startPlacement: "beta3",
      endPlacement: "beta5",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
  {
    name: "J - Air (TO)",
    data: {
      letter: "J",
      startPlacement: "alpha3",
      endPlacement: "beta5",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "ccw",
        startLocation: "w",
        endLocation: "s",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
  {
    name: "S - Sun (QS)",
    data: {
      letter: "S",
      startPlacement: "gamma3",
      endPlacement: "gamma5",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
  {
    name: "M - Moon (QO)",
    data: {
      letter: "M",
      startPlacement: "gamma3",
      endPlacement: "gamma13",
      leftMotion: {
        motionType: "pro",
        rotationDirection: "ccw",
        startLocation: "n",
        endLocation: "w",
        hand: "left",
        turns: 1,
      },
      rightMotion: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        hand: "right",
        turns: 1,
      },
    },
  },
];

async function main() {
  const renderer = getStandaloneRenderer();
  const cellSize = 400;
  const cols = 3;
  const rows = 2;
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;

  console.log("Generating 6 pictographs showcasing all elemental types...\n");

  // Generate each pictograph as SVG
  const svgCells: string[] = [];

  for (let i = 0; i < pictographs.length; i++) {
    const { name, data } = pictographs[i];
    console.log(`Rendering ${name}...`);

    const svg = await renderer.renderToSvg(data, {
      darkMode: true,
      showTKA: true,
      showTND: true,
      showElemental: true,
      showPlacements: true,
      showGrid: true,
      showLeftMotion: true,
      showRightMotion: true,
    });

    // Extract inner content (without xml declaration and outer svg tag)
    const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    const innerContent = innerMatch ? innerMatch[1] : "";

    // Calculate position in grid
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellSize;
    const y = row * cellSize;

    // Wrap in a group with transform and clip
    svgCells.push(`
      <g transform="translate(${x}, ${y})">
        <clipPath id="clip${i}">
          <rect width="${cellSize}" height="${cellSize}"/>
        </clipPath>
        <g clip-path="url(#clip${i})">
          <g transform="scale(${cellSize / 950})">
            ${innerContent}
          </g>
        </g>
      </g>
    `);
  }

  // Create the combined SVG
  const combinedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridWidth} ${gridHeight}" width="${gridWidth}" height="${gridHeight}">
  <rect width="${gridWidth}" height="${gridHeight}" fill="#0a0a0f"/>
  ${svgCells.join("\n")}
</svg>`;

  // Save SVG
  writeFileSync("C:/Users/Austen/Desktop/pictograph-showcase.svg", combinedSvg);
  console.log("\nSVG saved to: C:/Users/Austen/Desktop/pictograph-showcase.svg");

  // Convert to PNG
  const resvg = new Resvg(combinedSvg, {
    fitTo: { mode: "width", value: gridWidth },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  writeFileSync("C:/Users/Austen/Desktop/pictograph-showcase.png", pngBuffer);
  console.log("PNG saved to: C:/Users/Austen/Desktop/pictograph-showcase.png");

  console.log("\n✓ All 6 elemental types rendered successfully!");
  console.log("  Water (cyan) | Fire (yellow) | Earth (green)");
  console.log("  Air (gradient) | Sun (gold) | Moon (purple)");
}

main().catch(console.error);
