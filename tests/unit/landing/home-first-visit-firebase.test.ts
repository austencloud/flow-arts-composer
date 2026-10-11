/**
 * The home page's first visit never downloads Firebase.
 *
 * Firebase Auth and Firestore are the largest download a page can pull in, and
 * most first-time visitors never sign in. The home page draws its hero
 * animation, demo cards and launchpad tiles through LazyMount, which loads each
 * one with import() as it nears the screen, and it starts its backdrop, hero
 * and per-visit demo with import() right after first paint. A walk of the
 * route's static imports sees none of that: it passed on 2026-09-28 while a
 * fresh visit downloaded Firebase through three of those components, the
 * hero's animation player (its video export), the choreo card's QR generator
 * and the card layout settings (image-composition-state.svelte.ts).
 *
 * So this walks the route's static imports, every LazyMount loader they reach
 * and the import() calls listed below, and fails on any path to firebase.ts or
 * a Firebase package. Other import() calls stay out: they wait for a click, a
 * saved session (deferred-sign-in.ts) or app mode. The build check
 * (scripts/verify-public-firebase.mjs) covers the startup chunks, whose merges
 * this source walk cannot see.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chainTo,
  importGraph,
  repoPath,
  resolveLocal,
  type ImportGraph,
} from "../../helpers/import-graph";

const ROUTE_FILES = [
  "src/hooks.client.ts",
  "src/routes/+layout.svelte",
  "src/routes/+layout.ts",
  "src/routes/+page.svelte",
  "src/routes/+page.ts",
];

// Started on every first visit without a click: analytics once the landing
// page has drawn, then the backdrop, the hero and the per-visit demo.
const FIRST_VISIT_IMPORTS: Array<[owner: string, specifier: string]> = [
  ["src/routes/+layout.svelte", "#lib/shared/analytics/services/posthog.js"],
  ["src/routes/+layout.svelte", "#lib/shared/analytics/web-vitals.js"],
  [
    "src/lib/shared/landing/components/MarketingChrome.svelte",
    "#lib/shared/background/shared/components/BackgroundHost.svelte",
  ],
  [
    "src/lib/shared/landing/components/MarketingChrome.svelte",
    "#lib/shared/settings/utils/background-theme-calculator.js",
  ],
  [
    "src/lib/shared/landing/data/hero-act.svelte.ts",
    "#lib/shared/landing/data/shape-matrix-hero-pool.js",
  ],
  [
    "src/lib/shared/landing/data/hero-act.svelte.ts",
    "#lib/features/choreo-card/services/deck-variation.js",
  ],
  [
    "src/lib/shared/landing/data/per-visit-demo-core.ts",
    "#lib/shared/create/services/generation-orchestrator.js",
  ],
];

// <LazyMount loader={() => import("…")} />
const LAZY_MOUNT_LOADER =
  /loader=\{\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)\s*\}/g;

function readCode(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function resolveOrThrow(specifier: string, importer: string): string {
  const file = resolveLocal(specifier, importer);
  if (!file) throw new Error(`${specifier} in ${importer} does not resolve`);
  return file;
}

/**
 * The route's static graph plus everything the first visit loads with
 * import(). A loaded file's parent is the file that loads it, so a failure
 * prints the whole path.
 */
function firstVisitGraph() {
  const graph: ImportGraph = {
    files: new Set(),
    packages: new Map(),
    parent: new Map(),
  };
  const loadedBy = new Map<string, string | null>();
  for (const file of ROUTE_FILES) loadedBy.set(repoPath(file), null);
  for (const [owner, specifier] of FIRST_VISIT_IMPORTS) {
    loadedBy.set(resolveOrThrow(specifier, repoPath(owner)), repoPath(owner));
  }

  let entries = [...loadedBy.keys()];
  while (entries.length > 0) {
    const step = importGraph(entries);
    const added = [...step.files].filter((file) => !graph.files.has(file));
    for (const file of added) {
      graph.files.add(file);
      graph.parent.set(
        file,
        loadedBy.has(file)
          ? (loadedBy.get(file) ?? null)
          : (step.parent.get(file) ?? null)
      );
    }
    for (const [spec, importers] of step.packages) {
      const known = graph.packages.get(spec) ?? new Set<string>();
      for (const importer of importers) known.add(importer);
      graph.packages.set(spec, known);
    }

    entries = [];
    for (const file of added) {
      for (const [, specifier] of readCode(file).matchAll(LAZY_MOUNT_LOADER)) {
        const component = resolveOrThrow(specifier!, file);
        if (loadedBy.has(component) || graph.files.has(component)) continue;
        loadedBy.set(component, file);
        entries.push(component);
      }
    }
  }
  return { graph, loadedBy };
}

describe("home page first visit", () => {
  const { graph, loadedBy } = firstVisitGraph();

  it("follows the components LazyMount loads and the listed import() calls", () => {
    // A renamed loader prop or a moved import would otherwise leave nothing
    // behind the static graph to check.
    for (const component of [
      "src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte",
      "src/lib/shared/landing/components/launchpad/ChoreoCardPreview.svelte",
    ]) {
      expect(loadedBy.get(repoPath(component)), component).toBeTruthy();
    }
    for (const [owner, specifier] of FIRST_VISIT_IMPORTS) {
      expect(readCode(repoPath(owner)), owner).toContain(
        `import("${specifier}")`
      );
    }
  });

  it("never reaches the Firebase bootstrap", () => {
    const bootstrap = repoPath("src/lib/shared/auth/firebase.ts");
    expect(
      graph.files.has(bootstrap) ? chainTo(graph, bootstrap) : null,
      "Load it with import() where a click or a saved session needs it."
    ).toBeNull();
  });

  it("never imports a Firebase package", () => {
    const importers = [...graph.packages.entries()]
      .filter(([spec]) => /^@?firebase(\/|$)/.test(spec))
      .flatMap(([, files]) => [...files]);
    expect(importers.map((file) => chainTo(graph, file))).toEqual([]);
  });
});
