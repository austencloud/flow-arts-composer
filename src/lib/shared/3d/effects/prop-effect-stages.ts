import { useScheduler, useStage } from "@threlte/core";

const POSE_STAGE = Symbol("rendered-prop-pose");
const SOURCE_STAGE = Symbol("prop-effect-sources");
const PARTICLE_STAGE = Symbol("prop-effect-particles");

/** Shared per Canvas: live animation → captured pose → sources → particles. */
export function usePropEffectStages() {
  const { mainStage, renderStage } = useScheduler();
  const pose = useStage(POSE_STAGE, { after: mainStage, before: renderStage });
  const sources = useStage(SOURCE_STAGE, { after: pose, before: renderStage });
  const particles = useStage(PARTICLE_STAGE, {
    after: sources,
    before: renderStage,
  });
  return { pose, sources, particles };
}
