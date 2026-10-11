import { SequenceAnimationOrchestrator } from '#lib/shared/animation-engine/services/sequence-animation-orchestrator.js';
import { getAnimationStateManager } from '#lib/shared/animation-engine/get-animation-state-manager.js';
import { getViewerAnimationPropConfig } from '#lib/shared/animation-engine/get-viewer-animation-prop-config.js';

let instance: SequenceAnimationOrchestrator | null = null;
export function getSequenceAnimationOrchestrator(): SequenceAnimationOrchestrator {
  return instance ??= new SequenceAnimationOrchestrator(
    getAnimationStateManager(),
    getViewerAnimationPropConfig
  );
}
