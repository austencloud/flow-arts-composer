/** Decode existing web GLBs and their WebP textures for the native import pipeline. */
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const repo = resolve(project, '../..');
const source = process.argv[2] || repo;
const dependencyRoot = existsSync(join(repo, 'node_modules/.pnpm')) ? repo : source;
const pnpm = join(dependencyRoot, 'node_modules/.pnpm');
const cli = readdirSync(pnpm).find(x => x.startsWith('@gltf-transform+cli@'));
if (!cli) throw new Error('Install the repository gltf-transform CLI dependency first.');
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
const site = JSON.parse(readFileSync(join(project, 'Content/Data/site.json'), 'utf8'));
const staged = join(here, 'staged');
mkdirSync(staged, { recursive: true });
const jobs = site.assets.map(a => ({ id: a.family.replaceAll('-', '_'), family: a.family, source: resolve(source, a.source.startsWith('/models/') ? 'static'+a.source : a.source.replace(/^\//, '')), kind: 'Trees' }));
jobs.push({ id: 'SM_Car', source: join(source,'static/models/flow-fest/cars/ace-hatchback.glb'), kind: 'Car' });
jobs.push(
  { id: 'ForestGrass', source: join(source, 'static/models/flow-fest-sim/ecology/forest-grass-prototypes.glb'), kind: 'Ecology' },
  { id: 'DampSedge', source: join(source, 'static/models/forest/ground-life/damp-sedge-tussock.glb'), kind: 'Ecology' },
  { id: 'HazelShrub', source: join(source, 'static/models/forest/ground-life/woodland-hazel-shrub.glb'), kind: 'Ecology' },
);
for (const job of jobs) {
  if (!existsSync(job.source) && job.source.includes('/models/')) job.source = join(source, 'static', job.source.substring(job.source.indexOf('/models/')+1));
  const output = join(staged, job.id + '.glb');
  const doc = await io.read(job.source);
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/webp') {
      texture.setImage(await sharp(texture.getImage()).png().toBuffer()).setMimeType('image/png');
    }
  }
  for (const ext of [...doc.getRoot().listExtensionsUsed()]) {
    if (['EXT_meshopt_compression','KHR_draco_mesh_compression','EXT_texture_webp'].includes(ext.extensionName)) ext.dispose();
  }
  if (job.kind === 'Ecology') {
    const materials = doc.getRoot().listMaterials();
    if (materials.length !== 1) throw new Error(`${job.id}: expected one source ecology material`);
    const material = materials[0];
    for (const [suffix, texture, required] of [
      ['BaseColor', material.getBaseColorTexture(), true],
      ['Normal', material.getNormalTexture(), false],
      ['MetallicRoughness', material.getMetallicRoughnessTexture(), false],
    ]) {
      if (!texture) {
        if (required) throw new Error(`${job.id}: source base color texture missing`);
        continue;
      }
      if (texture.getMimeType() !== 'image/png') throw new Error(`${job.id}: ${suffix} was not decoded to PNG`);
      writeFileSync(join(staged, `${job.id}_${suffix}.png`), texture.getImage());
    }
  }
  await io.write(output, doc);
  job.decoded = output;
  console.log('Decoded', job.id);
}
const ortho = join(source,'static/data/flow-fest-sim/ortho.webp');
if (existsSync(ortho)) await sharp(ortho).png().toFile(join(staged,'TerrainOrtho.png'));
for (const [file, output] of [['forest-ground-detail-neutral.jpg','GroundDetail.png'],['normal.jpg','GroundNormal.png'],['roughness.jpg','GroundRoughness.png']]) {
  const input = join(source,'static/textures/forest-floor',file);
  if (existsSync(input)) await sharp(input).png().toFile(join(staged,output));
}
writeFileSync(join(staged, 'imports.json'), JSON.stringify(jobs, null, 2));
console.log(`Prepared ${jobs.length} assets`);
