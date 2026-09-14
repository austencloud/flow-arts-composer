import type { PropTypeManager } from "./prop-type-manager";
import type { AnimationEngineProps } from "./animation-engine.svelte";
import type { AnimatorState } from "../state/animator-state.svelte";
import type { IAnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import type { ISVGGenerator } from "$lib/shared/animation-engine/services/ISVGGenerator";
import type { TrailCapturer } from "./trail-capturer";
import type { IPropTextureLoader } from "$lib/shared/animation-engine/services/IPropTextureLoader";
import type { RenderFrameParams } from "$lib/shared/animation-engine/services/IAnimationRenderLoop";
import { PropTextureLoader } from "./prop-texture-loader.svelte";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

export class PropPipeline {
  private propTextureService: IPropTextureLoader | null = null;

  constructor(private readonly propTypeManager: PropTypeManager) {}

  initializeTextureLoader(
    renderer: IAnimationRenderer,
    svgGenerator: ISVGGenerator,
    trailCapturer: TrailCapturer | null
  ): IPropTextureLoader {
    this.propTextureService = new PropTextureLoader();
    this.propTextureService.initialize(renderer, svgGenerator, trailCapturer);
    this.propTypeManager.updateRefs({
      propTextureService: this.propTextureService,
    });
    return this.propTextureService;
  }

  handlePropTypeChanges(
    props: AnimationEngineProps,
    state: AnimatorState,
    getFrameParamsFn: () => RenderFrameParams,
    darkMode: boolean
  ): void {
    const hasOverrides =
      props.leftPropType != null || props.rightPropType != null;

    if (hasOverrides) {
      this.propTypeManager.handleOverrides(
        props,
        state,
        getFrameParamsFn,
        darkMode
      );
    } else {
      this.propTypeManager.handleSettingsChange(
        state,
        getFrameParamsFn,
        darkMode,
        props.tunnelPropColors ?? props.primaryPropColors ?? null
      );
    }

    this.propTypeManager.handleAdditionalLayers(
      props,
      state,
      getFrameParamsFn,
      darkMode
    );
  }

  async loadTextures(
    state: AnimatorState,
    darkMode: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void> {
    await this.propTypeManager.loadPropTextures(state, darkMode, colors);
  }

  dispose(): void {
    this.propTextureService?.dispose?.();
  }
}
