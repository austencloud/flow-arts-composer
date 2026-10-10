import { ArtifactExtractor } from './services/artifact-extractor';
import { handPathRepository } from '#lib/shared/foundation/services/hand-path-repository-store.js';
import { soloPropRepository } from '#lib/shared/foundation/services/solo-prop-repository-store.js';

let instance: ArtifactExtractor | null = null;
export function getArtifactExtractor(): ArtifactExtractor {
  return instance ??= new ArtifactExtractor(handPathRepository, soloPropRepository);
}
