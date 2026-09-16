/**
 * Create Module Services Type Definition
 *
 * Container interface for all CreateModule services.
 * Used by the context system to provide services to descendant components.
 *
 * Domain: Create module - Service types
 */

import type { StartPlacementManager } from "$lib/shared/create/services/start-placement-manager";
import type { StepOperator } from "$lib/features/create/shared/services/step-operator";
import type { CreateModuleOrchestrator } from "$lib/features/create/shared/services/create-module-orchestrator";
import type { NavigationSyncer } from "../services/navigation-syncer";
import type { ResponsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
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
