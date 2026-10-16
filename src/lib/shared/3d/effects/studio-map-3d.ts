import {
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearSRGBColorSpace,
  RGBAFormat,
} from "three";

// An owned night studio: a dim sky dome, two tall narrow softboxes that lay
// long highlight lines down the ropes, and one small hard key that leaves a
// bright glint. Everything else stays dark, so the liquid reads as glossy
// lines on a deep body instead of a uniformly lit blob. The floor version
// lifts the softboxes off the horizon: a pool seen at a low angle mirrors the
// horizon, and a light there would flood it white.
export function createStudioMap(floor = false): DataTexture {
  const width = 256;
  const height = 128;
  const pixels = new Float32Array(width * height * 4);
  // Soft-edged box with super-Gaussian falloff.
  const box = (u: number, v: number, cu: number, cv: number, w: number, h: number) => {
    let du = Math.abs(u - cu);
    du = Math.min(du, 1 - du);
    return Math.exp(-Math.pow(du / w, 6)) * Math.exp(-Math.pow((v - cv) / h, 6));
  };
  for (let y = 0; y < height; y++) {
    // Row 0 is the bottom of the equirectangular map (v = 0 looks down).
    const v = (y + 0.5) / height;
    const dome = Math.pow(Math.max(0, (v - 0.5) / 0.5), 1.2);
    const horizon = Math.exp(-Math.pow((v - 0.52) / 0.03, 2));
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const warm = floor
        ? box(u, v, 0.26, 0.8, 0.018, 0.12)
        : box(u, v, 0.26, 0.68, 0.018, 0.24);
      const cool = floor
        ? box(u, v, 0.74, 0.8, 0.014, 0.11)
        : box(u, v, 0.74, 0.7, 0.014, 0.2);
      const key = box(u, v, 0.08, 0.8, 0.03, 0.04);
      const offset = (y * width + x) * 4;
      // A low, dim glow along the floor's horizon gives pools a wet sheen.
      const sheen = floor ? 0.22 * Math.exp(-Math.pow((v - 0.55) / 0.05, 2)) : 0;
      const ground = (v < 0.5 ? 0.008 : 0) + sheen;
      pixels[offset] = ground + 0.02 + 0.1 * dome + 0.05 * horizon + 7 * warm + 3.2 * cool + 14 * key;
      pixels[offset + 1] = ground + 0.024 + 0.12 * dome + 0.06 * horizon + 6.6 * warm + 3.8 * cool + 14 * key;
      pixels[offset + 2] = ground + 0.035 + 0.17 * dome + 0.08 * horizon + 6 * warm + 4.6 * cool + 13 * key;
      pixels[offset + 3] = 1;
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
