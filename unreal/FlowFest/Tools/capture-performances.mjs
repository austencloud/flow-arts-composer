/* global process, URL, window */
/** Capture the live Flow Fest production scene into Blender-readable JSON.
 * Usage: node capture-performances.mjs http://127.0.0.1:5174 ./out
 * The URL must be a server rooted in this task worktree. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [baseUrl, outputArg] = process.argv.slice(2);
if (!baseUrl || !outputArg) {
  throw new Error(
    "Usage: node capture-performances.mjs <worktree-base-url> <output-dir>"
  );
}
const outputDir = resolve(outputArg);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  page.on("pageerror", (error) =>
    process.stderr.write(`Page error: ${error.message}\n`)
  );
  await page.goto(new URL("/test/flow-fest-native-export", baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => window.flowFestNativeCapture?.isReady(),
    null,
    { timeout: 120_000 }
  );
  const catalog = await page.evaluate(() => ({
    characters: window.flowFestNativeCapture.characters,
    roles: window.flowFestNativeCapture.roles,
    status: window.flowFestNativeCapture.getStatus(),
  }));
  if (!catalog.status.startsWith("Generated ")) throw new Error(catalog.status);
  if (catalog.characters.length !== 16 || catalog.roles.length !== 4)
    throw new Error(
      `Expected 16 rigs and four profiles; got ${catalog.characters.length} and ${catalog.roles.length}`
    );

  const artifacts = [];
  for (const character of catalog.characters) {
    for (const role of catalog.roles) {
      process.stdout.write(`${character} / ${role}\n`);
      const result = await page.evaluate(
        ([id, profile]) => window.flowFestNativeCapture.captureOne(id, profile),
        [character, role]
      );
      if (
        !result.frames.length ||
        result.frames.some(
          (frame) =>
            !frame.bones.length ||
            !frame.leftProp.renderedMeshes.length ||
            !frame.rightProp.renderedMeshes.length
        )
      )
        throw new Error(
          `Incomplete production capture: ${character} / ${role}`
        );
      const filename = `${character}_${role}.json`;
      await writeFile(resolve(outputDir, filename), JSON.stringify(result));
      artifacts.push({
        character,
        role,
        filename,
        frames: result.frames.length,
      });
    }
    process.stdout.write(`${character} / ride\n`);
    const ride = await page.evaluate(
      (id) => window.flowFestNativeCapture.captureRide(id),
      character
    );
    if (
      ride.frames.length !== 30 ||
      ride.frames.some((frame) => !frame.bones.length)
    )
      throw new Error(`Incomplete mounted capture: ${character}`);
    const filename = `${character}_ride.json`;
    await writeFile(resolve(outputDir, filename), JSON.stringify(ride));
    artifacts.push({
      character,
      role: "ride",
      filename,
      frames: ride.frames.length,
    });
  }
  await writeFile(
    resolve(outputDir, "manifest.json"),
    JSON.stringify(
      {
        schema: "flow-fest-native-export-manifest-v1",
        sourceUrl: page.url(),
        artifacts,
      },
      null,
      2
    )
  );
  process.stdout.write(
    `Captured ${artifacts.length} clips into ${outputDir}\n`
  );
} finally {
  await browser.close();
}
