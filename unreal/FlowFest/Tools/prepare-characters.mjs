/** Prepare the complete deployed avatar catalog for Blender and Unreal. */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDeployedCharacters } from '../../Shared/Tools/character-catalog.mjs';
import { museumPerformanceEntries, assertMuseumRawCapture } from '../../Shared/Tools/museum-performance-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const project = resolve(option('--project') || resolve(here, '..'));
const performanceManifestFile = option('--performance-manifest');
const museumMode = performanceManifestFile !== null;
const baseStaged = option('--base-staged') ? resolve(option('--base-staged')) : resolve(here, 'staged/Characters');
if (['--project', '--performance-manifest', '--base-staged'].some(flag => process.argv.includes(flag) && !option(flag)))
  throw new Error('--project, --performance-manifest and --base-staged require paths');
const repo = resolve(here, '../../..');
const source = resolve(process.argv[2]?.startsWith('--') ? repo : (process.argv[2] || repo));
const capturesFlag = process.argv.indexOf('--captures');
const capturesDir = capturesFlag < 0 ? null : resolve(process.argv[capturesFlag + 1] || '');
const captureIdFlag = process.argv.indexOf('--capture-id');
const captureId = captureIdFlag < 0 ? null : process.argv[captureIdFlag + 1];
const familyOnly = process.argv.includes('--family-only');
const legacyOnly = process.argv.includes('--legacy-only');
const allowPartial = process.argv.includes('--allow-partial');
if (museumMode && (familyOnly || legacyOnly || allowPartial || captureId))
  throw new Error('Museum manifest mode cannot combine with legacy capture filters');
if (museumMode && !capturesDir) throw new Error('--performance-manifest requires --captures');
if (capturesFlag >= 0 && (!process.argv[capturesFlag + 1] || !existsSync(capturesDir)))
  throw new Error(`Missing native performance capture directory: ${capturesDir}`);
if (captureIdFlag >= 0 && (!captureId || !capturesDir))
  throw new Error('--capture-id requires an ID and --captures directory');
if (familyOnly && !capturesDir) throw new Error('--family-only requires --captures directory');
if (legacyOnly && (!capturesDir || familyOnly)) throw new Error('--legacy-only requires --captures and cannot combine with --family-only');
if (allowPartial && !familyOnly) throw new Error('--allow-partial requires --family-only');
const dependencyRoot = existsSync(join(repo, 'node_modules/.pnpm')) ? repo : source;
const definitions = await loadDeployedCharacters(source);
if (definitions.length !== 16 || new Set(definitions.map(x => x.id)).size !== 16)
  throw new Error(`Expected exactly 16 unique deployed avatars; found ${definitions.length}`);
if (!familyOnly && !museumMode) {
  for (const character of definitions) {
    const input = join(source, character.sourceRelativePath);
    if (!existsSync(input)) throw new Error(`Missing deployed rig ${input}`);
  }
}
if (captureId && !definitions.some(x => x.id === captureId))
  throw new Error(`Unknown deployed capture character: ${captureId}`);

