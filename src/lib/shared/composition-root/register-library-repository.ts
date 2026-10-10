import { registerPublicIndexSyncerFactory } from "../library/get-library-repository";
import { registerVisualSequenceSaveCoordinatorFactory } from "../library/get-visual-sequence-save-coordinator";
import { createLazyPublicIndexSyncer } from "../library/services/create-lazy-public-index-syncer";

/**
 * Makes the library repository available without loading the public-index
 * implementation into the route's startup chunk.
 *
 * The root app and reset-layout entry points call this during component/module
 * initialization, before any viewer can ask for saved or ownership state.
 */
export function registerLibraryRepository(): void {
  registerPublicIndexSyncerFactory(() =>
    createLazyPublicIndexSyncer(async () => {
      const { getPublicIndexSyncer } =
        await import("#lib/features/library/get-public-index-syncer.js");
      return getPublicIndexSyncer();
    })
  );

  registerVisualSequenceSaveCoordinatorFactory(async () => {
    const { getVisualSequenceSaveCoordinator } =
      await import("#lib/features/library/get-visual-sequence-save-coordinator.js");
    return getVisualSequenceSaveCoordinator();
  });
}
