import {
  ACESFilmicToneMapping,
  HalfFloatType,
  LinearFilter,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type ColorSpace,
  type Scene,
  type ToneMapping,
  type WebGLRenderer,
} from "three";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  CopyPass,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
  type Effect,
} from "postprocessing";
import { EnvironmentTransitionCompositor } from "../../environments/rendering/environment-transition-compositor";
import type { EnvironmentTransitionPhase } from "../../environments/domain/environment-transition";
import {
  SCENE_COLOR_SNAPSHOT_SCALE_3D,
  clearSceneColorSnapshot3D,
  consumeSceneColorSnapshotDemand3D,
  publishSceneColorSnapshot3D,
} from "./scene-color-snapshot-3d";
import { UnderwaterDistortionEffect } from "./ocean/underwater-distortion-effect";
import { WaterAbsorptionEffect } from "./ocean/water-absorption-effect";

const OCEAN_TONE_MAPPING_EXPOSURE = 1.15;
const BASE_ABSORPTION = new Vector3(0.05, 0.018, 0.009);
const BASE_SCATTER = new Vector3(0, 0.02, 0.04);

export interface ScenePostProcessingPipelineConfig {
  enabled: boolean;
  isOcean: boolean;
  tierBloom: boolean;
  enableShadows: boolean;
  bloomResolutionScale: number;
  bloomLevels: number;
  tierBloomResolutionScale: number;
  tierBloomLevels: number;
  enableBloom: boolean;
  enableChromaticAberration: boolean;
  forceBloom?: boolean;
  oceanBloom: boolean;
  oceanWaterTint: boolean;
  oceanWaterTintStrength: number;
  oceanUnderwaterDistortion: boolean;
}

export interface ScenePostProcessingPipelineOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  config: ScenePostProcessingPipelineConfig;
}

export interface ScenePostProcessingRenderOptions {
  forceBaseRender?: boolean;
  transitionOpacity?: number;
  transitionPhase?: EnvironmentTransitionPhase;
}

interface OceanRendererState {
  shadowMapEnabled: boolean;
  toneMapping: ToneMapping;
  toneMappingExposure: number;
}

/**
 * Owns the post-processing resources without depending on Svelte, Threlte, or
 * an HTML canvas. The interactive viewer and an OffscreenCanvas worker can
 * therefore drive the same pass graph and lifecycle.
 */
export class ScenePostProcessingPipeline {
  private readonly renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  private config: ScenePostProcessingPipelineConfig;
  private composer: EffectComposer | null = null;
  private sceneDepthSourcePass: RenderPass | null = null;
  private waterAbsorption: WaterAbsorptionEffect | null = null;
  private oceanRendererState: OceanRendererState | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private disposed = false;

  private readonly size = new Vector2();
  private readonly tintCoefficient = new Vector3();
  private readonly tintScatter = new Vector3();
  private readonly sceneColorTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  private readonly sceneColorCopyPass: CopyPass;
  private readonly transitionCompositor = new EnvironmentTransitionCompositor();

  constructor({
    renderer,
    scene,
    camera,
    config,
  }: ScenePostProcessingPipelineOptions) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.config = { ...config };

    this.sceneColorTarget.texture.name = "SceneColorSnapshot3D";
    this.sceneColorTarget.texture.generateMipmaps = false;
    this.sceneColorCopyPass = new CopyPass(this.sceneColorTarget, false);
    this.sceneColorCopyPass.initialize(
      renderer,
      renderer.getContext().getContextAttributes()?.alpha ?? false,
      HalfFloatType
    );

