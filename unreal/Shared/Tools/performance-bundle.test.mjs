import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileHash, migrateCharacterTurns, verifyCharacterTurns } from './performance-bundle.mjs';

const write = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'flowfest-turn-migration-'));
  const project = join(root, 'Project'), previous = join(root, 'previous.json');
  const old = { version: 1, characters: [] }, current = { version: 1, characters: [] };
  for (let i = 0; i < 16; i++) {
    const key = `rig${i}`, id = `rig-${i}`, folder = `/Game/FlowFest/Characters/${key}`;
    const before = { id, key, folder, name: `Rig ${i}`, animations: { Idle: `${folder}/A_Idle.A_Idle` } };
    const after = structuredClone(before);
    after.turns = {}; after.turnRetarget = {};
    for (const clip of ['TurnLeft', 'TurnRight']) {
      const fbx = join(project, 'Tools/staged/Characters', key, `A_${clip}.fbx`);
      const asset = join(project, 'Content/FlowFest/Characters', key, `A_${clip}.uasset`);
      const sidecar = join(project, 'Tools/staged/Characters', key, `A_${clip}.turn.json`);
      write(fbx, `FBX ${key} ${clip}`); write(asset, `Native ${key} ${clip}`);
      const source = { source: clip === 'TurnLeft' ? 'turn-left.glb' : 'turn-right.glb',
        headingDegrees: clip === 'TurnLeft' ? -89.7 : 102.6, frameCount: 29 };
      const measured = { durationSeconds: 0.9333, frameCount: 29,
        supportWindows: { left: [], right: [] }, neutralStart: { frame: 0 }, neutralEnd: { frame: 28 } };
      const side = { schema: 'flowfest-native-turn-retarget-v1', characterId: id, clip, source,
        sourceSha256: 'source-hash', fbxSha256: fileHash(fbx), ...measured };
      write(sidecar, side);
      const reference = `${folder}/A_${clip}.A_${clip}`;
      after.animations[clip] = reference;
      after.turns[clip] = source;
      after.turnRetarget[clip] = { asset: reference, headingDegrees: source.headingDegrees,
        nativeHipsTranslationUnitsPerMeter: 1, sourceSha256: side.sourceSha256,
        fbxSha256: side.fbxSha256, ...measured };
    }
    old.characters.push(before); current.characters.push(after);
  }
  write(previous, old);
  write(join(project, 'Content/Data/characters.json'), current);
  write(join(project, 'Content/Data/performance-legacy-baseline.json'),
    { catalog: { 'characters.json': fileHash(previous), 'props.json': 'old-props-hash' }, entries: {} });
  migrateCharacterTurns(project, previous);
  return { root, project };
}
function withFixture(check) {
  const value = fixture();
  try { check(value.project); } finally { rmSync(value.root, { recursive: true, force: true }); }
}
function resealCurrentCatalog(project, change) {
  const path = join(project, 'Content/Data/characters.json');
  const current = JSON.parse(readFileSync(path, 'utf8'));
  change(current);
  write(path, current);
  const receipt = join(project, 'Content/Data/character-turn-migration.json');
  const migration = JSON.parse(readFileSync(receipt, 'utf8'));
  migration.charactersSHA256 = fileHash(path);
  write(receipt, migration);
}

test('additive turn migration retains historical catalog and all 32 native assets', () =>
  withFixture(project => {
    const result = verifyCharacterTurns(project);
    assert.equal(Object.keys(result.assets).length, 32);
    assert.equal(result.previousCharactersSHA256,
      fileHash(join(project, 'Content/Data/characters-before-turn.json')));
  }));

test('resealing a changed old character field or animation does not pass', () => {
  withFixture(project => {
    resealCurrentCatalog(project, current => { current.characters[0].name = 'Changed'; });
    assert.throws(() => verifyCharacterTurns(project), /pre-turn character fields/);
  });
  withFixture(project => {
    resealCurrentCatalog(project, current => { current.characters[0].animations.Idle = '/Game/Wrong.Wrong'; });
    assert.throws(() => verifyCharacterTurns(project), /pre-turn character fields/);
  });
});

test('missing or tampered imported turn asset is rejected', () => {
  withFixture(project => {
    unlinkSync(join(project, 'Content/FlowFest/Characters/rig0/A_TurnLeft.uasset'));
    assert.throws(() => verifyCharacterTurns(project), /Missing/);
  });
  withFixture(project => {
    appendFileSync(join(project, 'Content/FlowFest/Characters/rig0/A_TurnLeft.uasset'), 'tampered');
    assert.throws(() => verifyCharacterTurns(project), /Turn asset inventory/);
  });
});

if (process.env.FLOWFEST_TURN_PROJECT) test('portable turn catalog rejects legacy edits and missing or tampered native assets', () => {
  const sourceProject = process.env.FLOWFEST_TURN_PROJECT;
  const root = mkdtempSync(join(tmpdir(), 'flowfest-portable-turn-check-'));
  const project = join(root, 'Project');
  const copy = relative => {
    const target = join(project, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(sourceProject, relative), target);
  };
  try {
    for (const name of ['characters.json', 'characters-before-turn.json', 'character-turn-migration.json',
      'performance-legacy-baseline.json', 'performance-bundles.json']) copy(`Content/Data/${name}`);
    const migration = JSON.parse(readFileSync(join(project, 'Content/Data/character-turn-migration.json'), 'utf8'));
    for (const { asset, fbx, sidecar } of Object.values(migration.assets)) {
      copy(asset); copy(fbx); copy(sidecar);
    }
    assert.equal(Object.keys(verifyCharacterTurns(project).assets).length, 32);
    const catalog = join(project, 'Content/Data/characters.json');
    const receipt = join(project, 'Content/Data/character-turn-migration.json');
    const originalCatalog = readFileSync(catalog), originalReceipt = readFileSync(receipt);
    for (const edit of [value => { value.characters[0].name += ' changed'; },
      value => { value.characters[0].animations.Idle = '/Game/Wrong.Wrong'; }]) {
      const modified = JSON.parse(originalCatalog.toString('utf8'));
      edit(modified); write(catalog, modified);
      const resealed = JSON.parse(originalReceipt.toString('utf8'));
      resealed.charactersSHA256 = fileHash(catalog); write(receipt, resealed);
      assert.throws(() => verifyCharacterTurns(project), /pre-turn character fields/);
    }
    writeFileSync(catalog, originalCatalog); writeFileSync(receipt, originalReceipt);
    const firstAsset = join(project, Object.values(migration.assets)[0].asset);
    unlinkSync(firstAsset);
    assert.throws(() => verifyCharacterTurns(project), /Missing/);
    copy(Object.values(migration.assets)[0].asset);
    appendFileSync(firstAsset, 'tampered');
    assert.throws(() => verifyCharacterTurns(project), /Turn asset inventory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
