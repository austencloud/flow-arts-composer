/**
 * verify-public-firebase.mjs
 *
 * Fails when a listed public page downloads Firebase before it can draw.
 *
 * Public pages (landing mode, see src/config/domains.ts) are meant to start
 * without Firebase. A visitor who never signs in never needs it, and Auth plus
 * Firestore is one of the largest chunks in the build. One static import of a
 * module that imports Firebase is enough to put all of it on a page's first
 * download, and nothing else notices: the page still works, it is only slower
 * on a phone. A page may still load Firebase after it draws, with import().
 * This check reads only what a page loads to start.
 *
 * It reads the production build, so run it after `vite build`:
 *   .svelte-kit/output/server/manifest-full.js     the layout and page nodes of each route
 *   .svelte-kit/output/client/.vite/manifest.json  the static imports of each chunk
 *
 * The source-graph rules in tests/unit/boot-import-boundary.test.ts cannot see
 * the build's chunking: the small-chunk merge in vite.config.ts can fold a
 * module into a chunk that imports Firebase. Only the build output shows that.
 *
 * Usage:
 *   node scripts/verify-public-firebase.mjs                 # check the listed pages
 *   node scripts/verify-public-firebase.mjs --all           # also list every page in the build
 *   node scripts/verify-public-firebase.mjs --out <dir>     # a different .svelte-kit/output
 *
 * Exit 0 = every listed page starts without Firebase. Exit 1 = a listed page
 * loads Firebase at startup, or the build output is missing or unreadable.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The chunk vite.config.ts (classifyChunk) puts every Firebase package in. */
export const FIREBASE_CHUNK_NAME = "vendor-firebase";

/**
 * Public pages that start without Firebase, as SvelteKit route ids.
 *
 * If a change puts Firebase on one of these pages, load it with import() where
 * it is used (src/lib/shared/auth/loaded-auth.ts shows how to ask who is
 * signed in without it). Remove a page only if it genuinely needs Firebase
 * before it can draw, and say why in the commit. Run with --all to see every
 * page's status when a page stops loading Firebase and can be added here.
 * Pages that production switches off (src/config/feature-flags.ts) are left
 * out: their build is empty, so they would pass without being checked.
 */
export const PROTECTED_ROUTES = [
  "/",
  "/1998",
  "/2003",
  "/(public)/about",
  "/(public)/composer",
  "/(public)/delete-account",
  "/(public)/faq",
  "/(public)/guide",
  "/(public)/guide/codex",
  "/(public)/guide/codex/parity",
  "/(public)/guide/codex/poster",
  "/(public)/guide/level-2",
  "/(public)/guide/level-2/double-turns",
  "/(public)/guide/level-2/turns",
  "/(public)/guide/ratios",
  "/(public)/history",
  "/(public)/learn/staff-spinning-choreography",
  "/(public)/notation/buugeng",
  "/(public)/notation/caps",
  "/(public)/notation/clubs",
  "/(public)/notation/fans",
  "/(public)/notation/loops",
  "/(public)/notation/poi",
  "/(public)/notation/staves",
  "/(public)/privacy",
  "/(public)/roots/software",
  "/(public)/shape-engine",
  "/(public)/store/open",
  "/(public)/support",
  "/(public)/terms",
  "/(public)/tricks",
  "/demo/promo-generator",
  "/demo/video-record",
  "/embed/sequence/[id]",
  "/embed/spinner",
  "/notation/qft",
  "/q/[code]",
  "/sequence/[id]",
];

const nodeKey = (index) =>
  `.svelte-kit/generated/client-optimized/nodes/${index}.js`;

/** Every chunk reachable from the entries through static imports. */
export function staticClosure(clientManifest, entryKeys) {
  const seen = new Set();
  const queue = [...entryKeys];
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const dep of clientManifest[key]?.imports ?? []) queue.push(dep);
  }
  return seen;
}

/**
 * What each route downloads to start, and whether that includes Firebase.
 *
 * A route starts with SvelteKit's start and app entries, then every layout
 * node above the page and the page node itself. Firebase reached through a
 * layout counts as much as Firebase reached through the page.
 *
 * Throws when the build output does not have the shape this check depends
 * on, so a renamed chunk or a changed SvelteKit output fails loudly instead
 * of passing every page. `serverOnlyNodes` lists the nodes that give the
 * browser nothing to load; any other node missing from the client manifest
 * is reported rather than skipped.
 */