    if (config.enabled) this.buildComposer();
  }

  render(
    delta: number,
    {
      forceBaseRender = false,
      transitionOpacity = 0,
      transitionPhase = "idle",
    }: ScenePostProcessingRenderOptions = {}
  ): void {
    if (this.disposed) return;

    if (this.composer) {
      this.composer.setMainCamera(this.camera);

      this.renderer.getSize(this.size);
      const width = Math.round(this.size.x);
      const height = Math.round(this.size.y);
      if (width < 1 || height < 1) return;
      if (width !== this.lastWidth || height !== this.lastHeight) {
        this.resize(width, height);
      }

      this.composer.render(delta);
      this.captureSceneColorIfRequested(delta);
    } else if (forceBaseRender) {
      this.renderer.render(this.scene, this.camera);
    }

    this.transitionCompositor.render(
      this.renderer,
      this.scene,
      this.camera,
      transitionOpacity,
      transitionPhase
    );
  }

  captureTransitionFrame(): void {
    if (this.disposed || this.transitionCompositor.hasRetainedFrame) return;
    // preserveDrawingBuffer is off, so redraw before copying instead of
    // reading a backbuffer the browser may already have cleared.
    this.render(0, { forceBaseRender: true });
    this.transitionCompositor.capture(this.renderer);
  }

  /** The framebuffer used by the production scene pass before effects. */
  get sceneRenderTarget(): WebGLRenderTarget | null {
    return this.composer?.inputBuffer ?? null;
  }

  resize(width: number, height: number): void {
    if (this.disposed || !this.composer) return;

    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);
    if (roundedWidth < 1 || roundedHeight < 1) return;

    this.composer.setSize(roundedWidth, roundedHeight);
    this.sceneColorTarget.setSize(
      Math.max(1, Math.ceil(roundedWidth * SCENE_COLOR_SNAPSHOT_SCALE_3D)),
      Math.max(1, Math.ceil(roundedHeight * SCENE_COLOR_SNAPSHOT_SCALE_3D))
    );
    this.lastWidth = roundedWidth;
    this.lastHeight = roundedHeight;
  }

  updateConfig(
    config: ScenePostProcessingPipelineConfig,
    scene: Scene = this.scene,
    camera: Camera = this.camera
  ): void {
    if (this.disposed) return;

    const previousConfig = this.config;
    const renderTargetsChanged = scene !== this.scene || camera !== this.camera;
    this.config = { ...config };
    this.scene = scene;
    this.camera = camera;

    if (!config.enabled) {
      this.disposeComposer();
      return;
    }

    if (
      !this.composer ||
      renderTargetsChanged ||
      requiresComposerRebuild(previousConfig, config)
    ) {
      this.buildComposer();
      return;
    }

    if (
      previousConfig.oceanWaterTintStrength !== config.oceanWaterTintStrength
    ) {
      this.updateWaterTint();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.disposeComposer();
    this.sceneColorCopyPass.dispose();
    this.sceneColorTarget.dispose();
    this.transitionCompositor.dispose();
  }

  private buildComposer(): void {
    this.disposeComposer();

    const config = this.config;
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
    });

    this.sceneDepthSourcePass = new RenderPass(this.scene, this.camera);
    this.sceneDepthSourcePass.needsDepthTexture = true;
    this.composer.addPass(this.sceneDepthSourcePass);

    if (config.isOcean) this.applyOceanRendererState();

    if (config.isOcean && config.oceanWaterTint) {
      this.waterAbsorption = new WaterAbsorptionEffect({
        absorptionR: BASE_ABSORPTION.x * config.oceanWaterTintStrength,
        absorptionG: BASE_ABSORPTION.y * config.oceanWaterTintStrength,
        absorptionB: BASE_ABSORPTION.z * config.oceanWaterTintStrength,
        scatterColor: this.tintScatter
          .copy(BASE_SCATTER)
          .multiplyScalar(config.oceanWaterTintStrength),
        maxDepth: 50,
      });
      this.composer.addPass(new EffectPass(this.camera, this.waterAbsorption));
    }

    const colorEffects: Effect[] = [];
    const wantBloom =
      config.tierBloom &&
      (config.isOcean ? config.enableBloom && config.oceanBloom : true);
    if (wantBloom) {
      colorEffects.push(
        new BloomEffect({
          intensity: 0.8,
          luminanceThreshold: 0.6,
          luminanceSmoothing: 0.3,
          mipmapBlur: true,
          radius: 0.5,
          levels:
            config.forceBloom === undefined
              ? Math.min(config.bloomLevels, config.tierBloomLevels)
              : config.bloomLevels,
          resolutionScale:
            config.forceBloom === undefined
              ? Math.min(
                  config.bloomResolutionScale,
                  config.tierBloomResolutionScale
                )
              : config.bloomResolutionScale,
        })
      );
    }

    if (config.isOcean) {
      colorEffects.push(
        new VignetteEffect({
          darkness: 0.3,
          offset: 0.35,
        })
      );
    }

    if (colorEffects.length > 0) {
      this.composer.addPass(new EffectPass(this.camera, ...colorEffects));
    }

    if (
      config.isOcean &&
      config.tierBloom &&
      config.oceanUnderwaterDistortion
    ) {
      this.composer.addPass(
        new EffectPass(this.camera, new UnderwaterDistortionEffect())
      );
    }

    if (
      config.isOcean &&
      config.tierBloom &&
      config.enableChromaticAberration
    ) {
      this.composer.addPass(
        new EffectPass(
          this.camera,
          new ChromaticAberrationEffect({
            offset: new Vector2(0.0006, 0.0006),
            radialModulation: true,
            modulationOffset: 0.2,
          })
        )
      );
    }

    this.renderer.getSize(this.size);
    const width = Math.round(this.size.x);
    const height = Math.round(this.size.y);
    if (width > 0 && height > 0) this.resize(width, height);
    this.lastWidth = width;
    this.lastHeight = height;
  }

  private applyOceanRendererState(): void {
    this.oceanRendererState = {
      shadowMapEnabled: this.renderer.shadowMap.enabled,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure: this.renderer.toneMappingExposure,
    };
    this.renderer.shadowMap.enabled = this.config.enableShadows;
    // Ocean's coral warmth and jellyfish cyan depend on this authored ACES
    // grade. Exposure matches the standalone Ocean verification harness.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = OCEAN_TONE_MAPPING_EXPOSURE;
  }

  private updateWaterTint(): void {
    if (!this.waterAbsorption) return;

    // The development tint control is continuous, so it updates the running
    // uniforms without interrupting the frame stream to rebuild every pass.
    const strength = this.config.oceanWaterTintStrength;
    this.waterAbsorption.absorptionCoeff = this.tintCoefficient
      .copy(BASE_ABSORPTION)
      .multiplyScalar(strength);
    this.waterAbsorption.scatterColor = this.tintScatter
      .copy(BASE_SCATTER)
      .multiplyScalar(strength);
  }

  private captureSceneColorIfRequested(delta: number): void {
    if (!this.composer) return;

    if (!consumeSceneColorSnapshotDemand3D(this.renderer)) {
      clearSceneColorSnapshot3D(this.renderer);
      return;
    }

    const previousRenderTarget = this.renderer.getRenderTarget();
    try {
      this.sceneColorCopyPass.render(
        this.renderer,
        this.composer.inputBuffer,
        null,
        delta,
        false
      );
    } finally {
      this.renderer.setRenderTarget(previousRenderTarget);
    }
    publishSceneColorSnapshot3D(this.renderer, {
      texture: this.sceneColorTarget.texture,
      depthTexture: this.sceneDepthSourcePass?.getDepthTexture() ?? null,
      colorSpace: this.composer.inputBuffer.texture.colorSpace as ColorSpace,
    });
  }

  private disposeComposer(): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.sceneDepthSourcePass = null;
      this.waterAbsorption = null;
      this.renderer.autoClear = true;
    }

    if (this.oceanRendererState) {
      this.renderer.shadowMap.enabled =
        this.oceanRendererState.shadowMapEnabled;
      this.renderer.toneMapping = this.oceanRendererState.toneMapping;
      this.renderer.toneMappingExposure =
        this.oceanRendererState.toneMappingExposure;
      this.oceanRendererState = null;
    }

    clearSceneColorSnapshot3D(this.renderer);
  }
}

function requiresComposerRebuild(
  previous: ScenePostProcessingPipelineConfig,
  next: ScenePostProcessingPipelineConfig
): boolean {
  return (
    previous.enabled !== next.enabled ||
    previous.isOcean !== next.isOcean ||
    previous.tierBloom !== next.tierBloom ||
    previous.enableShadows !== next.enableShadows ||
    previous.bloomResolutionScale !== next.bloomResolutionScale ||
    previous.bloomLevels !== next.bloomLevels ||
    previous.tierBloomResolutionScale !== next.tierBloomResolutionScale ||
    previous.tierBloomLevels !== next.tierBloomLevels ||
    previous.enableBloom !== next.enableBloom ||
    previous.enableChromaticAberration !== next.enableChromaticAberration ||
    previous.forceBloom !== next.forceBloom ||
    previous.oceanBloom !== next.oceanBloom ||
    previous.oceanWaterTint !== next.oceanWaterTint ||
    previous.oceanUnderwaterDistortion !== next.oceanUnderwaterDistortion
  );
}
