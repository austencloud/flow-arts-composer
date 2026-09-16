import { getStandaloneRenderer } from "./src/core/standalone-renderer.js";
import { Orientation } from "./src/core/enums.js";
import { writeFileSync } from "fs";

const input = {
  letter: "Q",
  startPlacement: "gamma11",
  endPlacement: "gamma5",
  leftMotion: {
    motionType: "anti",
    rotationDirection: "cw",
    startLocation: "s",
    endLocation: "e",
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    hand: "left",
    turns: 1,
  },
  rightMotion: {
    motionType: "anti",
    rotationDirection: "ccw",
    startLocation: "e",
    endLocation: "s",
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    hand: "right",
    turns: 1,
  },
};

async function main() {
  console.log("Starting render...");
  const renderer = getStandaloneRenderer();
  console.log("Got renderer");
  const base64 = await renderer.renderToBase64(input, {
    darkMode: true,
    showTKA: true,
    showTND: true,
    showPlacements: true,
    showGrid: true,
    showLeftMotion: true,
    showRightMotion: true,
    size: 500,
  });
  console.log("Got base64, length:", base64.length);
  writeFileSync("C:/Users/Austen/Desktop/pictograph-Q.png", Buffer.from(base64, "base64"));
  console.log("Done! Saved to C:/Users/Austen/Desktop/pictograph-Q.png");
}

main().catch(e => console.error("Error:", e));