function glbJson(file) {
  const bytes = readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(16) !== 0x4e4f534a)
    throw new Error(`Invalid binary glTF: ${file}`);
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
}
function boneName(name) { return name.replace(/^mixamorig\d*:?/, ''); }
function safeAssetName(name) { return name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'Unnamed'; }
function metadata(file) {
  const doc = glbJson(file);
  const sourceBones = [...new Set((doc.skins || []).flatMap(s => s.joints).map(i => doc.nodes[i]?.name).filter(Boolean))];
  const boneMap = Object.fromEntries(sourceBones.map(name => [name, boneName(name)]));
  const imported = new Set(Object.values(boneMap));
  if (imported.size !== sourceBones.length) throw new Error(`Bone normalization collision: ${file}`);
  for (const name of ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'])
    if (!imported.has(name)) throw new Error(`Missing ${name} in ${file}`);
  const arm = side => ['Shoulder', 'Arm', 'ForeArm', 'Hand'].map(part => `${side}${part}`).filter(x => imported.has(x));
  const leg = side => ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map(part => `${side}${part}`).filter(x => imported.has(x));
  const morphTargets = (doc.meshes || []).flatMap((mesh, meshIndex) => {
    const names = mesh.extras?.targetNames || [];
    return (mesh.primitives || []).flatMap((primitive, primitiveIndex) =>
      (primitive.targets || []).map((_, index) => ({ mesh: mesh.name || `mesh_${meshIndex}`, primitive: primitiveIndex, name: names[index] || `morph_${index}` })));
  });
  return { sourceBones, boneMap, pelvis: 'Hips', hands: { left: 'LeftHand', right: 'RightHand' },
    feet: { left: 'LeftFoot', right: 'RightFoot' }, toes: { left: imported.has('LeftToeBase') ? 'LeftToeBase' : null, right: imported.has('RightToeBase') ? 'RightToeBase' : null },
    armChains: { left: arm('Left'), right: arm('Right') }, legChains: { left: leg('Left'), right: leg('Right') }, morphTargets };
}

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
const staged = museumMode ? join(project, 'Tools/staged/Characters') : join(here, 'staged/Characters');
mkdirSync(staged, { recursive: true });
const animations = {
  Idle: 'idle-rm.glb', Walk: 'walk-forward-rm.glb', Run: 'run-rm.glb', Jump: 'jump-up-rm.glb',
  Fall: 'falling-idle-rm.glb', Land: 'falling-to-landing-rm.glb', Backward: 'walk-backward-rm.glb',
  StrafeLeft: 'strafe-left-rm.glb', StrafeRight: 'strafe-right-rm.glb',
  RunStrafeLeft: 'strafe-run-left.glb', RunStrafeRight: 'strafe-run-right.glb',
};
const animationSource = join(source, 'static/animations/locomotion-pack');
if (!museumMode)
  for (const file of Object.values(animations)) if (!existsSync(join(animationSource, file))) throw new Error(`Missing source motion ${file}`);
const characters = [];
const legacyProfiles = [['FirePoi', 'fire-poi'], ['FireHoop', 'fire-hoop'], ['Juggler', 'juggler'], ['LedFlow', 'led-flow']];
const captureManifests = capturesDir && !museumMode
  ? ['manifest.json', 'family-manifest.json']
      .filter(file => existsSync(join(capturesDir, file)))
      .map(file => JSON.parse(readFileSync(join(capturesDir, file), 'utf8')))
  : [];
if (capturesDir && !museumMode && !captureManifests.length) throw new Error('Native capture manifest missing');
for (const manifest of captureManifests)
  if (manifest.schema !== 'flow-fest-native-export-manifest-v1')
    throw new Error(`Unexpected native capture manifest: ${manifest.schema}`);
const captureArtifacts = captureManifests.flatMap(manifest => manifest.artifacts);
const captureKeys = captureArtifacts.map(entry => `${entry.character}/${entry.role}`);
if (new Set(captureKeys).size !== captureKeys.length)
  throw new Error('Duplicate character/role in native capture manifests');
const familyRoles = captureManifests.length
  ? [...new Set(captureArtifacts.map(entry => entry.role)
      .filter(role => /^family-[a-z0-9_]+-[AB]$/.test(role)))].sort()
  : [];
if (familyRoles.length && !allowPartial && !legacyOnly && (familyRoles.length !== 82 ||
    familyRoles.some(role => !familyRoles.includes(role.replace(/-[AB]$/, role.endsWith('-A') ? '-B' : '-A')))))
  throw new Error(`Expected 41 paired family routines; found ${familyRoles.length} roles`);
const captureProfiles = [...legacyProfiles, ...familyRoles.map(role => {
  const [, family, variant] = /^family-([a-z0-9_]+)-([AB])$/.exec(role);
  return [`P_${family}_${variant.toUpperCase()}`, role];
})];
const availableProfiles = (id) => captureProfiles.filter(([, role]) =>
  (!familyOnly || role.startsWith('family-')) &&
  (!legacyOnly || !role.startsWith('family-')) &&
  (!allowPartial || (captureArtifacts.some(entry => entry.character === id && entry.role === role) &&
    existsSync(join(capturesDir, `${id}_${role}.json`)))));
if (capturesDir && !museumMode) {
  for (const { id } of definitions.filter(x => !captureId || x.id === captureId)) {
    for (const [, role] of availableProfiles(id)) {
      const file = join(capturesDir, `${id}_${role}.json`);
      if (!existsSync(file)) throw new Error(`Missing native performance capture: ${file}`);
    }
    if (!familyOnly) {
      const ride = join(capturesDir, `${id}_ride.json`);
      if (!existsSync(ride)) throw new Error(`Missing native mounted capture: ${ride}`);
    }
  }
}
async function prepareCapture(character, profile, filename, captureRole = profile, museumEntry = null) {
  const captureFile = join(capturesDir, filename);
  const output = join(staged, character.key, `capture_${profile}.glb`);
  const capture = JSON.parse(readFileSync(captureFile, 'utf8'));
  const ride = profile === 'Ride';
  if (capture.character !== character.id || capture.fps !== 30 ||
      capture.schema !== (ride ? 'flow-fest-native-mounted-v1' : 'flow-fest-native-performance-v1') ||
      (!ride && (capture.role !== captureRole || capture.frames.length !== (museumEntry?.frames ?? 480))) ||
      capture.frames.length < 2)
    throw new Error(`Invalid native capture contract: ${filename}`);
  if (museumEntry) assertMuseumRawCapture(capture, museumEntry);
  if (existsSync(output) && statSync(output).mtimeMs >= Math.max(
    statSync(captureFile).mtimeMs, statSync(character.decoded).mtimeMs,
    statSync(fileURLToPath(import.meta.url)).mtimeMs)) {
    console.log(`Reusing capture ${character.id}/${profile}`);
    return output;
  }
  const doc = await io.read(character.decoded);
  for (const old of doc.getRoot().listAnimations()) old.dispose();
  const jointName = name => name.replace(/^mixamorig\d*:?/, '');
  const nodes = new Map(doc.getRoot().listNodes().map(node => [jointName(node.getName()), node]));
  const firstBones = capture.frames[0].bones;
  const expected = new Set(character.bones.sourceBones.map(jointName));
  const capturedNames = firstBones.map(bone => jointName(bone.name));
  if (firstBones.length !== expected.size || new Set(capturedNames).size !== capturedNames.length ||
      !['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'].every(name => capturedNames.includes(name)) ||
      firstBones.some(bone => !expected.has(jointName(bone.name)) || !nodes.has(jointName(bone.name))))
    throw new Error(`Capture bones differ from deployed rig: ${filename}`);
  for (const [index, frame] of capture.frames.entries()) {
    if (frame.frame !== index || frame.bones.length !== firstBones.length)
      throw new Error(`Noncontinuous or incomplete frames: ${filename}`);
  }
  // Include the loop's closing pose at N/fps. Ending at (N-1)/fps would make
  // the body wrap one frame before synchronized prop motion does.
  const keyedFrames = [...capture.frames, capture.frames[0]];
  const times = Float32Array.from(keyedFrames, (_, index) => index / 30);
  const buffer = doc.getRoot().listBuffers()[0];
  const input = doc.createAccessor(`${profile}_times`).setArray(times).setType('SCALAR').setBuffer(buffer);
  const animation = doc.createAnimation(profile);
  for (let boneIndex = 0; boneIndex < firstBones.length; boneIndex++) {
    const node = nodes.get(jointName(firstBones[boneIndex].name));
    for (const [path, width, field] of [['translation', 3, 'position'], ['rotation', 4, 'quaternion']]) {
      const values = new Float32Array(keyedFrames.length * width);
      for (let frameIndex = 0; frameIndex < keyedFrames.length; frameIndex++) {
        const bone = keyedFrames[frameIndex].bones[boneIndex];
        if (bone.name !== firstBones[boneIndex].name) throw new Error(`Bone order changed in ${filename}`);
        values.set(bone.local[field], frameIndex * width);
      }
      const output = doc.createAccessor(`${profile}_${boneIndex}_${path}`).setArray(values).setType(width === 4 ? 'VEC4' : 'VEC3').setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler);
      animation.addSampler(sampler).addChannel(channel);
    }
  }
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  console.log(`Prepared capture ${character.id}/${profile}: ${capture.frames.length} frames`);
  return output;
}
function writeCatalog(entries) {
  mkdirSync(join(project, 'Content/Data'), { recursive: true });
  writeFileSync(join(project, 'Content/Data/characters.json'), JSON.stringify({ version: 1,
    characters: entries.map(({ id, name, key, folder, mesh, skeleton, animations, bones, textures, materials }) =>
      ({ id, name, key, folder, mesh, skeleton, animations, bones,
        textures: textures.map(({ name, asset }) => ({ name, asset })), materials })) }, null, 2) + '\n');
}
if (museumMode) {
  const performanceManifest = JSON.parse(readFileSync(resolve(performanceManifestFile), 'utf8'));
  const museumEntries = museumPerformanceEntries(performanceManifest);
  const sourceManifestFile = join(baseStaged, 'imports.json');
  if (!existsSync(sourceManifestFile)) throw new Error(`Missing prepared base character manifest: ${sourceManifestFile}`);
  const sourceManifest = JSON.parse(readFileSync(sourceManifestFile, 'utf8'));
  const sourceCharacter = sourceManifest.characters.find(entry => entry.id === 'x-bot');
  if (!sourceCharacter) throw new Error('Missing prepared x-bot rig');
  const character = structuredClone(sourceCharacter);
  if (!existsSync(character.decoded)) character.decoded = join(baseStaged, 'x_bot.glb');
  if (!existsSync(character.decoded)) throw new Error('Missing prepared x-bot rig');
  character.captures = {};
  for (const item of museumEntries) {
    character.captures[item.profile] = await prepareCapture(character, item.profile,
      item.filename, item.profile, item);
    character.animations[`Flow_${item.profile}`] = `${character.folder}/A_Flow_${item.profile}.A_Flow_${item.profile}`;
  }
  const stagedManifest = { version: 1, animationSource: sourceManifest.animationSource,
    animations: {}, characters: [character], performanceManifest: resolve(performanceManifestFile) };
  writeFileSync(join(staged, 'imports.json'), JSON.stringify(stagedManifest, null, 2) + '\n');
  console.log(`Prepared ${museumEntries.length} Museum performances from existing x-bot rig`);
  process.exit(0);
}
if (familyOnly) {
  const stagedManifestFile = join(staged, 'imports.json');
  if (!existsSync(stagedManifestFile)) throw new Error('--family-only requires previously staged native rigs');
  const stagedManifest = JSON.parse(readFileSync(stagedManifestFile, 'utf8'));
  if (stagedManifest.characters?.length !== 16 ||
      stagedManifest.characters.some((entry, index) => entry.id !== definitions[index].id || !existsSync(entry.decoded)))
    throw new Error('--family-only requires the complete decoded 16-character catalog');
  if (!allowPartial && familyRoles.length !== 82) throw new Error('--family-only requires all 41 A/B family routines');
  let prepared = 0;
  for (const character of stagedManifest.characters.filter(x => !captureId || x.id === captureId)) {
    character.captures ||= {};
    for (const [profile, role] of availableProfiles(character.id)) {
      character.captures[profile] = await prepareCapture(character, profile, `${character.id}_${role}.json`, role);
      const name = `Flow_${profile}`;
      character.animations[name] = `${character.folder}/A_${name}.A_${name}`;
      prepared++;
    }
  }
  if (!prepared) throw new Error('No complete listed family captures available for staging');
  writeFileSync(stagedManifestFile, JSON.stringify(stagedManifest, null, 2) + '\n');
  writeCatalog(stagedManifest.characters);
  console.log(`Prepared ${prepared} family performances for ${captureId || 'all 16'} native characters`);
  process.exit(0);
}
for (const { id, name, sourceRelativePath } of definitions) {
  const input = join(source, sourceRelativePath);
  const key = id.replaceAll('-', '_');
  const folder = `/Game/FlowFest/Characters/${key}`;
  const decoded = join(staged, `${key}.glb`);
  const doc = await io.read(input);
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/webp') texture.setImage(await sharp(texture.getImage()).png().toBuffer()).setMimeType('image/png');
  }
  for (const extension of [...doc.getRoot().listExtensionsUsed()])
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'EXT_texture_webp'].includes(extension.extensionName)) extension.dispose();
  await io.write(decoded, doc);
  const textures = doc.getRoot().listTextures();
  const textureDir = join(staged, 'textures', key);
  mkdirSync(textureDir, { recursive: true });
  const textureInfo = textures.map((texture, index) => {
    const image = texture.getImage();
    if (!image || texture.getMimeType() !== 'image/png') throw new Error(`Missing PNG texture ${id} ${index}`);
    const asset = `T_${key}_${index}_${safeAssetName(texture.getName())}`;
    const file = join(textureDir, `${asset}.png`);
    writeFileSync(file, image);
    return { name: texture.getName(), file, asset: `${folder}/${asset}.${asset}` };
  });
  const textureIndex = texture => texture ? textures.indexOf(texture) : null;
  const materials = doc.getRoot().listMaterials().map((material, index) => ({
    name: material.getName(), asset: `${folder}/M_${key}_${index}.M_${key}_${index}`,
    baseColor: textureIndex(material.getBaseColorTexture()),
    normal: textureIndex(material.getNormalTexture()),
    metallicRoughness: textureIndex(material.getMetallicRoughnessTexture()),
    emissive: textureIndex(material.getEmissiveTexture()),
    occlusion: textureIndex(material.getOcclusionTexture()),
    alphaMode: material.getAlphaMode(), doubleSided: material.getDoubleSided(),
    baseColorFactor: material.getBaseColorFactor(),
    metallicFactor: material.getMetallicFactor(), roughnessFactor: material.getRoughnessFactor(),
  }));
  const info = metadata(input);
  characters.push({ id, name, key, source: input, decoded, folder,
    mesh: `${folder}/SK_${key}.SK_${key}`, skeleton: `${folder}/SK_${key}_Skeleton.SK_${key}_Skeleton`,
    animations: Object.fromEntries(Object.keys(animations).map(k => [k, `${folder}/A_${k}.A_${k}`])),
    bones: info, textures: textureInfo, materials });
  console.log(`Prepared ${id}: ${info.sourceBones.length} bones, ${info.morphTargets.length} morph targets`);
}
const manifest = { version: 1, animationSource, animations, characters };
if (capturesDir) {
  for (const character of characters.filter(x => !captureId || x.id === captureId)) {
    character.captures = {};
    for (const [profile, captureRole] of availableProfiles(character.id))
      character.captures[profile] = await prepareCapture(character, profile, `${character.id}_${captureRole}.json`, captureRole);
    character.captures.Ride = await prepareCapture(character, 'Ride', `${character.id}_ride.json`);
    for (const profile of Object.keys(character.captures)) {
      const name = profile === 'Ride' ? 'Ride' : `Flow_${profile}`;
      character.animations[name] = `${character.folder}/A_${name}.A_${name}`;
    }
  }
}
writeFileSync(join(staged, 'imports.json'), JSON.stringify(manifest, null, 2) + '\n');
writeCatalog(characters);
console.log(`Prepared ${characters.length} native characters`);
