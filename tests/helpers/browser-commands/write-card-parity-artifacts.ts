import type { BrowserCommand } from "vitest/node";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const OUTPUT = path.resolve(process.cwd(), ".artifacts/live-card-parity");

/** Saves inspected Chromium/PNG pairs only; the assertion remains in-browser. */
export const writeCardParityArtifacts: BrowserCommand<
  [name: string, live: string, expected: string],
  void
> = async (_ctx, name, live, expected) => {
  await mkdir(OUTPUT, { recursive: true });
  const prefix = path.join(OUTPUT, name);
  const liveBytes = Buffer.from(live, "base64");
  const expectedBytes = Buffer.from(expected, "base64");
  await Promise.all([
    writeFile(`${prefix}.live.png`, liveBytes),
    writeFile(`${prefix}.png-export.png`, expectedBytes),
  ]);
  const livePng = PNG.sync.read(liveBytes);
  const exportPng = PNG.sync.read(expectedBytes);
  if (livePng.width !== exportPng.width || livePng.height !== exportPng.height)
    return;
  const diff = new PNG({ width: livePng.width, height: livePng.height });
  pixelmatch(
    livePng.data,
    exportPng.data,
    diff.data,
    livePng.width,
    livePng.height,
    { threshold: 0.1 }
  );
  await writeFile(`${prefix}.diff.png`, PNG.sync.write(diff));
};

declare module "vitest/browser" {
  interface BrowserCommands {
    writeCardParityArtifacts: (
      name: string,
      live: string,
      expected: string
    ) => Promise<void>;
  }
}
