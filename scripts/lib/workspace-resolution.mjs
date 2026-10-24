/**
 * Make a linked worktree resolve its OWN workspace packages.
 *
 * WHY THIS EXISTS
 *
 * A task worktree's `node_modules` is a junction into the primary checkout's
 * (`E:/tka-platform/node_modules`). pnpm's workspace links live in there too,
 * so `node_modules/@tka/sequence-engine` points at the PRIMARY's
 * `packages/sequence-engine`. Vite, Vitest and tsc all follow a link to its
 * real path, so inside a worktree the tests, the dev server and the type gate
 * read the primary's package sources and builds, never the worktree's edits.
 * On 2026-10-22 that showed up as 69 LOOP tests failing against the primary's
 * engine while all 553 passed against the worktree's.
 *
 * WHAT IT DOES
 *
 * It finds every workspace package whose `node_modules` link lands outside this
 * checkout and moves resolution back onto this checkout's `packages/<dir>`:
 *
 * - `workspaceResolvePlugins(root)` gives Vite and Vitest a resolve plugin. It
 *   lets normal resolution run first (so export conditions, subpaths and the
 *   dist-or-src choice stay exactly what they are), then swaps the primary's
 *   package directory for this checkout's. A `dist/` file this checkout has not
 *   built falls back to the matching `src/` file.
 * - `workspaceTsPaths(root)` gives tsc the same mapping as `paths`.
 *
 * In a checkout that owns its `node_modules` (the primary, CI, d2's scratch
 * worktrees) every link already lands in the checkout's own `packages/`, so
 * both return nothing and resolution is untouched there.
 */

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

/** Forward slashes, and one case for comparison on Windows. */
function normalize(path) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function comparable(path) {
  const normalized = normalize(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function realpathOrNull(path) {
  try {
    return normalize(realpathSync.native(path));
  } catch {
    return null;
  }
}

/**
 * The `packages:` globs from pnpm-workspace.yaml. Only the two forms this repo
 * uses are understood: a literal directory and `<dir>/*`.
 */
function workspaceGlobs(root) {
  let text;
  try {
    text = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  } catch {
    return [];
  }
  const globs = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line);
    if (item) {
      globs.push(item[1]);
    } else if (/^\S/.test(line)) {
      break;
    }
  }
  return globs;
}

/** Every workspace package in the checkout at `root`: name, dir, manifest. */
export function listWorkspacePackages(root) {
  const dirs = [];
  for (const glob of workspaceGlobs(root)) {
    if (glob.endsWith("/*")) {
      const parent = resolve(root, glob.slice(0, -2));
      let entries = [];
      try {
        entries = readdirSync(parent, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) dirs.push(join(parent, entry.name));
      }
    } else if (!glob.includes("*")) {
      dirs.push(resolve(root, glob));
    }
  }

  const packages = [];
  for (const dir of dirs) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      // packages/animation-renderer and packages/pictograph hold only leftovers.
      continue;
    }
    if (typeof manifest.name !== "string") continue;
    packages.push({ name: manifest.name, dir: normalize(dir), manifest });
  }
  return packages;
}

/**
 * Workspace packages whose `node_modules` link resolves outside this checkout,
 * each with the directory it currently lands in (`linkedDir`). Empty in a
 * checkout that owns its `node_modules`.
 */
export function findForeignWorkspaceLinks(root) {
  const redirects = [];
  for (const pkg of listWorkspacePackages(root)) {
    const linkedDir = realpathOrNull(join(root, "node_modules", pkg.name));
    if (!linkedDir) continue;
    const ownDir = realpathOrNull(pkg.dir) ?? pkg.dir;
    if (comparable(linkedDir) === comparable(ownDir)) continue;
    redirects.push({ ...pkg, dir: ownDir, linkedDir });
  }
  return redirects;
}

/**
 * Candidate files in this checkout for a package-relative path. A `dist/`
 * target is used only when this checkout has built it; otherwise the matching
 * `src/` file stands in (`dist/loop/index.js` -> `src/loop/index.ts`).
 */
