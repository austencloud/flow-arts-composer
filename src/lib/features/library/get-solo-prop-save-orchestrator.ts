import { SoloPropSaveOrchestrator } from './services/solo-prop-save-orchestrator';
import { soloPropRepository } from '#lib/shared/foundation/services/solo-prop-repository-store.js';
import { handPathRepository } from '#lib/shared/foundation/services/hand-path-repository-store.js';

let instance: SoloPropSaveOrchestrator | null = null;
export function getSoloPropSaveOrchestrator(): SoloPropSaveOrchestrator {
  return instance ??= new SoloPropSaveOrchestrator(soloPropRepository, handPathRepository);
}
