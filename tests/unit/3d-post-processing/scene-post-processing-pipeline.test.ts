import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACESFilmicToneMapping,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  type Camera,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import {
  getSceneColorSnapshot3D,
  requestSceneColorSnapshot3D,
} from "#lib/shared/3d/effects/post-processing/scene-color-snapshot-3d.js";
import {
  ScenePostProcessingPipeline,
  type ScenePostProcessingPipelineConfig,
} from "#lib/shared/3d/effects/post-processing/scene-post-processing-pipeline.js";

interface MockEffect {
  name: string;
  options?: Record<string, unknown>;
}

interface MockPass {
  kind: string;
  effects?: MockEffect[];
  needsDepthTexture?: boolean;
}

interface MockComposer {
  passes: MockPass[];
  inputBuffer: { texture: { colorSpace: string } };
  addPass: ReturnType<typeof vi.fn>;
  setMainCamera: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

interface MockCopyPass {
  target: WebGLRenderTarget;
  initialize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const postprocessing = vi.hoisted(() => ({
  composers: [] as unknown[],
  copyPasses: [] as unknown[],
  renderEvents: [] as string[],
}));

vi.mock("postprocessing", () => {
  class Effect {
    readonly name: string;
    readonly uniforms: Map<string, { value: unknown }>;

    constructor(
      name: string,
      _fragmentShader: string,
      options: { uniforms?: Map<string, { value: unknown }> } = {}
    ) {
      this.name = name;
      this.uniforms = options.uniforms ?? new Map();
    }
  }

  class RenderPass {
    readonly kind = "RenderPass";
    needsDepthTexture = false;
    readonly depthTexture = { name: "scene-depth" };

    getDepthTexture(): object {
      return this.depthTexture;
    }
  }

  class EffectPass {
    readonly kind = "EffectPass";
    readonly effects: MockEffect[];

    constructor(
      readonly camera: Camera,
      ...effects: MockEffect[]
    ) {
      this.effects = effects;
    }
  }

  class EffectComposer {
    readonly passes: MockPass[] = [];
    readonly inputBuffer = {
      texture: { colorSpace: "mock-linear-color-space" },
    };
    readonly addPass = vi.fn((pass: MockPass) => this.passes.push(pass));
    readonly setMainCamera = vi.fn();
    readonly setSize = vi.fn();
    readonly render = vi.fn(() => postprocessing.renderEvents.push("composer"));
    readonly dispose = vi.fn();

    constructor(
      readonly renderer: WebGLRenderer,
      readonly options: Record<string, unknown>
    ) {
      postprocessing.composers.push(this);
    }
  }

  class CopyPass {
    readonly initialize = vi.fn();
    readonly render = vi.fn();
    readonly dispose = vi.fn();

    constructor(
      readonly target: WebGLRenderTarget,
      readonly renderToScreen: boolean
    ) {
      postprocessing.copyPasses.push(this);
    }
  }

  class BloomEffect {
    readonly name = "BloomEffect";
    constructor(readonly options: Record<string, unknown>) {}
  }

  class VignetteEffect {
    readonly name = "VignetteEffect";
    constructor(readonly options: Record<string, unknown>) {}
  }

  class ChromaticAberrationEffect {
    readonly name = "ChromaticAberrationEffect";
    constructor(readonly options: Record<string, unknown>) {}
  }

  return {
    BlendFunction: { NORMAL: 0 },
    EffectAttribute: { DEPTH: 1, CONVOLUTION: 2 },
    Effect,
    RenderPass,
    EffectPass,
    EffectComposer,
    CopyPass,
    BloomEffect,
    VignetteEffect,
    ChromaticAberrationEffect,
  };
});

interface RendererHarness {
  renderer: WebGLRenderer;
  dimensions: { width: number; height: number };
  render: ReturnType<typeof vi.fn>;
  setRenderTarget: ReturnType<typeof vi.fn>;
  previousRenderTarget: object;
}

function createRendererHarness(): RendererHarness {
  const dimensions = { width: 800, height: 600 };
  const previousRenderTarget = { name: "previous-target" };
  const render = vi.fn(() => postprocessing.renderEvents.push("renderer"));
  const setRenderTarget = vi.fn();
  const renderer = {
    autoClear: false,
    shadowMap: { enabled: false },
    toneMapping: NoToneMapping,
    toneMappingExposure: 0.9,
    getContext: () => ({
      getContextAttributes: () => ({ alpha: true }),
    }),
    getSize: (target: Vector2) =>
      target.set(dimensions.width, dimensions.height),
    getRenderTarget: () => previousRenderTarget,
    setRenderTarget,
    render,
    clearDepth: vi.fn(),
  } as unknown as WebGLRenderer;

  return {
    renderer,
    dimensions,
    render,
    setRenderTarget,
    previousRenderTarget,
  };
}

function createConfig(
  overrides: Partial<ScenePostProcessingPipelineConfig> = {}
): ScenePostProcessingPipelineConfig {
  return {
    enabled: true,
    isOcean: true,
    tierBloom: true,
    enableShadows: true,
    bloomResolutionScale: 1,
    bloomLevels: 8,
    tierBloomResolutionScale: 0.5,
    tierBloomLevels: 5,
    enableBloom: true,
    enableChromaticAberration: true,
    oceanBloom: true,
    oceanWaterTint: true,
    oceanWaterTintStrength: 1,
    oceanUnderwaterDistortion: true,
    ...overrides,
  };
}

function latestComposer(): MockComposer {
  return postprocessing.composers.at(-1) as MockComposer;
}

function latestCopyPass(): MockCopyPass {
  return postprocessing.copyPasses.at(-1) as MockCopyPass;
}

function effectNames(composer: MockComposer): string[][] {
  return composer.passes.map((pass) =>
    pass.kind === "RenderPass"
      ? [pass.kind]
      : (pass.effects ?? []).map((effect) => effect.name)
  );
}

afterEach(() => {
  postprocessing.composers.length = 0;
  postprocessing.copyPasses.length = 0;
  postprocessing.renderEvents.length = 0;
});

describe("ScenePostProcessingPipeline", () => {
  it("builds the production Ocean pass order and authored values", () => {
    const harness = createRendererHarness();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene,
      camera,
      config: createConfig(),
    });
    const composer = latestComposer();

    expect(effectNames(composer)).toEqual([
      ["RenderPass"],
      ["WaterAbsorptionEffect"],
      ["BloomEffect", "VignetteEffect"],
      ["UnderwaterDistortionEffect"],
      ["ChromaticAberrationEffect"],
    ]);
    expect(composer.passes[0]?.needsDepthTexture).toBe(true);

    const water = composer.passes[1]?.effects?.[0] as MockEffect & {
      absorptionCoeff: Vector3;
      scatterColor: Vector3;
      maxDepth: number;
    };
    expect(water.absorptionCoeff.toArray()).toEqual([0.05, 0.018, 0.009]);
    expect(water.scatterColor.toArray()).toEqual([0, 0.02, 0.04]);
    expect(water.maxDepth).toBe(50);

    const bloom = composer.passes[2]?.effects?.[0];
    expect(bloom?.options).toEqual({
      intensity: 0.8,
      luminanceThreshold: 0.6,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
      radius: 0.5,
      levels: 5,
      resolutionScale: 0.5,
    });
    expect(composer.passes[2]?.effects?.[1]?.options).toEqual({
      darkness: 0.3,
      offset: 0.35,
    });
    expect(composer.passes[4]?.effects?.[0]?.options).toEqual({
      offset: expect.objectContaining({ x: 0.0006, y: 0.0006 }),
      radialModulation: true,
      modulationOffset: 0.2,
    });
    expect(harness.renderer.shadowMap.enabled).toBe(true);
    expect(harness.renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(harness.renderer.toneMappingExposure).toBe(1.15);
    expect(pipeline.sceneRenderTarget).toBe(composer.inputBuffer);

    pipeline.dispose();
  });

  it("keeps non-Ocean scenes bloom-only and leaves renderer grading untouched", () => {
    const harness = createRendererHarness();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      config: createConfig({
        isOcean: false,
        enableBloom: false,
      }),
    });

    expect(effectNames(latestComposer())).toEqual([
      ["RenderPass"],
      ["BloomEffect"],
    ]);
    expect(harness.renderer.shadowMap.enabled).toBe(false);
    expect(harness.renderer.toneMapping).toBe(NoToneMapping);
    expect(harness.renderer.toneMappingExposure).toBe(0.9);
    expect(pipeline.sceneRenderTarget).toBe(latestComposer().inputBuffer);

    pipeline.dispose();
  });

