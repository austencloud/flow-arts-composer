import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

import { detectSiteMode } from "../../src/config/domains";

describe("Prop Studio bootstrap", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("uses the lightweight site mode with a persisted camera pose", () => {
    window.history.replaceState(
      {},
      "",
      "/test/prop-3d-studio?prop=fan&cam=-5.84%2C7.52%2C-22.88&look=0.00%2C-0.25%2C0.15&fov=50"
    );

    expect(detectSiteMode()).toBe("landing");
  });

  it("keeps ordinary application routes on the full app bootstrap", () => {
    window.history.replaceState({}, "", "/create");

    expect(detectSiteMode()).toBe("app");
  });

  it("loads the 3D viewer, playback engine, and generator after the page shell", () => {
    const source = readFileSync(
      resolve("src/routes/test/prop-3d-studio/+page.svelte"),
      "utf8"
    );

    expect(source).not.toMatch(/import Viewer3DCanvas from/);
    expect(source).not.toMatch(/import \{ getGenerationOrchestrator \} from/);
    expect(source).not.toMatch(
      /import \{ SequenceAnimationOrchestrator \} from/
    );
    expect(source).not.toMatch(/import \{ AnimationPlaybackController \} from/);
    expect(source).toContain(
      'import("#lib/shared/3d/components/Viewer3DCanvas.svelte")'
    );
    expect(source).toContain(
      'import("#lib/shared/animation-engine/services/sequence-animation-orchestrator.js")'
    );
    expect(source).toContain(
      'import("#lib/shared/animation-engine/services/animation-playback-controller.js")'
    );
    expect(source).toMatch(
      /import\(\s*"#lib\/features\/create\/generate\/shared\/get-generation-orchestrator\.js"\s*\)/
    );
  });

  it("loads only the selected 3D environment", () => {
    const source = readFileSync(
      resolve("src/lib/shared/3d/environments/components/Environment3D.svelte"),
      "utf8"
    );

    expect(source).not.toMatch(/import BlossomScene from/);
    expect(source).not.toMatch(/import ForestScene from/);
    expect(source).toContain('import("../scenes/BlossomScene.svelte")');
    expect(source).toContain('import("../scenes/ForestScene.svelte")');
  });

  it("restores a validated LOOP before importing the generator on refresh", () => {
    const source = readFileSync(
      resolve("src/routes/test/prop-3d-studio/+page.svelte"),
      "utf8"
    );

    expect(source).toContain('"prop-studio:rotated-loop:v1"');
    expect(source).toMatch(
      /const cachedSequence = readCachedRotatedLoop\(\);[\s\S]*const initialSequencePromise = cachedSequence[\s\S]*\? Promise\.resolve\(cachedSequence\)[\s\S]*: generateRotatedLoop\(\)/
    );
    expect(source).toMatch(
      /Promise\.all\(\[loadPlaybackController\(\), initialSequencePromise\]\)[\s\S]*installSequence\(initial\)/
    );
    expect(source).toMatch(
      /const cached = JSON\.parse\(serialized\) as SequenceData;[\s\S]*if \(isEffectPreviewLoop\(cached\)\) return cached;/
    );
  });

  it("keeps the motion orchestrator independent of the authenticated app graph", () => {
    const source = readFileSync(
      resolve(
        "src/lib/shared/animation-engine/services/sequence-animation-orchestrator.ts"
      ),
      "utf8"
    );

    expect(source).not.toContain("application/state/app-state");
    expect(source).not.toContain("getSettings()");
    expect(source).toContain("AnimationPropConfigProvider");
    expect(source).toContain("DEFAULT_ANIMATION_PROP_CONFIG");
  });

  it("keeps root presence and analytics out of development harnesses", () => {
    const source = readFileSync(resolve("src/routes/+layout.svelte"), "utf8");

    expect(source).toMatch(
      /detectSiteMode\(\) !== "app"[\s\S]*?import\("#lib\/shared\/presence\/get-presence-tracker\.js"\)/
    );
    expect(source).toMatch(
      /const isDevelopmentHarness =[\s\S]*?import\.meta\.env\.DEV[\s\S]*?pathname\.startsWith\("\/test\/"\)/
    );
    expect(source).toMatch(
      /const analyticsFrame = isDevelopmentHarness[\s\S]*?\? null[\s\S]*?: requestAnimationFrame/
    );
  });

  it("does not load the effects runtime in the prop inspection studio", () => {
    const studioSource = readFileSync(
      resolve("src/routes/test/prop-3d-studio/+page.svelte"),
      "utf8"
    );
    const sceneSource = readFileSync(
      resolve("src/lib/shared/3d/components/Viewer3DScene.svelte"),
      "utf8"
    );
    const canvasSource = readFileSync(
      resolve("src/lib/shared/3d/components/Viewer3DCanvas.svelte"),
      "utf8"
    );

    // The studio mounts the canonical rail instead of a bespoke band. Its prop
    // cards now come from BentoPropGrid, which renders catalog art rather than
    // a saved pictograph composition, so saved composition overrides never
    // enter this surface.
    const pickerSource = readFileSync(
      resolve("src/lib/shared/3d/components/controls/ScenePropPicker.svelte"),
      "utf8"
    );

    expect(studioSource).toContain("enableEffects={false}");
    expect(pickerSource).toContain("<BentoPropGrid");
    expect(pickerSource).not.toContain("PropCompositionPreview");
    // The canonical rail needs an effects *config* context to render, so the
    // studio builds one — but non-persisting, so a review session never writes
    // back into the visitor's saved effect setup. The heavyweight effects
    // runtime stays barred by the orchestrator/manager assertions below.
    expect(studioSource).toContain(
      "createEffectsConfigState(undefined, { persist: false })"
    );
    expect(studioSource).not.toMatch(
      /import\s+\{[^}]*DifficultyLevel[^}]*\}\s+from\s+"#lib\/shared\/foundation\/domain\/models\/generation\/generate-models\.js"/s
    );
    expect(sceneSource).not.toMatch(/import EffectOrchestrator3D from/);
    expect(sceneSource).not.toMatch(/import SceneEffectsCoordinator3D from/);
    expect(sceneSource).not.toMatch(/import \{ SceneEffectsManager3D \} from/);
    expect(sceneSource).not.toMatch(/import \{ settingsService \} from/);
    expect(sceneSource).toContain(
      'import("../effects/EffectOrchestrator3D.svelte")'
    );
    expect(sceneSource).toContain(
      'import("../effects/scene-effects/SceneEffectsCoordinator3D.svelte")'
    );
    expect(sceneSource).toContain(
      'import("../effects/scene-effects/scene-effects-manager-3d")'
    );
    expect(sceneSource).toContain(
      'import("#lib/shared/settings/state/settings-state.svelte.js")'
    );
    expect(canvasSource).not.toMatch(/import ScenePostProcessing from/);
    expect(canvasSource).not.toMatch(/import SceneAudioPlayer from/);
    expect(canvasSource).not.toMatch(/import UnifiedTimeline from/);
    expect(canvasSource).toContain("{#if enableEffects}");
    expect(canvasSource).toContain("loadScenePostProcessing()");
    expect(canvasSource).toContain("{#if sequenceData && !hideOverlays}");

    const previewSource = readFileSync(
      resolve(
        "src/lib/shared/pictograph/prop/components/PropCompositionPreview.svelte"
      ),
      "utf8"
    );
    expect(previewSource).not.toMatch(
      /import \{ getSettings \} from .*app-state/
    );
    expect(previewSource).toContain(
      'import("#lib/shared/application/state/app-state.svelte.js")'
    );
  });
});
