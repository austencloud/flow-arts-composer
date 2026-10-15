import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const cli = resolve('unreal/Shared/Tools/character-catalog.mjs');

function loadDeployedCharacters(root: string) {
  const script = `import(${JSON.stringify(pathToFileURL(cli).href)})
    .then(({ loadDeployedCharacters }) => loadDeployedCharacters(process.argv[1]))
    .then((characters) => console.log(JSON.stringify(characters)))
    .catch((error) => { console.error(error); process.exitCode = 1; });`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8' }));
}

const catalogPath = 'node_modules/@austencloud/scene-3d/src/lib/config/avatar-definitions.ts';
const packagePath = 'node_modules/@austencloud/scene-3d/package.json';
const temporaryRoots: string[] = [];

async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'native-characters-'));
  temporaryRoots.push(root);
  await mkdir(dirname(join(root, catalogPath)), { recursive: true });
  await writeFile(join(root, catalogPath), source);
  await writeFile(join(root, packagePath), JSON.stringify({ version: '2.3.4' }));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('native character catalog', () => {
  it('evaluates production definitions, filters local evaluation, and preserves order', async () => {
    const root = await fixture(`
      const revisions = { alpha: 'r2' };
      const deployed = [
        { id: 'z-bot', name: 'Zed', modelPath: '/z.glb' },
        { id: 'alpha', name: 'Alpha', modelPath: '/avatars/' + revisions.alpha + '/alpha.glb' },
      ];
      export const AVATAR_DEFINITIONS = import.meta.env.DEV
        ? [...deployed, { id: 'dev-only', name: 'Dev', modelPath: '/dev.glb' }]
        : [...deployed, { id: 'evaluation', name: 'Eval', modelPath: '/eval.glb', availability: 'local-evaluation' }];
    `);
    expect(loadDeployedCharacters(root)).toEqual([
      { id: 'z-bot', name: 'Zed', key: 'z_bot', modelPath: '/z.glb', sourceRelativePath: 'static/models/avatars/_optimized/z-bot.glb' },
      { id: 'alpha', name: 'Alpha', key: 'alpha', modelPath: '/avatars/r2/alpha.glb', sourceRelativePath: 'static/models/avatars/_optimized/alpha.glb' },
    ]);
  });

  it.each([
    ['duplicate IDs', `[{ id: 'same', name: 'One', modelPath: '/1' }, { id: 'same', name: 'Two', modelPath: '/2' }]`, 'Duplicate avatar ID'],
    ['key collision', `[{ id: 'a-b', name: 'One', modelPath: '/1' }, { id: 'a_b', name: 'Two', modelPath: '/2' }]`, 'Avatar key collision'],
    ['unsafe ID', `[{ id: '../escape', name: 'One', modelPath: '/1' }]`, 'Unsafe avatar ID'],
    ['empty catalog', `[]`, 'Deployed avatar catalog is empty'],
  ])('rejects %s', async (_case, definitions, message) => {
    const root = await fixture(`export const AVATAR_DEFINITIONS = ${definitions};`);
    expect(() => loadDeployedCharacters(root)).toThrow(message);
  });

  it('writes a portable versioned manifest with a source hash', async () => {
    const source = `export const AVATAR_DEFINITIONS = [{ id: 'x-bot', name: 'X-Bot', modelPath: '/x.glb' }];`;
    const root = await fixture(source);
    const output = join(root, 'Saved', 'characters.json');
    execFileSync(process.execPath, [cli, '--source-root', root, '--output', output]);
    const manifest = JSON.parse(await readFile(output, 'utf8'));
    expect(manifest.schema).toBe('flow-arts-native-characters-v1');
    expect(manifest.source).toEqual({
      package: '@austencloud/scene-3d',
      version: '2.3.4',
      catalogPath,
      sha256: createHash('sha256').update(source).digest('hex'),
    });
    expect(manifest.characters).toEqual(loadDeployedCharacters(root));
    expect(JSON.stringify(manifest)).not.toContain(root);
  });
});
