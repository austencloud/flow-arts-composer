import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The production SSR build empties every `.svelte` file under
 * getSsrEmptiedRoutePaths() (see src/config/vite-plugin-feature-gate.ts) so
 * client-only pages stay out of the Cloudflare Worker. That is safe only for a
 * page the server never renders: a page that resolves to `ssr = true` would
 * serve a blank server render. The dev server never shows this because the
 * gate only runs for `vite build`.
 */

const REPO = resolve(__dirname, "../..");
const ROUTES = join(REPO, "src/routes");
const toRepoPath = (file: string) => relative(REPO, file).replace(/\\/g, "/");

async function loadProductionFeatureFlags() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BUILD_ALL", "");
  vi.resetModules();
  return import("../../src/config/feature-flags");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function listFiles(dir: string, match: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path, match);
    return match.test(entry.name) ? [path] : [];
  });
}

/** A node's own `ssr` export; the universal module wins, as in SvelteKit. */
function ssrOption(dir: string, kind: "page" | "layout"): boolean | undefined {
  for (const suffix of [".ts", ".js", ".server.ts", ".server.js"]) {
    const file = join(dir, `+${kind}${suffix}`);
    if (!existsSync(file)) continue;
    const match = /export\s+const\s+ssr\s*=\s*(true|false)\b/.exec(
      readFileSync(file, "utf8")
    );
    if (match) return match[1] === "true";
  }
  return undefined;
}

/** The `@segment` reset of a layout in `dir`, or null when it has no layout. */
function layoutIn(dir: string): { reset?: string } | null {
  const names = readdirSync(dir);
  const component = names.find((name) => /^\+layout(@.*)?\.svelte$/.test(name));
  const hasModule = names.some((name) =>
    /^\+layout(\.server)?\.(ts|js)$/.test(name)
  );
  if (!component && !hasModule) return null;
  return { reset: /^\+layout@(.*)\.svelte$/.exec(component ?? "")?.[1] };
}

function nearestLayout(start: string): string {
  for (let dir = start; dir !== ROUTES; dir = dirname(dir)) {
    if (layoutIn(dir)) return dir;
  }
  return ROUTES;
}

function ancestorNamed(start: string, segment: string): string {
  if (segment === "") return ROUTES;
  for (let dir = start; dir !== ROUTES; dir = dirname(dir)) {
    if (basename(dir) === segment) return dir;
  }
  throw new Error(`No "${segment}" segment above ${toRepoPath(start)}`);
}

/** Resolve `ssr` the way SvelteKit does, following `@` layout resets. */
function resolvedSsr(pageFile: string): boolean {
  const dir = dirname(pageFile);
  const own = ssrOption(dir, "page");
  if (own !== undefined) return own;
  const pageReset = /^\+page@(.*)\.svelte$/.exec(basename(pageFile))?.[1];
  let layout =
    pageReset === undefined
      ? nearestLayout(dir)
      : nearestLayout(ancestorNamed(dir, pageReset));
  for (;;) {
    const value = ssrOption(layout, "layout");
    if (value !== undefined) return value;
    if (layout === ROUTES) return true;
    const reset = layoutIn(layout)?.reset;
    layout =
      reset === undefined
        ? nearestLayout(dirname(layout))
        : nearestLayout(ancestorNamed(dirname(layout), reset));
  }
}

describe("SSR-emptied routes", () => {
  it("never renders an emptied page on the server", async () => {
    const flags = await loadProductionFeatureFlags();
    // A page the client build empties too is blank everywhere already.
    const clientEmptied = flags.getClientEmptiedRoutePaths();

    for (const prefix of flags.getSsrEmptiedRoutePaths()) {
      const pages = listFiles(join(REPO, prefix), /^\+page(@.*)?\.svelte$/);
      expect(pages, `${prefix} holds no page`).not.toEqual([]);
      for (const page of pages) {
        const path = toRepoPath(page);
        if (clientEmptied.some((emptied) => path.startsWith(emptied))) continue;
        expect(resolvedSsr(page), `${path} renders on the server`).toBe(false);
      }
    }
  });

  it("keeps emptied components out of routes that render elsewhere", async () => {
    const flags = await loadProductionFeatureFlags();
    const prefixes = flags.getSsrEmptiedRoutePaths();
    const inside = (path: string) =>
      prefixes.some((prefix) => path.startsWith(prefix));
    const specifier =
      /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;

    const crossImports: string[] = [];
    for (const file of listFiles(ROUTES, /\.(svelte|ts|js)$/)) {
      const path = toRepoPath(file);
      if (inside(path)) continue;
      for (const [, target] of readFileSync(file, "utf8").matchAll(specifier)) {
        const resolved = toRepoPath(resolve(dirname(file), target!));
        if (resolved.endsWith(".svelte") && inside(resolved)) {
          crossImports.push(`${path} -> ${resolved}`);
        }
      }
    }
    expect(crossImports).toEqual([]);
  });

  it("resolves ssr through layout resets", () => {
    // /test sets ssr = false, but this harness resets to the root layout.
    expect(resolvedSsr(join(ROUTES, "test/autumn-scene/+page.svelte"))).toBe(
      true
    );
    expect(resolvedSsr(join(ROUTES, "test/prop-viewing/+page.svelte"))).toBe(
      false
    );
    expect(
      resolvedSsr(join(ROUTES, "(public)/shop/success/+page.svelte"))
    ).toBe(false);
    expect(resolvedSsr(join(ROUTES, "(public)/shop/+page.svelte"))).toBe(true);
  });
});
