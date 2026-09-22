import {
  Camera,
  FramebufferTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  type WebGLRenderer,
} from "three";
import {
  ENVIRONMENT_VEIL_MAX_OPACITY,
  type EnvironmentTransitionPhase,
} from "../domain/environment-transition";

/** The ordinary scene layer rendered by the primary camera pass. */
export const BASE_SCENE_LAYER = 0;

/**
 * Performer-only layer redrawn after the environment transition veil.
 * Layer 7 is intentionally local to the viewer transition pipeline.
 */
export const PROTECTED_PERFORMER_LAYER = 7;

/**
 * Keep both the base and protected layer enabled on a performer subtree.
 * This also catches effect meshes that are added imperatively after Svelte's
 * layer plugin has initialized the declarative component tree.
 */
export function protectPerformerTree(root: Object3D): void {
  root.traverse((object) => {
    object.layers.enable(BASE_SCENE_LAYER);
    object.layers.enable(PROTECTED_PERFORMER_LAYER);
  });
}

/**
 * Holds a complete picture while the next environment loads, then fades it
 * out. Hosts without a retained frame use the performer-preserving veil.
 */
export class EnvironmentTransitionCompositor {
  private retainedFrame: FramebufferTexture | null = null;
  private readonly size = new Vector2();
  private readonly veilScene = new Scene();
  private readonly veilCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly veilGeometry = new PlaneGeometry(2, 2);
  private readonly veilMaterial = new MeshBasicMaterial({
    color: 0x080c12,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });

  constructor() {
    const veil = new Mesh(this.veilGeometry, this.veilMaterial);
    veil.frustumCulled = false;
    this.veilScene.add(veil);
  }

  get hasRetainedFrame(): boolean {
    return this.retainedFrame !== null;
  }

  capture(renderer: WebGLRenderer): void {
    // Rapid choices keep the last complete scene, never a half-built world.
    if (this.retainedFrame) return;
    renderer.getDrawingBufferSize(this.size);
    if (this.size.x < 1 || this.size.y < 1) return;
    const frame = new FramebufferTexture(this.size.x, this.size.y);
    frame.colorSpace = renderer.outputColorSpace;
    frame.minFilter = LinearFilter;
    frame.magFilter = LinearFilter;
    try {
      renderer.copyFramebufferToTexture(frame);
    } catch (error) {
      frame.dispose();
      throw error;
    }
    this.retainedFrame = frame;
    this.veilMaterial.map = frame;
    this.veilMaterial.color.setHex(0xffffff);
    this.veilMaterial.needsUpdate = true;
  }

  private releaseFrame(): void {
    if (!this.retainedFrame) return;
    this.veilMaterial.map = null;
    this.veilMaterial.color.setHex(0x080c12);
    this.veilMaterial.needsUpdate = true;
    this.retainedFrame.dispose();
    this.retainedFrame = null;
  }

  render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    opacity: number,
    phase?: EnvironmentTransitionPhase
  ): void {
    if (this.retainedFrame) {
      if (phase === "idle") {
        this.releaseFrame();
        return;
      }
      const previousAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        // The entire outgoing picture stays opaque until the new world has
        // loaded and warmed up. Its original resolution also survives resize.
        this.veilMaterial.opacity =
          phase === "revealing"
            ? Math.max(0, Math.min(1, opacity / ENVIRONMENT_VEIL_MAX_OPACITY))
            : 1;
        renderer.render(this.veilScene, this.veilCamera);
      } finally {
        renderer.autoClear = previousAutoClear;
      }
      return;
    }
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    if (clampedOpacity <= 0) return;

    const previousAutoClear = renderer.autoClear;
    const previousCameraMask = camera.layers.mask;
    const previousBackground = scene.background;
    const previousFog = scene.fog;

    try {
      renderer.autoClear = false;
      this.veilMaterial.opacity = clampedOpacity;
      renderer.render(this.veilScene, this.veilCamera);

      // The protected pass must depth-test against itself, never against the
      // environment that was rendered before the veil.
      renderer.clearDepth();
      camera.layers.set(PROTECTED_PERFORMER_LAYER);
      scene.background = null;
      scene.fog = null;
      renderer.render(scene, camera);
    } finally {
      scene.background = previousBackground;
      scene.fog = previousFog;
      camera.layers.mask = previousCameraMask;
      renderer.autoClear = previousAutoClear;
    }
  }

  dispose(): void {
    this.releaseFrame();
    this.veilGeometry.dispose();
    this.veilMaterial.dispose();
  }
}
