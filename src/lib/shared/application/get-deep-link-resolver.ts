import { DeepLinkResolver } from './services/deep-link-resolver';
import { getSequenceRepository } from '#lib/shared/create/get-sequence-repository.js';
import { getBrowseLoader } from '#lib/shared/browse/get-browse-loader.js';

let instance: DeepLinkResolver | null = null;
export function getDeepLinkResolver(): DeepLinkResolver {
  return instance ??= new DeepLinkResolver(getSequenceRepository(), getBrowseLoader());
}
