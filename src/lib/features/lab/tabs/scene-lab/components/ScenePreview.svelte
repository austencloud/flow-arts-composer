<script lang="ts">
  /**
   * ScenePreview
   *
   * Standalone Threlte canvas that renders the currently-selected scene
   * from SceneLabState. Three camera modes:
   *
   * - Orbit: standard OrbitControls (drag to rotate, scroll to zoom). Good
   *   for external-view tuning.
   * - Walk: grounded avatar that walks around with WASD. Gravity applies,
   *   feet planted on snow. V cycles 1st/3rd person - in 3rd person you see
   *   the character walking. Uses the kinematic fallback path (no Rapier).
   * - Fly: noclip free-fly - frictionless, no gravity, ground is irrelevant.
   *   First-person only, no visible avatar. For aerial scene exploration.
   */

  import { Canvas, T } from "@threlte/core";
  import { WebGLRenderer, PCFSoftShadowMap, Vector3 } from "three";
  import type CameraControls from "camera-controls";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import ForestScene from "#lib/shared/3d/environments/scenes/ForestScene.svelte";
  import AutumnScene from "#lib/shared/3d/environments/scenes/AutumnScene.svelte";
  import WinterScene from "#lib/shared/3d/environments/scenes/WinterScene.svelte";
  import CosmicScene from "#lib/shared/3d/environments/scenes/CosmicScene.svelte";
  import OceanScene from "#lib/shared/3d/environments/scenes/ocean/OceanScene.svelte";
  import EmberScene from "#lib/shared/3d/environments/scenes/EmberScene.svelte";
  import BlossomScene from "#lib/shared/3d/environments/scenes/BlossomScene.svelte";
  import RainbowScene from "#lib/shared/3d/environments/scenes/RainbowScene.svelte";
  import CelestialScene from "#lib/shared/3d/environments/scenes/CelestialScene.svelte";
  import VoidScene from "#lib/shared/3d/environments/scenes/VoidScene.svelte";
  import { UnifiedCameraController, CameraMode } from "@austencloud/camera-3d";
  import { Avatar3D } from "@austencloud/scene-3d";
  import { cameraPreferences } from "#lib/shared/3d/camera/camera-preferences.svelte.js";
  import { userProportionsState } from "@austencloud/scene-3d";
  import GenericSceneEditor from "#lib/shared/3d/scene-composer/GenericSceneEditor.svelte";
  import ComposerInteractivity from "#lib/shared/3d/scene-composer/ComposerInteractivity.svelte";
  import ComposerGhost from "#lib/shared/3d/scene-composer/ComposerGhost.svelte";
  import ComposedObject from "#lib/shared/3d/scene-composer/ComposedObject.svelte";
  import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
  import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";
  import type { Command } from "#lib/shared/history/command-stack.svelte.js";
  import { getSceneLabContext } from "../context/scene-lab-context";
  import { createSceneLabPlayerState } from "../state/scene-lab-player-state.svelte";
  import EditHistoryShortcutBridge from "#lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";

  interface Props {
    onComposerSave?: () => void | Promise<void>;
  }

  const { onComposerSave }: Props = $props();

  const { state: labState, composerState } = getSceneLabContext();

  // Player state - shared by walk + fly modes so position persists across toggles.
  const player = createSceneLabPlayerState();

  type CamMode = "orbit" | "walk" | "fly" | "compose";
  let camMode = $state<CamMode>("orbit");
  let pointerLocked = $state(false);

  let editorRef: ReturnType<typeof GenericSceneEditor> | undefined = $state();
  const activePlugin = $derived(composerRegistry.get(labState.sceneId));
  const canCompose = $derived(!!activePlugin);

  $effect(() => {
    if (camMode === "compose" && activePlugin) {
      composerState.setActive(true);
      composerState.setPlacements([...activePlugin.getDefaults()]);
    } else if (camMode !== "compose") {
      composerState.setActive(false);
    }
  });

  // When user clicks "Controls" in SceneLab (sets active=false), sync camMode back
  $effect(() => {
    if (!composerState.active && camMode === "compose") {
      camMode = "orbit";
    }
  });

  async function handleComposeSave() {
    await onComposerSave?.();
  }

  function handlePlaceObject(placement: ComposerPlacement) {
    const cmd: Command = {
      label: `Place ${placement.objectKey}`,
      execute() {
        composerState.addPlacement(placement);
      },
      undo() {
        composerState.removePlacement(placement.id);
      },
    };
    composerState.commands.execute(cmd);
  }

  // The UnifiedCameraController tracks FIRST_PERSON vs THIRD_PERSON internally
  // (toggled by V). We mirror it here so the avatar body can hide itself in
  // first-person (no self-nose) and appear in third-person.
  // Default Walk to third-person so the player sees their avatar on arrival.
  cameraPreferences.setModeForDestination(
    "scene-lab-walk",
    CameraMode.THIRD_PERSON
  );
  let activeCameraMode = $state<CameraMode>(CameraMode.THIRD_PERSON);

  // The UnifiedCameraController's kinematic fallback hardcodes ground at y=0
  // and feet at y=-0.85 (capsule center convention). TKA scenes render their
  // ground plane at userProportionsState.groundY (~-1.5m) using a shoulder-
  // centric convention where y=0 is shoulder level. We bridge the two by
  // shifting the scene content up so its ground lands where the controller
  // expects feet - then avatar and scene agree on where the floor is.
  const CAPSULE_HALF_EXTENT = 0.85;
  const sceneShiftY = $derived(
    -userProportionsState.groundY - CAPSULE_HALF_EXTENT
  );

  // Avatar renders only in Walk mode's third-person. Fly mode is always
  // first-person with no body. In first-person we hide the body so the
  // player doesn't see their own shoulders through the camera.
  const avatarBodyVisible = $derived(
    camMode === "walk" && activeCameraMode === CameraMode.THIRD_PERSON
  );

  // Dispatch a synthetic V keydown so the mode pill matches the keyboard
  // shortcut's behavior exactly.
  function togglePersonMode() {
    const evt = new KeyboardEvent("keydown", { code: "KeyV", bubbles: true });
    window.dispatchEvent(evt);
  }

  // Keep the camera from slipping underground while orbiting.
  const MIN_CAMERA_Y = 0.1;
  let controlsRef = $state<CameraControls | null>(null);

  $effect(() => {
    if (camMode === "compose" && controlsRef) {
      composerState.setOrbitControls(controlsRef);
    }
  });

  let clamping = false;
  const _clampPos = new Vector3();
  const _clampTgt = new Vector3();

  function clampBelowGround(controls: CameraControls) {
    if (clamping) return;
    controls.getPosition(_clampPos);
    controls.getTarget(_clampTgt);

    let newPosY = _clampPos.y;
    let newTgtY = _clampTgt.y;
    let changed = false;

    if (_clampPos.y < MIN_CAMERA_Y) {
      const delta = MIN_CAMERA_Y - _clampPos.y;
      newPosY += delta;
      newTgtY += delta;
      changed = true;
    }

    if (newTgtY < 0) {
      newTgtY = 0;
      changed = true;
    }

    if (changed) {
      clamping = true;
      // No transition - the clamp should feel like a hard wall, not
      // a rubber-band. setLookAt sets both at once so the dolly
      // distance stays intact.
      controls.setLookAt(
        _clampPos.x,
        newPosY,
        _clampPos.z,
        _clampTgt.x,
        newTgtY,
        _clampTgt.z,
        false
      );
      clamping = false;
    }
  }

  function createRenderer(canvas: HTMLCanvasElement) {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    return renderer;
  }

  // Listen for pointer-lock so the HUD can show/hide its instruction hint.
  $effect(() => {
    if (camMode === "orbit") {
      pointerLocked = false;
      return;
    }
    const handler = () => {
      pointerLocked = document.pointerLockElement !== null;
    };
    document.addEventListener("pointerlockchange", handler);
    return () => document.removeEventListener("pointerlockchange", handler);
  });
