import type { Object3D, Scene } from "three";

type SceneGlobalKey =
  | "fog"
  | "background"
  | "environment"
  | "environmentIntensity";
type SceneGlobals = Pick<Scene, SceneGlobalKey>;

const SCENE_GLOBAL_KEYS: readonly SceneGlobalKey[] = [
  "fog",
  "background",
  "environment",
  "environmentIntensity",
];

/** What an incoming world starts from, as if the scene were empty. */
const EMPTY_SCENE_GLOBALS: SceneGlobals = {
  fog: null,
  background: null,
  environment: null,
  environmentIntensity: 1,
};

function readGlobals(scene: Scene): SceneGlobals {
  return {
    fog: scene.fog,
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
  };
}

function writeGlobals(scene: Scene, globals: SceneGlobals): void {
  scene.fog = globals.fog;
  scene.background = globals.background;
  scene.environment = globals.environment;
  scene.environmentIntensity = globals.environmentIntensity;
}

/**
 * Keeps the shown world looking exactly as it did while another world loads
 * hidden in the same three.js scene.
 *
 * Worlds set scene-wide fog, background and image lighting, and most attach
 * their root straight to the scene rather than under the group Environment3D
 * can hide. Some do it the moment they mount (Ocean), some well before their
 * shaders are warm (every world, between reporting ready and the warm-up
 * finishing). While preparing, each frame puts the shown world's globals back
 * and remembers what the newcomer wrote, and hides any root the newcomer
 * attached. Promotion hands the newcomer its own globals and roots; cancelling
 * leaves the shown world as it was.
 */
export class EnvironmentHandoffGuard {
  private held: SceneGlobals | null = null;
  private incoming: SceneGlobals = { ...EMPTY_SCENE_GLOBALS };
  private shownChildren = new Set<Object3D>();
  private readonly hidden = new Map<Object3D, boolean>();
  /** Globals to reassert once more after the outgoing world's own cleanup. */
  private settleTo: SceneGlobals | null = null;

  get preparing(): boolean {
    return this.held !== null;
  }

  /** Start, or retarget, a preparation. A retarget forgets the abandoned world's globals. */
  begin(scene: Scene): void {
    if (this.held === null) {
      this.held = readGlobals(scene);
      this.shownChildren = new Set(scene.children);
    }
    this.settleTo = null;
    this.incoming = { ...EMPTY_SCENE_GLOBALS };
  }

  /** Run every frame before the scene renders. */
  hold(scene: Scene): void {
    const held = this.held;
    if (held === null) {
      if (this.settleTo) {
        writeGlobals(scene, this.settleTo);
        this.settleTo = null;
      }
      return;
    }
    for (const key of SCENE_GLOBAL_KEYS) {
      if (scene[key] === held[key]) continue;
      (this.incoming as Record<SceneGlobalKey, unknown>)[key] = scene[key];
      (scene as unknown as Record<SceneGlobalKey, unknown>)[key] = held[key];
    }
    for (const child of scene.children) {
      if (this.shownChildren.has(child) || this.hidden.has(child)) continue;
      this.hidden.set(child, child.visible);
      child.visible = false;
    }
  }

  /** The newcomer is ready: give it the scene. */
  promote(scene: Scene): void {
    if (this.held === null) return;
    this.hold(scene);
    this.finish(scene, this.incoming);
  }

  /** The newcomer was abandoned or failed: the shown world keeps the scene. */
  cancel(scene: Scene): void {
    if (this.held === null) return;
    this.finish(scene, this.held);
  }

  private finish(scene: Scene, globals: SceneGlobals): void {
    writeGlobals(scene, globals);
    for (const [child, visible] of this.hidden) child.visible = visible;
    this.hidden.clear();
    this.shownChildren.clear();
    this.held = null;
    this.incoming = { ...EMPTY_SCENE_GLOBALS };
    // The world leaving the scene restores what it saw at its own mount when
    // it unmounts, which can be a disposed world's fog. Reassert next frame.
    this.settleTo = globals;
  }
}
