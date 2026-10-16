/** Museum adapter for the same glTF/Sharp decoding stack used by Flow Fest. */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(project, '../..');
const output = join(project, 'Saved/Shells');
mkdirSync(output, { recursive: true });
const pnpm = join(repo, 'node_modules/.pnpm');
const cli = readdirSync(pnpm).find(x => x.startsWith('@gltf-transform+cli@'));
if (!cli) throw new Error('Repository gltf-transform dependency is missing.');
const require = createRequire(join(pnpm, cli, 'node_modules/@gltf-transform/cli/package.json'));
const { NodeIO } = await import(pathToFileURL(require.resolve('@gltf-transform/core')).href);
const { ALL_EXTENSIONS } = await import(pathToFileURL(require.resolve('@gltf-transform/extensions')).href);
const draco = (await import(pathToFileURL(require.resolve('draco3dgltf')).href)).default;
const { MeshoptDecoder } = await import(pathToFileURL(require.resolve('meshoptimizer')).href);
const sharp = (await import(pathToFileURL(createRequire(join(repo, 'package.json')).resolve('sharp')).href)).default;
const ts = createRequire(join(repo, 'package.json'))('typescript');

// These named overrides are part of the browser scene, not the GLB. Read its
// literal declarations so native imports cannot silently keep obsolete colours.
function browserMaterialTuning(component) {
  const source = readFileSync(join(repo, 'src/lib/features/museum/components/game', component + '.svelte'), 'utf8');
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error(`Missing scene script: ${component}`);
  const tree = ts.createSourceFile(component + '.ts', script, ts.ScriptTarget.Latest, true);
  const constants = {};
  function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
      if (!ts.isPropertyAssignment(property)) throw new Error(`Nonliteral material tuning in ${component}`);
      return [property.name.text, literal(property.initializer)];
    }));
    throw new Error(`Unsupported material tuning expression in ${component}`);
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['LIGHTMAP_BOOST', 'EMISSIVE_TUNING'].includes(node.name.getText(tree))) {
      constants[node.name.getText(tree)] = literal(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!constants.EMISSIVE_TUNING || !Number.isFinite(constants.LIGHTMAP_BOOST)) throw new Error(`Missing material tuning in ${component}`);
  return { component, lightmapBoost: constants.LIGHTMAP_BOOST, overrides: constants.EMISSIVE_TUNING };
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder,
});
const shells = {
  DrownedGallery: 'cave/drowned-gallery.glb',
  EarthRootTerrace: 'cave/earth-root-terrace.glb',
  FirstFire: 'cave/first-fire-cinder-court.glb',
  OrderLobbyDressing: 'lobby/order-lobby-dressing.glb',
  OrderLobbyCeiling: 'lobby/order-lobby-ceiling.glb',
};
const hash = data => createHash('sha256').update(data).digest('hex');
for (const [name, relative] of Object.entries(shells)) {
  const source = join(repo, 'static/models/museum', relative);
  const raw = readFileSync(source);
  const length = raw.readUInt32LE(12);
  const document = JSON.parse(raw.subarray(20, 20 + length).toString());
  const binaryStart = 20 + length + 8;
  const textures = [];
  for (const [index, texture] of (document.textures ?? []).entries()) {
    const image = document.images[texture.source ?? texture.extensions?.EXT_texture_webp?.source];
    const view = document.bufferViews[image.bufferView];
    if (!view || (view.buffer ?? 0) !== 0) throw new Error('Expected embedded GLB image.');
    const start = binaryStart + (view.byteOffset ?? 0);
    const png = await sharp(raw.subarray(start, start + view.byteLength)).png().toBuffer();
    const file = `${name}_T${index}.png`;
    writeFileSync(join(output, file), png);
    textures.push({ file, sha256: hash(png) });
  }
  // FBX drops PBR and texture transforms. Retain original values and provenance.
  writeFileSync(join(output, `${name}.materials.json`), JSON.stringify({
    version: 1, source: relative, sourceSha256: hash(raw), materials: document.materials ?? [], textures,
    browserTuning: relative.startsWith('cave/') ? browserMaterialTuning(name + 'Authored') : null,
  }, null, 2));
  const decoded = await io.read(source);
  for (const texture of decoded.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/webp') {
      texture.setImage(await sharp(texture.getImage()).png().toBuffer()).setMimeType('image/png');
    }
  }
  for (const extension of [...decoded.getRoot().listExtensionsUsed()]) {
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'EXT_texture_webp'].includes(extension.extensionName)) extension.dispose();
  }
  await io.write(join(output, `${name}.glb`), decoded);
  console.log(`MUSEUM_SHELL_PREPARED ${name} materials=${document.materials?.length ?? 0} textures=${textures.length}`);
}
