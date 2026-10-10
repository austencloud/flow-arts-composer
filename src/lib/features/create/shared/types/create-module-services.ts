/**
 * Create Module Services Type Definition
 *
 * Container interface for all CreateModule services.
 * Used by the context system to provide services to descendant components.
 *
 * Domain: Create module - Service types
 */

import type { StartPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import type { StepOperator } from "#lib/features/create/shared/services/step-operator.js";
import type { CreateModuleOrchestrator } from "#lib/features/create/shared/services/create-module-orchestrator.js";
import type { NavigationSyncer } from "../services/navigation-syncer";
import type { ResponsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";
import type { SequenceRepository } from "#lib/shared/create/services/sequence-repository.js";
import type { Sharer } from "../../../../shared/share/services/sharer";

/**
 * Container for all CreateModule services
 */
export interface CreateModuleOrchestrators {
  sequenceService: SequenceRepository;
  SequencePersister: SequencePersister;
  StartPlacementManager: StartPlacementManager;
  CreateModuleOrchestrator: CreateModuleOrchestrator;
  layoutService: ResponsiveLayoutManager;
  NavigationSyncer: NavigationSyncer;
  StepOperator: StepOperator;
  shareService: Sharer;
}
