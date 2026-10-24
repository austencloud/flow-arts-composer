/**
 * The 3D viewer's opening: the viewer starts on a plain stage you can already
 * orbit, and the environment arrives around you when it has loaded.
 *
 * The plain stage is the environment's own sky (the loading-sky colours), a
 * dark floor with a faint grid, and a haze that hides everything past a few
 * metres. When the environment is ready the host calls `environmentArrived`:
 * the world's new pieces stay hidden while their shaders compile, then the
 * haze pulls back from the performers outward, the plain floor fades under
 * the world's own ground, and the sky shell thins to show the world's sky.
 *
 * Plain three.js, no Svelte or DOM, so the main-thread renderer and the
 * worker renderer run the same opening. The host drives `update` once per
 * frame before rendering and owns the duration (motionDuration lives on the
 * main thread).
 */
import {
  BackSide,
  BufferAttribute,
  CircleGeometry,
  Color,
  Fog,
  FogExp2,
  GridHelper,
  Group,
  type LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
} from "three";
import type { SceneLoadingSky } from "../environments/domain/scene-environment-loading-sky";

/** How far you can see on the plain stage before the haze closes in, m. */
export const BUILD_IN_BASE_VISIBLE_RADIUS = 16;

/** A world with no fog of its own reveals out to here, then keeps a haze
 *  this thin rather than dropping fog (which would recompile every shader). */
export const BUILD_IN_CLEAR_VISIBLE_RADIUS = 4000;

/** The plain floor's reach; well past the haze, so its edge never shows. */
const FLOOR_RADIUS = 220;
const GRID_SIZE = 120;
const GRID_DIVISIONS = 60;
const GRID_OPACITY = 0.14;

/** FogExp2 is 98% fog at this many "density radii": d = K / r. */
const EXP2_VISIBILITY = Math.sqrt(-Math.log(0.02));

/** The floor hands over to the world's ground in this first share of the
 *  reveal, while the haze is still close, so the swap reads as one surface. */
const FLOOR_HANDOVER_SHARE = 0.35;

export type SceneBuildInPhase = "waiting" | "preparing" | "revealing" | "done";

export interface SceneBuildInOptions {
  scene: Scene;
  sky: SceneLoadingSky;
  groundY: number;
  /** The reveal's length; 0 (reduced motion) shows the world at once. */
  revealMs: number;
  /**
   * Compile the world's shaders while its pieces are hidden, so the reveal
   * starts on smooth frames. Resolves when they can be shown.
   */
  prepare?: (scene: Scene) => Promise<void>;
}

export interface SceneBuildIn {
  readonly phase: SceneBuildInPhase;
  /** Call once per frame, before the scene renders. */
  update(nowMs: number, camera: Camera): void;
  /** The environment has attached its world, fog and background. */
  environmentArrived(): void;
  setGroundY(groundY: number): void;
  /** Ends the opening now, leaving the world exactly as it set itself up. */
  finish(): void;
  dispose(): void;
}

/** Visible radius ↔ FogExp2 density. */
export function exp2DensityForRadius(radius: number): number {
  return EXP2_VISIBILITY / Math.max(radius, 1e-3);
}

export function exp2RadiusForDensity(density: number): number {
  return density <= 0
    ? BUILD_IN_CLEAR_VISIBLE_RADIUS
    : Math.min(EXP2_VISIBILITY / density, BUILD_IN_CLEAR_VISIBLE_RADIUS);
}

/**
 * The haze's reach at progress `p`: grows geometrically, so it opens as
 * evenly across the near stage as across the far hills.
 */
export function revealRadius(from: number, to: number, p: number): number {
  const t = Math.min(Math.max(p, 0), 1);
  return from * Math.pow(to / from, t);
}

/** Slow start, long settle: the haze lifts, then eases out to rest. */
export function revealEase(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The loading sky as a world-fixed dome: horizon at the equator, the top
 *  colour overhead, the horizon colour below. */
function createSkyDome(sky: SceneLoadingSky): Mesh {
  const geometry = new SphereGeometry(1, 48, 24);
  const top = new Color(sky.top);
  const mid = new Color(sky.mid);
  const horizon = new Color(sky.horizon);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y <= 0) color.copy(horizon);
    else if (y < 0.3) color.copy(horizon).lerp(mid, y / 0.3);
    else color.copy(mid).lerp(top, (y - 0.3) / 0.7);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: BackSide,
    fog: false,
    transparent: true,
    depthWrite: false,
  });
  const dome = new Mesh(geometry, material);
  // Drawn last among the transparent objects so, once the world is in, it
  // covers only what lies beyond it: the world's sky, not its stage.
  dome.renderOrder = 10_000;
  dome.frustumCulled = false;
  dome.name = "build-in-sky";
  return dome;
}

