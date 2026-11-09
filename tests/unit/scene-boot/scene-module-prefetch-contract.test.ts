/**
 * Static contract test for the scene module prefetch map.
 *
 * Warming a scene's component chunk only helps if the warm-up and the mount ask
 * for the same module. Two `import()` specifiers that resolve to different
 * files produce two chunks: the prefetch downloads one, Environment3D mounts
 * the other, and the switch is exactly as slow as before while looking like it
 * was fixed. Nothing at runtime notices — which is why the two are compared
 * here, by resolved path, in both directions.
 *
 * Environment3D reaches every scene through the branch that mounts a
 * non-retained environment, so that block carries the full background → module
 * mapping even though retained scenes are also mounted elsewhere. Autumn is the
 * one branch that awaits a module held in a local const rather than an inline
 * import, so that indirection is resolved too.
 *
 * Backgrounds registered by a `static/models/<scene>/scene.json` (Ocean) are
 * looked up before that switch. Their module is the runtime the manifest names
 * in `environment-runtimes.ts`, or the shared GlbEnvironment loader.
 *
 * If this test fails, fix the map — do not loosen the assertions.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const ENVIRONMENT_3D = path.join(
  repoRoot,
  "src/lib/shared/3d/environments/components/Environment3D.svelte"
);
const ENVIRONMENT_RUNTIMES = path.join(
  repoRoot,
  "src/lib/shared/3d/environments/registry/environment-runtimes.ts"
);
const MODELS_DIR = path.join(repoRoot, "static/models");
const PREFETCH_MAP = path.join(
  repoRoot,
  "src/lib/shared/3d/scene-boot/scene-module-prefetch.ts"
);

const resolveFrom = (file: string, specifier: string) =>
  path.relative(repoRoot, path.resolve(path.dirname(file), specifier)).replace(/\\/g, "/");

/** Every `const NAME = ... import("spec")` in the component, by local name. */
function moduleConsts(source: string): Map<string, string> {
  const consts = new Map<string, string>();
  // The initializer can be any expression — Autumn's wraps its import in a
  // $derived.by block with statements of its own — so the window between the
  // name and the import is bounded only by the next declaration.
  const pattern =
    /const\s+(\w+)\s*=\s*((?:(?!\bconst\b)[\s\S])*?)import\(\s*["']([^"']+)["']\s*\)/g;
  for (const [, name, , specifier] of source.matchAll(pattern)) {
    if (!consts.has(name)) consts.set(name, specifier);
  }
  return consts;
}

/** The scene name each `BackgroundType` resolves to in `getSceneConfig`. */
function backgroundScenes(source: string): Map<string, string> {
  const scenes = new Map<string, string>();
  const pattern =
    /case\s+BackgroundType\.(\w+):\s*\n\s*return\s*\{\s*scene:\s*["'](\w+)["']/g;
  for (const [, background, scene] of source.matchAll(pattern)) {
    scenes.set(background, scene);
  }
  return scenes;
}

/** The module each scene name mounts, taken from the non-retained branch. */
function sceneModules(source: string): Map<string, string> {
  const start = source.indexOf("!retainedEnvironments.has(worldType)");
  expect(start, "the non-retained environment branch").toBeGreaterThan(-1);
  const block = source.slice(start);
  const consts = moduleConsts(source);

  const branches = [...block.matchAll(/config\.scene === ["'](\w+)["']/g)];
  const modules = new Map<string, string>();
  branches.forEach((branch, index) => {
    const from = branch.index ?? 0;
    const to = branches[index + 1]?.index ?? block.length;
    const body = block.slice(from, to);

    const inline = body.match(/import\(\s*["']([^"']+)["']\s*\)/);
    if (inline) {
      modules.set(branch[1], inline[1]);
      return;
    }
    const awaited = body.match(/\{#await\s+(\w+)\s+then/);
    const indirect = awaited ? consts.get(awaited[1]) : undefined;
    expect(indirect, `a module for the "${branch[1]}" branch`).toBeTruthy();
    modules.set(branch[1], indirect as string);
  });
  return modules;
}

/** Backgrounds a scene.json takes over, with the module that mounts them. */
function registeredModules(runtimesSource: string): Map<string, string> {
  const runtimes = new Map(
    [
      ...runtimesSource.matchAll(
        /(\w+):\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g
      ),
    ].map(([, name, specifier]) => [name, specifier])
  );
  const sharedLoader = runtimesSource.match(
    /runtime === null\)\s*\{\s*return\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/
  );
  expect(sharedLoader, "the shared GlbEnvironment import").toBeTruthy();

  const byBackground = Object.fromEntries(
    Object.entries(BackgroundType).map(([name, value]) => [value, name])
  ) as Record<string, string>;
  const modules = new Map<string, string>();
  for (const folder of readdirSync(MODELS_DIR)) {
    const manifest = path.join(MODELS_DIR, folder, "scene.json");
    if (!existsSync(manifest)) continue;
    const { id, runtime } = JSON.parse(readFileSync(manifest, "utf8")) as {
      id: string;
      runtime?: string | null;
    };
    const background = byBackground[id];
    if (!background) continue;
    const specifier = runtime ? runtimes.get(runtime) : sharedLoader![1];
    expect(specifier, `a module for registered "${id}"`).toBeTruthy();
    modules.set(
      background,
      resolveFrom(ENVIRONMENT_RUNTIMES, specifier as string)
    );
  }
  return modules;
}

/** The specifier the prefetch map warms for each `BackgroundType`. */
function prefetchedModules(source: string): Map<string, string> {
  const pattern =
    /\[BackgroundType\.(\w+)\]:\s*\(\)\s*=>\s*\n?\s*import\(\s*["']([^"']+)["']\s*\)/g;
  return new Map(
    [...source.matchAll(pattern)].map(([, background, specifier]) => [
      background,
      specifier,
    ])
  );
}

describe("scene module prefetch map", () => {
  const environmentSource = readFileSync(ENVIRONMENT_3D, "utf8");
  const prefetchSource = readFileSync(PREFETCH_MAP, "utf8");
  const runtimesSource = readFileSync(ENVIRONMENT_RUNTIMES, "utf8");

  const scenes = backgroundScenes(environmentSource);
  const modules = sceneModules(environmentSource);
  const prefetched = prefetchedModules(prefetchSource);

  const registered = registeredModules(runtimesSource);
  const mounted = new Map([
    ...[...scenes].map(([background, scene]): [string, string] => {
      const specifier = modules.get(scene);
      expect(specifier, `a module for scene "${scene}"`).toBeTruthy();
      return [background, resolveFrom(ENVIRONMENT_3D, specifier as string)];
    }),
    ...registered,
  ]);
  const warmed = new Map(
    [...prefetched].map(([background, specifier]) => [
      background,
      resolveFrom(PREFETCH_MAP, specifier),
    ])
  );

  it("names backgrounds that exist and modules that exist", () => {
    expect(warmed.size).toBeGreaterThan(0);
    for (const [background, module] of warmed) {
      expect(BackgroundType, `BackgroundType.${background}`).toHaveProperty(
        background
      );
      expect(
        existsSync(path.join(repoRoot, module)),
        `${module} exists`
      ).toBe(true);
    }
  });

  it("warms the same module Environment3D mounts, for every background", () => {
    expect(Object.fromEntries(warmed)).toEqual(Object.fromEntries(mounted));
  });

  it("covers every background the map claims to, and no others", () => {
    expect([...warmed.keys()].sort()).toEqual([...mounted.keys()].sort());
  });
});
