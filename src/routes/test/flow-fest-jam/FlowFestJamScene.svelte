<script lang="ts">
  /**
   * Dusk at Middle Earth: the Thursday fire jam on the real festival ground.
   *
   * One camera throughout. The opening shot flies it down from golden hour to
   * the archway, then the player takes over in third person, standing in the
   * funnel, and the night builds over about four minutes to 22:30 and holds.
   * In watch mode there is no player: the night comes on quickly and the
   * camera circles the jam.
   *
   * The verbs are quiet: lingering near the rope eases the camera lower and
   * wider; E at the edge sits; walking in through the gap lights your props at
   * the flame; Space inside the rope flows; keep flowing and the watchers turn,
   * then a performer comes over and mirrors you.
   */
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type { AvatarState, PhysicsProvider } from "@austencloud/camera-3d";
  import {
    Color,
    DirectionalLight,
    FogExp2,
    Group,
    HemisphereLight,
    Mesh,
    PointLight,
    Quaternion,
    TextureLoader,
    Vector3,
    WebGLRenderTarget,
    type Camera,
    type Light,
    type Material,
    type MeshPhysicalMaterial,
    type Object3D,
    type PerspectiveCamera,
    type Scene,
    type ShaderMaterial,
    type SkinnedMesh,
    type Texture,
    type WebGLRenderer,
  } from "three";
  import {
    loadGeospatialEvidenceLayers,
    loadGeospatialTerrain,
    parseGeospatialTerrainManifest,
  } from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";
  import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
  import {
    createPhysicsWorldState,
    createRigidBody,
    disposePhysicsWorld,
    initPhysicsWorld,
    removeRigidBody,
    stepPhysics,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import { createPlayerController, disposePlayerController } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type { PhysicsBodyComponent, PhysicsWorldState, PlayerControllerState } from "#lib/shared/3d/physics/types.js";
  import SkyGradient from "#lib/shared/3d/environments/primitives/SkyGradient.svelte";
  import Starfield from "#lib/shared/3d/environments/primitives/Starfield.svelte";
  import { FireRenderer3D } from "#lib/shared/3d/effects/fire/fire-renderer-3d.js";
  import { QualityTier } from "#lib/shared/3d/effects/types.js";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    buildFlowFestJamLayout,
    distanceToPolyline,
    insidePolygon,
    jamNightAt,
    jamObstacleClearance,
    jamRopeGlow,
    type JamPoint,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
  import {
    JAM_NIGHT_BUILD_SECONDS,
    JAM_NIGHT_HOLD_HOUR,
    createJamAttention,
    jamHourAfterHandover,
    jamHourForSunElevation,
    jamSunElevationForHour,
    sampleJamShot,
    stepJamAttention,
    type JamAttentionState,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-runtime.js";
  import { buildFlowFestEntranceGradedTerrain } from "../flow-fest-sim/flow-fest-entrance-terrain";
  import { createFlowFestCampPlan } from "../flow-fest-sim/flow-fest-camp-plan";
  import { deriveFlowFestForestEcology, type FlowFestForestEcologyLayout } from "../flow-fest-sim/flow-fest-forest-ecology";
  import { FLOW_FEST_SITE_TREE_LAYOUT } from "../flow-fest-sim/flow-fest-site-tree-layout";
  import { buildFlowFestGroundFamilyMask, type FlowFestGroundFamilyMask } from "../flow-fest-sim/flow-fest-ground-surface";
  import FlowFestGroundSurface from "../flow-fest-sim/FlowFestGroundSurface.svelte";
  import FlowFestForestEcology from "../flow-fest-sim/FlowFestForestEcology.svelte";
  import {
    createFlowFestPlaceholderPool,
    type FlowFestPerformerSequencePool,
  } from "../flow-fest-sim/flow-fest-performer-sequences";
  import { buildFlowFestTerrainHost, sampleFlowFestTerrainWorldY, type FlowFestTerrainHost } from "../flow-fest-graybox/flow-fest-terrain-host";
  import { loadFlowFestRuntimeContract } from "../flow-fest-graybox/flow-fest-runtime-contract";
  import FlowFestOnFootPlayer from "../flow-fest-graybox/FlowFestOnFootPlayer.svelte";
  import FlowFestJamPeople, { type JamPeopleStats } from "./FlowFestJamPeople.svelte";
  import { buildJamSet, type JamSetHandle } from "./flow-fest-jam-set";
  import { buildJamStructures, type JamStructuresHandle } from "./flow-fest-jam-structures";
  import { JAM_MOON_DIRECTION, jamLightAt, jamSunDirection, type JamLightStop } from "./flow-fest-jam-light";
  import { facingFromYaw, jamAvatarFor, jamSequencePool } from "./flow-fest-jam-people";
  import type { JamAudio } from "./flow-fest-jam-audio";
  import { JAM_STAGE_PIECES, JAM_WARM_PIECES, JamReadiness, jamCastPieces, type JamLoadProgress } from "./flow-fest-jam-readiness";

  /**
   * loading: the set is building. preparing: the set is up and the opening's
   * first frame holds still behind the loading screen while the people load
   * and the shaders warm. The opening's clock starts when the screen has gone.
   */
  export type JamPhase = "loading" | "preparing" | "opening" | "play" | "watch";

  export interface JamLoadReport {
    expected: number;
    ready: number;
    /** Navigation start to the gate opening, ms. */
    msFromNavigation: number;
    /** Pieces still missing when the 45 s cap opened the gate anyway. */
    missing: string[];
  }

  export interface JamSceneStatus {
    phase: JamPhase;
    openingSeconds: number;
    openingLength: number;
    hour: number;
    hint: string | null;
    sitting: boolean;
    flowing: boolean;
    joined: boolean;
    notice: number;
    duet: boolean;
    linger: number;
    people: JamPeopleStats | null;
    /** The last whole frame: every pass the composer rendered. */
    render: { calls: number; triangles: number; programs: number };
  }

  interface Props {
    watch: boolean;
    /** Bumped by the page when a key or click should skip the opening. */
    skipToken: number;
    audio: JamAudio;
    /** Cap on outside spinners shown; furthest from the camera go first. */
    outsideCap?: number;
    /** The loading screen has gone: the opening shot may start. */
    begin: boolean;
    onStatus?: (status: JamSceneStatus) => void;
    onError?: (message: string) => void;
    onLoading?: (progress: JamLoadProgress) => void;
    /** Everything has loaded, compiled and runs smoothly behind the screen. */
    onPrepared?: (report: JamLoadReport) => void;
  }

  const props: Props = $props();
  // Same cast as the graybox walk scene: at runtime these are the raw objects.
  const { scene, renderer, camera } = useThrelte() as unknown as {
    scene: Scene;
    renderer: WebGLRenderer;
    camera: { current: Camera };
  };

  const MANIFEST_PATH = "/data/flow-fest-sim/terrain.manifest.json";
  const PLAYER_RADIUS = 0.3;
  const PLAYER_HALF_HEIGHT = 0.55;
  const PLAYER_OFFSET = 0.02;
  const BODY_CENTRE_ABOVE_GROUND = PLAYER_HALF_HEIGHT + PLAYER_RADIUS + PLAYER_OFFSET;
  const WALK_SPEED = 1.3;
  const COLLIDER_REACH = 64;
  const COLLIDER_CELL = 32;
  const SEATED_EYE = 0.95;
  const HANDOVER_BLEND_SECONDS = 1.6;
  const BASE_FOV = 55;
  /** Watch mode brings the night on this many times faster. */
  const WATCH_CLOCK_RATE = 12;

  const layout = buildFlowFestJamLayout();
  const openingLength = layout.openingShot[layout.openingShot.length - 1]!.seconds;

  let terrain = $state.raw<ImportedTerrainDataV2 | null>(null);
  let terrainHost = $state.raw<FlowFestTerrainHost | null>(null);
  let ecology = $state.raw<FlowFestForestEcologyLayout | null>(null);
  let groundSurface = $state.raw<FlowFestGroundFamilyMask | null>(null);
  let structures = $state.raw<JamStructuresHandle | null>(null);
  let set = $state.raw<JamSetHandle | null>(null);
  let disposed = false;

  function ground(x: number, z: number): number {
    return terrain ? sampleFlowFestTerrainWorldY(terrain, x, z) : 0;
  }

  // ------------------------------------------------------------------ physics

  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state.raw<PhysicsProvider | null>(null);
  const terrainBodies = new Map<string, PhysicsBodyComponent>();
  let colliderCell = "";

  function ensureColliders(x: number, z: number): void {
    if (!physicsState?.world || !terrainHost) return;
    const cell = `${Math.floor(x / COLLIDER_CELL)}:${Math.floor(z / COLLIDER_CELL)}`;
    if (cell === colliderCell) return;
    colliderCell = cell;
    const wanted = new Set<string>();
    for (const c of terrainHost.colliders) {
      if (Math.abs(c.centerX - x) > COLLIDER_REACH + c.halfExtentX) continue;
      if (Math.abs(c.centerZ - z) > COLLIDER_REACH + c.halfExtentZ) continue;
      wanted.add(c.name);
      if (terrainBodies.has(c.name)) continue;
      const body = createRigidBody(
        physicsState,
        { type: "static", position: { x: 0, y: 0, z: 0 } },
        { type: "trimesh", vertices: c.vertices, indices: c.indices, friction: 0.8 }
      );
      if (body) terrainBodies.set(c.name, body);
    }
    for (const [name, body] of terrainBodies) {
      if (wanted.has(name)) continue;
      removeRigidBody(physicsState, body);
      terrainBodies.delete(name);
    }
  }

  // ------------------------------------------------------------------ player

  let playerPosition = $state({ x: layout.handover.x, y: 0, z: layout.handover.z });
  let playerYaw = $state(facingFromYaw(layout.handover.yaw));
  let targetYaw = facingFromYaw(layout.handover.yaw);
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });
  let groundSpeed = $state(0);
  let viewYaw = facingFromYaw(layout.handover.yaw);
  let viewPitch = 0.22;

  const avatarState: AvatarState = {
    get position() {
      return playerPosition;
    },
    get facingAngle() {
      return playerYaw;
    },
    get isMoving() {
      return isMoving;
    },
    get moveDirection() {
      return moveDirection;
    },
    setMoveInput(input) {
      moveDirection = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement() {},
    setFacingAngle(angle) {
      if (sitting || flowing) return;
      targetYaw = angle;
    },
    snapFacingAngle(angle) {
      playerYaw = angle;
      targetYaw = angle;
    },
    updateLocomotion(delta) {
      let d = targetYaw - playerYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      playerYaw += Math.sign(d) * Math.min(Math.abs(d), 12 * delta);
    },
  };

  /** While seated or flowing the body stays put; gravity still applies. */
  function wrapProvider(base: PhysicsProvider): PhysicsProvider {
    return {
      ...base,
      movePlayer(desired, dt) {
        if (sitting || flowing) {
          desired.x = 0;
          desired.z = 0;
        }
        base.movePlayer(desired, dt);
      },
      getPlayerPosition: () => base.getPlayerPosition(),
      isGrounded: () => base.isGrounded(),
      getVelocity: () => base.getVelocity(),
      teleport: base.teleport ? (p) => base.teleport!(p) : undefined,
    };
  }

  // ------------------------------------------------------------------ state

  let phase = $state<JamPhase>("loading");
  let openingClock = 0;
  let nightClock = 0;
  let watchOrbit = 0;
  const firstElevation = layout.openingShot[0]!.sunElevationDegrees;
  let sunElevation = $state(firstElevation);
  let hour = $state(jamHourForSunElevation(firstElevation));
  let night = $state(jamNightAt(layout.night, jamHourForSunElevation(firstElevation)));
  let ropeGlow = $state(0);
  let playerReady = $state(false);
  let handoverAt = -1;
  let sitting = $state(false);
  let sitYaw = 0;
  let flowing = $state(false);
  let flowHeld = false;
  let joined = $state(false);
  let wasInside = false;
  let attention: JamAttentionState = createJamAttention();
  let notice = $state(0);
  let duet = $state(false);
  let duetSync = $state(0);
  let linger = 0;
  let hint = $state<string | null>(null);
  let peopleStats: JamPeopleStats | null = null;
  let litFires: { x: number; y: number; z: number }[] = [];
  let sequencePool = $state.raw<FlowFestPerformerSequencePool>(createFlowFestPlaceholderPool());
  let lastSkip = 0;

  // ------------------------------------------------------------------ light

  const keyLight = new DirectionalLight("#ffffff", 1);
  keyLight.castShadow = true;
  // One shadow light with a modest map; only the set and structures cast into it.
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -46;
  keyLight.shadow.camera.right = 46;
  keyLight.shadow.camera.top = 46;
  keyLight.shadow.camera.bottom = -46;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 260;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.04;
  const hemi = new HemisphereLight("#9fb4d0", "#3a3226", 0.6);
  const flameLight = new PointLight(new Color(1.0, 0.62, 0.3), 0, 10, 2);
  const fog = new FogExp2("#a08672", 0.002);
  let light = $state<JamLightStop>(jamLightAt(firstElevation));
  let sunDirection = $state<[number, number, number]>(jamSunDirection(firstElevation));
  let lightRefresh = 0;
  let tintedFor = "";
  const sunDir = new Vector3();
  const moonDir = new Vector3(...JAM_MOON_DIRECTION);
  const keyColour = new Color();
  const moonColour = new Color();

  function applyLight(dt: number): void {
    lightRefresh += dt;
    if (lightRefresh > 0.25 || !light) {
      lightRefresh = 0;
      light = jamLightAt(sunElevation);
      sunDirection = jamSunDirection(sunElevation);
    }
    const l = light;
    // Below the horizon the key light hands over from the sun to the moon.
    const e = sunElevation;
    const raw = Math.max(0, Math.min(1, (1.5 - e) / 7.5));
    const moonWeight = raw * raw * (3 - 2 * raw);
    sunDir.set(...jamSunDirection(e));
    sunDir.lerp(moonDir, moonWeight).normalize();
    keyColour.set(l.sunColor).lerp(moonColour.set(l.moonColor), moonWeight);
    keyLight.color.copy(keyColour);
    keyLight.intensity = l.sunIntensity * (1 - moonWeight) + l.moonIntensity * moonWeight;
    keyLight.position.set(layout.centre.x + sunDir.x * 120, ground(layout.centre.x, layout.centre.z) + sunDir.y * 120, layout.centre.z + sunDir.z * 120);
    keyLight.target.position.set(layout.centre.x, ground(layout.centre.x, layout.centre.z), layout.centre.z);
    keyLight.target.updateMatrixWorld();
    hemi.color.set(l.hemiSky);
    hemi.groundColor.set(l.hemiGround);
    hemi.intensity = l.hemiIntensity;
    fog.color.set(l.fogColor);
    fog.density = l.fogDensity;
    renderer.toneMappingExposure = l.exposure;
    // Terrain grade, only when the colour actually moves.
    if (terrainHost && l.terrainTint !== tintedFor) {
      tintedFor = l.terrainTint;
      tintTerrain(terrainHost.root, l.terrainTint);
    }
  }

  function tintTerrain(root: Object3D, tint: string): void {
    root.traverse((o) => {
      if (!(o instanceof Mesh) || !o.name.startsWith("FFS_Terrain_")) return;
      const materials = (Array.isArray(o.material) ? o.material : [o.material]) as (Material & { color?: Color; roughness?: number })[];
      for (const m of materials) {
        m.color?.set(tint);
        if (m.roughness !== undefined) m.roughness = 1;
      }
    });
  }

  // ------------------------------------------------------------------ loading

  const readiness = new JamReadiness([...JAM_STAGE_PIECES, ...jamCastPieces(layout), ...JAM_WARM_PIECES]);
  /** Past this the screen lifts anyway, after saying what never arrived. */
  const LOAD_CAP_MS = 45_000;
  /** Frames in a row under this long before the screen lifts. */
  const SMOOTH_FRAME_MS = 25;
  const SMOOTH_FRAMES = 8;
  /** Waiting for smooth frames ends here, so a busy machine still gets in. */
  const SMOOTH_WAIT_MS = 4000;
  const mountedAt = performance.now();
  let compiling = $state(false);
  let gate: "waiting" | "mounting" | "compiling" | "settling" | "done" = "waiting";
  let gateFrames = 0;
  let settleStarted = 0;
  let capMissing: string[] = [];
  let lastProgress = -1;

  /** When each piece arrived, ms from navigation, for measuring the load. */
  const pieceTimes: Record<string, number> = {};
  (globalThis as Record<string, unknown>).__flowFestJamPieces = pieceTimes;

  function piece(name: string): void {
    pieceTimes[name] ??= Math.round(performance.now());
    readiness.mark(name);
    const progress = readiness.progress();
    if (progress.ready === lastProgress) return;
    lastProgress = progress.ready;
    props.onLoading?.(progress);
  }

  /**
   * Performers' effects are mounted only while compiling and unmount once the
   * jam shows; disposing their materials releases the compiled programs, so
   * each effect compiled again when it first lit, about 20 s in. A copy of
   * every shader material holds its program until the jam closes. Fire is
   * built only once a performer's tips burn, so none exists while compiling;
   * one fire at the performers' quality tier stands in for it here.
   */
  const programKeeper = new Group();
  const keptMaterials: Material[] = [];
  let keptFire: FireRenderer3D | null = null;
  function keepPrograms(c: Camera, target: WebGLRenderTarget): void {
    const seen = new Set<string>();
    scene.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m || Array.isArray(m) || !(m as ShaderMaterial).isShaderMaterial) return;
      const key = (renderer.properties.get(m) as { currentProgram?: { cacheKey: string } }).currentProgram?.cacheKey;
      if (!key || seen.has(key)) return;
      seen.add(key);
      const copy = o.clone(false) as Mesh;
      copy.material = m.clone();
      keptMaterials.push(copy.material);
      programKeeper.add(copy);
    });
    keptFire = new FireRenderer3D(QualityTier.LOW);
    keptFire.initialize(programKeeper);
    keptFire.primeGpuUpload();
    renderer.setRenderTarget(target);
    renderer.compile(programKeeper, c, scene);
  }

  /**
   * Compile what is hidden as well as what shows: three compiles only the
   * visible tree, and nearly everyone at the jam starts hidden, often several
   * levels deep (a hidden performer's hidden staff). Everything hidden shows
   * for this one compile against the scene's lights and fog, then hides again,
   * and its textures go up to the GPU now rather than on the frame it appears.
   * Lights keep their state: how many are on is part of every shader's key.
   */
  async function warmUp(): Promise<void> {
    const c = cam();
    const hidden: Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible && !(o as Light).isLight) hidden.push(o);
    });
    for (const o of hidden) o.visible = true;
    // The jam draws through the composer into a linear render target, and a
    // program's key includes the output it draws to. Compiled against the
    // screen, every hidden material would get an sRGB program the jam never
    // uses and compile again on the frame it first shows.
    const target = new WebGLRenderTarget(1, 1);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      const compiled = renderer.compileAsync(scene, c, scene);
      renderer.setRenderTarget(previous);
      await compiled;
      keepPrograms(c, target);
    } finally {
      renderer.setRenderTarget(previous);
      target.dispose();
      for (const o of hidden) o.visible = false;
    }
    const textures = new Set<Texture>();
    scene.traverse((o) => {
      const material = (o as Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) textures.add(value as Texture);
      }
    });
    for (const texture of textures) renderer.initTexture(texture);
  }

  /**
   * Hold still what never moves. three recomposes every object's matrix each
   * frame, and because the scene recomposes its own, it forces every world
   * matrix below it to be recomputed too. The ground, woods, structures and
   * set never move once built, so their matrices are composed once here, and
   * the scene and the wrappers above them (all at the origin) stop forcing the
   * rest. People, props, lights and the camera still update themselves. The
   * woods are found by the names the shared ecology gives its roots; a root it
   * swaps in later keeps updating as normal.
   */
  const ORIGIN = new Vector3();
  const UNIT = new Vector3(1, 1, 1);

  function holdStillScenery(): void {
    const anchor = terrainHost?.root;
    if (!anchor) return;
    for (let p = anchor.parent; p; p = p.parent) {
      if (!p.position.equals(ORIGIN) || p.quaternion.w !== 1 || !p.scale.equals(UNIT)) break;
      p.updateMatrix();
      p.matrixAutoUpdate = false;
    }
    const still: (Object3D | undefined)[] = [anchor, structures?.root, set?.root];
    for (const sibling of anchor.parent?.children ?? []) {
      if (/^(FFS_ForestScene_|Forest_Runtime)/.test(sibling.name)) still.push(sibling);
    }
    for (const root of still) {
      if (!root) continue;
      root.traverse((o) => {
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      });
      root.updateMatrixWorld(true);
    }
  }

  function stepGate(delta: number): void {
    const now = performance.now();
    const capped = now - mountedAt > LOAD_CAP_MS;
    if (gate === "waiting" && (readiness.loaded || capped)) {
      if (!readiness.loaded) {
        capMissing = readiness.missing().filter((n) => !n.startsWith("warm:"));
        console.warn(`[jam] still missing after ${LOAD_CAP_MS / 1000} s, showing anyway:`, capMissing);
      }
      gate = "mounting";
      gateFrames = 0;
      compiling = true;
    } else if (gate === "mounting" && ++gateFrames >= 4) {
      // The effects have had a few frames to build; compile everything.
      gate = "compiling";
      void warmUp()
        .catch((error: unknown) => console.warn("[jam] warm-up compile failed", error))
        .finally(() => {
          holdStillScenery();
          compiling = false;
          piece("warm:compiled");
          gate = "settling";
          gateFrames = 0;
          settleStarted = performance.now();
        });
    } else if (gate === "settling") {
      gateFrames = delta * 1000 < SMOOTH_FRAME_MS ? gateFrames + 1 : 0;
      if (gateFrames >= SMOOTH_FRAMES || now - settleStarted > SMOOTH_WAIT_MS) {
        gate = "done";
        piece("warm:smooth");
        const progress = readiness.progress();
        const report: JamLoadReport = {
          expected: progress.expected,
          ready: progress.ready,
          msFromNavigation: Math.round(now),
          missing: readiness.missing(),
        };
        console.info(`[jam] ready ${report.ready}/${report.expected} at ${report.msFromNavigation} ms from navigation`, report.missing.length ? report.missing : "");
        (globalThis as Record<string, unknown>).__flowFestJamLoad = { ...report, capMissing };
        props.onPrepared?.(report);
      }
    }
  }

  // One whole frame's draw calls: the composer renders several passes and
  // three resets its counters per render unless told not to, so the counters
  // are reset here once a frame instead and read just before.
  const lastFrame = { calls: 0, triangles: 0, programs: 0 };
  function sampleRenderInfo(): void {
    lastFrame.calls = renderer.info.render.calls;
    lastFrame.triangles = renderer.info.render.triangles;
    lastFrame.programs = renderer.info.programs?.length ?? 0;
    renderer.info.reset();
  }

  // Materials the jam overrides for frame rate, put back when the page goes.
  const transmissionRestore = new Map<MeshPhysicalMaterial, number>();
  /**
   * Two things the shared performer brings that the jam cannot afford with
   * thirty people on the floor. Any transmissive material (the hoop tube's
   * slight translucency) makes three render the whole scene a second time
   * every frame, so it goes opaque here. And bodies stop casting into the
   * one shadow map; at dusk and after it the set's shadows are what read.
   * Run while loading, before shaders are compiled, and then once a second
   * for anything mounted later.
   */
  function settleMaterials(): void {
    scene.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh && o.castShadow) o.castShadow = false;
      const material = (o as Mesh).material;
      if (!material || Array.isArray(material)) return;
      const physical = material as MeshPhysicalMaterial;
      if (physical.isMeshPhysicalMaterial && physical.transmission > 0) {
        transmissionRestore.set(physical, physical.transmission);
        physical.transmission = 0;
        physical.needsUpdate = true;
      }
    });
  }
  let settleClock = 0;

  onMount(() => {
    void jamSequencePool().catch(() => {});
    renderer.info.autoReset = false;
    (globalThis as Record<string, unknown>).__flowFestJamPerf = () => ({ ...lastFrame });
    scene.fog = fog;
    scene.add(keyLight, keyLight.target, hemi, flameLight);
    void load().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[flow-fest-jam]", error);
      props.onError?.(message);
    });
  });

  async function load(): Promise<void> {
    const response = await fetch(MANIFEST_PATH);
    if (!response.ok) throw new Error(`Terrain manifest failed to load (${response.status})`);
    const manifest = parseGeospatialTerrainManifest(await response.json());
    const [source, contract, evidence] = await Promise.all([
      loadGeospatialTerrain(MANIFEST_PATH),
      loadFlowFestRuntimeContract(),
      loadGeospatialEvidenceLayers(manifest),
    ]);
    if (disposed) return;
    const loaded = buildFlowFestEntranceGradedTerrain(source).terrain;
    terrain = loaded;
    piece("stage:terrain");
    const objectUrl = URL.createObjectURL(new Blob([evidence.orthophotoBytes], { type: "image/webp" }));
    let texture;
    try {
      texture = await new TextureLoader().loadAsync(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    if (disposed) return;
    const host = buildFlowFestTerrainHost(loaded, "chunked", texture, {
      fullDetailBounds: { minX: layout.centre.x - 120, maxX: layout.centre.x + 120, minZ: layout.centre.z - 120, maxZ: layout.centre.z + 120 },
      fullDetailPaddingMeters: 32,
      farSampleStep: 2,
    });
    host.root.traverse((o) => {
      if (o instanceof Mesh) o.receiveShadow = true;
    });
    terrainHost = host;
    piece("stage:orthophoto");

    // The woods and grass of the real site, cleared out of the jam itself
    // and of every structure footprint.
    const campPlan = createFlowFestCampPlan(contract, "lower-tent");
    const source_ = deriveFlowFestForestEcology(
      contract,
      loaded,
      {
        offsetsCentimeters: evidence.surfaceOffsetsCentimeters,
        width: loaded.heightmap.width,
        height: loaded.heightmap.height,
      },
      campPlan,
      { speciesPlan: FLOW_FEST_SITE_TREE_LAYOUT }
    );
    const ring = layout.boundary;
    const funnel = layout.entrance.funnel;
    const keepTree = (t: JamPoint & { crownRadiusMeters?: number }) => {
      const crown = t.crownRadiusMeters ?? 3;
      if (insidePolygon(t, ring)) return false;
      if (distanceToPolyline(t, ring) < crown * 0.7 + 4) return false;
      if (jamObstacleClearance(t) < crown * 0.5) return false;
      if (Math.min(distanceToPolyline(t, funnel[0]), distanceToPolyline(t, funnel[1])) < crown * 0.6 + 1) return false;
      return true;
    };
    const keepLow = (p: JamPoint) =>
      Math.hypot(p.x - layout.centre.x, p.z - layout.centre.z) < 150 &&
      !insidePolygon(p, ring) &&
      distanceToPolyline(p, ring) > 1.2 &&
      jamObstacleClearance(p) > 0.4 &&
      Math.min(distanceToPolyline(p, funnel[0]), distanceToPolyline(p, funnel[1])) > 1.4;
    const cleared: FlowFestForestEcologyLayout = {
      ...source_,
      trees: source_.trees.filter(keepTree),
      grass: source_.grass.filter(keepLow),
      groundLife: source_.groundLife.filter(keepLow),
    };
    ecology = cleared;
    groundSurface = buildFlowFestGroundFamilyMask(campPlan, cleared, loaded.worldBounds);

    structures = buildJamStructures(ground);
    piece("stage:structures");
    set = await buildJamSet(layout, ground);
    if (disposed) {
      set.dispose();
      return;
    }
    flameLight.position.set(set.lightingFlame.x, set.lightingFlame.y + 0.35, set.lightingFlame.z);
    piece("stage:set");

    physicsState = createPhysicsWorldState();
    await initPhysicsWorld(physicsState, { x: 0, y: -9.81, z: 0 });
    if (disposed || !physicsState.world) return;
    const start = layout.handover;
    ensureColliders(start.x, start.z);
    playerPosition = { x: start.x, y: ground(start.x, start.z) + BODY_CENTRE_ABOVE_GROUND, z: start.z };
    playerState = createPlayerController(physicsState, {
      radius: PLAYER_RADIUS,
      halfHeight: PLAYER_HALF_HEIGHT,
      offset: PLAYER_OFFSET,
      position: playerPosition,
    });
    physicsProvider = wrapProvider(createRapierPhysicsProvider(physicsState, playerState));
    piece("stage:physics");
    phase = "preparing";
    (globalThis as Record<string, unknown>).__flowFestJam = {
      layout,
      scene,
      renderer,
      get status() {
        return status();
      },
      get player() {
        return { ...playerPosition, yaw: playerYaw, viewYaw };
      },
      skipOpening: () => skipOpening(),
      setNightSeconds: (s: number) => {
        nightClock = s;
      },
      teleport: (x: number, z: number, facing?: number) => teleport(x, z, facing),
      setFlowing: (on: boolean) => setFlowing(on),
      sit: () => trySit(),
    };
  }

  // ------------------------------------------------------------------ verbs

  function skipOpening(): void {
    if (phase === "opening") openingClock = openingLength;
  }

  function teleport(x: number, z: number, facing?: number): void {
    if (!physicsProvider?.teleport) return;
    ensureColliders(x, z);
    physicsProvider.teleport(new Vector3(x, ground(x, z) + BODY_CENTRE_ABOVE_GROUND + 0.05, z));
    playerPosition = { x, y: ground(x, z) + BODY_CENTRE_ABOVE_GROUND, z };
    if (facing !== undefined) avatarState.snapFacingAngle?.(facing);
  }

  function insideRope(): boolean {
    return insidePolygon(playerPosition, layout.boundary);
  }

  function ropeDistance(): number {
    return distanceToPolyline(playerPosition, layout.boundary);
  }

  function trySit(): boolean {
    if (phase !== "play") return false;
    if (sitting) {
      sitting = false;
      return true;
    }
    if (insideRope() || ropeDistance() > layout.interaction.lingerRadiusMeters) return false;
    flowing = false;
    sitting = true;
    // Seated, you face into the circle.
    const toward = Math.atan2(layout.centre.x - playerPosition.x, layout.centre.z - playerPosition.z);
    avatarState.snapFacingAngle?.(toward);
    sitYaw = viewYaw;
    return true;
  }

  function setFlowing(on: boolean): void {
    if (phase !== "play") return;
    if (on && !insideRope()) return;
    if (on) sitting = false;
    flowing = on;
  }

  const MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  let flowPressedAt = 0;
  let flowTurnedOn = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (phase !== "play" || event.repeat) return;
    if (event.code === "KeyE") {
      trySit();
    } else if (event.code === "Space") {
      event.preventDefault();
      flowPressedAt = performance.now();
      flowHeld = true;
      flowTurnedOn = !flowing;
      if (!flowing) setFlowing(true);
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code !== "Space" || !flowHeld) return;
    flowHeld = false;
    // A tap toggles; a hold plays only while held.
    const held = performance.now() - flowPressedAt > 450;
    if (!flowTurnedOn || held) setFlowing(false);
  }

  function onMoveCodes(codes: string[]): void {
    if (!codes.some((c) => MOVE_CODES.includes(c))) return;
    if (sitting) sitting = false;
    if (flowing && !flowHeld) flowing = false;
  }

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // ------------------------------------------------------------------ camera

  const handoverFrom = { position: new Vector3(), quaternion: new Quaternion() };
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpQ = new Quaternion();
  const lookTarget = new Vector3();
  let sceneTime = 0;

  function cam(): PerspectiveCamera {
    return camera.current as PerspectiveCamera;
  }

  function placeShotCamera(seconds: number): void {
    const shot = sampleJamShot(layout.openingShot, seconds);
    const c = cam();
    c.position.set(shot.x, ground(shot.x, shot.z) + shot.heightAboveGround, shot.z);
    c.lookAt(shot.lookX, ground(shot.lookX, shot.lookZ) + shot.lookHeightAboveGround, shot.lookZ);
    c.fov = BASE_FOV;
    c.updateProjectionMatrix();
    sunElevation = shot.sunElevationDegrees;
  }

  function placeWatchCamera(dt: number): void {
    watchOrbit += dt * 0.028;
    const c = cam();
    const radius = 25;
    const a = watchOrbit + 2.2;
    const x = layout.centre.x + Math.cos(a) * radius;
    const z = layout.centre.z + Math.sin(a) * radius * 0.8;
    c.position.set(x, ground(x, z) + 4.2 + Math.sin(watchOrbit * 0.6) * 0.8, z);
    c.lookAt(layout.centre.x, ground(layout.centre.x, layout.centre.z) + 1.1, layout.centre.z);
    c.fov = BASE_FOV;
    c.updateProjectionMatrix();
  }

  /**
   * After the controller has placed the camera for this frame: blend in from
   * the opening's last pose, ease toward the spectator framing while
   * lingering, or drop to seated eye height.
   */
  function adjustPlayCamera(): void {
    if (phase !== "play") return;
    const c = cam();
    const footY = playerPosition.y - BODY_CENTRE_ABOVE_GROUND;
    let fov = BASE_FOV;
    if (sitting) {
      const toward = Math.atan2(layout.centre.x - playerPosition.x, layout.centre.z - playerPosition.z);
      const yaw = toward + (viewYaw - sitYaw);
      c.position.set(playerPosition.x, footY + SEATED_EYE, playerPosition.z);
      const pitch = Math.max(-0.5, Math.min(0.4, 0.06 - (viewPitch - 0.22)));
      lookTarget.set(c.position.x + Math.sin(yaw) * Math.cos(pitch), c.position.y + Math.sin(pitch), c.position.z + Math.cos(yaw) * Math.cos(pitch));
      c.lookAt(lookTarget);
      fov = BASE_FOV + 6;
    } else if (linger > 0.01) {
      // Lower and wider, the player at the near edge of the frame and the circle beyond.
      const dx = layout.centre.x - playerPosition.x;
      const dz = layout.centre.z - playerPosition.z;
      const d = Math.hypot(dx, dz) || 1;
      tmpA.set(playerPosition.x - (dx / d) * 3.4 + (dz / d) * 1.1, footY + 1.25, playerPosition.z - (dz / d) * 3.4 - (dx / d) * 1.1);
      tmpB.set(layout.centre.x, ground(layout.centre.x, layout.centre.z) + 1.2, layout.centre.z);
      const k = linger * linger * (3 - 2 * linger);
      tmpQ.copy(c.quaternion);
      const fromPos = c.position.clone();
      c.position.copy(tmpA);
      c.lookAt(tmpB);
      c.position.lerpVectors(fromPos, tmpA, k);
      c.quaternion.slerpQuaternions(tmpQ, c.quaternion.clone(), k);
      fov = BASE_FOV + 10 * k;
    }
    if (handoverAt >= 0) {
      const t = (sceneTime - handoverAt) / HANDOVER_BLEND_SECONDS;
      if (t < 1) {
        const k = t * t * (3 - 2 * t);
        c.position.lerpVectors(handoverFrom.position, c.position, k);
        c.quaternion.slerpQuaternions(handoverFrom.quaternion, c.quaternion.clone(), k);
      } else {
        handoverAt = -1;
      }
    }
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
    c.updateMatrixWorld();
  }

  onMount(() => {
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = adjustPlayCamera;
    return () => {
      scene.onBeforeRender = previous;
    };
  });

  // ------------------------------------------------------------------ frame

  const flameStart = performance.now();
  let statusClock = 0;
  const forward = new Vector3();

  useTask((delta) => {
    sampleRenderInfo();
    settleClock += delta;
    if (settleClock > 1) {
      settleClock = 0;
      settleMaterials();
    }
    if (disposed) return;
    if (phase === "loading") {
      if (!capMissing.length && performance.now() - mountedAt > LOAD_CAP_MS) {
        capMissing = readiness.missing().filter((n) => !n.startsWith("warm:"));
        console.warn(`[jam] the set has not finished building after ${LOAD_CAP_MS / 1000} s:`, capMissing);
      }
      return;
    }
    const dt = Math.min(Math.max(delta, 0), 0.1);
    sceneTime += dt;

    if (phase === "preparing") {
      stepGate(delta);
      if (gate === "done" && props.begin) phase = "opening";
    }
    if (props.skipToken !== lastSkip) {
      lastSkip = props.skipToken;
      skipOpening();
    }

    if (phase === "opening" || phase === "preparing") {
      // Preparing holds the shot's first frame; the clock starts on the reveal.
      if (phase === "opening") openingClock += dt;
      placeShotCamera(Math.min(openingClock, openingLength));
      hour = jamHourForSunElevation(sunElevation);
      if (openingClock >= openingLength) {
        const c = cam();
        handoverFrom.position.copy(c.position);
        handoverFrom.quaternion.copy(c.quaternion);
        if (props.watch) {
          phase = "watch";
          watchOrbit = 0;
        } else {
          phase = "play";
          handoverAt = sceneTime;
          playerReady = true;
        }
      }
    } else {
      nightClock += dt * (phase === "watch" ? WATCH_CLOCK_RATE : 1);
      hour = jamHourAfterHandover(Math.min(nightClock, JAM_NIGHT_BUILD_SECONDS * 2));
      sunElevation = jamSunElevationForHour(hour);
      if (phase === "watch") placeWatchCamera(dt);
    }

    ropeGlow = jamRopeGlow(layout.light, sunElevation);
    const n = jamNightAt(layout.night, Math.min(hour, JAM_NIGHT_HOLD_HOUR));
    if (Math.abs(n.inside - night.inside) > 0.004 || Math.abs(n.watching - night.watching) > 0.004) night = n;
    applyLight(dt);

    // The lighting flame: always burning, small and steady, the one warm light at the gap.
    const flicker = 0.86 + 0.08 * Math.sin(sceneTime * 13.1) + 0.06 * Math.sin(sceneTime * 29.7 + 1.3);
    flameLight.intensity = (1.2 + 5.2 * ropeGlow) * flicker;

    // Set animation.
    if (set) {
      const c = cam();
      const height = renderer.domElement.height || 1080;
      set.update({
        elapsed: (performance.now() - flameStart) / 1000,
        ropeGlow,
        ropeColour: layout.light.ropeColour,
        driftColour: layout.light.ropeDriftColour,
        driftSeconds: layout.light.ropeDriftSeconds,
        viewScale: height / (2 * Math.tan((c.fov * Math.PI) / 360)),
      });
    }

    if (phase === "play" && physicsState?.world && physicsProvider) {
      const p = physicsProvider.getPlayerPosition();
      ensureColliders(p.x, p.z);
      stepPhysics(physicsState, Math.min(dt, 1 / 30));
      const next = physicsProvider.getPlayerPosition();
      playerPosition = { x: next.x, y: next.y, z: next.z };
      const v = physicsProvider.getVelocity();
      const raw = sitting || flowing ? 0 : Math.hypot(v.x, v.z);
      groundSpeed += (raw - groundSpeed) * (1 - Math.exp(-12 * dt));

      const inside = insideRope();
      // Joining: stepping in through the gap lights your props at the flame.
      if (inside && !wasInside && !joined) {
        const gapDistance = Math.hypot(playerPosition.x - layout.entrance.x, playerPosition.z - layout.entrance.z);
        if (gapDistance < 5) {
          joined = true;
          props.audio.joinCue({ x: layout.entrance.flame.x, y: ground(layout.entrance.flame.x, layout.entrance.flame.z) + 1, z: layout.entrance.flame.z });
        }
      }
      wasInside = inside;
      if (flowing && !inside) flowing = false;

      attention = stepJamAttention(
        attention,
        dt,
        { speed: groundSpeed, ropeDistance: ropeDistance(), insideRope: inside, flowing, sitting },
        layout.interaction
      );
      linger = attention.linger;
      if (Math.abs(attention.notice - notice) > 0.01 || (attention.notice < 0.01 && notice !== 0)) {
        notice = attention.notice < 0.01 ? 0 : attention.notice;
      }
      if (attention.duet !== duet) {
        duet = attention.duet;
        if (duet) duetSync += 1;
      }

      // One quiet hint at most.
      let nextHint: string | null = null;
      if (sitting) nextHint = "E  stand";
      else if (inside && !flowing) nextHint = "Space  flow";
      else if (!inside && ropeDistance() <= layout.interaction.lingerRadiusMeters && groundSpeed < 0.3) nextHint = "E  sit";
      if (nextHint !== hint) hint = nextHint;
    }

    // Sound.
    const c = cam();
    c.getWorldDirection(forward);
    props.audio.update({
      dt,
      listener: { x: c.position.x, y: c.position.y, z: c.position.z },
      forward: { x: forward.x, y: forward.y, z: forward.z },
      fires: litFires,
    });

    statusClock += dt;
    if (statusClock > 0.1) {
      statusClock = 0;
      props.onStatus?.(status());
    }
  });

  function status(): JamSceneStatus {
    return {
      phase,
      openingSeconds: openingClock,
      openingLength,
      hour,
      hint,
      sitting,
      flowing,
      joined,
      notice,
      duet,
      linger,
      people: peopleStats,
      render: { ...lastFrame },
    };
  }

  onDestroy(() => {
    disposed = true;
    renderer.info.autoReset = true;
    for (const [material, value] of transmissionRestore) {
      material.transmission = value;
      material.needsUpdate = true;
    }
    scene.remove(keyLight, keyLight.target, hemi, flameLight);
    if (scene.fog === fog) scene.fog = null;
    structures?.dispose();
    set?.dispose();
    for (const material of keptMaterials) material.dispose();
    keptFire?.dispose();
    if (physicsState) {
      if (playerState) disposePlayerController(physicsState, playerState);
      disposePhysicsWorld(physicsState);
    }
    delete (globalThis as Record<string, unknown>).__flowFestJam;
  });

  const playerFoot = $derived({ x: playerPosition.x, y: playerPosition.y - BODY_CENTRE_ABOVE_GROUND, z: playerPosition.z });
  const playerView = $derived({ x: playerPosition.x, z: playerPosition.z, present: phase === "play", flowing });
  const starConfig = $derived({
    // On while compiling too, so the stars' shader is ready before dusk.
    enabled: compiling || light.stars > 0.02,
    count: 2600,
    radius: 4000,
    sizeRange: [0.6, 2.2] as [number, number],
    twinkleSpeed: 0.6,
    intensity: Math.round(light.stars * 20) / 20,
    horizonSpread: 0.5,
  });
</script>

<T.PerspectiveCamera makeDefault fov={BASE_FOV} near={0.1} far={12000} position={[40, 60, -168]} />

<SkyGradient
  topColor={light.skyTop}
  midColor={light.skyMid}
  bottomColor={light.skyBottom}
  radius={9000}
  gradientStart={0.22}
  gradientEnd={0.92}
  sun={{
    enabled: sunElevation > -1.2,
    direction: sunDirection,
    color: light.sunColor,
    angularDiameterDegrees: 0.9,
    glowScale: 6,
    glowOpacity: 0.55,
  }}
  horizonGlow={{
    color: light.horizonGlow,
    direction: jamSunDirection(Math.min(sunElevation, 0)),
    height: 0.32,
    spread: 0.35,
    intensity: light.horizonGlowIntensity,
  }}
  moon={{
    enabled: true,
    texture: "/textures/moon.png",
    direction: JAM_MOON_DIRECTION,
    angularDiameterDegrees: 0.9,
    opacity: Math.min(1, 0.15 + ropeGlow),
    glowScale: 3.2,
    glowOpacity: 0.12 + 0.2 * ropeGlow,
  }}
/>
<Starfield config={starConfig} />

{#if terrainHost}
  <T is={terrainHost.root} />
{/if}
{#if groundSurface && terrainHost}
  <FlowFestGroundSurface
    surface={groundSurface}
    scene={terrainHost.root}
    detailColorStrength={light.detailStrength}
    onPatched={() => {
      piece("stage:ground");
      tintedFor = "";
    }}
  />
{/if}
{#if ecology}
  <FlowFestForestEcology layout={ecology} foliageTint={light.foliageTint} barkTint={light.barkTint} grassTint={light.grassTint} onReady={() => piece("stage:woods")} />
{/if}
{#if structures}
  <T is={structures.root} />
{/if}
{#if set}
  <T is={set.root} />
{/if}

{#if terrain && set}
  <FlowFestJamPeople
    {layout}
    {ground}
    inside={night.inside}
    watching={night.watching}
    {ropeGlow}
    {hour}
    player={playerView}
    {notice}
    {duet}
    {duetSync}
    outsideCap={props.outsideCap}
    settled={phase !== "loading" && phase !== "preparing"}
    {compiling}
    onPiece={piece}
    onSequencePool={(pool) => {
      sequencePool = pool;
    }}
    onStats={(stats) => {
      peopleStats = stats;
    }}
    onFires={(points) => {
      litFires = points;
    }}
  />
{/if}

{#if phase === "play" && playerReady && physicsProvider}
  {#if flowing}
    <LiveSequencePerformer3D
      id="ffj-player"
      position={playerFoot}
      facingAngle={playerYaw}
      characterId={jamAvatarFor("player")}
      propType={PropType.POI}
      sequence={sequencePool.loops[0]!}
      effectId="fire"
      effectQualityTier="low"
      showEffects={joined && ropeGlow > 0.2}
      phaseOffsetSteps={duetSync * 64}
      playbackSpeed={1}
      active={true}
    />
  {:else if !sitting}
    <FlowFestOnFootPlayer
      position={playerPosition}
      bodyCentreAboveGroundMeters={BODY_CENTRE_ABOVE_GROUND}
      facingAngle={playerYaw}
      {isMoving}
      moveSpeedMetersPerSecond={groundSpeed}
      {moveDirection}
      characterId={jamAvatarFor("player")}
    />
  {/if}
  <UnifiedCameraController
    destinationId="flow-fest-jam"
    destinationDefaults={{ "flow-fest-jam": CameraMode.THIRD_PERSON }}
    preferencesKey="flow-fest-jam-camera"
    {avatarState}
    {physicsProvider}
    enabled={true}
    initialYaw={playerYaw}
    initialPitch={0.22}
    allowedModes={[CameraMode.THIRD_PERSON]}
    disableModeToggle={true}
    showControlsHint={false}
    moveSpeed={WALK_SPEED}
    jumpForce={0}
    gravity={9.81}
    enableSprint={true}
    enableJump={false}
    enableCrouch={false}
    enableNoclip={false}
    onRotationChange={(yaw, pitch) => {
      viewYaw = yaw;
      viewPitch = pitch;
    }}
    onInputStateChange={(input) => onMoveCodes(input.activeCodes)}
  />
{/if}
