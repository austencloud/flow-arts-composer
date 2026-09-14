import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const staticRoot = fileURLToPath(new URL("../../../static/", import.meta.url));

// These directories belong to the shared renderer. Keep all prop styles so a
// new choice never needs a network connection just to show its shape.
const assets = [
  "data/pictographs/DiamondPictographDataframe.csv",
  "data/hero/tnd-base-words.json",
  "data/arrow_placement",
  "images/arrows",
  "images/arrow.svg",
  "images/grid",
  "images/letters_trimmed",
  "images/numbers",
  "images/props/animated",
  "images/props/pictograph",
  "images/props/buttons",
  "images/props/appearances",
  "images/props/build-previews",
  "images/elements/norm",
  "images/elements/water-v2.webp",
  "images/elements/fire-v2.webp",
  "images/elements/earth-v2.webp",
  "images/elements/air-v2.webp",
  "images/elements/sun-v4.webp",
  "images/elements/moon-v2.webp",
  "fonts/tka/tka.woff2",
  "fonts/css/fontawesome.min.css",
  "fonts/css/solid.min.css",
  "fonts/css/fa-supplement.css",
  "fonts/webfonts/fa-solid-900.woff2",
];

await mkdir(join(appRoot, "dist"), { recursive: true });
for (const asset of assets) {
  await cp(join(staticRoot, asset), join(appRoot, "dist", asset), {
    recursive: true,
  });
}
await cp(
  join(appRoot, "assets/icon-source.png"),
  join(appRoot, "dist/shape-engine-icon.png")
);
console.log(`Bundled ${assets.length} asset groups for offline use.`);
