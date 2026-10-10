/**
 * Global Arrow Adjustment Singleton
 *
 * Provides a singleton instance of the GlobalArrowAdjustmentRepository
 * that is initialized with public presentation data at app startup.
 *
 * This pattern allows the repository to be accessed by services
 * like SpecialPlacer without requiring DI container reconstruction.
 */

import type { GlobalArrowAdjustmentRepository } from "./global-arrow-adjustment-repository";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { setGlobalAdjustmentResolver } from "../../placement/services/override-resolvers";

const logger = createComponentLogger("GlobalAdjustmentSingleton");

let repositoryInstance: GlobalArrowAdjustmentRepository | null = null;
let initializationPromise: Promise<void> | null = null;

let globalReadDisabled = false;
export function setGlobalReadDisabled(v: boolean): void {
  globalReadDisabled = v;
}
export function isGlobalReadDisabled(): boolean {
  return globalReadDisabled;
}

/**
 * Get the global adjustment repository instance.
 * Returns null if not initialized yet.
 */
export function getGlobalAdjustmentRepository(): GlobalArrowAdjustmentRepository | null {
  return repositoryInstance;
}

/**
 * Initialize the global adjustment system.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export async function initializeGlobalAdjustments(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  if (repositoryInstance?.isInitialized) return;

  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  try {
    logger.info("Initializing global arrow adjustment system...");

    const { GlobalArrowAdjustmentPersister } =
      await import("./global-arrow-adjustment-persister");
    const { GlobalArrowAdjustmentRepository } =
      await import("./global-arrow-adjustment-repository");
    const persister = new GlobalArrowAdjustmentPersister();
    const repository = new GlobalArrowAdjustmentRepository(persister);

    // Initialize (loads from Firestore and starts subscription)
    await repository.initialize();

    // Store singleton
    repositoryInstance = repository;

    setGlobalAdjustmentResolver(
      (baseKey, thisPropType, otherPropType, legacyOriKey) =>
        repository.getAdjustmentCascading(
          baseKey,
          thisPropType,
          otherPropType,
          legacyOriKey
        )
    );

    logger.success(
      `Global arrow adjustment system initialized with ${repository.isInitialized ? "success" : "failure"}`
    );
  } catch (error) {
    logger.error("Failed to initialize global adjustments:", error);
    // Don't throw - the system should continue without global adjustments
  } finally {
    initializationPromise = null;
  }
}

/**
 * Dispose of the global adjustment system.
 * Call this on app shutdown or when the user signs out.
 */
export function disposeGlobalAdjustments(): void {
  if (repositoryInstance) {
    repositoryInstance.dispose();
    setGlobalAdjustmentResolver(null);
    repositoryInstance = null;
    logger.info("Global arrow adjustment system disposed");
  }
}
