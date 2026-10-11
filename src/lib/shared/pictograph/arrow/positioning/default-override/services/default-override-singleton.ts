/**
 * Default Arrow Placement Override Singleton
 *
 * Provides a singleton DefaultArrowPlacementRepository, initialized after
 * Firebase auth is ready. On init it registers a Firestore-first resolver into
 * ArrowPlacer so default base adjustments prefer admin overrides over the
 * static JSON. Mirrors special-override-singleton.ts.
 */

import type { DefaultArrowPlacementRepository } from "./default-arrow-placement-repository";
import { setDefaultOverrideResolver } from "../../placement/services/arrow-placer";
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const logger = createComponentLogger("DefaultOverrideSingleton");

let repositoryInstance: DefaultArrowPlacementRepository | null = null;
let initializationPromise: Promise<void> | null = null;

export function getDefaultOverrideRepository(): DefaultArrowPlacementRepository | null {
  return repositoryInstance;
}

export async function initializeDefaultOverrides(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  if (repositoryInstance?.isInitialized) return;
  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  try {
    logger.info("Initializing default placement override system...");
    const { DefaultArrowPlacementPersister } =
      await import("./default-arrow-placement-persister");
    const { DefaultArrowPlacementRepository } =
      await import("./default-arrow-placement-repository");
    const persister = new DefaultArrowPlacementPersister();
    const repository = new DefaultArrowPlacementRepository(persister);
    await repository.initialize();
    repositoryInstance = repository;

    // Register the Firestore-first resolver. Any new override now shadows JSON.
    setDefaultOverrideResolver(
      (placementFrame, motionType, placementKey, turns, propType) =>
        repository.getValue(
          placementFrame,
          propType,
          motionType,
          placementKey,
          turns
        )
    );
    // Existing cached renders predate the resolver — invalidate so they repopulate.
    pictographPreparer.clearCache();

    logger.success("Default placement override system initialized");
  } catch (error) {
    logger.error("Failed to initialize default overrides:", error);
    // Don't throw — rendering continues on the static JSON baseline.
  } finally {
    initializationPromise = null;
  }
}

export function disposeDefaultOverrides(): void {
  if (repositoryInstance) {
    setDefaultOverrideResolver(null);
    repositoryInstance.dispose();
    repositoryInstance = null;
    logger.info("Default placement override system disposed");
  }
}
