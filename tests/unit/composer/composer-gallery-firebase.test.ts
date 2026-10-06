/**
 * The /composer Glide stops mount without downloading Firebase.
 *
 * Each stop mounts one glide early, while the visitor is still watching the
 * stop before it. The gallery cards imported the auth state statically, and so
 * did the Construct stop's step cells, so the whole Firebase SDK downloaded
 * during the glide, screens before the page's first account action. The cards
 * read their community sequences through REST and load auth only with a
 * card's context menu; the step cells read the admin answer from
 * loaded-auth-state.
 *
 * This walks each stop's static imports and fails on any path to firebase.ts
 * or a Firebase package. Opening a card loads its viewer with import(), after
 * a click, so the walk stops there. The "See it in 3D" stop is not listed: the
 * shared 3D scene controls still import auth-state, so Firebase Auth starts
 * there, though Firestore stays closed until an account action.
 */
import { describe, expect, it } from "vitest";
import { chainTo, importGraph, repoPath } from "../../helpers/import-graph";

const STOPS = [
  "src/routes/(public)/composer/_components/ComposerExperience.svelte",
  "src/routes/(public)/composer/_sections/ConstructSection.svelte",
  "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte",
  "src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte",
  "src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte",
];

describe.each(STOPS)("/composer stop %s", (stop) => {
  const graph = importGraph([repoPath(stop)]);

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