</script>

<div class="scene-preview" data-edit-history-shortcut-scope>
  {#if camMode === "compose"}
    <EditHistoryShortcutBridge
      onUndo={() => composerState.commands.undo()}
      onRedo={() => composerState.commands.redo()}
      canUndo={composerState.commands.canUndo}
      canRedo={composerState.commands.canRedo}
      undoLabel={composerState.commands.undoLabel}
      redoLabel={composerState.commands.redoLabel}
    />
  {/if}
  <Canvas {createRenderer}>
    <T.PerspectiveCamera
      makeDefault
      position={[0, 3, 12]}
      fov={55}
      near={0.1}
      far={200}
    >
      {#if camMode === "orbit" || camMode === "compose"}
        <OrbitControls
          bind:ref={controlsRef}
          enabled={!composerState.gizmoDragging}
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2}
          rotateSpeed={0.6}
          panSpeed={2.5}
          zoomSpeed={2.0}
          target={[0, 1.5, 0]}
          onchange={clampBelowGround}
        />
      {/if}
    </T.PerspectiveCamera>

    {#if camMode === "walk"}
      <!-- Walk: kinematic fallback (physicsProvider=null) gives gravity +
           ground clamp + WASD horizontal walk. Both 1st and 3rd person
           allowed; Space jumps when grounded. If the controller flips to
           ORBIT (Esc / pointer-lock-lost), we pop camMode back to "orbit"
           so the outer state stays coherent instead of leaving the
           controller stranded. -->
      <UnifiedCameraController
        destinationId="scene-lab-walk"
        avatarState={player.avatarState}
        {cameraPreferences}
        enabled={true}
        allowedModes={[CameraMode.FIRST_PERSON, CameraMode.THIRD_PERSON]}
        onModeChange={(m: CameraMode) => {
          if (m === CameraMode.ORBIT) {
            camMode = "orbit";
            return;
          }
          activeCameraMode = m;
        }}
      />
    {:else if camMode === "fly"}
      <!-- Fly: physicsProvider always reports noclip, so controller takes its
           full-3D-forward path - no gravity, pitch lifts you. First-person
           only, no avatar body. -->
      <UnifiedCameraController
        destinationId="scene-lab-fly"
        avatarState={player.avatarState}
        physicsProvider={player.physicsProvider}
        {cameraPreferences}
        enabled={true}
        allowedModes={[CameraMode.FIRST_PERSON]}
        disableModeToggle={true}
        moveSpeed={8}
        sprintMultiplier={2.5}
        gravity={0}
        jumpForce={0}
      />
    {/if}

    <!-- Scene + avatar live in a shifted group so the TKA shoulder-centric
         ground lines up with the controller's "ground at y=0" assumption.
         Without this the avatar floats 1.5m above the visible snow. -->
    <T.Group position.y={camMode === "walk" ? sceneShiftY : 0}>
      {#if labState.sceneId === "winter"}
        <WinterScene config={labState.winterConfig} />
      {:else if labState.sceneId === "forest"}
        <ForestScene variant="firefly" config={labState.forestConfig} />
      {:else if labState.sceneId === "autumn"}
        <AutumnScene config={labState.autumnConfig} />
      {:else if labState.sceneId === "cosmic"}
        <CosmicScene
          variant={labState.cosmicVariant}
          config={labState.cosmicVariant === "night"
            ? labState.cosmicNightConfig
            : labState.cosmicAuroraConfig}
        />
      {:else if labState.sceneId === "ocean"}
        <OceanScene />
      {:else if labState.sceneId === "ember"}
        <EmberScene config={labState.emberConfig} />
      {:else if labState.sceneId === "blossom"}
        <BlossomScene config={labState.blossomConfig} />
      {:else if labState.sceneId === "rainbow"}
        <RainbowScene config={labState.rainbowConfig} />
      {:else if labState.sceneId === "celestial"}
        <CelestialScene config={labState.celestialConfig} />
      {:else if labState.sceneId === "void"}
        <VoidScene config={labState.voidConfig} />
      {/if}

      {#if camMode === "walk"}
        <!-- TEMP: keep avatar always visible in Walk mode while we debug
             the disappearing issue. The proper first-person self-hide can
             come back once we confirm the basic render is stable. -->
        <Avatar3D
          id="scene-lab-player"
          leftPropState={null}
          rightPropState={null}
          visible={true}
          isActive={false}
          position={player.avatarState.position}
          facingAngle={player.avatarState.facingAngle}
          isMoving={player.avatarState.isMoving}
          moveDirection={player.avatarState.moveDirection ?? { x: 0, z: 1 }}
          enableLocomotion={true}
        />
      {/if}
    </T.Group>

    {#if camMode === "compose" && activePlugin}
      <ComposerInteractivity>
        <GenericSceneEditor
          bind:this={editorRef}
          editorState={composerState}
          plugin={activePlugin}
          onSave={handleComposeSave}
        />

        {#each composerState.placements as placement (placement.id)}
          {@const def =
            placement.source === "native"
              ? undefined
              : activePlugin.catalog.getDefinition(placement.objectKey)}
          {#if def && placement.visible !== false}
            <ComposedObject
              {placement}
              definition={def}
              onselect={(group) => editorRef?.handleClick(group)}
              onhoverstart={(group) => editorRef?.handlePointerEnter(group)}
              onhoverend={() => editorRef?.handlePointerLeave()}
            />
          {/if}
        {/each}

        {#if composerState.activeCatalogItem && activePlugin}
          <ComposerGhost
            definition={composerState.activeCatalogItem}
            surfaceRules={activePlugin.surfaceRules}
            constraints={activePlugin.constraints}
            existingPlacements={composerState.validationPlacements}
            onPlace={handlePlaceObject}
            onCancel={() => composerState.stopPlacement()}
          />
        {/if}
      </ComposerInteractivity>
    {/if}
  </Canvas>

  <!-- Mode toggle, top-left of the preview -->
  <div class="cam-toggle">
    <button
      class:active={camMode === "orbit"}
      onclick={() => (camMode = "orbit")}
      title="Orbit - drag to rotate, scroll to zoom"
    >
      <i class="fas fa-rotate"></i> Orbit
    </button>
    <button
      class:active={camMode === "walk"}
      onclick={() => {
        camMode = "walk";
        player.resetSpawn();
      }}
      title="Walk - grounded avatar, WASD to walk, V for 1st/3rd person"
    >
      <i class="fas fa-person-walking"></i> Walk
    </button>
    <button
      class:active={camMode === "fly"}
      onclick={() => {
        camMode = "fly";
        player.resetSpawn();
      }}
      title="Fly - noclip free-flight, WASD + look direction"
    >
      <i class="fas fa-feather"></i> Fly
    </button>
    {#if canCompose}
      <button
        class:active={camMode === "compose"}
        onclick={() => {
          composerState.setActive(true);
          camMode = "compose";
        }}
        title="Compose - place and arrange objects"
      >
        <i class="fas fa-cubes"></i> Compose
      </button>
    {/if}
  </div>

  <!-- First/third-person pill, shown only in walk mode -->
  {#if camMode === "walk"}
    <div class="person-toggle">
      <button
        class:active={activeCameraMode === CameraMode.FIRST_PERSON}
        onclick={() => {
          if (activeCameraMode !== CameraMode.FIRST_PERSON) togglePersonMode();
        }}
        title="First person (V)"
      >
        <i class="fas fa-eye"></i> 1st
      </button>
      <button
        class:active={activeCameraMode === CameraMode.THIRD_PERSON}
        onclick={() => {
          if (activeCameraMode !== CameraMode.THIRD_PERSON) togglePersonMode();
        }}
        title="Third person - see your avatar (V)"
      >
        <i class="fas fa-user"></i> 3rd
      </button>
    </div>
  {/if}

  <!-- Hint overlay when in a game mode without pointer lock -->
  {#if (camMode === "walk" || camMode === "fly") && !pointerLocked}
    <div class="fly-hint">
      <div class="fly-hint-card">
        <strong>Click to look around</strong>
        {#if camMode === "walk"}
          <div class="keys">
            <kbd>WASD</kbd> walk &middot;
            <kbd>Space</kbd> jump &middot;
            <kbd>Shift</kbd> sprint &middot;
            <kbd>V</kbd> 1st/3rd person &middot;
            <kbd>Esc</kbd> release
          </div>
        {:else}
          <div class="keys">
            <kbd>WASD</kbd> move &middot;
            <kbd>Shift</kbd> sprint &middot;
            <kbd>Esc</kbd> release
          </div>
          <div class="fly-hint-note">
            Look up or down while holding <kbd>W</kbd> to fly vertically.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .scene-preview {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0a0a1a;
    border-radius: 12px;
    overflow: hidden;
  }

  .cam-toggle {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    gap: 2px;
    padding: 2px;
    background: rgba(10, 14, 26, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    backdrop-filter: blur(6px);
    z-index: 10;
  }

  .cam-toggle button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .cam-toggle button:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.05);
  }

  .cam-toggle button.active {
    background: color-mix(in srgb, #38bdf8 20%, transparent);
    color: #7dd3fc;
  }

  .cam-toggle button:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }

  .person-toggle {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 2px;
    padding: 2px;
    background: rgba(10, 14, 26, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    backdrop-filter: blur(6px);
    z-index: 10;
  }

  .person-toggle button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .person-toggle button:hover {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.05);
  }

  .person-toggle button.active {
    background: color-mix(in srgb, #38bdf8 20%, transparent);
    color: #7dd3fc;
  }

  .fly-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 9;
  }

  .fly-hint-card {
    padding: 16px 22px;
    background: rgba(10, 14, 26, 0.72);
    border: 1px solid rgba(125, 211, 252, 0.25);
    border-radius: 12px;
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.92);
    font-size: 14px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }

  .fly-hint-card strong {
    display: block;
    margin-bottom: 6px;
    color: #7dd3fc;
    font-size: 15px;
    font-weight: 700;
  }

  .fly-hint-card .keys {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
  }

  .fly-hint-note {
    margin-top: 6px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }

  kbd {
    display: inline-block;
    padding: 1px 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    margin: 0 2px;
  }
</style>
