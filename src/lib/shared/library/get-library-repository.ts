import { LibraryRepository } from "./services/library-repository";
import { getConflictResolver } from "#lib/shared/offline/get-conflict-resolver.js";
import type { IPublicIndexSyncer } from "./services/IPublicIndexSyncer";

let publicIndexSyncerFactory: (() => IPublicIndexSyncer) | null = null;

/**
 * Register the factory that creates PublicIndexSyncer.
 * Called once by the composition root at app startup to avoid a reverse import
 * anywhere else in shared/.
 */
export function registerPublicIndexSyncerFactory(
  fn: () => IPublicIndexSyncer
): void {
  publicIndexSyncerFactory = fn;
}

let instance: LibraryRepository | null = null;
export function getLibraryRepository(): LibraryRepository {
  if (!publicIndexSyncerFactory) {
    throw new Error(
      "PublicIndexSyncer factory not registered. " +
        "Ensure registerPublicIndexSyncerFactory() is called at app startup."
    );
  }
  return (instance ??= new LibraryRepository(
    publicIndexSyncerFactory(),
    getConflictResolver()
  ));
}