export function inspectRoutes({
  clientManifest,
  client,
  routes,
  routeIds,
  serverOnlyNodes = new Set(),
}) {
  const firebaseKeys = new Set(
    Object.keys(clientManifest).filter(
      (key) => clientManifest[key].name === FIREBASE_CHUNK_NAME
    )
  );
  if (firebaseKeys.size === 0) {
    throw new Error(
      `no "${FIREBASE_CHUNK_NAME}" chunk in the client manifest. If ` +
        `vite.config.ts renamed it, update FIREBASE_CHUNK_NAME here.`
    );
  }

  const keyOfFile = new Map(
    Object.entries(clientManifest).map(([key, chunk]) => [chunk.file, key])
  );
  const startKey = keyOfFile.get(client?.start);
  const appKey = keyOfFile.get(client?.app);
  if (!startKey || !appKey) {
    throw new Error(
      "the server manifest's start or app entry is not in the client manifest"
    );
  }

  return routeIds.map((id) => {
    const route = routes.find((candidate) => candidate.id === id);
    if (!route?.page) {
      return { id, error: "not a page route in this build" };
    }
    // Layout lists can have holes where a directory has no layout of its own.
    const nodes = [...route.page.layouts, route.page.leaf].filter(
      (index) =>
        index !== undefined && index !== null && !serverOnlyNodes.has(index)
    );
    const missing = nodes.filter((index) => !clientManifest[nodeKey(index)]);
    if (missing.length > 0) {
      return {
        id,
        error: `node ${missing.join(", ")} missing from the client manifest`,
      };
    }

    const loaded = staticClosure(clientManifest, [
      startKey,
      appKey,
      ...nodes.map(nodeKey),
    ]);
    // The chunks that import Firebase directly are where to start looking: a
    // chunk is usually named after the first module in it.
    const importers = [...loaded]
      .filter((key) =>
        (clientManifest[key].imports ?? []).some((dep) => firebaseKeys.has(dep))
      )
      .map((key) => clientManifest[key].name ?? clientManifest[key].file)
      .sort();
    return {
      id,
      firebase: [...firebaseKeys].some((key) => loaded.has(key)),
      importers,
    };
  });
}

/**
 * Nodes the browser loads nothing for, such as a +page.server.ts that only
 * redirects. SvelteKit writes each node's browser files into its server node
 * module as `imports`, and leaves the list empty for these.
 */
function findServerOnlyNodes(serverNodesDir) {
  const indices = new Set();
  for (const file of fs.readdirSync(serverNodesDir)) {
    const match = /^(\d+)\.js$/.exec(file);
    if (!match) continue;
    const source = fs.readFileSync(path.join(serverNodesDir, file), "utf8");
    if (/^export const imports = \[\];$/m.test(source)) {
      indices.add(Number(match[1]));
    }
  }
  return indices;
}

async function main() {
  const args = process.argv.slice(2);
  let out = path.join(ROOT, ".svelte-kit", "output");
  let all = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      out = path.resolve(args[++i]);
    } else if (args[i] === "--all") {
      all = true;
    } else {
      console.error(`[verify-public-firebase] unknown argument: ${args[i]}`);
      console.error(
        "usage: node scripts/verify-public-firebase.mjs [--all] [--out <dir>]"
      );
      process.exit(1);
    }
  }

  const clientManifestPath = path.join(out, "client", ".vite", "manifest.json");
  const serverManifestPath = path.join(out, "server", "manifest-full.js");
  for (const file of [clientManifestPath, serverManifestPath]) {
    if (!fs.existsSync(file)) {
      console.error(`[verify-public-firebase] build output not found: ${file}`);
      console.error("[verify-public-firebase] run a production build first.");
      process.exit(1);
    }
  }

  const clientManifest = JSON.parse(
    fs.readFileSync(clientManifestPath, "utf8")
  );
  const { manifest } = await import(pathToFileURL(serverManifestPath).href);
  const { client, routes } = manifest._;
  const serverOnlyNodes = findServerOnlyNodes(
    path.join(out, "server", "nodes")
  );

  let results;
  let everyPage = [];
  try {
    results = inspectRoutes({
      clientManifest,
      client,
      routes,
      routeIds: PROTECTED_ROUTES,
      serverOnlyNodes,
    });
    if (all) {
      everyPage = inspectRoutes({
        clientManifest,
        client,
        routes,
        routeIds: routes.filter((route) => route.page).map((route) => route.id),
        serverOnlyNodes,
      });
    }
  } catch (error) {
    console.error(`[verify-public-firebase] ${error.message}`);
    process.exit(1);
  }

  console.log(`verify-public-firebase (${out})\n`);
  const failures = [];
  for (const result of results) {
    let detail = "starts without Firebase";
    if (result.error) detail = result.error;
    else if (result.firebase)
      detail = `loads Firebase at startup, imported by ${result.importers.join(", ")}`;
    const pass = !result.error && !result.firebase;
    console.log(`${pass ? "✅" : "❌"} ${result.id.padEnd(48)} ${detail}`);
    if (!pass) failures.push(result);
  }

  if (all) {
    console.log("\nEvery page in the build:");
    for (const result of everyPage) {
      const status = result.error
        ? result.error
        : result.firebase
          ? `Firebase at startup (${result.importers.join(", ")})`
          : "clean";
      console.log(`  ${result.id.padEnd(48)} ${status}`);
    }
  }

  console.log("");
  if (failures.length > 0) {
    console.log(
      `PUBLIC PAGES: ${failures.length} of ${results.length} load Firebase at ` +
        "startup or could not be checked. Load Firebase with import() where " +
        "it is used; see the comment above PROTECTED_ROUTES."
    );
    process.exit(1);
  }
  console.log(
    `PUBLIC PAGES: all ${results.length} listed pages start without Firebase`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
