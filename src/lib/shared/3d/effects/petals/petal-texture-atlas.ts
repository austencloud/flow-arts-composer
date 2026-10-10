import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";
import {
  drawPetalSilhouette,
  type PetalSpriteShape,
} from "#lib/shared/effects/domain/petal-palettes.js";

const SHAPES: readonly PetalSpriteShape[] = [
  "round",
  "oval",
  "elongated",
  "stylized",
  "blossom_flower",
  "blossom_petal",
  "blossom_petal_folded",
  "blossom_petal_curled",
  "maple",
  "curved",
  "oak",
  "rounded",
  "double",
  "nature",
  "monstera",
  "banana",
  "fern",
  "elephant",
  "palm",
  "calathea",
  "ash_flake",
  "ash_cinder",
  "ginkgo",
];

const COLUMNS = 5;
const ROWS = Math.ceil(SHAPES.length / COLUMNS);
const CELL_SIZE = 128;
let atlas: CanvasTexture | null = null;

export interface PetalAtlasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One module-scope silhouette atlas; tint stays in the instance color. */
export function getPetalTextureAtlas(): CanvasTexture | null {
  if (atlas) return atlas;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = COLUMNS * CELL_SIZE;
  canvas.height = ROWS * CELL_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // The unit-test canvas shim intentionally implements only the operations its
  // tests exercise. A missing drawing API means "no texture" just like SSR;
  // the scene manager can still be lifecycle-tested without faking pixels.
  if (
    typeof context.save !== "function" ||
    typeof context.translate !== "function"
  ) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < SHAPES.length; index++) {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    context.save();
    context.translate(
      column * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2
    );
    drawPetalSilhouette(context, SHAPES[index]!, 50, "#ffffff");
    context.restore();
  }

  atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.magFilter = LinearFilter;
  atlas.minFilter = LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.name = "tka-petal-silhouette-atlas";
  atlas.needsUpdate = true;
  return atlas;
}

export function getPetalAtlasFrame(shape: PetalSpriteShape): PetalAtlasFrame {
  const index = Math.max(0, SHAPES.indexOf(shape));
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return {
    x: column / COLUMNS,
    y: 1 - (row + 1) / ROWS,
    width: 1 / COLUMNS,
    height: 1 / ROWS,
  };
}
