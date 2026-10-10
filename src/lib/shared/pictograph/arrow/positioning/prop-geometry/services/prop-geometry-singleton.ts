/**
 * Prop Geometry Adjustment Singleton
 *
 * Same lifecycle pattern as global-adjustment-singleton.ts.
 * Initialized after Firebase auth is ready, accessed by the
 * arrow adjustment pipeline without requiring DI reconstruction.
 */

import type { PropGeometryAdjustmentRepository } from "./prop-geometry-adjustment-repository";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { setPropGeometryResolver } from "../../placement/services/override-resolvers";

const logger = createComponentLogger("PropGeometrySingleton");

let repositoryInstance: PropGeometryAdjustmentRepository | null = null;
let initializationPromise: Promise<void> | null = null;

export function getPropGeometryRepository(): PropGeometryAdjustmentRepository | null {
  return repositoryInstance;
}

export async function initializePropGeometryAdjustments(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  if (repositoryInstance?.isInitialized) return;

  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  try {
    logger.info("Initializing prop geometry adjustment system...");

    const { PropGeometryAdjustmentPersister } = await import("./prop-geometry-adjustment-persister");
    const { PropGeometryAdjustmentRepository } = await import("./prop-geometry-adjustment-repository");
    const persister = new PropGeometryAdjustmentPersister();
    const repository = new PropGeometryAdjustmentRepository(persister);

    await repository.initialize();
    repositoryInstance = repository;

    setPropGeometryResolver((key) => repository.getAdjustmentCascading(key));

    logger.success("Prop geometry adjustment system initialized");
  } catch (error) {
    logger.error("Failed to initialize prop geometry adjustments:", error);
  } finally {
    initializationPromise = null;
  }
}

export function disposePropGeometryAdjustments(): void {
  if (repositoryInstance) {
    repositoryInstance.dispose();
    setPropGeometryResolver(null);
    repositoryInstance = null;
    logger.info("Prop geometry adjustment system disposed");
  }
}
