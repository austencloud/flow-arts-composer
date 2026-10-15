/** Reject incomplete or stale capture data both before cook and in the archive. */
import { readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexMotionManifest, validateFamilyMotion } from '../../Shared/Tools/motion-contract.mjs';

const data = resolve(process.argv[2] || fileURLToPath(new URL('../Content/Data/', import.meta.url)));
const read = name => JSON.parse(readFileSync(join(data, name), 'utf8'));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
const characters = read('characters.json').characters;
const props = read('props.json').props;
requireValue(characters?.length === 16 && unique(characters.map(c => c.id)), 'Expected 16 unique original characters');
requireValue(props?.length === 41 && unique(props.map(p => p.id)), 'Expected 41 unique original prop families');
requireValue(props.flatMap(p => p.variants).length === 71, 'Expected 71 original equipment variants');
for (const prop of props) {
  requireValue(/^[a-z0-9_]+$/.test(prop.id), `Invalid prop ID: ${prop.id}`);
  requireValue(unique(prop.variants.map(v => v.id)), `Duplicate variant: ${prop.id}`);
  for (const variant of prop.variants)
    requireValue(variant.mesh && variant.rightMesh, `Missing left/right equipment: ${prop.id}/${variant.id}`);
}

const site = read('site.json');
const terrain = site.terrain;
requireValue(site.version === 1 && Number.isInteger(terrain?.width) && Number.isInteger(terrain?.height) &&
  terrain.width >= 2 && terrain.width <= 4097 && terrain.height >= 2 && terrain.height <= 4097,
  'Invalid terrain grid');
for (const field of ['heightFile', 'imageryFile', 'canopyFile', 'manifestFile']) {
  const name = terrain[field];
  requireValue(typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name), `Invalid terrain ${field}`);
  requireValue(statSync(join(data, name)).size > 0, `Empty terrain ${field}`);
}
requireValue(statSync(join(data, terrain.heightFile)).size === terrain.width * terrain.height * 4,
  'Height grid byte count does not match dimensions');
requireValue(site.grass?.length >= 20000 && site.groundLife?.length >= 20, 'Missing living ecology');

const legacy = ['FirePoi', 'FireHoop', 'Juggler', 'LedFlow'];
const locomotion = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Land', 'Backward', 'StrafeLeft',
  'StrafeRight', 'RunStrafeLeft', 'RunStrafeRight', 'Ride'];
const profiles = [...legacy, ...props.flatMap(p => [`P_${p.id}_A`, `P_${p.id}_B`])];
const manifest = read('PropMotion/manifest.json');
requireValue(manifest.schema === 'flow-fest-prop-motion-manifest-v1' && Array.isArray(manifest.clips),
  'Invalid compact motion manifest');
const manifestMap = indexMotionManifest(manifest);
requireValue(manifestMap.size === 1376 && manifest.clips.length === 1376,
  `Expected exactly 1376 unique compact clips, found ${manifest.clips.length}`);
let frameCount = 0;
for (const character of characters) {
  requireValue(/^[a-z0-9_-]+$/.test(character.id), `Invalid character ID: ${character.id}`);
  const key = character.id.replaceAll('-', '_');
  for (const motion of [...locomotion, ...profiles.map(p => `Flow_${p}`)])
    requireValue(character.animations?.[motion]?.startsWith(`/Game/FlowFest/Characters/${key}/`),
      `${character.id}: missing native animation ${motion}`);
  for (const profile of profiles) {
    const name = `${key}_${profile}.json`;
    const clip = read(`PropMotion/${name}`);
    const family = /^P_(.+)_[AB]$/.exec(profile)?.[1];
    requireValue(clip.character === character.id && clip.profile === profile && clip.fps === 30 &&
      clip.frames?.length === 480 && clip.sourceFrameCount === 480, `Invalid clip identity/timing: ${name}`);
    const entry = manifestMap.get(`${character.id}/${profile}`);
    requireValue(entry?.filename === name && entry.frames === 480, `Manifest mismatch: ${name}`);
    let stride;
    if (family) {
      const result = validateFamilyMotion(clip, { characterId: character.id, propId: family,
        routine: profile.slice(-1), manifestEntry: entry });
      frameCount += result.frames;
      continue;
    } else {
      requireValue(['flow-fest-prop-motion-v1', 'flow-fest-prop-motion-v2'].includes(clip.schema),
        `Invalid legacy schema: ${name}`);
      stride = clip.schema.endsWith('v2') ? 20 : 14;
    }
    for (let index = 0; index < clip.frames.length; index++) {
      const frame = clip.frames[index];
      requireValue(Array.isArray(frame) && frame.length === stride && frame.every(Number.isFinite),
        `Nonfinite or incomplete frame: ${name}/${index}`);
      for (const offset of [3, 10]) {
        const norm = Math.hypot(...frame.slice(offset, offset + 4));
        requireValue(Math.abs(norm - 1) < .001, `Invalid rotation: ${name}/${index}/${offset}`);
      }
      frameCount++;
    }
  }
}
console.log(JSON.stringify({ status: 'PASS', characters: 16, propFamilies: 41, variants: 71,
  animationReferences: 1568, familyClips: 1312, compactClips: 1376, checkedFrames: frameCount,
  captureRevision: 'clock-isolated-body-v3', data }, null, 2));