function createFloor(sky: SceneLoadingSky): Group {
  const floor = new Group();
  floor.name = "build-in-floor";
  const ground = new Mesh(
    new CircleGeometry(FLOOR_RADIUS, 96),
    new MeshBasicMaterial({
      color: new Color(sky.horizon).multiplyScalar(0.26),
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  const grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS);
  const gridColor = new Color(sky.mid).lerp(new Color("#ffffff"), 0.6);
  const gridMaterial = grid.material as LineBasicMaterial;
  gridMaterial.color = gridColor;
  gridMaterial.vertexColors = false;
  gridMaterial.transparent = true;
  gridMaterial.opacity = GRID_OPACITY;
  gridMaterial.depthWrite = false;
  grid.position.y = 0.002;
  floor.add(ground, grid);
  return floor;
}

function materialsOf(object: Object3D): Material[] {
  const found: Material[] = [];
  object.traverse((child) => {
    const material = (child as Mesh).material;
    if (!material) return;
    if (Array.isArray(material)) found.push(...material);
    else found.push(material);
  });
  return found;
}

interface FogTarget {
  fog: Fog | FogExp2 | null;
  color: Color;
  /** Linear fog's own near/far, or the exp2 density, restored at the end. */
  near: number;
  far: number;
  density: number;
  radius: number;
}

export function createSceneBuildIn(options: SceneBuildInOptions): SceneBuildIn {
  const { scene, sky, revealMs, prepare } = options;
  const horizon = new Color(sky.horizon);

  const baseFog = new FogExp2(
    horizon.getHex(),
    exp2DensityForRadius(BUILD_IN_BASE_VISIBLE_RADIUS)
  );
  const previousFog = scene.fog;
  const previousBackground = scene.background;
  const baseBackground = horizon.clone();
  scene.fog = baseFog;
  scene.background = baseBackground;

  const dome = createSkyDome(sky);
  const floor = createFloor(sky);
  floor.position.y = options.groundY;
  scene.add(dome, floor);
  const domeMaterial = dome.material as MeshBasicMaterial;
  const floorMaterials = materialsOf(floor) as (
    | MeshBasicMaterial
    | LineBasicMaterial
  )[];
  const floorOpacity = floorMaterials.map((material) => material.opacity);

  let phase: SceneBuildInPhase = "waiting";
  let known = new Set<Object3D>(scene.children);
  let arrivals: Object3D[] = [];
  let target: FogTarget | null = null;
  let revealStart: number | null = null;
  let disposed = false;
  // The haze last written onto the fog, to tell the world's own writes apart.
  const written = { color: new Color(), near: 0, far: 0, density: 0 };

  function captureTarget(): FogTarget {
    const fog = scene.fog === baseFog ? null : scene.fog;
    if (fog instanceof FogExp2) {
      return {
        fog,
        color: fog.color.clone(),
        near: 0,
        far: 0,
        density: fog.density,
        radius: exp2RadiusForDensity(fog.density),
      };
    }
    if (fog instanceof Fog) {
      return {
        fog,
        color: fog.color.clone(),
        near: fog.near,
        far: fog.far,
        density: 0,
        radius: fog.far,
      };
    }
    // No fog of its own: keep ours and thin it to nothing.
    scene.fog = baseFog;
    return {
      fog: null,
      color: horizon.clone(),
      near: 0,
      far: 0,
      density: exp2DensityForRadius(BUILD_IN_CLEAR_VISIBLE_RADIUS),
      radius: BUILD_IN_CLEAR_VISIBLE_RADIUS,
    };
  }

  /** Writes the haze for reveal progress `p` onto the fog in the scene. */
  function applyHaze(p: number): void {
    if (!target) return;
    const radius = revealRadius(
      BUILD_IN_BASE_VISIBLE_RADIUS,
      Math.max(target.radius, BUILD_IN_BASE_VISIBLE_RADIUS),
      p
    );
    const fog = target.fog ?? baseFog;
    fog.color.copy(horizon).lerp(target.color, p);
    if (fog instanceof FogExp2) {
      fog.density = exp2DensityForRadius(radius);
    } else {
      fog.far = Math.min(radius, target.far);
      fog.near = Math.min(target.near * p, fog.far * 0.5);
    }
    written.color.copy(fog.color);
    written.near = fog instanceof Fog ? fog.near : 0;
    written.far = fog instanceof Fog ? fog.far : 0;
    written.density = fog instanceof FogExp2 ? fog.density : 0;
  }

  /**
   * A world may write its own fog again after it reports ready (Autumn and
   * Rainbow apply their config from an effect). Whatever differs from the
   * haze last written is the world's intent: it becomes where the reveal
   * ends, and the haze goes back on before the frame renders.
   */
  function absorbWorldFog(): void {
    const fog = target?.fog;
    if (!target || !fog) return;
    if (!fog.color.equals(written.color)) target.color.copy(fog.color);
    if (fog instanceof FogExp2) {
      if (fog.density !== written.density) {
        target.density = fog.density;
        target.radius = exp2RadiusForDensity(fog.density);
      }
    } else if (fog.near !== written.near || fog.far !== written.far) {
      target.near = fog.near;
      target.far = fog.far;
      target.radius = fog.far;
    }
  }

  function setFloorFade(fade: number): void {
    floorMaterials.forEach((material, index) => {
      material.opacity = (floorOpacity[index] ?? 1) * fade;
      material.depthWrite = false;
    });
    floor.visible = fade > 0.001;
  }

  function restoreTarget(): void {
    if (!target) return;
    if (target.fog) {
      target.fog.color.copy(target.color);
      if (target.fog instanceof FogExp2) target.fog.density = target.density;
      else {
        target.fog.near = target.near;
        target.fog.far = target.far;
      }
      if (scene.fog === baseFog) scene.fog = target.fog;
    } else {
      baseFog.color.copy(target.color);
      baseFog.density = target.density;
    }
  }

  function removeStage(): void {
    scene.remove(dome, floor);
    dome.geometry.dispose();
    domeMaterial.dispose();
    floor.traverse((child) => {
      const mesh = child as Mesh;
      mesh.geometry?.dispose();
    });
    floorMaterials.forEach((material) => material.dispose());
  }

  function finish(): void {
    if (phase === "done" || disposed) return;
    arrivals.forEach((object) => (object.visible = true));
    arrivals = [];
    if (!target) target = captureTarget();
    restoreTarget();
    removeStage();
    phase = "done";
  }

  function beginReveal(): void {
    if (disposed || phase !== "preparing") return;
    arrivals.forEach((object) => (object.visible = true));
    arrivals = [];
    if (revealMs <= 0) {
      finish();
      return;
    }
    phase = "revealing";
    revealStart = null;
    applyHaze(0);
  }

  return {
    get phase() {
      return phase;
    },

    update(nowMs, camera) {
      if (phase === "done" || disposed) return;
      // The dome follows the eye and sits just inside the far plane.
      dome.position.copy(camera.position);
      const far = (camera as Camera & { far?: number }).far ?? 1000;
      dome.scale.setScalar(far * 0.9);

      if (phase === "waiting") {
        known = new Set(scene.children);
        return;
      }
      // Some worlds put their fog in from a separate effect, a beat after
      // they report ready. Adopt it and hold it at the base haze.
      const ownFog = target?.fog ?? baseFog;
      if (scene.fog && scene.fog !== ownFog && scene.fog !== baseFog) {
        target = captureTarget();
      } else {
        absorbWorldFog();
      }
      if (phase !== "revealing") {
        applyHaze(0);
        return;
      }
      revealStart ??= nowMs;
      const t = Math.min((nowMs - revealStart) / revealMs, 1);
      const p = revealEase(t);
      applyHaze(p);
      setFloorFade(1 - smoothstep(0, FLOOR_HANDOVER_SHARE, p));
      domeMaterial.opacity = 1 - smoothstep(0.15, 1, p);
      if (t >= 1) finish();
    },

    environmentArrived() {
      if (phase !== "waiting" || disposed) return;
      phase = "preparing";
      // The world's pieces are the children it just attached. They wait,
      // hidden, until their shaders are ready.
      arrivals = scene.children.filter(
        (child) => !known.has(child) && child !== dome && child !== floor
      );
      arrivals.forEach((object) => (object.visible = false));
      target = captureTarget();
      // The world's background stays behind the dome until it thins.
      applyHaze(0);
      if (!prepare) {
        beginReveal();
        return;
      }
      // Compiled while in the scene graph but hidden from the frame: three
      // compiles every material it finds, visible or not.
      prepare(scene)
        .catch(() => undefined)
        .then(beginReveal);
    },

    setGroundY(groundY) {
      floor.position.y = groundY;
    },

    finish,

    dispose() {
      if (disposed) return;
      if (phase !== "done") {
        arrivals.forEach((object) => (object.visible = true));
        removeStage();
        if (scene.fog === baseFog) scene.fog = previousFog;
        if (scene.background === baseBackground) {
          scene.background = previousBackground;
        }
      }
      disposed = true;
    },
  };
}
