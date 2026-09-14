import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("museum rendering performance contract", () => {
  it("never uses the synchronous Three.js shader compiler", () => {
    const streamer = read(
      "src/lib/features/museum/services/museum-geometry-streamer.ts"
    );
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );

    expect(scene).toContain(
      "renderer.compileAsync(object, warmupCamera, scene)"
    );
    expect(`${streamer}\n${scene}`).not.toMatch(/\br(?:enderer|2)\.compile\(/);
    expect(streamer).not.toContain("Build all remaining rooms progressively");
  });

  it("raycasts the collider index instead of the complete scene graph", () => {
    const source = read(
      "packages/camera-3d/src/lib/components/UnifiedCameraController.svelte"
    );

    expect(source).toContain("getCameraColliders(sceneToCast)");
    expect(source).not.toContain(
      "intersectObjects(sceneToCast.children, true)"
    );
  });

  it("only animates performer stations in the visitor's current room", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );
    const station = read(
      "src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte"
    );

    expect(scene).toContain("active={activePerformerIds.has(performer.id)}");
    expect(scene).toContain("visiblePerformers = roomId");
    expect(scene).not.toContain("visiblePerformers = grid.performers");
    expect(station).toContain("else performerState.pause()");
  });

  it("uses one direct render path at a bounded museum DPR", () => {
    const postProcessing = read(
      "src/lib/features/museum/components/game/MuseumPostProcessing.svelte"
    );
    const shell = read(
      "src/lib/features/museum/components/game/DimensionFlipProof.svelte"
    );

    expect(postProcessing).toContain("renderer.render(scene, camera)");
    expect(postProcessing).not.toContain("EffectComposer");
    expect(shell).toContain("<Canvas dpr={1}>");
  });

  it("keeps museum mirrors out of the render loop", () => {
    const mirror = read(
      "src/lib/features/museum/components/game/MuseumMirror.svelte"
    );

    expect(mirror).toContain("<T.MeshStandardMaterial");
    expect(mirror).not.toContain("PlanarReflector");
    expect(mirror).not.toContain("Reflector");
  });

  it("keeps portals out of the museum's render loop", () => {
    const portal = read(
      "src/lib/features/museum/components/game/MuseumPortal.svelte"
    );

    expect(portal).toContain("<T.MeshBasicMaterial");
    expect(portal).not.toContain("WebGLRenderTarget");
    expect(portal).not.toContain("useTask");
    expect(portal).not.toMatch(/\.render\(/);
  });

  it("instances the decorative cave rocks before the first doorway", () => {
    const caveScenery = read(
      "src/lib/features/museum/components/game/VulcanCaveScenicLayer.svelte"
    );

    expect(caveScenery).toContain("new InstancedMesh(");
    expect(caveScenery).toContain("<T is={scenicRocks} />");
    expect(caveScenery).not.toContain("useGltf");
    expect(caveScenery).not.toContain("source.clone(true)");
    expect(caveScenery).not.toContain("{#each rockInstances");
  });

  it("pauses and hides the village outside the Collaboration room", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );
    const village = read(
      "src/lib/features/museum/components/game/MuseumVillageEmbed.svelte"
    );

    expect(scene).toContain("visible={props.visible !== false && nearCollab}");
    expect(village).toContain("setMuseumVillageVisible(visible)");
    expect(village).toContain("<T.Group visible={visible}");
    expect(village).not.toContain("setMuseumVillageVisible(true)");
  });

  it("does not start a docent walk before shader warmup finishes", () => {
    const shell = read(
      "src/lib/features/museum/components/game/DimensionFlipProof.svelte"
    );

    expect(shell).toContain("if (!sceneReady && !docent.active) return");
    expect(shell).toContain("disabled={!sceneReady && !docent.active}");
  });

  it("draws both 3D camera variants behind the loading gate", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );
    const shell = read(
      "src/lib/features/museum/components/game/DimensionFlipProof.svelte"
    );

    expect(scene).toContain("onModelSwapped={handlePlayerAvatarReady}");
    expect(scene).toContain("fpsActive = true");
    expect(scene).toContain("playerAvatarWarmupGroup.visible = true");
    expect(scene).toContain("Promise.race([");
    expect(scene).toContain("renderer.render(scene, warmupCamera)");
    expect(scene).toContain("cameraFlip.initializeCamera(warmupCamera, true)");
    expect(scene).not.toContain("fpsWarmupObjects");
    expect(shell).toContain("onShaderWarmupReady={handleShaderWarmupReady}");
  });

  it("bounds real-time museum lights before shader generation", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );
    const roomPool = read(
      "src/lib/features/museum/services/museum-room-light-pool.ts"
    );

    expect(scene).toContain("const MAX_TORCH_LIGHTS = 1");
    expect(scene).toContain("const MAX_EXHIBIT_LIGHTS = 0");
    expect(scene).toContain("const MAX_CEILING_LIGHTS = 0");
    expect(scene).toContain("const MAX_SUNLIGHTS = 0");
    expect(roomPool).toContain("export const MAX_ROOM_LIGHTS = 2");
    expect(roomPool).toContain("export const MAX_AUTHORED_POINT_LIGHTS = 3");
  });

  it("snaps between 2D and 3D without flying through uncached rooms", () => {
    const controller = read(
      "src/lib/features/museum/services/museum-camera-flip-controller.ts"
    );

    expect(controller).toContain("const progress = goingDown ? 1 : 0");
    expect(controller).not.toContain("FLIP_DURATION");
    expect(controller).not.toContain("lerpVectors");
  });

  it("keeps the portal lights in the renderer's light count while their frames hide", () => {
    // Three.js keys every lit material's program on the number of visible
    // lights. When both portal groups flipped visible 15 m out, the point-light
    // count rose by two and every lit program in the lobby relinked in one
    // frame (measured 79 links, 3.1 s, ten steps from spawn). The light must
    // stay visible and fade by intensity instead.
    const portal = read(
      "src/lib/features/museum/components/game/MuseumPortal.svelte"
    );

    expect(portal).toContain("intensity={props.visible !== false ? 3 : 0}");
    expect(portal).not.toContain("intensity={3}");

    // The toggled group holds only the frame meshes and closes before the
    // light, so the light never inherits its visibility.
    const toggledGroup = portal.indexOf(
      "<T.Group visible={props.visible !== false}>"
    );
    expect(toggledGroup).toBeGreaterThan(-1);
    const toggledGroupClose = portal.indexOf("</T.Group>", toggledGroup);
    expect(portal.indexOf("<T.PointLight")).toBeGreaterThan(toggledGroupClose);
  });

  it("keeps the player light in the scene across camera modes", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );

    expect(scene).toContain(
      "intensity={!fpsActive && !museum3dEditorState.editorActive ? 2 : 0}"
    );
    expect(scene).not.toMatch(
      /<T\.Group[\s\S]{0,180}visible=\{!fpsActive[\s\S]{0,800}<T\.PointLight intensity=\{2\}/
    );
  });

  it("keeps one fixed authored-light signature across rooms and corridors", () => {
    const scene = read(
      "src/lib/features/museum/components/game/Museum3DScene.svelte"
    );
    const pointLightSources = [
      "DrownedGalleryAuthored.svelte",
      "FirstFireAuthored.svelte",
      "EarthRootTerraceAuthored.svelte",
      "AirChimneyGraybox.svelte",
      "VulcanCaveScenicLayer.svelte",
    ];

    expect(scene).toMatch(
      /\$state<string \| null>\(\s*geometryStreamer\.getSpawnRoomId\(\)\s*\)/
    );
    expect(scene).toContain("{#each authoredPointLightPool as slot, i (i)}");
    expect(scene).toContain("const torchLightSlot = $derived.by");
    expect(scene).toContain("baseIntensity={0}");
    expect(scene).toContain(
      "if (detectedRoomId) currentLightingRoomId = detectedRoomId"
    );
    for (const file of pointLightSources) {
      const source = read(`src/lib/features/museum/components/game/${file}`);
      expect(source).not.toContain("<T.PointLight");
      expect(source).not.toContain("currentRoomId === null ||");
    }

    for (const file of ["SundialGraybox.svelte", "MoonGraybox.svelte"]) {
      const source = read(`src/lib/features/museum/components/game/${file}`);
      expect(source).not.toContain("<T.Group visible={lit}>");
      expect(source).not.toContain("currentRoomId === null ||");
    }
  });

  it("treats Museum as one destination without mounting developer canvases", () => {
    const moduleDefinitions = read(
      "src/lib/shared/navigation/config/module-definitions.ts"
    );
    const navigationCoordinator = read(
      "src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts"
    );
    const museumModule = read("src/lib/features/museum/MuseumModule.svelte");

    expect(moduleDefinitions).toMatch(
      /id: "museum",[\s\S]{0,500}sections: \[\]/
    );
    expect(museumModule).not.toContain("museum-last-mode");
    expect(museumModule).not.toContain("PropsShowroom");
    expect(museumModule).not.toContain("ThirdPersonTest");
    expect(museumModule).not.toContain("Museum2DEditor");
    expect(navigationCoordinator).toContain('["museum", "play"]');
    expect(navigationCoordinator).toContain(
      "moduleDef?.sections?.[0]?.id ?? RETIRED_DEFAULT_SECTIONS.get(moduleId)"
    );
  });

  it("starts the deferred 3D mount even when the tab becomes hidden", () => {
    const museumModule = read("src/lib/features/museum/MuseumModule.svelte");

    expect(museumModule).toContain("if (document.hidden)");
    expect(museumModule).toContain(
      'document.addEventListener("visibilitychange", onVisibilityChange)'
    );
    expect(museumModule).toContain("cancelAnimationFrame(rafId)");
    expect(museumModule).toContain("startDeferred();");
    expect(museumModule).toContain("clearTimeout(timeoutId)");
  });

  it("passes each museum's real room graph into the geometry streamer", () => {
    const officialMuseum = read("src/lib/features/museum/MuseumModule.svelte");
    const personalMuseum = read(
      "src/lib/features/personal-museum/PersonalMuseumModule.svelte"
    );

    expect(officialMuseum).toContain(
      "edges={selectedRoom ? [] : MUSEUM_EDGES}"
    );
    expect(personalMuseum).toContain("edges={PERSONAL_MUSEUM_EDGES}");
  });
});
