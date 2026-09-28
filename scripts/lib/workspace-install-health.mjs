import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const CRITICAL_IMPORTS = Object.freeze([
  "zod",
  "@9square/domain",
  "@caps/domain",
  "@flow-arts/core",
  "@spin-science/domain",
  "@tka/domain",
  "@tka/render-core",
  "@tka/sequence-engine",
  "@tka/tka-types",
  "@vtg/domain",
  "svelte",
  "@sveltejs/vite-plugin-svelte",
  "vite",
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function getDeclaredDependencyNames(manifest) {
  return [
    ...new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]),
  ].sort();
}

function packageRoot(projectRoot, packageName) {
  return path.join(projectRoot, "node_modules", ...packageName.split("/"));
}

export function inspectDeclaredDependencyRoots({ projectRoot, manifest }) {
  const issues = [];
  const dependencyNames = getDeclaredDependencyNames(manifest);

  for (const packageName of dependencyNames) {
    const manifestPath = path.join(
      packageRoot(projectRoot, packageName),
      "package.json"
    );

    if (!existsSync(manifestPath)) {
      issues.push({
        kind: "missing-package-manifest",
        packageName,
        path: manifestPath,
        message: "the installed package directory has no package.json",
      });
      continue;
    }

    try {
      const installedManifest = readJson(manifestPath);
      if (installedManifest.name !== packageName) {
        issues.push({
          kind: "mismatched-package-manifest",
          packageName,
          path: manifestPath,
          message: `expected package ${packageName}, found ${String(installedManifest.name)}`,
        });
      }
    } catch (error) {
      issues.push({
        kind: "invalid-package-manifest",
        packageName,
        path: manifestPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { dependencyNames, issues };
}

export async function inspectCriticalImports({
  projectRoot,
  specifiers = CRITICAL_IMPORTS,
}) {
  const issues = [];
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json"))
  );

  for (const packageName of specifiers) {
    let entryPath;
    try {
      entryPath = projectRequire.resolve(packageName);
    } catch (error) {
      issues.push({
        kind: "unresolvable-critical-module",
        packageName,
        path: null,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!existsSync(entryPath)) {
      issues.push({
        kind: "missing-critical-entry",
        packageName,
        path: entryPath,
        message: "the resolved module entrypoint does not exist",
      });
      continue;
    }

    try {
      await import(pathToFileURL(entryPath).href);
    } catch (error) {
      issues.push({
        kind: "unimportable-critical-module",
        packageName,
        path: entryPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { specifiers: [...specifiers], issues };
}

export async function inspectWorkspaceInstall({
  projectRoot,
  criticalImports = CRITICAL_IMPORTS,
}) {
  const rootManifestPath = path.join(projectRoot, "package.json");
  let manifest;

  try {
    manifest = readJson(rootManifestPath);
  } catch (error) {
    return {
      healthy: false,
      dependencyCount: 0,
      criticalImportCount: criticalImports.length,
      issues: [
        {
          kind: "invalid-root-manifest",
          packageName: null,
          path: rootManifestPath,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const dependencyInspection = inspectDeclaredDependencyRoots({
    projectRoot,
    manifest,
  });
  const criticalImportInspection = await inspectCriticalImports({
    projectRoot,
    specifiers: criticalImports,
  });
  const issues = [
    ...dependencyInspection.issues,
    ...criticalImportInspection.issues,
  ];

  return {
    healthy: issues.length === 0,
    dependencyCount: dependencyInspection.dependencyNames.length,
    criticalImportCount: criticalImportInspection.specifiers.length,
    issues,
  };
}

const NODE_MODULES_PREFIX = "node_modules/";

// npm's own platform rule (npm-install-checks): a "!value" entry excludes that
// value, and when plain values are listed, one of them has to match.
function matchesPlatformList(value, list) {
  const entries = Array.isArray(list) ? list : [list];
  if (entries.length === 1 && entries[0] === "any") return true;
  let negated = 0;
  let matched = false;
  for (const entry of entries) {
    if (entry.startsWith("!")) {
      negated += 1;
      if (entry.slice(1) === value) return false;
    } else if (entry === value) {
      matched = true;
    }
  }
  return matched || negated === entries.length;
}

function detectLibc() {
  return process.report?.getReport?.().header?.glibcVersionRuntime
    ? "glibc"
    : "musl";
}

function runsOnPlatform(entry, { platform, arch, libc }) {
  if (entry.os && !matchesPlatformList(platform, entry.os)) return false;
  if (entry.cpu && !matchesPlatformList(arch, entry.cpu)) return false;
  if (entry.libc) return libc !== null && matchesPlatformList(libc, entry.libc);
  return true;
}

// Dependency names a lockfile entry pulls in, mapped to whether the edge is
// optional. Later groups override earlier ones, in the same order as npm's own
// tree loader (@npmcli/arborist Node#loadDeps). Only the root installs its
// devDependencies.
function dependencyEdges(entry, isRoot) {
  const edges = new Map();
  const peerMeta = entry.peerDependenciesMeta ?? {};
  for (const name of Object.keys(entry.peerDependencies ?? {})) {
    edges.set(name, peerMeta[name]?.optional === true);
  }
  for (const name of Object.keys(entry.dependencies ?? {})) {
    edges.set(name, false);
  }
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    edges.set(name, true);
  }
  if (isRoot) {
    for (const name of Object.keys(entry.devDependencies ?? {})) {
      edges.set(name, false);
    }
  }
  return edges;
}

// Node's lookup over lockfile paths: node_modules/a/node_modules/b resolves a
// dependency in its own node_modules first, then in each enclosing one, and
// last in the project's.
function resolveLockfileLocation(entries, from, name) {
  let base = from;
  for (;;) {
    const candidate =
      base === ""
        ? `${NODE_MODULES_PREFIX}${name}`
        : `${base}/node_modules/${name}`;
    if (Object.hasOwn(entries, candidate)) return candidate;
    if (base === "") return null;
    const enclosing = base.lastIndexOf("/node_modules/");
    base = enclosing === -1 ? "" : base.slice(0, enclosing);
  }
}

// npm's optionalSet (optional-set.js in @npmcli/arborist 9.1.9, npm 11.7): the
// failed package and every package that requires it, up to the nearest
// optional edge, plus all of their dependencies that no package outside the
// set depends on, even optionally.
function optionalSet(start, edgesIn, edgesOut) {
  const boundary = new Set([start]);
  for (const location of boundary) {
    for (const edge of edgesIn.get(location) ?? []) {
      if (!edge.optional) boundary.add(edge.from);
    }
  }

  const members = new Set(boundary);
  for (const location of members) {
    for (const edge of edgesOut.get(location) ?? []) members.add(edge.to);
  }
  let changed = true;
  while (changed && members.size > 0) {
    changed = false;
    for (const location of members) {
      if (boundary.has(location)) continue;
      const dependedOnOutside = (edgesIn.get(location) ?? []).some(
        (edge) => !members.has(edge.from)
      );
      if (dependedOnOutside) {
        members.delete(location);
        changed = true;
      }
    }
  }
  return members;
}

// The lockfile locations npm leaves uninstalled on this platform.
// package-lock.json lists every platform's packages. npm skips an optional one
// built for another platform along with its optional set, so a WebAssembly
// fallback also takes the runtime packages only it uses. npm also skips an
// optional package whose `engines` field rejects the running Node or npm; that
// case is not modeled here.
function platformSkippedLocations(entries, target) {
  const edgesIn = new Map();
  const edgesOut = new Map();
  for (const [from, entry] of Object.entries(entries)) {
    // A link carries no dependencies (its target does), and a link target such
    // as ../packages/domain resolves only inside its own folder. npm
    // workspaces are not modeled.
    if (entry.link) continue;
    if (from !== "" && !from.startsWith(NODE_MODULES_PREFIX)) continue;
    const out = [];
    for (const [name, optional] of dependencyEdges(entry, from === "")) {
      const to = resolveLockfileLocation(entries, from, name);
      if (to === null) continue;
      out.push({ to, optional });
      if (!edgesIn.has(to)) edgesIn.set(to, []);
      edgesIn.get(to).push({ from, optional });
    }
    edgesOut.set(from, out);
  }

  const skipped = new Set();
  for (const [location, entry] of Object.entries(entries)) {
    if (entry.optional !== true || runsOnPlatform(entry, target)) continue;
    for (const member of optionalSet(location, edgesIn, edgesOut)) {
      skipped.add(member);
    }
  }
  return skipped;
}

function inspectLink({ packageName, installedPath, projectRoot, resolved }) {
  let actual;
  try {
    actual = realpathSync(installedPath);
  } catch {
    return {
      kind: "missing-link",
      packageName,
      path: installedPath,
      message: `not linked (lockfile links it to ${resolved})`,
    };
  }

  const expected = path.resolve(projectRoot, resolved ?? "");
  let expectedReal = expected;
  try {
    expectedReal = realpathSync(expected);
  } catch {
    // A missing target still fails the comparison below, which says where the
    // link points instead.
  }
  if (actual === expectedReal) return null;
  return {
    kind: "mismatched-link",
    packageName,
    path: installedPath,
    message: `resolves to ${actual}, lockfile links it to ${resolved}`,
  };
}

/**
 * Compares an npm project's installed node_modules with its package-lock.json,
 * entry by entry, the way `npm ci` would lay it out. Optional packages npm
 * skips on this platform are skipped here too. Lockfile paths outside
 * node_modules (a `file:` link's target, such as ../packages/domain) belong to
 * whoever installs that folder.
 */
export function inspectLockfileInstall({
  projectRoot,
  platform = process.platform,
  arch = process.arch,
  libc = platform === "linux" ? detectLibc() : null,
}) {
  const lockfilePath = path.join(projectRoot, "package-lock.json");
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  const unhealthy = (issue) => ({
    healthy: false,
    packageCount: 0,
    issues: [{ packageName: null, ...issue }],
  });

  let entries;
  try {
    entries = readJson(lockfilePath).packages;
  } catch (error) {
    return unhealthy({
      kind: "invalid-lockfile",
      path: lockfilePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (!entries || typeof entries !== "object") {
    return unhealthy({
      kind: "invalid-lockfile",
      path: lockfilePath,
      message: 'the lockfile has no "packages" map (npm 7 and later write one)',
    });
  }
  if (!existsSync(nodeModulesPath)) {
    return unhealthy({
      kind: "missing-node-modules",
      path: nodeModulesPath,
      message: "nothing is installed in this folder",
    });
  }

  const skipped = platformSkippedLocations(entries, { platform, arch, libc });
  const issues = [];
  let packageCount = 0;

  for (const [location, entry] of Object.entries(entries)) {
    if (!location.startsWith(NODE_MODULES_PREFIX)) continue;
    if (skipped.has(location)) continue;
    packageCount += 1;

    const packageName = location.slice(
      location.lastIndexOf(NODE_MODULES_PREFIX) + NODE_MODULES_PREFIX.length
    );
    const installedPath = path.join(projectRoot, ...location.split("/"));

    if (entry.link) {
      const issue = inspectLink({
        packageName,
        installedPath,
        projectRoot,
        resolved: entry.resolved,
      });
      if (issue) issues.push(issue);
      continue;
    }

    const manifestPath = path.join(installedPath, "package.json");
    if (!existsSync(manifestPath)) {
      issues.push({
        kind: "missing-installed-package",
        packageName,
        path: installedPath,
        message: entry.version
          ? `not installed (lockfile has ${entry.version})`
          : "not installed",
      });
      continue;
    }

    let installedVersion;
    try {
      installedVersion = readJson(manifestPath).version;
    } catch (error) {
      issues.push({
        kind: "invalid-package-manifest",
        packageName,
        path: manifestPath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (entry.version && installedVersion !== entry.version) {
      issues.push({
        kind: "mismatched-installed-version",
        packageName,
        path: installedPath,
        message: `installed ${String(installedVersion)}, lockfile has ${entry.version}`,
      });
    }
  }

  return { healthy: issues.length === 0, packageCount, issues };
}
