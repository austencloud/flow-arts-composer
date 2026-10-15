/** Stage every physical Prop3D type for the native Flow Fest importer. */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const source = resolve(process.argv[2] || repo);
const staged = join(here, 'staged/Props');
mkdirSync(staged, { recursive: true });
const dependencyRoot = existsSync(join(repo, 'node_modules/.pnpm')) ? repo : source;
const pnpm = join(dependencyRoot, 'node_modules/.pnpm');
const cli = readdirSync(pnpm).find(name => name.startsWith('@gltf-transform+cli@'));
if (!cli) throw new Error('Repository gltf-transform dependency is required');
const req = createRequire(join(pnpm, cli, 'node_modules/@gltf-transform/cli/package.json'));
const { NodeIO } = await import(pathToFileURL(req.resolve('@gltf-transform/core')).href);
const { ALL_EXTENSIONS } = await import(pathToFileURL(req.resolve('@gltf-transform/extensions')).href);
const draco = (await import(pathToFileURL(req.resolve('draco3dgltf')).href)).default;
const { MeshoptDecoder } = await import(pathToFileURL(req.resolve('meshoptimizer')).href);
const sharp = (await import(pathToFileURL(createRequire(join(dependencyRoot, 'package.json')).resolve('sharp')).href)).default;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder,
});

const enumSource = readFileSync(join(source, 'node_modules/@austencloud/scene-3d/src/lib/domain/enums/PropType.ts'), 'utf8');
const types = [...enumSource.matchAll(/^\s*\w+\s*=\s*"([^"]+)"/gm)].map(match => match[1]).filter(id => id !== 'hand');
if (types.length < 35) throw new Error(`PropType inventory unexpectedly has ${types.length} physical types`);
const glbs = {
  buugeng: 'buugeng', chicken: 'chicken', bigchicken: 'chicken', guitar: 'guitar',
  ukulele: 'ukulele', sword: 'sword', sickles: 'sickles', trigeng: 'trigeng',
  doublestar: 'doublestar', bigdoublestar: 'doublestar', doublecontactball: 'double-contact-ball',
  bigdoublecontactball: 'double-contact-ball', capsule_baton: 'capsule-baton',
  fire_double_staff: 'fire-double-staff', stick: 'stick', pen: 'pen',
};
const bigBases = {
  bigstaff: 'staff', bigclub: 'club', bigfan: 'fan', bigtriad: 'triad',
  bighoop: 'minihoop', bigbuugeng: 'buugeng', bigdoublestar: 'doublestar',
  bigeightrings: 'eightrings', bigcontactball: 'contactball',
  bigdoublecontactball: 'doublecontactball', bigtorch: 'torch',
};
const labels = {
  simple_staff: 'Simple Staff', staff_v2: 'Staff V2', minihoop: 'Mini Hoop',
  triquetra2: 'Triquetra 2', capsule_baton: 'LED Baton', fire_double_staff: 'Fire Double Staff',
};
const variantsFor = id => {
  if (id === 'buugeng' || id === 'bigbuugeng') return [
    { id: 'matching-a', leftFlipped: false, rightFlipped: false },
    { id: 'mirrored-ab', leftFlipped: false, rightFlipped: true },
    { id: 'mirrored-ba', leftFlipped: true, rightFlipped: false },
    { id: 'matching-b', leftFlipped: true, rightFlipped: true },
  ];
  if (id === 'fan' || id === 'bigfan') {
    const result = [{ id: 'pictograph' }];
    for (const build of ['fire', 'lotus', 'day', 'moon', 'flat-grip', 'star']) {
      for (const frame of build === 'day' ? ['black', 'white'] : ['black']) {
        for (const cover of ['fire', 'day'].includes(build) ? ['bare', 'covered'] : ['bare']) {
          result.push({ id: [build, frame, cover].join('_'), fanBuild: build, fanFrameColor: frame, fanCover: cover });
        }
      }
    }
    return result;
  }
  if (['triad', 'bigtriad', 'quiad'].includes(id)) return [{ id: 'fire', finish: 'fire' }, { id: 'day', finish: 'day' }];
  if (id === 'triangle') return [{ id: 'corner', triangleGrip: 'corner' }, { id: 'side', triangleGrip: 'side' }];
  return [{ id: 'default' }];
};
const modelScale = { chicken: .52 / .7779893, bigchicken: .8636 / .7779893,
  bigdoublestar: 1.4, bigdoublecontactball: 1.4, bigbuugeng: 1.4 };
