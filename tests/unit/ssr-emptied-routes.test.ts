import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The production SSR build empties every `.svelte` file under
 * getSsrEmptiedRoutePaths() (see src/config/vite-plugin-feature-gate.ts) so
 * client-only pages stay out of the Cloudflare Worker. That is safe only for a
 * page the server never renders: a page that resolves to `ssr = true` would
 * serve a blank server render. The production client build also empties pages
 * under getClientEmptiedRoutePaths(), which rely on a load guard to redirect
 * before the blank component renders. The dev server never shows either
 * because the gate only runs for `vite build`.
 *
 * A `+layout@` or `+page@` reset drops every layout it skips, along with the
 * `ssr = false` and guard those layouts carry, so both checks follow the
 * route's real node chain.
 */

const REPO = resolve(__dirname, "../..");
const ROUTES = join(REPO, "src/routes");
const toRepoPath = (file: string) => relative(REPO, file).replace(/\\/g, "/");

/** What guardInternalRoute() does, or an equivalent inline redirect. */
const PRODUCTION_REDIRECT =
  /\bguardInternalRoute\(\)|\bredirect\(\s*307\s*,\s*(?:INTERNAL_ROUTE_FALLBACK|["']\/browse\/gallery["'])/;

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

type RouteNode = { dir: string; kind: "page" | "layout" };

/** A node's load modules, universal first, as SvelteKit prefers them. */
function nodeModules({ dir, kind }: RouteNode): string[] {
  return [".ts", ".js", ".server.ts", ".server.js"]
    .map((suffix) => join(dir, `+${kind}${suffix}`))
    .filter((file) => existsSync(file));
}

/** A node's own `ssr` export; the universal module wins, as in SvelteKit. */
function ssrOption(node: RouteNode): boolean | undefined {
  for (const file of nodeModules(node)) {
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

/** The nodes SvelteKit loads for a page, root layout first, following resets. */
function nodeChain(pageFile: string): RouteNode[] {
  const dir = dirname(pageFile);
  const chain: RouteNode[] = [{ dir, kind: "page" }];
  const pageReset = /^\+page@(.*)\.svelte$/.exec(basename(pageFile))?.[1];
  let layout =
    pageReset === undefined
      ? nearestLayout(dir)
      : nearestLayout(ancestorNamed(dir, pageReset));
  for (;;) {
    chain.unshift({ dir: layout, kind: "layout" });
    if (layout === ROUTES) return chain;
    const reset = layoutIn(layout)?.reset;
    layout =
      reset === undefined
        ? nearestLayout(dirname(layout))
        : nearestLayout(ancestorNamed(dirname(layout), reset));
  }
}

/** Resolve `ssr` the way SvelteKit does: the deepest node that sets it wins. */
function resolvedSsr(pageFile: string): boolean {
  for (const node of nodeChain(pageFile).reverse()) {
    const value = ssrOption(node);
    if (value !== undefined) return value;
  }
  return true;
}

function redirectsInProduction(pageFile: string): boolean {
  return nodeChain(pageFile).some((node) =>
    nodeModules(node).some((file) =>
      PRODUCTION_REDIRECT.test(readFileSync(file, "utf8"))
    )
  );
}

describe("SSR-emptied routes", () => {
  it("never renders an emptied page on the server", async () => {
    const flags = await loadProductionFeatureFlags();
    const serverRendered: string[] = [];

    for (const prefix of flags.getSsrEmptiedRoutePaths()) {
      const pages = listFiles(join(REPO, prefix), /^\+page(@.*)?\.svelte$/);
      expect(pages, `${prefix} holds no page`).not.toEqual([]);
      for (const page of pages) {
        if (resolvedSsr(page)) serverRendered.push(toRepoPath(page));
      }
    }
    expect(serverRendered).toEqual([]);
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

  it("builds node chains through layout resets", () => {
    const chainOf = (page: string) =>
      nodeChain(join(ROUTES, page)).map(
        (node) => `${toRepoPath(node.dir)}/+${node.kind}`
      );
    // The book page resets to (public), skipping the level-1 guide layout.
    expect(
      chainOf("(public)/guide/level-1/book/+page@(public).svelte")
    ).toEqual([
      "src/routes/+layout",
      "src/routes/(public)/+layout",
      "src/routes/(public)/guide/level-1/book/+page",
    ]);
    expect(chainOf("test/prop-viewing/+page.svelte")).toEqual([
      "src/routes/+layout",
      "src/routes/test/+layout",
      "src/routes/test/prop-viewing/+layout",
      "src/routes/test/prop-viewing/+page",
    ]);
    expect(resolvedSsr(join(ROUTES, "test/prop-viewing/+page.svelte"))).toBe(
      false
    );
    expect(
      resolvedSsr(join(ROUTES, "(public)/shop/success/+page.svelte"))
    ).toBe(false);
    expect(resolvedSsr(join(ROUTES, "(public)/shop/+page.svelte"))).toBe(true);
  });
});

describe("Client-emptied routes", () => {
  it("redirect every page in production before it renders blank", async () => {
    const flags = await loadProductionFeatureFlags();
    const unguarded: string[] = [];

    for (const prefix of flags.getClientEmptiedRoutePaths()) {
      const pages = listFiles(join(REPO, prefix), /^\+page(@.*)?\.svelte$/);
      expect(pages, `${prefix} holds no page`).not.toEqual([]);
      for (const page of pages) {
        if (!redirectsInProduction(page)) unguarded.push(toRepoPath(page));
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("finds a guard anywhere in the node chain", () => {
    expect(
      redirectsInProduction(join(ROUTES, "test/prop-viewing/+page.svelte"))
    ).toBe(true);
    expect(
      redirectsInProduction(join(ROUTES, "(public)/shop/+page.svelte"))
    ).toBe(false);
  });
});
