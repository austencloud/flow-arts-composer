/** Refresh only fire-fan attachment coordinates in an already converted props.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readFanWickTips } from './prop-wick-geometry.mjs';

export function refreshPropWickAttachments(catalog, fanGlbPath) {
  const next = structuredClone(catalog);
  if (next.schema !== 1 || !Array.isArray(next.props)) throw new Error('Unsupported prop catalog');
  let updated = 0;
  for (const id of ['fan', 'bigfan']) {
    const matches = next.props.filter(prop => prop.id === id);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${id} prop`);
    const prop = matches[0];
    const scale = id === 'bigfan' ? 1.4 : 1;
    if (prop.scale !== scale || !Array.isArray(prop.variants)) throw new Error(`Unexpected ${id} geometry scale`);
    for (const variant of prop.variants) {
      if (variant.fanBuild !== 'fire' && variant.fanBuild !== 'lotus') continue;
      const key = `${id}_${variant.id}`.replaceAll('-', '_');
      if (variant.mesh !== `/Game/FlowFest/Props/${key}.${key}` ||
          variant.rightMesh !== `/Game/FlowFest/Props/${key}_right.${key}_right` ||
          !variant.bounds || !variant.rightBounds ||
          variant.effectAttachments?.length !== 5 ||
          variant.effectAttachments.some(attachment => attachment.type !== 'fire'))
        throw new Error(`Unexpected imported geometry or attachments: ${key}`);
      const tips = readFanWickTips(fanGlbPath, variant.fanBuild, scale);
      for (const tip of tips) {
        const [x, y] = tip;
        // Exported bounds enclose every physical wick end. A changed source
        // GLB requires a real reimport instead of silently patching metadata.
        if (x < variant.bounds.minCm[0] - .2 || x > variant.bounds.maxCm[0] + .2 ||
            y < variant.bounds.minCm[1] - .2 || y > variant.bounds.maxCm[1] + .2)
          throw new Error(`Authored wick lies outside imported mesh: ${key}`);
      }
      variant.effectAttachments = tips.map(offsetCm => ({ type: 'fire', offsetCm }));
      ++updated;
    }
  }
  if (updated !== 6) throw new Error(`Expected six fire fan variants, found ${updated}`);
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, fanGlb] = process.argv.slice(2);
  if (!input || !output || !fanGlb || input === output)
    throw new Error('Usage: node refresh-prop-wick-attachments.mjs INPUT_PROPS_JSON OUTPUT_PROPS_JSON SOURCE_FAN_GLB');
  const updated = refreshPropWickAttachments(JSON.parse(readFileSync(input, 'utf8')), fanGlb);
  writeFileSync(output, JSON.stringify(updated, null, 2) + '\n');
  console.log(`Refreshed six authored fire fan variants: ${output}`);
}
