import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
} from "three";

const CELL = 128;
const COLUMNS = 2;

/** UV slots: upright glint, diagonal glint, fine dust, white-hot center. */
export const SPARKLE_UV = [
  [0, 0],
  [0.5, 0],
  [0, 0.5],
  [0.5, 0.5],
] as const;

export function createSparkleTextureAtlas3D(): DataTexture {
  const side = CELL * COLUMNS;
  const pixels = new Uint8Array(side * side * 4);

  for (let tile = 0; tile < 4; tile++) {
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const nx = ((x + 0.5) / CELL) * 2 - 1;
        const ny = ((y + 0.5) / CELL) * 2 - 1;
        const diagonal = tile === 1;
        const u = diagonal ? (nx + ny) * Math.SQRT1_2 : nx;
        const v = diagonal ? (ny - nx) * Math.SQRT1_2 : ny;
        const r = Math.hypot(nx, ny);
        const halo = Math.exp(-((r / 0.48) ** 2) * 3.2);
        const center = Math.exp(
          -((r / (tile === 3 ? 0.105 : 0.11)) ** 2) * 2.4
        );
        const horizontal =
          Math.exp(-((v / 0.018) ** 2)) *
          Math.exp(-((u / (diagonal ? 0.66 : 0.84)) ** 2) * 2.4);
        const vertical =
          Math.exp(-((u / 0.018) ** 2)) *
          Math.exp(-((v / (diagonal ? 0.84 : 0.66)) ** 2) * 2.4);
        const arms = (horizontal + vertical) * (tile === 3 ? 0.25 : 0.7);
        const opacity =
          tile === 2
            ? center * 0.85 + halo * 0.1
            : tile === 3
              ? center + arms
              : center * 0.5 + arms + halo * 0.13;
        const column = tile % COLUMNS;
        const row = Math.floor(tile / COLUMNS);
        const offset = ((row * CELL + y) * side + column * CELL + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = Math.round(Math.min(1, opacity) * 255);
      }
    }
  }

  const texture = new DataTexture(pixels, side, side, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
