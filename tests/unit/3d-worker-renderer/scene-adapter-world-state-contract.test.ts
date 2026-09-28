import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCENES_DIR = "src/lib/shared/3d/environments/scenes";

function collectSvelteFiles(relativeDir: string): string[] {
  return readdirSync(join(SCENES_DIR, relativeDir), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relativePath = relativeDir
      ? `${relativeDir}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) return collectSvelteFiles(relativePath);
    return /\.svelte(\.ts)?$/.test(entry.name) ? [relativePath] : [];
  });
}

// Scene adapters clear their world on teardown only when it is still the one
// that run built: `if (world === mounted) world = null`. Deep $state stores a
// proxy of the plain world object, and a proxy never equals its target, so the
// check always failed and the adapter kept driving a disposed world
// (autumn-scene-load-effect.test.ts watches that happen). $state.raw stores the
// object itself.
describe("Svelte scene adapters", () => {
  it("keep a value they clear by identity out of deep $state", () => {
    const proxied = collectSvelteFiles("").flatMap((file) => {
      const source = readFileSync(join(SCENES_DIR, file), "utf8");
      return [...source.matchAll(/if \((\w+) === \w+\)\s*\{?\s*\1 = null/g)]
        .map(([, name]) => name)
        .filter((name) => new RegExp(`let ${name} = \\$state[<(]`).test(source))
        .map((name) => `${file}: ${name}`);
    });

    expect(proxied).toEqual([]);
  });
});
