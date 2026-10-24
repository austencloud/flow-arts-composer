/** Capture one newly authored score with the production browser performer. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeployedCharacters } from '../../Shared/Tools/character-catalog.mjs';
import { createRuntimeMotionBundle, sourceGlbJson } from '../../Shared/Tools/runtime-motion-bundle.mjs';

const [baseUrl, outputArg, requestArg] = process.argv.slice(2);
if (!baseUrl || !outputArg || !requestArg)
  throw new Error('Usage: capture-runtime-motion.mjs URL OUTPUT_DIRECTORY REQUEST.json');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const request = JSON.parse(await readFile(resolve(requestArg), 'utf8'));
if (!request.sequence?.steps?.length || !request.characterId || !request.propType ||
    !['fire', 'led'].includes(request.effectId) ||
    typeof request.loop !== 'boolean')
  throw new Error('Request needs sequence, characterId, propType, effectId and loop');
if (request.capturePlane !== undefined && !['wall', 'wheel', 'floor'].includes(request.capturePlane))
  throw new Error('Request capturePlane must be wall, wheel or floor');
// The browser validates timed steps after extracting any legacy start row.
const characters = await loadDeployedCharacters(root);
const character = characters.find(entry => entry.id === request.characterId);
if (!character) throw new Error(`Unknown deployed character ${request.characterId}`);
const rigBytes = await readFile(join(root, character.sourceRelativePath));
const rigSHA256 = createHash('sha256').update(rigBytes).digest('hex');
const sourceGlb = sourceGlbJson(rigBytes);
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  page.on('pageerror', error => process.stderr.write(`Capture page: ${error.message}\n`));
  await page.goto(new URL('/test/flow-fest-native-export?custom=1', baseUrl).href,
    { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.flowFestNativeCapture?.isReady(),
    null, { timeout: 120_000 });
  const capture = await page.evaluate(async request =>
    window.flowFestNativeCapture.captureRuntimeSequence(
      request.characterId, request.sequence, request.propType, request.effectId, request.loop,
      request.propId, request.capturePlane), request);
  const bundle = await createRuntimeMotionBundle(capture, { sourceGlb, sourceRigSHA256: rigSHA256,
    loop: request.loop });
  const outputDir = resolve(outputArg);
  await mkdir(outputDir, { recursive: true });
  const planeSuffix = request.capturePlane && request.capturePlane !== 'wall' ? `_${request.capturePlane}` : '';
  const name = `${character.key}_${bundle.sequenceSHA256.slice(0, 16)}${planeSuffix}.motion.json`;
  const path = join(outputDir, name);
  await writeFile(path, `${JSON.stringify(bundle)}\n`, 'utf8');
  console.log(`RUNTIME_MOTION_WRITTEN ${path}`);
} finally {
  await browser.close();
}
