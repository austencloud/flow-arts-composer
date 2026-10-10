<script module lang="ts">
  export interface CameraState {
    position: [number, number, number];
    target: [number, number, number];
  }
</script>

<script lang="ts">
  /**
   * Scene3D Component
   *
   * Main 3D scene container using Threlte.
   * Includes:
   * - Camera with orbit controls
   * - Lighting
   * - Grid planes
   * - Props (when provided)
   * - Optional bloom post-processing
   */

  import { Canvas } from "@threlte/core";
  import { T } from "@threlte/core";
  import { layers } from "@threlte/extras";
  import type CameraControls from "camera-controls";
  import OrbitControls from "./OrbitControls.svelte";
  import { EffectComposer } from "threlte-postprocessing";
  import { Object3D, PerspectiveCamera, Vector3 } from "three";
  import Grid3D from "./Grid3D.svelte";
  import PerfMonitor from "./PerfMonitor.svelte";
  import Stage3D from "./Stage3D.svelte";
  import SeatedAudience3D from "./SeatedAudience3D.svelte";
  import ManualRaycaster from "./ManualRaycaster.svelte";
  import BloomEffect from "../effects/post-processing/BloomEffect.svelte";
  import Environment3D from "../environments/components/Environment3D.svelte";
  import StageTerrain from "./StageTerrain.svelte";
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { PhysicsWorldState } from "#lib/shared/3d/physics/types.js";
  import { Plane } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";
  import type { Snippet } from "svelte";
  import { WALL_OFFSET } from "@austencloud/scene-3d";
  import { CameraMode } from "#lib/shared/3d/camera/types.js";
  import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
  import { getCameraLayers } from "@austencloud/scene-3d";
  import { SCALE, STAGE } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";

  // Enable Threlte layers plugin for layer inheritance through component tree
  layers();

  /** Character position for per-character grids */
  interface CharacterGridPosition {
    x: number;
    y: number;
    z: number;
    /** Character facing angle - grids rotate with the character's body orientation */
    facingAngle?: number;
  }

  interface Props {
    /** Camera mode for view switching (orbit vs first-person) */
    cameraMode?: CameraMode;
    /** Primary character to follow in first-person mode */
    primaryCharacter?: CharacterInstanceState | null;
    /** Which planes to show */
    visiblePlanes?: Set<Plane>;
    /** Whether to show the grid */
    showGrid?: boolean;
    /** Whether to show grid point labels */
    showLabels?: boolean;
    /**
     * Whether to render the performance stage platform under the
     * performer. Defaults to true so every 3D viewer gets a clear
     * audience-direction reference (warm footlights downstage, colored
     * side cues, sunk at the current ground level). Set false for
     * first-person mode or scenes where a stage would clutter the view.
     */
    showStage?: boolean;
    /** Width of the stage platform along X in meters. Default 6m. */
    stageWidth?: number;
    /** Depth of the stage platform along Z in meters. Default 4.5m. */
    stageDepth?: number;
    /** Number of performers the environment stage must support. */
    performerCount?: number;
    /** Z offset for environment-owned stages that expand asymmetrically. */
    stageZOffset?: number;
    /**
     * Whether to render a seated audience arc on the downstage side
     * of the stage. Off by default because the character + animation
     * downloads cost several megabytes; opt in from consumers that
     * benefit from the extra spatial cue (collision lab, sequence
     * viewer).
     */
    showAudience?: boolean;
    /** Number of seated audience members to render. Default 6. */
    audienceCount?: number;
    /** Grid mode: diamond or box */
    gridMode?: GridMode;
    /** Optional half-size for prop-aware inspection grids. */
    gridSize?: number;
    /** Optional hand ring radius for prop-aware inspection grids. */
    gridHandPointRadius?: number;
    /** Optional outer ring radius for prop-aware inspection grids. */
    gridOuterPointRadius?: number;
    /** Optional body-local distance from performer to the grid plane. */
    gridForwardOffset?: number;
    /** Camera position preset */
    cameraPreset?: "front" | "top" | "side" | "perspective";
    /** Custom camera position (overrides preset) */
    customCameraPosition?: [number, number, number] | null;
    /** Custom camera target (overrides default) */
    customCameraTarget?: [number, number, number] | null;
    /** Callback when camera moves (for persistence) */
    onCameraChange?: (state: CameraState) => void;
    /** Enable bloom post-processing effect */
    bloomEnabled?: boolean;
    /** Bloom effect intensity (0 = none, higher = stronger glow) */
    bloomIntensity?: number;
    /** Bloom luminance threshold (0-1, only pixels brighter than this glow) */
    bloomThreshold?: number;
    /** Bloom blur radius (how far glow spreads) */
    bloomRadius?: number;
    /** Background type - controls both 2D theme and 3D environment */
    backgroundType?: BackgroundType;
    /** Character positions for per-character grids (if empty, single grid at origin) */
    characterPositions?: CharacterGridPosition[];
    /** Disable built-in camera (for locomotion mode which provides its own) */
    disableCamera?: boolean;
    /** Disable orbit controls (for object dragging) */
    disableOrbitControls?: boolean;
    /** Callback when a mesh is clicked (for performer selection/dragging) */
    onMeshClick?: (
      meshName: string,
      point: { x: number; y: number; z: number }
    ) => void;
    /** Callback when pointer is released (for drag end) */
    onPointerUp?: () => void;
    /** Callback during drag with ground plane coordinates */
    onDrag?: (position: { x: number; z: number }) => void;
    /** Whether dragging is currently active */
    isDragging?: boolean;
    /** Children content (props, etc.) */
    children?: Snippet;
    /** Show performance monitor overlay (FPS, draw calls, triangles, memory) */
    showPerf?: boolean;
    /** Enable procedural terrain around the stage */
    enableTerrain?: boolean;
    /** Physics state for terrain colliders (required if enableTerrain is true) */
    physicsState?: PhysicsWorldState | null;
    /** Camera position for terrain chunk streaming */
    terrainCameraPosition?: { x: number; y: number; z: number };
  }

  let {
    cameraMode = CameraMode.THIRD_PERSON,
    primaryCharacter = null,
    visiblePlanes = new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]),
    showGrid = true,
    showLabels = true,
    showStage = true,
    stageWidth = 6.0,
    stageDepth = 4.5,
    performerCount = 1,
    stageZOffset = 0,
    showAudience = false,
    audienceCount = 6,
    gridMode = "diamond",
    gridSize,
    gridHandPointRadius,
    gridOuterPointRadius,
    gridForwardOffset,
    cameraPreset = "perspective",
    customCameraPosition = null,
    customCameraTarget = null,
    onCameraChange,
    bloomEnabled = false,
    bloomIntensity = 1.5,
    bloomThreshold = 0.8,
    bloomRadius = 0.4,
    backgroundType = BackgroundType.COSMIC,
    characterPositions = [],
    disableCamera = false,
    disableOrbitControls = false,
    onMeshClick,
    onPointerUp,
    onDrag,
    isDragging = false,
    children,
    showPerf = false,
    enableTerrain = false,
    physicsState = null,
    terrainCameraPosition = { x: 0, y: 0, z: 0 },
  }: Props = $props();

  // Handle mesh click from raycaster
  function handleMeshClick(mesh: Object3D, point: Vector3) {
    const meshName = mesh.name || "";
    if (onMeshClick) {
      onMeshClick(meshName, { x: point.x, y: point.y, z: point.z });
    }
  }

  // Grid positions match character positions; rotation pivots at the character.
  // Grid offset is applied via parent T.Group, not Grid3D props.
  const gridPositions = $derived(
    characterPositions.length > 0
      ? characterPositions
      : [{ x: 0, y: 0, z: 0 }]
  );

  // Grid offset pushes the grid forward from the character in body-local space.
  // WALL_OFFSET is negative (character behind grid), so negate it for forward.
  const gridOffset = $derived(gridForwardOffset ?? -WALL_OFFSET);

  // Determine if this is a night/dark environment that needs reduced lighting
  const isNightEnvironment = $derived(
    backgroundType === BackgroundType.FOREST ||
      backgroundType === BackgroundType.COSMIC ||
      backgroundType === BackgroundType.OCEAN
  );

  // Environment-aware lighting intensities
  const ambientIntensity = $derived(isNightEnvironment ? 0.2 : 0.6);
  const mainLightIntensity = $derived(isNightEnvironment ? 0.35 : 0.8);
  const fillLightIntensity = $derived(isNightEnvironment ? 0.15 : 0.3);

  // Light colors - cool tint for night, warm neutral for day
  const ambientColor = $derived(isNightEnvironment ? "#4466aa" : "#ffffff");
  const mainLightColor = $derived(isNightEnvironment ? "#6688cc" : "#ffffff");
  const fillLightColor = $derived(isNightEnvironment ? "#334477" : "#ffffff");

  // Camera position presets (from centralized STAGE constants)
  // Grid ~1.1m, performers ~1.7m tall - camera at ~4m gives good overview
  const cameraPositions = STAGE.CAMERA_PRESETS;

  // Use custom position if provided, otherwise use preset
  let cameraPosition = $derived(
    customCameraPosition ?? cameraPositions[cameraPreset]
  );
  let cameraTarget = $derived(
    customCameraTarget ?? ([0, 0, 0] as [number, number, number])
  );

  // Track if we should use custom position (set to false when preset changes)
  let useCustom = $state(false);

  // Reset custom tracking when preset changes explicitly
  $effect(() => {
    // Access cameraPreset to create dependency
    const _ = cameraPreset;
    useCustom = false;
  });

  // Reference to orbit controls for getting camera state.
  let controlsRef = $state<CameraControls | null>(null);
  let lastAppliedCameraSignature: string | null = null;
  const _camStatePos = new Vector3();
  const _camStateTgt = new Vector3();

  // CameraControls owns the live camera transform once it mounts. Updating the
  // Three.js camera alone would be overwritten on the next controls tick, so
  // viewpoint buttons must move the controller and its target together.
  $effect(() => {
    const controls = controlsRef;
    const [positionX, positionY, positionZ] = cameraPosition;
    const [targetX, targetY, targetZ] = cameraTarget;
    if (!controls) return;

    const signature = `${positionX},${positionY},${positionZ}|${targetX},${targetY},${targetZ}`;
    if (signature === lastAppliedCameraSignature) return;

    const animate = lastAppliedCameraSignature !== null;
    lastAppliedCameraSignature = signature;
    void controls.setLookAt(
      positionX,
      positionY,
      positionZ,
      targetX,
      targetY,
      targetZ,
      animate
    );
  });

  // Reference to camera for first-person mode
  let cameraRef = $state<PerspectiveCamera | undefined>(undefined);

  // Reference to orbit camera for layer configuration
  let orbitCameraRef = $state<PerspectiveCamera | undefined>(undefined);

  // Determine if we're in first-person mode
  const isFirstPerson = $derived(cameraMode === CameraMode.FIRST_PERSON);

  // Camera layers based on mode (first-person hides player body, shows viewmodel)
  const cameraLayerConfig = $derived(getCameraLayers(isFirstPerson));

  // Apply camera layers when camera or mode changes
  // Camera.layers determines which object layers the camera can see
  $effect(() => {
    const camera = isFirstPerson ? cameraRef : orbitCameraRef;
    if (!camera) return;

    // Reset layers and enable only the ones we want
    camera.layers.disableAll();
    for (const layer of cameraLayerConfig) {
      camera.layers.enable(layer);
    }
  });

  /**
   * Compute the maximum polar angle that keeps the camera above the ground.
   * At close orbit distances the angle is generous (camera can't reach
   * underground anyway). At far distances it tightens to prevent clipping
   * through the ground plane.
   */
  function getGroundMaxPolarAngle(
    orbitRadius: number,
    targetY: number
  ): number {
    const floorY = userProportionsState.groundY + STAGE.ORBIT_GROUND_BUFFER;
    const cosTheta = (floorY - targetY) / orbitRadius;
    // Clamp to valid acos range; when the floor is unreachable at this
    // radius the camera can orbit freely (returns π).
    return Math.acos(Math.max(-1, Math.min(1, cosTheta)));
  }

  // Handle orbit control changes
  function handleCameraChange(controls: CameraControls) {
    controls.getPosition(_camStatePos);
    controls.getTarget(_camStateTgt);

    // Dynamically tighten the polar-angle ceiling so the camera
    // never drops below the ground plane at the current orbit radius.
    const r = _camStatePos.distanceTo(_camStateTgt);
    controls.maxPolarAngle = getGroundMaxPolarAngle(r, _camStateTgt.y);

    if (!onCameraChange) return;
    onCameraChange({
      position: [_camStatePos.x, _camStatePos.y, _camStatePos.z],
      target: [_camStateTgt.x, _camStateTgt.y, _camStateTgt.z],
    });
  }
