/**
 * Source contract: a 3D open downloads only what the scene loads.
 *
 * The scene warm-up exists for "3D is one click away". On a direct 3D open the
 * real loaders are already running, so warming only fetched the same models a
 * second time, plus `cosmic-stage.glb`, which the worker world never loads.
 * The old forest/camping preloader fetched ten models no shipping viewer scene
 * reads. Both cost a measured ~8 MB on the live boot (2026-11-11), and neither
 * shows up anywhere except the network panel, so the gate is pinned here.
 *
 * If this test fails, fix the viewer, do not loosen the assertions.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const VIEWER_DIR = "src/lib/shared/sequence-viewer/components";

describe("viewer boot downloads", () => {
  it("warms scene assets only while 3D has not been opened", () => {
    const source = read(`${VIEWER_DIR}/ViewerMotionSurface.svelte`);
    const effect = source.match(
      /\$effect\(\(\) => \{([^}]*?)warmSelectedSceneAssets\(\);/s
    );
    expect(effect, "warm-up effect not found").not.toBeNull();
    expect(effect![1]).toMatch(
      /if \(is3DActive \|\| is3DMounted\) return;/
    );
    // The viewer mounts a surface per side. Only the primary side may warm,
    // or the hidden companion fetches the models during a direct 3D open.
    expect(effect![1]).toMatch(/if \(side !== "left"\) return;/);
    // Exactly one call site, so the gate cannot be bypassed by a second one.
    expect(source.match(/warmSelectedSceneAssets\(\)/g)).toHaveLength(1);
  });

  it("does not run the old forest and camping preloader", () => {
    expect(
      existsSync(
        path.join(
          repoRoot,
          "src/lib/shared/3d/services/scene-asset-preloader.svelte.ts"
        )
      )
    ).toBe(false);
    expect(read(`${VIEWER_DIR}/ViewerSplitPane.svelte`)).not.toContain(
      "scene-asset-preloader"
    );
  });

  // The early start is only useful if it requests the very modules the real
  // loaders do; a different specifier would download a second copy.
  it("starts the same 3D imports early on a direct 3D open", () => {
    const prefetch = read(
      "src/lib/shared/3d/scene-boot/viewer-3d-code-prefetch.ts"
    );
    const surface = read(`${VIEWER_DIR}/ViewerMotionSurface.svelte`);
    const lazyState = read(
      "src/lib/shared/sequence-viewer/state/lazy-viewer-3d-state.svelte.ts"
    );
    for (const [owner, specifier] of [
      [surface, "#lib/shared/3d/components/Viewer3DCanvas.svelte"],
      [lazyState, "#lib/shared/3d/state/viewer-3d-state.svelte.js"],
      [lazyState, "@austencloud/scene-3d"],
    ] as const) {
      expect(owner).toContain(`import("${specifier}")`);
      expect(prefetch).toContain(`import("${specifier}")`);
    }
    // Code only: never the worker itself or a scene download.
    expect(prefetch).not.toMatch(/new Worker\(|warmScene|sceneAssetUrls/);

    const route = read("src/routes/sequence/[id]/+page.svelte");
    expect(route).toMatch(
      /if \(browser && pageBootsInto3D\(\)\) preloadViewer3DCode\(\);/
    );
  });
});
