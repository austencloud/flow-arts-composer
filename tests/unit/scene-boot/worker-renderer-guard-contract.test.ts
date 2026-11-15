/**
 * The worker renderer is its own module world: the page installs
 * guardEveryWebGLRenderer, but nothing carries that into the worker. Without
 * the guard a material disposed mid-compile throws inside three's timer, the
 * throw never reaches our error record and the compile promise never settles,
 * so the visitor waits on the loading curtain forever.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKER_ENTRY = resolve(
  "src/lib/shared/3d/worker-renderer/workers/environment-renderer.worker.ts"
);

describe("worker renderer shader-compile guard", () => {
  const source = readFileSync(WORKER_ENTRY, "utf8");

  it("imports the shared guard", () => {
    expect(source).toMatch(
      /import \{ guardEveryWebGLRenderer \} from "\.\.\/\.\.\/scene-boot\/guarded-compile-async";/
    );
  });

  it("installs it at module top level, before any renderer is built", () => {
    const install = source.search(/^guardEveryWebGLRenderer\(\);$/m);
    const firstRenderer = source.indexOf("new WebGLRenderer(");
    expect(install).toBeGreaterThan(-1);
    expect(firstRenderer).toBeGreaterThan(-1);
    expect(install).toBeLessThan(firstRenderer);
  });
});
