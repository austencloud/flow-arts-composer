/**
 * Create Module Initialization Service Implementation
 *
 * Manages complete initialization sequence for CreateModule's construction interface.
 * Creates state, configures callbacks for sequence building workflow.
 *
 * Domain: Create module - Sequence Construction Interface
 * Extracted from CreateModule.svelte onMount monolith.
 *
 * REFACTORED: Now uses constructor injection instead of resolve() calls.
 * All dependencies are injected via @inject decorators for:
 * - Visible dependencies (can see what class needs in constructor)
 * - Compile-time safety (missing bindings fail at startup, not runtime)
 * - Testability (can pass mocks directly to constructor)
 */

import { bootProfiler } from "$lib/shared/analytics/boot-profiler";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StartPositionManager } from "$lib/shared/create/services/start-position-manager";
import { createCreateModuleState } from "$lib/features/create/shared/state/create-module-state.svelte";
import { createConstructTabState } from "$lib/features/create/shared/state/construct-tab-state.svelte";
// ARCHIVED: createAssemblerTabState import removed (Feb 2026)
import { createGeneratorTabState } from "$lib/features/create/shared/state/generator-tab-state.svelte";
// REMOVED: createSpellTabState - Spell mode unified into Generate tab (Feb 2026)
import { createAssembleTabState } from "$lib/features/create/shared/state/assemble-tab-state.svelte";
import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { StepOperator } from "$lib/features/create/shared/services/step-operator";
import type { CreateModuleEffectCoordinator } from "./create-module-effect-coordinator";
import type { CreateModuleHandlers } from "./create-module-handlers";
import type { CreateModuleOrchestrator } from "$lib/features/create/shared/services/create-module-orchestrator";
import type { DeepLinkSequenceHandler } from "./deep-link-sequence-handler";
import type { NavigationSyncer } from "./navigation-syncer";
import type { ResponsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import { getCreateModuleEventHandler } from "./create-module-event-handler";
import type { DeepLinker } from "$lib/shared/navigation/services/deep-linker";
import type { ICreateModuleState } from "../types/create-module-types";
import type { PanelPersister } from "./panel-persister.svelte";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { UndoOperationType } from "./undo-manager";
import type { UndoMetadata } from "./undo-manager";
import type { Sharer } from "$lib/shared/share/services/sharer";
import type { ConstructTabState } from "../state/construct-tab-state.svelte";
import type { GeneratorTabState } from "../state/generator-tab-state.svelte";
import type { AssembleTabState } from "../state/assemble-tab-state.svelte";

export interface CreateModuleInitializationResult {
  // State objects
  CreateModuleState: ICreateModuleState;
  constructTabState: ConstructTabState;
  generatorTabState: GeneratorTabState;
  assembleTabState: AssembleTabState;

  // Core services
  sequenceService: SequenceRepository;
  SequencePersister: SequencePersister;
  StartPositionManager: StartPositionManager;
  CreateModuleOrchestrator: CreateModuleOrchestrator;
  layoutService: ResponsiveLayoutManager;
  NavigationSyncer: NavigationSyncer;
  StepOperator: StepOperator;

  // UI coordination services
  handlers: CreateModuleHandlers;
  effectCoordinator: CreateModuleEffectCoordinator;
  deepLinkService: DeepLinkSequenceHandler;
  shareService: Sharer;
  panelPersistenceService: PanelPersister;
}

export interface SequenceLoadResult {
  /** Whether a sequence was loaded from deep link or pending edit */
  sequenceLoaded: boolean;
  /** Tab to navigate to (from deep link) */
  targetTab?: string;
}

export class CreateModuleInitializer {
  constructor(
    // Core services
    private readonly sequenceService: SequenceRepository,
    private readonly SequencePersister: SequencePersister,
    private readonly StartPositionManager: StartPositionManager,
    private readonly CreateModuleOrchestrator: CreateModuleOrchestrator,
    private readonly layoutService: ResponsiveLayoutManager,
    private readonly NavigationSyncer: NavigationSyncer,
    private readonly StepOperator: StepOperator,
    private readonly deepLinkService: DeepLinkSequenceHandler,
    private readonly navigationDeepLinker: DeepLinker,

    // UI coordination services
    private readonly handlers: CreateModuleHandlers,
    private readonly effectCoordinator: CreateModuleEffectCoordinator,
    private readonly shareService: Sharer,
    private readonly panelPersistenceService: PanelPersister,

    // Sequence operation services
    private readonly sequenceStatisticsService: SequenceStatsCalculator,
    private readonly SequenceTransformer: SequenceTransformer,
    private readonly sequenceValidationService: SequenceValidator
  ) {}

  async initialize(): Promise<CreateModuleInitializationResult> {
    const t0 = performance.now();
    // Wait a tick to ensure component context is fully established
    await new Promise((r) => setTimeout(r, 0));

    // Create state objects using injected services
    const CreateModuleState = createCreateModuleState(
      this.sequenceService,
      this.SequencePersister,
      this.sequenceStatisticsService,
      this.SequenceTransformer,
      this.sequenceValidationService
    );

    // Create tab-specific states - each tab has its own independent sequence state
    const constructTabState = createConstructTabState(
      this.CreateModuleOrchestrator,
      this.sequenceService,
      this.SequencePersister,
      this.sequenceStatisticsService,
      this.SequenceTransformer,
      this.sequenceValidationService,
      CreateModuleState
    );

    const generatorTabState = createGeneratorTabState(
      this.sequenceService,
      this.SequencePersister,
      this.sequenceStatisticsService,
      this.SequenceTransformer,
      this.sequenceValidationService
    );

    // REMOVED: spellTabState creation - Spell mode unified into Generate tab (Feb 2026)

    const assembleTabState = createAssembleTabState(
      this.sequenceService,
      this.SequencePersister,
      this.sequenceStatisticsService,
      this.SequenceTransformer,
      this.sequenceValidationService
    );

    // Attach tab states to CreateModuleState for easy access
    CreateModuleState.constructTabState = constructTabState; // Legacy accessor
    CreateModuleState.constructorTabState = constructTabState; // Main accessor (triggers setter for _constructorTabState)
    // ARCHIVED: assemblerTabState removed (Feb 2026)
    CreateModuleState.generatorTabState = generatorTabState;
    // REMOVED: spellTabState assignment - Spell mode unified into Generate tab (Feb 2026)
    CreateModuleState.assembleTabState = assembleTabState;

    // Initialize services
    const t1 = performance.now();
    await bootProfiler.measureAsync("create:orchestrator", () =>
      this.CreateModuleOrchestrator.initialize()
    );
    console.log(
      `[Create init] Orchestrator: ${Math.round(performance.now() - t1)}ms`
    );

    // Initialize all tab states + start positions in parallel (independent of each other)
    const t2 = performance.now();
    await Promise.all([
      bootProfiler.measureAsync("create:construct-tab", () =>
        constructTabState.initializeConstructTab()
      ),
      bootProfiler.measureAsync("create:generator-tab", () =>
        generatorTabState.initializeGeneratorTab()
      ),
      bootProfiler.measureAsync("create:assemble-tab", () =>
        assembleTabState.initializeAssembleTab()
      ),
      bootProfiler.measureAsync("create:start-positions", () =>
        this.loadStartPositions(GridMode.DIAMOND)
      ),
    ]);
    console.log(
      `[Create init] Tabs + start positions: ${Math.round(performance.now() - t2)}ms`
    );
    console.log(`[Create init] Total: ${Math.round(performance.now() - t0)}ms`);

    return {
      // State objects
      CreateModuleState,
      constructTabState,
      generatorTabState,
      // REMOVED: spellTabState - Spell mode unified into Generate tab (Feb 2026)
      assembleTabState,

      // Core services
      sequenceService: this.sequenceService,
      SequencePersister: this.SequencePersister,
      StartPositionManager: this.StartPositionManager,
      CreateModuleOrchestrator: this.CreateModuleOrchestrator,
      layoutService: this.layoutService,
      NavigationSyncer: this.NavigationSyncer,
      StepOperator: this.StepOperator,

      // UI coordination services
      handlers: this.handlers,
      effectCoordinator: this.effectCoordinator,
      deepLinkService: this.deepLinkService,
      shareService: this.shareService,
      panelPersistenceService: this.panelPersistenceService,
    };
  }

  async loadSequenceAndInitializePersistence(
    setSequence: (sequence: SequenceData) => void,
    initializePersistence: () => Promise<void>
  ): Promise<SequenceLoadResult> {
    // Try to load from deep link or pending edit
    const loadResult =
      await this.deepLinkService.loadFromAnySource(setSequence);

    if (loadResult.loaded) {
      // Initialize persistence so the deep link sequence can be saved
      // This ensures the sequence persists across navigation/reloads
      await initializePersistence();

      return {
        sequenceLoaded: true,
        targetTab: loadResult.targetTab,
      };
    }

    // No sequence from deep link/pending edit - initialize from persistence
    await initializePersistence();

    return {
      sequenceLoaded: false,
    };
  }

  configureEventCallbacks(
    CreateModuleState: ICreateModuleState,
    panelState: PanelCoordinationState,
    onOptionApplied: (sequence: SequenceData, stepNumber: number) => void
  ): void {
    const CreateModuleEventHandler = getCreateModuleEventHandler();

    // Set up sequence state callbacks for CreateModuleEventHandler
    CreateModuleEventHandler.setSequenceStateCallbacks(
      () => CreateModuleState.sequenceState.getCurrentSequence(),
      (sequence) =>
        CreateModuleState.sequenceState.setCurrentSequence(sequence),
      () => CreateModuleState.sequenceState.whenCurrentSequenceReady()
    );

    // Set up option history callback
    CreateModuleEventHandler.setAddOptionToHistoryCallback(
      (stepIndex, stepData) =>
        CreateModuleState.addOptionToHistory(stepIndex, stepData)
    );

    // Set up undo snapshot callback
    CreateModuleEventHandler.setPushUndoSnapshotCallback((type, metadata) =>
      CreateModuleState.pushUndoSnapshot(
        type as UndoOperationType,
        metadata as UndoMetadata
      )
    );
    CreateModuleEventHandler.setOptionAppliedCallback(onOptionApplied);

    // Configure panel state callbacks on sequenceState
    type SequenceStateWithCallbacks = typeof CreateModuleState.sequenceState & {
      onEditPanelOpen?: (
        stepIndex: number,
        stepData: unknown,
        stepsData: unknown[]
      ) => void;
      onEditPanelClose?: () => void;
      onAnimationStart?: () => void;
      onAnimationEnd?: () => void;
    };
    const seqState =
      CreateModuleState.sequenceState as SequenceStateWithCallbacks;

    seqState.onEditPanelOpen = (
      stepIndex: number,
      stepData: unknown,
      stepsData: unknown[]
    ) => {
      if (stepsData && stepsData.length > 0) {
        // Multi-select: open batch edit panel
        panelState.openBatchEditPanel(stepsData as StepData[]);
      } else {
        // Single beat: open Sequence Actions panel (auto-open effect will handle it based on selection)
        panelState.openSequenceActionsPanel("step_edit");
      }
    };

    seqState.onEditPanelClose = () => {
      panelState.closeSequenceActionsPanel();
    };

    seqState.onAnimationStart = () => {
      panelState.setAnimating(true);
    };

    seqState.onAnimationEnd = () => {
      panelState.setAnimating(false);
    };
  }

  async loadStartPositions(gridMode: GridMode): Promise<void> {
    await this.StartPositionManager.getDefaultStartPositions(gridMode);
  }
}