</script>

{#snippet sceneContent()}
  <!-- Procedural terrain (when enabled, replaces Environment3D) -->
  {#if enableTerrain}
    <StageTerrain {physicsState} cameraPosition={terrainCameraPosition} />
  {:else}
    <!-- 3D Environment (sky, ground, particles - matches 2D theme) -->
    <Environment3D
      {backgroundType}
      {performerCount}
      {stageWidth}
      {stageDepth}
      {stageZOffset}
    />
  {/if}

  <!--
    Performance stage platform. Sits at the current ground level (from
    user proportions) with warm footlights on the downstage edge for an
    unambiguous audience-direction cue. Rendered before the grid so the
    grid lines sit visibly on top of the plank.
  -->
  {#if showStage}
    <Stage3D width={stageWidth} depth={stageDepth} />
  {/if}

  <!--
    Seated audience arc on the downstage side of the stage. Opt-in
    (off by default) because the character + animation FBX downloads
    are a few megabytes. When enabled, audience members all face the
    performer at origin so the "downstage = audience" relationship
    becomes literal instead of implied.
  -->
  {#if showAudience}
    <SeatedAudience3D count={audienceCount} />
  {/if}

  <!-- Grid planes - one per character position, rotating with character facing -->
  {#if showGrid}
    {#each gridPositions as pos, i}
      <T.Group
        position={[pos.x, pos.y, pos.z]}
        rotation.y={pos.facingAngle ?? 0}
      >
        <T.Group position.z={gridOffset}>
          <Grid3D
            {visiblePlanes}
            {showLabels}
            {gridMode}
            size={gridSize}
            handPointRadius={gridHandPointRadius}
            outerPointRadius={gridOuterPointRadius}
          />
        </T.Group>
      </T.Group>
    {/each}
  {/if}

  <!-- Children content (props, etc.) -->
  {#if children}
    {@render children()}
  {/if}
{/snippet}

<div class="scene-container" role="application">
  <Canvas>
    <PerfMonitor visible={showPerf} />

    <!-- Manual raycasting for click detection (bypasses broken Threlte interactivity) -->
    <ManualRaycaster
      onMeshClick={handleMeshClick}
      {onPointerUp}
      {onDrag}
      {isDragging}
    />

    <!-- Perspective Camera (disabled when locomotion mode provides its own) -->
    {#if !disableCamera}
      {#if cameraMode === CameraMode.FIRST_PERSON && primaryCharacter}
        <!-- First-person camera following primary character (in meters) -->
        {@const eyeHeight = SCALE.EYE_HEIGHT}
        {@const forwardOffset = STAGE.FIRST_PERSON_FORWARD_OFFSET}
        {@const eyeX =
          primaryCharacter.position.x +
          Math.sin(primaryCharacter.facingAngle) * forwardOffset}
        {@const eyeY = primaryCharacter.position.y + eyeHeight}
        {@const eyeZ =
          primaryCharacter.position.z +
          Math.cos(primaryCharacter.facingAngle) * forwardOffset}

        <T.PerspectiveCamera
          bind:ref={cameraRef}
          makeDefault
          position={[eyeX, eyeY, eyeZ]}
          fov={SCALE.DEFAULT_FOV}
          near={SCALE.NEAR_CLIP}
          far={SCALE.FAR_CLIP}
        />

        <!-- Update camera rotation to match character facing -->
        <T.Object3D
          onFrame={() => {
            if (cameraRef && primaryCharacter) {
              cameraRef.rotation.order = "YXZ";
              cameraRef.rotation.y = primaryCharacter.facingAngle;
              cameraRef.rotation.x = 0; // Look straight ahead
            }
          }}
        />
      {:else}
        <!-- Existing orbit controls (third-person) -->
        <T.PerspectiveCamera
          bind:ref={orbitCameraRef}
          makeDefault
          position={cameraPosition}
          fov={65}
          near={SCALE.NEAR_CLIP}
          far={SCALE.FAR_CLIP}
        >
          <!-- Orbit controls attached to camera (disabled during object dragging) -->
          <OrbitControls
            bind:ref={controlsRef}
            enabled={!disableOrbitControls}
            enableDamping
            dampingFactor={0.05}
            minDistance={STAGE.ORBIT_MIN_DISTANCE}
            maxDistance={STAGE.ORBIT_MAX_DISTANCE}
            maxPolarAngle={Math.PI / 2}
            target={cameraTarget}
            onchange={handleCameraChange}
          />
        </T.PerspectiveCamera>
      {/if}
    {/if}

    <!-- Ambient light for base illumination (reduced for night environments) -->
    <T.AmbientLight intensity={ambientIntensity} color={ambientColor} />

    <!-- Directional light for depth (reduced for night environments) -->
    <T.DirectionalLight
      position={[2, 3, 2]}
      intensity={mainLightIntensity}
      color={mainLightColor}
    />

    <!-- Additional fill light from opposite side -->
    <T.DirectionalLight
      position={[-1, 1, -1]}
      intensity={fillLightIntensity}
      color={fillLightColor}
    />

    <!-- Post-processing effects (wraps scene content when enabled) -->
    {#if bloomEnabled}
      <EffectComposer>
        {@render sceneContent()}

        <!-- Bloom effect -->
        <BloomEffect
          enabled={bloomEnabled}
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          radius={bloomRadius}
        />
      </EffectComposer>
    {:else}
      {@render sceneContent()}
    {/if}
  </Canvas>
</div>

<style>
  .scene-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
    /* Background now handled by SkyGradient in 3D when environment is active */
    /* Fallback gradient for NONE environment type */
    background: linear-gradient(
      180deg,
      var(--theme-surface-dark, #0a0a12) 0%,
      var(--theme-panel-bg, #050510) 100%
    );
    border-radius: 8px;
    overflow: hidden;
  }
</style>
