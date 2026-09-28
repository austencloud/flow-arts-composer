import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

import { detectSiteMode } from "../../src/config/domains";

const pageSource = readFileSync(
  resolve("src/routes/test/viewer-3d/+page.svelte"),
  "utf8"
);
const layoutSource = readFileSync(
  resolve("src/routes/test/viewer-3d/+layout.svelte"),
  "utf8"
);
const runtimeSource = readFileSync(
  resolve("src/routes/test/viewer-3d/Viewer3DWorkbench.svelte"),
  "utf8"
);
const canvasSource = readFileSync(
  resolve("src/lib/shared/3d/components/Viewer3DCanvas.svelte"),
  "utf8"
);
const fullscreenSource = readFileSync(
  resolve("src/lib/shared/3d/components/Viewer3DFullscreen.svelte"),
  "utf8"
);
const shaderWarmupSource = readFileSync(
  resolve("src/lib/shared/3d/components/SceneShaderWarmup.svelte"),
  "utf8"
);
const postProcessingSource = readFileSync(
  resolve(
    "src/lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte"
  ),
  "utf8"
);
const environmentSource = readFileSync(
  resolve("src/lib/shared/3d/environments/components/Environment3D.svelte"),
  "utf8"
);
const appDocumentSource = readFileSync(resolve("src/app.html"), "utf8");

describe("Viewer 3D scene workbench bootstrap", () => {
  beforeEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    window.history.replaceState({}, "", "/");
  });

  it("bypasses the authenticated application bootstrap", () => {
    window.history.replaceState({}, "", "/test/viewer-3d?scene=blossom");

    expect(detectSiteMode()).toBe("landing");
  });

  it("remains standalone inside a Tauri-hosted development browser", () => {
    (
      window as Window & { __TAURI_INTERNALS__?: Record<string, never> }
    ).__TAURI_INTERNALS__ = {};
    window.history.replaceState({}, "", "/test/viewer-3d?scene=blossom");

    expect(detectSiteMode()).toBe("landing");
  });

  it("dismisses the application boot curtain before the workbench paints", () => {
    expect(appDocumentSource).toContain('p.startsWith("/test/viewer-3d")');
  });

  it("clears the boot splash from its own bare layout", () => {
    expect(layoutSource).toContain('import "../../../app.css"');
    expect(layoutSource).toContain(
      'document.getElementById("app-loading")?.remove()'
    );
  });

  it("does not paint an artificial route-level loading experience", () => {
    expect(pageSource).toContain('import("./Viewer3DWorkbench.svelte")');
    expect(pageSource).not.toMatch(/Preparing the scene workbench/);
    expect(pageSource).not.toMatch(/loading-(shell|card|mark)/);
  });

  it("composes the production viewer with local data and no app loaders", () => {
    expect(runtimeSource).toContain("Viewer3DFullscreen");
    expect(runtimeSource).toContain("demo-sequence.json");
    expect(runtimeSource).toContain("createPlaybackState");
    expect(runtimeSource).not.toMatch(/loadCatalogs|loadCatalogSequences/);
    expect(runtimeSource).not.toMatch(/firebase|authState|composition-root/);
    expect(runtimeSource).not.toMatch(
      /SequenceViewerOrchestrator|SequenceViewerShell/
    );
  });

  it("streams the scene directly instead of mounting either loading curtain", () => {
    // `?renderer=worker` opts into the production curtain so a worker parity
    // review compares like with like (5cb43b1e80). The plain workbench URL,
    // which is the one this bootstrap protects, still streams.
    expect(runtimeSource).toContain(
      'initialRevealMode={workerReview ? "gated" : "streaming"}'
    );
    expect(runtimeSource).toContain('get("renderer") === "worker"');
    expect(runtimeSource).toContain(
      "initialRevealDeferredFeatures={STREAMED_SCENE_FEATURES}"
    );
    expect(canvasSource).toContain('initialRevealMode?: "gated" | "streaming"');
    expect(canvasSource).toContain(
      '{#if sequenceData && initialRevealMode === "gated"}'
    );
    expect(canvasSource).toContain(
      'canvasMountReady || initialRevealMode === "streaming"'
    );
  });

  it("loads optional fullscreen chrome after the canvas boundary", () => {
    expect(fullscreenSource).toContain(
      'import("./controls/SceneControlWorkspace.svelte")'
    );
    expect(fullscreenSource).not.toMatch(
      /import SceneControlWorkspace from ["']\.\/controls\//
    );
    expect(runtimeSource).toContain("word={null}");
  });

  it("draws the base scene without waiting for post-processing", () => {
    const sceneRender = canvasSource.indexOf("{@render sceneContent()}");
    const postProcessingLoad = canvasSource.indexOf(
      "{#await loadScenePostProcessing()"
    );

    expect(sceneRender).toBeGreaterThan(-1);
    expect(postProcessingLoad).toBeGreaterThan(sceneRender);
    expect(postProcessingSource).toContain("children?: Snippet");
  });

  it("does not overlap whole-scene and streamed environment shader compiles", () => {
    expect(canvasSource).toContain(
      'waitForAllFeatures={initialRevealMode === "streaming"}'
    );
    expect(shaderWarmupSource).toContain("sceneFeatures.allEnabledReady");
    expect(shaderWarmupSource).toContain(
      "sceneFeatures.allInitialRevealFeaturesReady"
    );
  });

  it("keeps production environments behind per-scene dynamic imports", () => {
    expect(environmentSource).not.toMatch(
      /import\s+\w+Scene\s+from\s+["']\.\.\/scenes\//
    );
    expect(environmentSource).toContain(
      'import("../scenes/BlossomScene.svelte")'
    );
    expect(environmentSource).toContain(
      'import("../scenes/ocean/OceanScene.svelte")'
    );
  });
});
