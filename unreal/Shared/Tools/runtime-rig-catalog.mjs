/** Bind runtime motion imports to the exact deployed source rigs used by this build. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadDeployedCharacters } from './character-catalog.mjs';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Usage: runtime-rig-catalog.mjs SOURCE_ROOT OUTPUT.json');
const sourceRoot = resolve(sourceArg);
const characters = await loadDeployedCharacters(sourceRoot);
const rigs = {};
for (const character of characters) {
  const bytes = await readFile(resolve(sourceRoot, character.sourceRelativePath));
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`Invalid source rig ${character.id}`);
  rigs[character.id] = createHash('sha256').update(bytes).digest('hex');
}
await mkdir(dirname(resolve(outputArg)), { recursive: true });
await writeFile(resolve(outputArg), JSON.stringify({ schema: 'flow-arts-runtime-rigs-v1', rigs }, null, 2) + '\n');
console.log(`RUNTIME_RIGS_WRITTEN ${characters.length}`);
