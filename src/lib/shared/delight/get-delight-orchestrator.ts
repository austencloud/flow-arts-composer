
import { DelightOrchestrator } from './services/delight-orchestrator';
import { getHapticFeedback } from '#lib/shared/application/get-haptic-feedback.js';

let instance: DelightOrchestrator | null = null;
export function getDelightOrchestrator(): DelightOrchestrator {
  return instance ??= new DelightOrchestrator(getHapticFeedback());
}