function tipOffsets(id, variant, scale) {
  if (id === 'fan' || id === 'bigfan') {
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
const catalog = types.map(id => {
  const base = bigBases[id] || id;
  const sourceModel = glbs[id] || glbs[base];
  const category = ['staff', 'simple_staff', 'staff_v2', 'bigstaff', 'capsule_baton', 'fire_double_staff', 'stick', 'pen'].includes(id) ? 'staff' :
    ['contactball', 'bigcontactball', 'doublecontactball', 'bigdoublecontactball'].includes(id) ? 'ball' : base;
  const scale = modelScale[id] || (id.startsWith('big') ? 1.4 : 1);
  const variants = variantsFor(id).map(variant => {
    const key = `${id}_${variant.id}`.replaceAll('-', '_');
    const effect = variant.fanBuild === 'fire' || variant.fanBuild === 'lotus' ||
      (['triad', 'bigtriad', 'quiad'].includes(id) && variant.finish === 'fire') ||
      ['fire_double_staff', 'torch', 'bigtorch'].includes(id) ? 'fire' :
      id === 'capsule_baton' || (['triad', 'bigtriad', 'quiad'].includes(id) && variant.finish === 'day') ? 'led' : null;
    return { ...variant, mesh: `/Game/FlowFest/Props/${key}.${key}`, rightMesh: `/Game/FlowFest/Props/${key}_right.${key}_right`,
      effectAttachments: tipOffsets(id, variant, scale).map(offsetCm => ({ type: effect || 'none', offsetCm })) };
  });
  return {
    id, displayName: labels[id] || id.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
    category, source: sourceModel ? `/models/props/${sourceModel}.glb` : `Prop3D/${base}`,
    grip: 'center', axis: '+Y', authoredLengthCm: null,
    ...(id === 'pen' ? { physicalReferenceLengthCm: 14.2 } : {}),
    scale,
    lengthAdjustable: ['staff', 'simple_staff', 'staff_v2', 'bigstaff', 'fire_double_staff', 'stick', 'pen'].includes(id),
    variants,
  };
});

const inputs = new Set(Object.values(glbs));
inputs.add('stick-right');
inputs.add('fan'); inputs.add('fan-flat-grip'); inputs.add('fan-star');
for (const name of inputs) {
  const path = join(source, 'static/models/props', `${name}.glb`);
  if (!existsSync(path)) throw new Error(`Missing authored prop model: ${path}`);
  const doc = await io.read(path);
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/webp') texture.setImage(await sharp(texture.getImage()).png().toBuffer()).setMimeType('image/png');
  }
  for (const ext of [...doc.getRoot().listExtensionsUsed()]) {
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'EXT_texture_webp'].includes(ext.extensionName)) ext.dispose();
  }
  await io.write(join(staged, `${name}.glb`), doc);
}
const output = { schema: 1, source: 'Prop3D.svelte and prop-model-registry.ts', units: 'centimeters', props: catalog };
writeFileSync(join(staged, 'catalog.json'), JSON.stringify(output, null, 2));
// These plates come straight from the same Shape and bullnose constructor as
// Prop3D. Export triangle data rather than approximating their knot/rim outlines.
const esbuildFolder = readdirSync(pnpm).find(name => name.startsWith('esbuild@'));
if (!esbuildFolder) throw new Error('Repository esbuild dependency is required for exact plate geometry');
const esbuildRequire = createRequire(join(pnpm, esbuildFolder, 'node_modules/esbuild/package.json'));
const { build } = esbuildRequire('esbuild');
const profileRoot = join(source, 'node_modules/@austencloud/scene-3d/src/lib/components/props');
const bridge = `
import { writeFileSync } from 'node:fs';
import { buildFanShape, FAN_FRAME_WIDTH } from './fan-profile.ts';
import { buildTriquetraShape, TRIQUETRA_HAND, TRIQUETRA2_HAND, TRIQUETRA_RIBBON_WIDTH } from './triquetra-profile.ts';
import { buildEightringsShape, EIGHTRINGS_STOCK_WIDTH } from './eightrings-profile.ts';
import { buildBuugengShape, GENG_BLADE_WIDTH } from './geng-profile.ts';
import { bullnosePlate } from './plate-extrude.ts';
const length = .9, depth = .009 * 1.4;
const geometries = {
  fan: bullnosePlate(buildFanShape(length), depth, length * FAN_FRAME_WIDTH / 6.8),
  triquetra: bullnosePlate(buildTriquetraShape(length, TRIQUETRA_HAND), depth, length * TRIQUETRA_RIBBON_WIDTH / 6.8),
  triquetra2: bullnosePlate(buildTriquetraShape(length, TRIQUETRA2_HAND), depth, length * TRIQUETRA_RIBBON_WIDTH / 6.8),
  eightrings: bullnosePlate(buildEightringsShape(length), depth, length * EIGHTRINGS_STOCK_WIDTH / 6.8, 24),
  fractalgeng: bullnosePlate(buildBuugengShape(length), depth, length * GENG_BLADE_WIDTH / 6.8),
};
const out = {};
for (const [name, indexed] of Object.entries(geometries)) {
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
  out[name] = { positions: Array.from(geometry.attributes.position.array), groups: geometry.groups };
}
writeFileSync(${JSON.stringify(join(staged, 'exact-plates.json'))}, JSON.stringify(out));
`;
const bridgePath = join(staged, 'profile-bridge.mjs');
await build({ stdin: { contents: bridge, resolveDir: profileRoot, sourcefile: 'profile-bridge.ts', loader: 'ts' },
  outfile: bridgePath, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
await import(pathToFileURL(bridgePath).href + `?v=${Date.now()}`);
console.log(`Prepared ${catalog.length} physical Prop3D IDs, ${catalog.reduce((n, p) => n + p.variants.length, 0)} variants, and ${inputs.size} authored GLBs`);