function checkoutCandidates(dir, relativePath) {
  const candidates = [`${dir}/${relativePath}`];
  if (relativePath.startsWith("dist/")) {
    const stem = `${dir}/src/${relativePath.slice("dist/".length)}`.replace(
      /\.(d\.ts|d\.mts|js|mjs)$/,
      ""
    );
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.mjs`);
  }
  return candidates;
}

/**
 * Map a resolved file path in another checkout's package onto this checkout's
 * copy. Returns null when the path is not in a redirected package or this
 * checkout has no matching file. A query suffix (`?v=...`) is kept.
 */
export function rebaseWorkspaceFile(id, redirects) {
  const queryStart = id.indexOf("?");
  const file = normalize(queryStart === -1 ? id : id.slice(0, queryStart));
  const query = queryStart === -1 ? "" : id.slice(queryStart);
  const fileKey = comparable(file);

  for (const pkg of redirects) {
    const prefix = `${comparable(pkg.linkedDir)}/`;
    if (!fileKey.startsWith(prefix)) continue;
    const relativePath = file.slice(prefix.length);
    for (const candidate of checkoutCandidates(pkg.dir, relativePath)) {
      if (existsSync(candidate)) return `${candidate}${query}`;
    }
    return null;
  }
  return null;
}

function isWorkspaceSpecifier(source, names) {
  for (const name of names) {
    if (source === name || source.startsWith(`${name}/`)) return true;
  }
  return false;
}

/**
 * Vite/Vitest plugins that keep workspace packages inside this checkout.
 * Returns [] when no link leaves the checkout, so the primary checkout's and
 * CI's resolution stay exactly as they were.
 */
export function workspaceResolvePlugins(root) {
  const redirects = findForeignWorkspaceLinks(root);
  if (redirects.length === 0) return [];
  const names = redirects.map((pkg) => pkg.name);

  return [
    {
      name: "checkout-workspace-packages",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (!isWorkspaceSpecifier(source, names)) return null;
        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        if (!resolved || resolved.external) return resolved;
        const rebased = rebaseWorkspaceFile(resolved.id, redirects);
        return rebased ? { ...resolved, id: rebased } : resolved;
      },
    },
  ];
}

/** Conditions tsc applies under `moduleResolution: "Bundler"` with `customConditions: ["svelte"]`. */
const TS_CONDITIONS = new Set(["types", "import", "svelte", "default"]);

function pickExportTarget(entry, conditions) {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry)) {
    for (const item of entry) {
      const target = pickExportTarget(item, conditions);
      if (target) return target;
    }
    return null;
  }
  if (entry && typeof entry === "object") {
    for (const [key, value] of Object.entries(entry)) {
      if (!conditions.has(key)) continue;
      const target = pickExportTarget(value, conditions);
      if (target) return target;
    }
  }
  return null;
}

/** Specifier -> package-relative target, as tsc would pick it. */
function typeEntryPoints(pkg) {
  const { exports, types, typings, main } = pkg.manifest;
  const entries = new Map();
  if (exports && typeof exports === "object" && !Array.isArray(exports)) {
    const keys = Object.keys(exports);
    const subpathMap = keys.length > 0 && keys.every((k) => k.startsWith("."));
    const subpaths = subpathMap ? Object.entries(exports) : [[".", exports]];
    for (const [subpath, entry] of subpaths) {
      if (subpath.includes("*")) continue;
      const target = pickExportTarget(entry, TS_CONDITIONS);
      if (!target) continue;
      const specifier =
        subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
      entries.set(specifier, target.replace(/^\.\//, ""));
    }
  } else {
    const target =
      pickExportTarget(exports, TS_CONDITIONS) ?? types ?? typings ?? main;
    if (target) entries.set(pkg.name, target.replace(/^\.\//, ""));
  }
  return entries;
}

/**
 * tsconfig `paths` that point every redirected workspace package at this
 * checkout, as absolute paths in the order tsc should try them. Empty in a
 * checkout that owns its `node_modules`.
 */
export function workspaceTsPaths(root) {
  const paths = {};
  for (const pkg of findForeignWorkspaceLinks(root)) {
    for (const [specifier, target] of typeEntryPoints(pkg)) {
      const candidates = checkoutCandidates(pkg.dir, target).filter((path) =>
        /\.(d\.ts|d\.mts|ts|tsx)$/.test(path)
      );
      if (candidates.length > 0) paths[specifier] = candidates;
    }
  }
  return paths;
}

/**
 * True when this checkout's `node_modules` is a link into another checkout, so
 * anything SvelteKit generates under `node_modules/$app` is shared with it.
 */
export function hasSharedNodeModules(root) {
  const linked = realpathOrNull(join(root, "node_modules"));
  const own = realpathOrNull(root);
  if (!linked || !own) return false;
  return comparable(linked) !== `${comparable(own)}/node_modules`;
}
