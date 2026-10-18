import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Read the five actual wick ends from the authored fan GLB, in source prop centimeters. */
export function readFanWickTips(path, build, scale = 1) {
  if (build !== 'fire' && build !== 'lotus') throw new Error(`Fan build has no wicks: ${build}`);
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(16) !== 0x4E4F534A)
    throw new Error(`Expected a GLB with a JSON chunk: ${path}`);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
  const prefix = `Fan_${build === 'fire' ? 'Fire' : 'Lotus'}_Wick_`;
  const roots = json.nodes.filter(node => node.name === `Fan_${build === 'fire' ? 'Fire' : 'Lotus'}`);
  if (roots.length !== 1 || roots[0].matrix || roots[0].translation || roots[0].rotation || roots[0].scale)
    throw new Error(`Unsupported transformed fan build root: ${build}`);
  const tips = [];
  for (let index = 1; index <= 5; ++index) {
    const matches = json.nodes.map((node, nodeIndex) => ({ node, nodeIndex }))
      .filter(({ node }) => node.name === `${prefix}${index}`);
    if (matches.length !== 1 || !roots[0].children.includes(matches[0].nodeIndex))
      throw new Error(`Missing direct authored wick ${prefix}${index}`);
    const { node } = matches[0];
    const primitive = json.meshes[node.mesh]?.primitives[0];
    const halfLength = json.accessors[primitive?.attributes?.POSITION]?.max?.[1];
    if (!node.translation || !node.rotation || !(halfLength > 0))
      throw new Error(`Unsupported wick geometry: ${node.name}`);
    const [x, y, z, w] = node.rotation;
    // The wick mesh's +Y cap is its outward tip. The authored GLB's -Z is
    // the prop's +Y hand axis after the native Blender import/rest rotation.
    const tipX = node.translation[0] + 2 * (x * y - z * w) * halfLength;
    const tipY = -(node.translation[2] + (2 * (y * z + x * w)) * halfLength);
    tips.push([tipX * 100 * scale, tipY * 100 * scale, 0]);
  }
  return tips;
}

/** Attachment points in the same authored centimeters as the imported prop meshes. */
export function propTipOffsets(id, variant, scale, source) {
  if (id === 'fan' || id === 'bigfan') {
    if (variant.fanBuild === 'fire' || variant.fanBuild === 'lotus')
      return readFanWickTips(join(source, 'static/models/props/fan.glb'), variant.fanBuild, scale);
    return Array.from({ length: 5 }, (_, i) => {
      const angle = -.77 + i * .385;
      return [Math.sin(angle) * 45 * scale, Math.cos(angle) * 50 * scale, 0];
    });
  }
  if (['triad', 'bigtriad', 'quiad'].includes(id)) {
    const arms = id === 'quiad' ? 4 : 3;
    const reach = 90 * (id === 'quiad' ? .43202 : .44707) * 1.104 * scale;
    return Array.from({ length: arms }, (_, i) => [Math.sin(i * 2 * Math.PI / arms) * reach,
      Math.cos(i * 2 * Math.PI / arms) * reach, 0]);
  }
  if (id === 'minihoop' || id === 'bighoop') {
    const radius = (46.99 / 2 - 1.5875 / 2) * scale;
    return [[0, 0, 0], [radius, radius, 0], [0, 2 * radius, 0], [-radius, radius, 0]];
  }
  if (['staff','simple_staff','staff_v2','bigstaff','fire_double_staff','stick','capsule_baton'].includes(id)) {
    const end = id === 'capsule_baton' ? 43.18 : 45 * scale;
    return [[0, end, 0], [0, -end, 0]];
  }
  if (id === 'club' || id === 'bigclub') return [[0, 43 * scale, 0]];
  if (id === 'poi') return [[0, 48, 0]];
  if (id === 'torch' || id === 'bigtorch') return [[0, 59.335 * .9 * scale, 0]];
  return [];
}