  it("updates water strength live and rebuilds only when the pass graph changes", () => {
    const harness = createRendererHarness();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      config: createConfig(),
    });
    const firstComposer = latestComposer();
    const water = firstComposer.passes[1]?.effects?.[0] as MockEffect & {
      absorptionCoeff: Vector3;
      scatterColor: Vector3;
    };

    pipeline.updateConfig(createConfig({ oceanWaterTintStrength: 2 }));

    expect(postprocessing.composers).toHaveLength(1);
    expect(water.absorptionCoeff.toArray()).toEqual([0.1, 0.036, 0.018]);
    expect(water.scatterColor.toArray()).toEqual([0, 0.04, 0.08]);

    pipeline.updateConfig(
      createConfig({
        oceanWaterTintStrength: 2,
        oceanUnderwaterDistortion: false,
      })
    );

    expect(postprocessing.composers).toHaveLength(2);
    expect(firstComposer.dispose).toHaveBeenCalledOnce();
    expect(effectNames(latestComposer())).toEqual([
      ["RenderPass"],
      ["WaterAbsorptionEffect"],
      ["BloomEffect", "VignetteEffect"],
      ["ChromaticAberrationEffect"],
    ]);

    pipeline.dispose();
  });

  it("resizes explicitly and follows renderer size changes during rendering", () => {
    const harness = createRendererHarness();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      config: createConfig(),
    });
    const composer = latestComposer();
    const copyPass = latestCopyPass();

    expect(composer.setSize).toHaveBeenLastCalledWith(800, 600);
    expect(copyPass.target.width).toBe(50);
    expect(copyPass.target.height).toBe(38);

    pipeline.resize(640.4, 480.6);
    expect(composer.setSize).toHaveBeenLastCalledWith(640, 481);
    expect(copyPass.target.width).toBe(40);
    expect(copyPass.target.height).toBe(31);

    harness.dimensions.width = 1024;
    harness.dimensions.height = 512;
    pipeline.render(1 / 60);
    expect(composer.setSize).toHaveBeenLastCalledWith(1024, 512);
    expect(composer.render).toHaveBeenLastCalledWith(1 / 60);

    pipeline.dispose();
  });

  it("publishes requested scene color and preserves the prior render target", () => {
    const harness = createRendererHarness();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      config: createConfig(),
    });
    const composer = latestComposer();
    const copyPass = latestCopyPass();

    requestSceneColorSnapshot3D(harness.renderer);
    pipeline.render(0.25);

    expect(copyPass.render).toHaveBeenCalledWith(
      harness.renderer,
      composer.inputBuffer,
      null,
      0.25,
      false
    );
    expect(harness.setRenderTarget).toHaveBeenCalledWith(
      harness.previousRenderTarget
    );
    expect(getSceneColorSnapshot3D(harness.renderer)).toEqual({
      texture: copyPass.target.texture,
      depthTexture: { name: "scene-depth" },
      colorSpace: "mock-linear-color-space",
    });

    pipeline.dispose();
    expect(getSceneColorSnapshot3D(harness.renderer)).toBeNull();
  });

  it("restores Ocean renderer state and retains forced base-frame rendering", () => {
    const harness = createRendererHarness();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const pipeline = new ScenePostProcessingPipeline({
      renderer: harness.renderer,
      scene,
      camera,
      config: createConfig(),
    });
    const composer = latestComposer();
    const copyPass = latestCopyPass();
    const disposeTarget = vi.spyOn(copyPass.target, "dispose");

    pipeline.updateConfig(createConfig({ enabled: false }));

    expect(composer.dispose).toHaveBeenCalledOnce();
    expect(harness.renderer.autoClear).toBe(true);
    expect(harness.renderer.shadowMap.enabled).toBe(false);
    expect(harness.renderer.toneMapping).toBe(NoToneMapping);
    expect(harness.renderer.toneMappingExposure).toBe(0.9);
    expect(pipeline.sceneRenderTarget).toBeNull();

    pipeline.render(0.1);
    expect(harness.render).not.toHaveBeenCalled();
    pipeline.render(0, { forceBaseRender: true, transitionOpacity: 0.5 });
    expect(harness.render).toHaveBeenNthCalledWith(1, scene, camera);
    expect(postprocessing.renderEvents).toEqual([
      "renderer",
      "renderer",
      "renderer",
    ]);

    pipeline.dispose();
    pipeline.dispose();
    expect(copyPass.dispose).toHaveBeenCalledOnce();
    expect(disposeTarget).toHaveBeenCalledOnce();
  });
});
