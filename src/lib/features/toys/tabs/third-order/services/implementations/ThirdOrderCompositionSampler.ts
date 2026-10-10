import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import {
  mapThirdOrderChildStep,
  resolveThirdOrderGridPose,
  wrapThirdOrderBeat,
} from "../../domain/third-order-math";
import {
  sampleThirdOrderFlowerPose,
  thirdOrderFlowerTotalBeats,
} from "../../domain/third-order-flower-path";
import type {
  ThirdOrderCompositionDraft,
  ThirdOrderCompositionFrame,
} from "../../domain/third-order-composition";
import type { IThirdOrderCompositionSampler } from "../contracts/IThirdOrderCompositionSampler";

interface SequenceSampler {
  orchestrator: SequenceAnimationOrchestrator;
  totalSteps: number;
}

const DEFAULT_PROP: PropState = {
  centerPathAngle: 0,
  staffRotationAngle: 0,
};

export class ThirdOrderCompositionSampler implements IThirdOrderCompositionSampler {
  private samplers = new WeakMap<SequenceData, SequenceSampler>();

  sample(
    composition: ThirdOrderCompositionDraft,
    masterBeat: number
  ): ThirdOrderCompositionFrame {
    const carrierSampler = this.samplerFor(composition.carrier);
    const carrierSteps = carrierSampler?.totalSteps ?? 0;
    const totalBeats =
      composition.carrierPath.mode === "flower"
        ? thirdOrderFlowerTotalBeats(
            composition.carrierPath.ratio,
            carrierSteps
          )
        : carrierSteps;
    const resolvedBeat = wrapThirdOrderBeat(masterBeat, totalBeats);
    const carrierBeat = wrapThirdOrderBeat(resolvedBeat, carrierSteps);
    const carrierProps = carrierSampler
      ? this.sampleTrack(carrierSampler, carrierBeat)
      : { left: { ...DEFAULT_PROP }, right: { ...DEFAULT_PROP } };

    const lookAheadBeat = wrapThirdOrderBeat(carrierBeat + 0.01, carrierSteps);
    const nextCarrierProps = carrierSampler
      ? this.sampleTrack(carrierSampler, lookAheadBeat)
      : carrierProps;

    const children = composition.children.map((child) => {
      const childSampler = this.samplerFor(child.sequence);
      const childTotalSteps = childSampler?.totalSteps ?? 0;
      const childStep = mapThirdOrderChildStep(
        resolvedBeat,
        childTotalSteps,
        totalBeats,
        child.timingMode,
        child.rate
      );
      const props = childSampler
        ? this.sampleTrack(childSampler, childStep)
        : { left: { ...DEFAULT_PROP }, right: { ...DEFAULT_PROP } };
      const carrier = carrierProps[child.lane];
      const nextCarrier = nextCarrierProps[child.lane];
      const flowerSample =
        composition.carrierPath.mode === "flower"
          ? sampleThirdOrderFlowerPose(
              composition.carrierPath,
              child.lane,
              resolvedBeat,
              carrierSteps,
              child.orientationMode
            )
          : null;

      return {
        ...child,
        props,
        step: childStep,
        totalSteps: childTotalSteps,
        pose:
          flowerSample?.pose ??
          resolveThirdOrderGridPose(
            carrier,
            nextCarrier,
            child.orientationMode
          ),
        decomposition: flowerSample?.decomposition,
      };
    });

    return {
      masterBeat: resolvedBeat,
      totalBeats,
      carrierProps,
      children,
    };
  }

  clear(): void {
    this.samplers = new WeakMap<SequenceData, SequenceSampler>();
  }

  private samplerFor(sequence: SequenceData): SequenceSampler | null {
    const cached = this.samplers.get(sequence);
    if (cached) return cached;

    const orchestrator = new SequenceAnimationOrchestrator(
      new AnimationStateManager()
    );
    if (!orchestrator.initializeWithDomainData(sequence)) return null;

    const sampler = {
      orchestrator,
      totalSteps: orchestrator.getMetadata().totalSteps,
    };
    this.samplers.set(sequence, sampler);
    return sampler;
  }

  private sampleTrack(
    sampler: SequenceSampler,
    step: number
  ): { left: PropState; right: PropState } {
    // The Toy clock starts at zero. The animator reserves position zero for
    // its opening hold, and starts the first motion at position one.
    return sampler.orchestrator.samplePropStateAt(step + 1);
  }
}
