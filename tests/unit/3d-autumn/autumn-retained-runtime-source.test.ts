import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("Autumn retained runtime lifecycle", () => {
  it("does not remount the Autumn world when quality changes", () => {
    const scene = source(
      "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
    );

    expect(scene).not.toMatch(/\{#key\s+tier\}/);
    expect(scene).toContain("tier: untrack(() => tier)");
    expect(scene).toContain("$effect(() => world?.setTier(tier));");
  });

  it("stops the shared particle task while inactive", () => {
    const particles = source(
      "src/lib/shared/3d/environments/primitives/FallingParticles.svelte"
    );

    expect(particles).toMatch(/autoStart:\s*false/);
    expect(particles).toMatch(
      /\$effect\(\(\) => \{[\s\S]*?\bactive\b[\s\S]*?\.stop\(\)/
    );
  });

  it("skips the Autumn world update while the scene is inactive", () => {
    const scene = source(
      "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
    );

    expect(scene).toMatch(
      /useTask\(\(delta\) => \{[^}]*?!active\) return;[^}]*?current\.update\(/
    );
  });

  it("uploads one reduced-motion particle pose before stopping", () => {
    const particles = source(
      "src/lib/shared/3d/environments/primitives/FallingParticles.svelte"
    );

    expect(particles).toContain("uploadedStillFrame");
    expect(particles).toContain("activeMotionScale === 0");
    expect(particles).toContain("particleTask.stop()");
  });

  it("registers pointer listeners only inside the active interaction effect", () => {
    const scene = source(
      "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
    );
    const listener = scene.indexOf(
      'window.addEventListener("pointermove", onPointerMove)'
    );
    const effect = scene.lastIndexOf("$effect(() => {", listener);
    const activeGuard = scene.indexOf("if (!active)", effect);

    expect(listener).toBeGreaterThan(-1);
    expect(effect).toBeGreaterThan(-1);
    expect(activeGuard).toBeGreaterThan(effect);
    expect(activeGuard).toBeLessThan(listener);
    expect(scene).toContain(
      'window.removeEventListener("pointermove", onPointerMove)'
    );
  });

  it("releases the dedicated Autumn GLTF after restoring spatial batches", () => {
    const scene = source(
      "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
    );
    const restore = scene.indexOf("restoreAutumnGeometryTier(loaded)");
    const dispose = scene.indexOf("disposeSceneGraph(loaded)");

    expect(scene).toContain(
      'import { disposeSceneGraph } from "../utils/dispose-scene"'
    );
    expect(restore).toBeGreaterThan(-1);
    expect(dispose).toBeGreaterThan(restore);
  });

  it("keeps the interactive framebuffer discardable without breaking capture", () => {
    const viewer = source("src/lib/shared/3d/components/Viewer3DCanvas.svelte");
    const postProcessing = source(
      "src/lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte"
    );

    expect(viewer).toContain("preserveDrawingBuffer: false");
    expect(viewer).toContain("<InteractiveCanvasFrameBridge />");
    expect(postProcessing).toContain("registerInteractiveCanvasFrameProvider");
    expect(postProcessing).toContain("renderCurrentFrame(0, true)");
  });

  it("keeps Autumn shadows live when the composer pauses for export", () => {
    const postProcessing = source(
      "src/lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte"
    );

    expect(postProcessing).not.toContain("renderer.shadowMap.enabled = false");
    expect(postProcessing).toContain("oceanRendererState.shadowMapEnabled");
  });

  it("replays the reported ground-edge view against a deterministic production load", () => {
    const route = source("src/routes/test/autumn-scene/+page.svelte");
    const harness = source(
      "src/routes/test/autumn-scene/AutumnProductionHarness.svelte"
    );

    expect(route).toContain("overlook:");
    expect(route).toContain("position: [-51.21, 43.81, 25.07]");
    expect(route).toContain("target: [1.27, 8.56, -4.99]");
    expect(route).toContain("{cameraPreset}");
    expect(route).toContain("<SceneShaderWarmup");
    expect(route).toContain("waitForAllFeatures={true}");
    expect(route).toContain("sceneFeatureState.allEnabledReady");
    expect(route).toContain("productionReady");
    expect(harness).toContain("performers: REVIEW_PERFORMERS");
    expect(harness).toContain('effect: "trails"');
    expect(harness).toContain('effect: "fire"');
    expect(harness).toContain('effect: "led"');
    expect(harness).toContain("cameraMaxOrbitDistance={128}");
    expect(harness).toContain("cameraFov={cameraPreset.fov}");
    expect(harness).toContain("onSceneReadyChange={onReadyChange}");
  });

  it("routes cancellation into an Autumn-owned GLTF transport", () => {
    const scene = source(
      "src/lib/shared/3d/environments/scenes/AutumnScene.svelte"
    );
    const transport = source(
      "src/lib/shared/3d/environments/scenes/autumn/runtime/autumn-environment-transport.ts"
    );

    expect(scene).toContain("load: loadAutumnEnvironment");
    expect(scene).toContain(
      "onDiscard: (loaded) => disposeSceneGraph(loaded.scene)"
    );
    expect(transport).toContain("new LoadingManager()");
    expect(transport).toContain("manager.abort()");
  });
});
