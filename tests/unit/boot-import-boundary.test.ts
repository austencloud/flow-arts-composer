/**
 * Boot import boundary.
 *
 * The root layout is on every route's hydration path — landing, /create,
 * /browse, everything. Whatever it can reach through a STATIC import is
 * downloaded, parsed and evaluated before the page becomes interactive, and
 * Rollup's `experimentalMinChunkSize` merge (vite.config.ts,
 * `clientOnlyChunkMergePlugin`) means a sub-20 KB module can be folded into
 * the layout's own chunk, so a single static edge into a large shared vendor
 * chunk is enough to put megabytes there.
 *
 * Measured on the 2026-09-12 production build of `c4be1619`: the boot preload
 * set for `/` was 21 requests / 3,870,217 raw bytes, of which two chunks were
 * 3,491,339 — the `vendor` bucket (reached through a merged
 * `background-hold.svelte.ts`) and the fflate/web-vitals bucket (reached
 * through `url-parameter-policy` → the viewer URL codec).
 *
 * This walks the real source graph rather than the build output so the rule is
 * enforceable in a fast unit run. It reads only static `import`/`export ... from`
 * specifiers: `import type` and dynamic `import()` are deliberately invisible,
 * because both are exactly how a heavy dependency is supposed to be reached
 * from here.
 */
import { describe, expect, it } from "vitest";
import { chainTo, importGraph, repoPath as rel } from "../helpers/import-graph";

const staticGraph = (entries: string[]) => importGraph(entries);

describe("boot import boundary", () => {
  const bootGraph = staticGraph([
    rel("src/routes/+layout.svelte"),
    rel("src/routes/+layout.ts"),
    rel("src/routes/[...appPath]/+page.svelte"),
    rel("src/routes/[...appPath]/+layout.ts"),
  ]);

  /**
   * These packages belong to large or feature-only chunks with working lazy
   * paths. The backgrounds renderer loads after first paint; media export and
   * audio inference load with the features that need them.
   */
  const FORBIDDEN_PACKAGES = [
    "@austencloud/backgrounds",
    "fflate",
    "firebase",
    "three",
    "posthog-js",
    "dexie",
    "zod",
    "bits-ui",
    "fabric",
    "mediabunny",
    "h264-mp4-encoder",
    "gifenc",
    "modern-screenshot",
    "onnxruntime-web",
    "@ricky0123/vad-web",
  ];

  for (const pkg of FORBIDDEN_PACKAGES) {
    it(`does not statically reach "${pkg}" from the root layout`, () => {
      const importers = [...bootGraph.packages.entries()]
        .filter(([spec]) => spec === pkg || spec.startsWith(`${pkg}/`))
        // A package stylesheet is extracted by Vite and never drags the
        // package's JS in — see the `.css` carve-out in classifyChunk().
        .filter(([spec]) => !spec.endsWith(".css"))
        .flatMap(([, files]) => [...files]);

      expect(
        importers.map((file) => chainTo(bootGraph, file)),
        `${pkg} is on the hydration path of every route. Reach it through ` +
          `import type or a dynamic import() instead.`
      ).toEqual([]);
    });
  }

  it("keeps background-hold free of package imports so it is safe to merge", () => {
    // Under ~20 KB, so Rollup's experimentalMinChunkSize merge can fold this
    // module into any neighbouring chunk — including the root layout's. It can
    // only stay safe to merge while it imports no package at all.
    const holdGraph = staticGraph([
      rel("src/lib/shared/background/shared/state/background-hold.svelte.ts"),
    ]);
    expect([...holdGraph.packages.keys()]).toEqual([]);
  });

  it("keeps the admin user preview state free of Firebase", () => {
    // app-state checks this state on every settings lookup, and public pages
    // such as /shape-engine and /embed/spinner import app-state. The preview's
    // Firestore reads load Firebase with import() once an admin opens a
    // preview; a static Firebase import anywhere under this module puts
    // Firebase on those pages' startup download.
    const previewGraph = staticGraph([
      rel("src/lib/shared/debug/state/user-preview-state.svelte.ts"),
    ]);
    const firebaseImporters = [...previewGraph.packages.entries()]
      .filter(([spec]) => spec === "firebase" || spec.startsWith("firebase/"))
      .flatMap(([, files]) => [...files]);
    expect(
      firebaseImporters.map((file) => chainTo(previewGraph, file)),
      "Load Firebase inside the preview reads with import() instead."
    ).toEqual([]);
  });

  it.each([
    [
      "/shape-engine",
      [
        "src/routes/(public)/+layout@.svelte",
        "src/routes/(public)/+layout.ts",
        "src/routes/(public)/shape-engine/+page.svelte",
      ],
    ],
    ["/embed/spinner", ["src/routes/embed/spinner/+page.svelte"]],
  ])("keeps %s free of Firebase at startup", (_route, routeFiles) => {
    // Public pages that nobody needs to sign in to use. The spinner still
    // loads Firebase with import() once it has drawn. The build-output check
    // (scripts/verify-public-firebase.mjs) also catches chunk merges that
    // this source walk cannot see.
    const pageGraph = staticGraph(
      ["src/routes/+layout.svelte", "src/routes/+layout.ts", ...routeFiles].map(
        rel
      )
    );
    // A renamed route file would otherwise leave nothing to check.
    for (const file of routeFiles) {
      expect(pageGraph.files.has(rel(file)), `${file} not found`).toBe(true);
    }
    const firebaseImporters = [...pageGraph.packages.entries()]
      .filter(([spec]) => spec === "firebase" || spec.startsWith("firebase/"))
      .flatMap(([, files]) => [...files]);
    expect(
      firebaseImporters.map((file) => chainTo(pageGraph, file)),
      "Load Firebase with import() where it is used instead."
    ).toEqual([]);
  });

  it("keeps the viewer URL param names free of the compression codec", () => {
    const paramsGraph = staticGraph([
      rel("src/lib/shared/sequence-viewer/services/viewer-url-state-params.ts"),
    ]);
    expect([...paramsGraph.packages.keys()]).toEqual([]);
    expect(paramsGraph.files.size).toBe(1);
  });
});
