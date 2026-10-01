/**
 * FrameSystem
 *
 * Owns per-frame parameter building, beat/musical-position label calculation,
 * and glyph-state synchronisation for a single animator instance.
 *
 * Extracted from AnimationEngine to reduce its surface area.  All logic is
 * moved verbatim — no behavior changes on the per-frame hot path.
 *
 * Depends on:
 *  - AnimatorState (type only — written to via setGlyphState)
 *  - CanvasLifecycleManager (type only — reads glyphTransition, orchestrator)
 *  - PropSystem (type only — reads prevDarkMode)
 *  - EffectRendererManager (passed into FrameParameterBuilder.getFrameParams)
 *
 * Does NOT import AnimationEngine — keeps the dependency graph acyclic.
 */

import { FrameParameterBuilder } from "../frame-parameter-builder";
import { FrameBuilder } from "../frame-builder";
import type { AnimatorState } from "../../state/animator-state.svelte";
import type { CanvasLifecycleManager } from "../canvas-lifecycle-manager";
import type { PropSystem } from "./prop-system";
import type { AnimationEngineProps } from "../animation-engine.svelte";
import type { RenderFrameParams } from "../IAnimationRenderLoop";
import type { TrailSettings } from "../../domain/types/trail-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import type { EffectRendererManager } from "../effect-renderer-manager";
import type { MandalaPathOptions } from "$lib/shared/mandala/services/types";

export class FrameSystem {
  readonly frameParameterBuilder = new FrameParameterBuilder();
  private readonly frameBuilder = new FrameBuilder();
  private readonly mandalaPathOptions: MandalaPathOptions = {
    pathShape: "arc",
    motionAware: false,
  };

  constructor(
    private readonly state: AnimatorState,
    private readonly deps: {
      lifecycleManager: CanvasLifecycleManager;
      propSystem: PropSystem;
    }
  ) {}


  /**
   * Build the RenderFrameParams for the current frame.
   * Delegates to FrameParameterBuilder.getFrameParams() with engine-side deps
   * resolved through the constructor arguments.
   *
   * Callers pass effectsConfigState + effectRendererManager + settingsService
   * because these live on the engine (not on a lifecycle-manager getter).
   */
  buildFrameParams(
    props: AnimationEngineProps,
    buildDeps: {
      effectsConfigState: EffectsConfigState | null;
      effectRendererManager: EffectRendererManager;
      getVM: () => import("$lib/shared/animation-engine/state/animation-visibility-state.svelte").AnimationVisibilityStateManager;
    }
  ): RenderFrameParams {
    const params = this.frameParameterBuilder.getFrameParams(props, this.state, {
      prevDarkMode: this.deps.propSystem.prevDarkMode,
      prevHasFireTips: buildDeps.effectRendererManager.wasEnabled("fire"),
      prevHasCharcoalTips: buildDeps.effectRendererManager.wasEnabled("charcoal"),
      trailsSuppressedUntilTextureLoad:
        this.deps.propSystem.propTypeManager.trailsSuppressedUntilTextureLoad,
      effectsConfigState: buildDeps.effectsConfigState,
      settingsService: this.deps.lifecycleManager.settingsService,
      effectRendererManager: buildDeps.effectRendererManager,
      getVM: buildDeps.getVM,
      orchestrator: this.deps.lifecycleManager.orchestrator,
    });

    const pathPolicy = buildDeps.getVM().getPathPolicy();
    this.mandalaPathOptions.pathShape = pathPolicy.pathShape;
    this.mandalaPathOptions.motionAware = pathPolicy.motionAwarePaths;
    params.mandalaVisible =
      props.mandalaVisibleOverride ?? this.state.visibilityState.mandala;
    params.mandalaSteps = props.sequenceData?.steps ?? null;
    params.mandalaPathOptions = this.mandalaPathOptions;
    return params;
  }


  calculateBeatNumber(props: AnimationEngineProps): number {
    return this.frameBuilder.calculateBeatNumber(
      props.sequenceData ?? null,
      props.stepData ?? null
    );
  }

  calculateMusicalPosition(props: AnimationEngineProps): string | null {
    return this.frameBuilder.calculateMusicalPosition(
      props.sequenceData ?? null,
      props.stepData ?? null,
      this.deps.lifecycleManager.orchestrator ?? null
    );
  }


  /**
   * Sync the glyph transition service state into AnimatorState.
   *
   * Two call sites in the engine:
   *   1. update() — after glyphTransition.updateTarget() (immediately after the
   *      labels are recalculated so the component sees new values without waiting
   *      for the next animation tick).
   *   2. syncServiceState() — pull glyph state at the top of every update().
   *
   * Both sites call this method with no arguments; the method reads from the
   * lifecycle manager's glyphTransition getter each time it is invoked so it
   * always reflects the latest service state.
   */
  syncGlyphState(): void {
    const glyphTransition = this.deps.lifecycleManager.glyphTransition;
    if (!glyphTransition) return;
    const gs = glyphTransition.state;
    this.state.setGlyphState({
      displayedLetter: gs.displayedLetter,
      displayedStepNumber: gs.displayedStepNumber,
      displayedMusicalPosition: gs.displayedMusicalPosition,
      fadingOutLetter: gs.fadingOutLetter,
      fadingOutStepNumber: gs.fadingOutStepNumber,
      isNewLetter: gs.isNewLetter,
    });
  }


  enforceUnilateralConstraint(
    settings: TrailSettings,
    currentLeftPropType: string,
    currentRightPropType: string
  ): TrailSettings {
    return this.frameParameterBuilder.enforceUnilateralConstraint(
      settings,
      currentLeftPropType,
      currentRightPropType
    );
  }

  getSequenceContentHash(seq: SequenceData): string {
    return this.frameParameterBuilder.getSequenceContentHash(seq);
  }

  get lastSequenceContentHash(): string | null {
    return this.frameParameterBuilder.lastSequenceContentHash;
  }

  set lastSequenceContentHash(v: string | null) {
    this.frameParameterBuilder.lastSequenceContentHash = v;
  }

  resetHandPresenceCache(): void {
    this.frameParameterBuilder.resetHandPresenceCache();
  }
}
