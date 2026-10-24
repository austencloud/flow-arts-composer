/**
 * Finds the farm fields in the open land around the festival.
 *
 * The registered ground-family mask paints every open hillside as forest litter, so the
 * farmland reads as brown dirt. This marks open land from the LiDAR canopy-height scan
 * (no canopy over 1.5 m) that the mask left as litter, and tells green crop from dry hay
 * or stubble by the orthophoto's colour. Content/Data/ground-fields.rg holds two bytes a
 * cell on the family mask's 512 x 512 grid, rows south to north like the mask:
 * field weight, then dryness (0 green crop rows, 1 dry hay or stubble).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const smooth = (lo, hi, v) => { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

function blur(values, size, radius) {
  const out = new Float32Array(values.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      sum += values[sy * size + sx]; count++;
    }
    out[y * size + x] = sum / count;
  }
  return out;
}

export async function classifyFields(dataDir, sharp) {
  const site = JSON.parse(readFileSync(join(dataDir, 'site.json'), 'utf8'));
  const { width: gridW, height: gridH } = site.terrain;
  const ground = site.groundSurface;
  const size = ground.width;
  if (ground.height !== size) throw new Error('Field classification expects a square ground mask');
  const canopyBytes = readFileSync(join(dataDir, site.terrain.canopyFile));
  const canopy = new Uint16Array(canopyBytes.buffer, canopyBytes.byteOffset, canopyBytes.length / 2);
  if (canopy.length !== gridW * gridH) throw new Error('Canopy scan size does not match the terrain grid');
  const mask = readFileSync(join(dataDir, ground.file));
  const ortho = await sharp(join(dataDir, site.terrain.imageryFile)).resize(size, size).removeAlpha().raw().toBuffer();
  const metresPerCell = (ground.maxX - ground.minX) / size;
  const field = new Float32Array(size * size), dryness = new Float32Array(size * size);
  for (let row = 0; row < size; row++) for (let x = 0; x < size; x++) {
    const north = size - 1 - row; // ortho and canopy rows run north to south
    let top = 0;
    for (let dz = 0; dz < metresPerCell; dz++) for (let dx = 0; dx < metresPerCell; dx++) {
      const gx = Math.min(gridW - 1, Math.round(x * metresPerCell + dx)), gz = Math.min(gridH - 1, Math.round(north * metresPerCell + dz));
      const offset = canopy[gz * gridW + gx];
      if (offset !== 65535) top = Math.max(top, offset / 100);
    }
    const cell = row * size + x;
    field[cell] = smooth(4, 1.5, top) * (mask[cell * 4 + 2] / 255);
    // The orthophoto is hazy and blue; green crops still read redder-blue than dry fields.
    const pixel = (north * size + x) * 3;
    dryness[cell] = smooth(-24, -8, ortho[pixel] - ortho[pixel + 2]);
  }
  const soft = blur(field, size, 1), dry = blur(dryness, size, 3);
  const out = Buffer.alloc(size * size * 2);
  let fieldCells = 0, dryCells = 0;
  for (let cell = 0; cell < size * size; cell++) {
    out[cell * 2] = Math.round(soft[cell] * 255);
    out[cell * 2 + 1] = Math.round(dry[cell] * 255);
    if (soft[cell] > .5) { fieldCells++; dryCells += dry[cell] > .5; }
  }
  writeFileSync(join(dataDir, 'ground-fields.rg'), out);
  return { size, fieldShare: fieldCells / (size * size), dryShare: fieldCells ? dryCells / fieldCells : 0, bytes: out };
}
