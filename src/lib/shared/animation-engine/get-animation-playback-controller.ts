import { AnimationPlaybackController } from '#lib/shared/animation-engine/services/animation-playback-controller.js';
import { getSequenceAnimationOrchestrator } from './get-sequence-animation-orchestrator';
import { getAnimationLoop } from '#lib/shared/animation-engine/get-animation-loop.js';

let instance: AnimationPlaybackController | null = null;
export function getAnimationPlaybackController(): AnimationPlaybackController {
  return instance ??= new AnimationPlaybackController(
    getSequenceAnimationOrchestrator(),
    getAnimationLoop()
  );
}
