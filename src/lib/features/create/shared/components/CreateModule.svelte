<script lang="ts">
  import { bootProfiler } from "$lib/shared/analytics/boot-profiler";
  // get-create-module-initializer (64-file subtree) and get-extension-flow-coordinator
  // (10-file subtree) are imported dynamically at their only call sites (onMount /
  // LOOP action) so they stay OUT of the Create module's eager first-paint graph.
  // See scripts/trace-create-three.cjs. getLibraryRepository stays static — it's
  // read synchronously by a context getter children rely on.
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";

  /**
   * CreateModule.svelte - COMPOSITION ROOT
   *
   * ============================================================================
   * FOR AI AGENTS: DO NOT DECONSTRUCT THIS FILE FURTHER
   * ============================================================================
   *
   * This is a COMPOSITION ROOT - its job is to wire dependencies together.
   * The ~700 line count is intentional and appropriate because:
   *
   * 1. Composition roots import many dependencies (that's their purpose)
   * 2. They wire services, create state, set up contexts
   * 3. They coordinate initialization and cleanup
   * 4. They contain NO business logic - only glue code
   *
   * What belongs here:
   * - DI service resolution
   * - State object creation
   * - Context registration
   * - Effect coordinator setup
   * - Simple event handler wiring
   * - Child component composition
   *
   * What does NOT belong here (extract to services/managers):
   * - Business logic → move to services
   * - Complex effect logic → move to Manager files in state/managers/
   * - Handlers > 10 lines → move to CreateModuleHandlers
   * - State mutation logic → move to state operations
   *
   * See: docs/architecture/create-module-composition-root.md
   *
   * Domain: Create module - Composition Root
   */

  import { settingsService as settingsServiceSingleton } from "$lib/shared/settings/state/settings-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { createComponentLogger } from "$lib/shared/utils/debug-logger";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
  import { handleSectionChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
  import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { setSideBySideLayout } from "$lib/shared/application/state/animation-visibility-state.svelte";
  import { onMount, setContext, tick } from "svelte";
  import ErrorBanner from "./ErrorBanner.svelte";
  import type { CreateModuleOrchestrators } from "../types/create-module-services";
  import type { CreateModuleInitializer } from "../services/create-module-initializer";
  import type { CreateModuleHandlers } from "../services/create-module-handlers";
  import type { CreateModuleEffectCoordinator } from "../services/create-module-effect-coordinator";
  import type { PanelPersister } from "../services/panel-persister.svelte";
  import type { createCreateModuleState as CreateModuleStateType } from "../state/create-module-state.svelte";
  import type { createConstructTabState as ConstructTabStateType } from "../state/construct-tab-state.svelte";
  import { createPanelCoordinationState } from "../state/panel-coordination-state.svelte";
  import { setCreateModuleStateRef } from "$lib/shared/create/state/create-module-state-ref.svelte";
  import type { IToolPanelMethods } from "../types/create-module-types";
  import TransferConfirmDialog from "./TransferConfirmDialog.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import StandardWorkspaceLayout from "./StandardWorkspaceLayout.svelte";
  import CreateFrontDoor from "./CreateFrontDoor.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { setCreateModuleContext } from "../context/create-module-context";
  import LOOPCoordinator from "./coordinators/LOOPCoordinator.svelte";
  import StartEndCoordinator from "./coordinators/StartEndCoordinator.svelte";
  import SequenceDrawerLauncher from "./coordinators/SequenceDrawerLauncher.svelte";
  // Deferred (loaded on first open via LazyMount) — keeps their ~110-file
  // dependency subtrees out of the Create module's eager first-paint graph.
  // See scripts/trace-create-three.cjs for the deferral analysis.
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import IndeterminateBar from "$lib/shared/components/loading/IndeterminateBar.svelte";
  import { SessionManager } from "../services/session-manager.svelte";
  import { Autosaver } from "../services/autosaver";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    featureFlagService,
    featureFlagState,
  } from "$lib/shared/auth/services/post-hog-feature-flag-service.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { appEntryState } from "$lib/shared/onboarding/state/app-entry-state.svelte";
  import { resolveAccessTier } from "$lib/shared/auth/domain/access-tier";
  import { isPremiumOrAbove } from "$lib/shared/auth/domain/models/user-role";
  import { isTabAccessible } from "$lib/shared/auth/domain/guest-access-config";
  import { createPanelHeightTracker } from "../state/managers/panel-height-tracker.svelte";
  import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import { formatLOOPTypeForDisplay } from "$lib/shared/create/services/loop-type-utils";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { UndoOperationType } from "../services/undo-manager";
  import PropUnlockCelebration from "$lib/shared/gamification/components/PropUnlockCelebration.svelte";
  import { getPropUnlockManager } from "$lib/shared/gamification/get-prop-unlock-manager";
  import { createConstructTutorialState } from "../../construct/tutorial/state/construct-tutorial-state.svelte";
  import { logConstructOptionApplied } from "../../construct/services/construct-analytics";
  import { tryGetAccountSetupContext } from "$lib/shared/onboarding/context/account-setup-context";
  import {
    createSequenceTransformActionDispatcher,
    type SequenceTransformActionDispatcher,
  } from "../services/sequence-transform-action-dispatcher";
  import { setGridRotationDirection } from "$lib/shared/pictograph/grid/state/grid-rotation-state.svelte";

  const logger = createComponentLogger("CreateModule");
  const accountSetupState = tryGetAccountSetupContext();

  type CreateModuleState = ReturnType<typeof CreateModuleStateType>;
  type ConstructTabState = ReturnType<typeof ConstructTabStateType>;

  let {
    onTabAccessibilityChange,
    onCurrentWordChange,
  }: {
    onTabAccessibilityChange?: (canAccessEditAndExport: boolean) => void;
    onCurrentWordChange?: (word: string) => void;
  } = $props();

  // SERVICES & STATE (Resolved via DI)
  let services: CreateModuleOrchestrators | null = $state(null);
  let handlers: CreateModuleHandlers | null = $state(null);
  let effectCoordinator: CreateModuleEffectCoordinator | null = $state(null);
  let deepLinkService: any = $state(null);
  let panelPersistenceService: PanelPersister | null = $state(null);
  let CreateModuleState: CreateModuleState | null = $state(null);
  let constructTabState: ConstructTabState | null = $state(null);
  let sequenceTransformActions: SequenceTransformActionDispatcher | null = null;

  // Session management services
  let sessionManager: SessionManager | null = $state(null);
  let autosaver: Autosaver | null = $state(null);

  // Settings service for user preferences
  let settingsService: SettingsState | null = $state(null);

  let panelState = createPanelCoordinationState();
  const constructTutorialState = createConstructTutorialState();
  let animatingStepNumber = $state<number | null>(null);
  let shouldUseSideBySideLayout = $state<boolean>(false);
  let error = $state<string | null>(null);
  let servicesInitialized = $state<boolean>(false);
  let initProgress = $state<string>("");

  // Confirmation dialog states
  let showTransferConfirmation = $state(false);
  let showClearSequenceConfirm = $state(false);

  // Auth/tier state for step cap enforcement
  const accessTier = $derived(
    resolveAccessTier(
      authState.isAuthenticated,
      authState.isAnonymous,
      isPremiumOrAbove(authState.role)
    )
  );
  const availableCreateMethods = $derived.by(() => {
    // Establish the same reactive flag dependency as the navigation surfaces.
    void featureFlagState.flagsVersion;
    return CREATE_TABS.filter(
      (tab) =>
        tab.metadata?.isCreationMethod === true &&
        featureFlagService.canAccessTab("create", tab.id) &&
        isTabAccessible("create", tab.id, accessTier)
    );
  });
  const lastUsedCreateMode = $derived(
    navigationState.hasRememberedCreateMode
      ? navigationState.currentCreateMode
      : null
  );
  // Only guests get a step-cap ask — straight to the auth screen, whose
  // contextual copy carries the why; no intermediate nudge (Austen,
  // 2026-08-10). Logged-in users are hard-capped at 64 with no upsell, so the
  // cap applies silently. (The paid Scribe tier is shelved until there's a plan.)
  function showStepCapGate() {
    if (accessTier === "guest") {
      authDrawerState.show(
        "signup",
        "step-cap-guest",
        CreateModuleState?.sequenceState.currentSequence?.id
      );
    }
  }

  // LOOP completion state
  let showLoopConfirm = $state(false);
  let pendingLoopType = $state<LOOPType | null>(null);
  let isApplyingLoop = $state(false);
  let pendingLoopStepCount = $state(0);
  let pendingLoopComponentName = $state("");
  let isMobile = $state(false);
  let sequenceToTransfer: PictographData[] | null = $state(null);
  let toolPanelElement: HTMLElement | null = $state(null);
  let toolPanelRef: IToolPanelMethods | null = $state(null);
  let buttonPanelElement: HTMLElement | null = $state(null);
  let effectCleanup: (() => void) | null = null;
  let panelPersistenceCleanup: (() => void) | undefined = undefined;
  let panelHeightTrackerCleanup: (() => void) | null = null;
  let currentDisplayWord = $state<string>(""); // Current word with contextual messages
  let currentLetterSources = $state<LetterSource[] | null>(null); // Letter sources for spell tab styling
  let isInputMode = $state(false); // Input mode - collapse workspace when word input is focused on mobile
  const canShowSaveToLibraryPanel = $derived(
    CreateModuleState?.isPersistenceInitialized === true &&
      CreateModuleState.canShowActionButtons()
  );

  setContext("panelState", panelState);

  const layoutContext = {
    get shouldUseSideBySideLayout() {
      return shouldUseSideBySideLayout;
    },
    isMobilePortrait() {
      return services?.layoutService?.isMobilePortrait() ?? false;
    },
    get isInputMode() {
      return isInputMode;
    },
    setInputMode(mode: boolean) {
      isInputMode = mode;
    },
  };

  setCreateModuleContext({
    get CreateModuleState() {
      if (!CreateModuleState) {
        throw new Error("CreateModuleState not yet initialized");
      }
      return CreateModuleState;
    },
    get constructTabState() {
      if (!constructTabState) {
        throw new Error("constructTabState not yet initialized");
      }
      return constructTabState;
    },
    constructTutorialState,
    panelState,
    getSequenceTransformActions: () => sequenceTransformActions,
    get services() {
      if (!services) {
        throw new Error("Services not yet initialized");
      }
      return services;
    },
    get sessionManager() {
      return sessionManager;
    },
    get autosaver() {
      return autosaver;
    },
    get libraryRepository() {
      return getLibraryRepository() ?? null;
    },
    layout: layoutContext,
    handlers: {
      onError: (err: string) => {
        error = err;
      },
      requestClearSequence: () => handleClearSequence(),
    },
  });

  let entryTutorialWasActive = false;
  let tutorialWorkspacePrepared = false;
  let restoreTutorialAfterViewerCloses = false;

  function syncConstructWorkspaceUi(): void {
    if (!constructTabState?.sequenceState) {
      return;
    }

    const startPosition = constructTabState.sequenceState.selectedStartPosition;

    constructTabState.setSelectedStartPosition(startPosition);
    if (startPosition) {
      constructTabState.startPositionStateService.setSelectedPosition(
        startPosition
      );
    } else {
      constructTabState.startPositionStateService.clearSelectedPosition();
    }
    constructTabState.syncPickerStateWithSequence();
  }

  function prepareTutorialWorkspace(): void {
    if (tutorialWorkspacePrepared || !CreateModuleState) {
      return;
    }

    tutorialWorkspacePrepared = true;
    CreateModuleState.beginTutorialWorkspace();
    syncConstructWorkspaceUi();
  }

  function finishTutorialWorkspace(): void {
    if (!tutorialWorkspacePrepared || !CreateModuleState) {
      return;
    }

    CreateModuleState.finishTutorialWorkspace();
    syncConstructWorkspaceUi();
    tutorialWorkspacePrepared = false;
    restoreTutorialAfterViewerCloses = false;
  }

  $effect(() => {
    const entryTutorialIsActive = appEntryState.isCreateTutorial();
    const tutorialIsReady =
      entryTutorialIsActive &&
      CreateModuleState?.isPersistenceInitialized === true;

    if (tutorialIsReady && !tutorialWorkspacePrepared) {
      constructTutorialState.start();
      prepareTutorialWorkspace();
    } else if (!entryTutorialIsActive && entryTutorialWasActive) {
      const viewerOwnsCompletedTutorial =
        constructTutorialState.status === "completed" &&
        panelState.isExportPanelOpen;

      if (viewerOwnsCompletedTutorial) {
        restoreTutorialAfterViewerCloses = true;
      } else {
        finishTutorialWorkspace();
        constructTutorialState.reset();
      }
    }

    entryTutorialWasActive = entryTutorialIsActive;
  });

  $effect(() => {
    if (
      constructTutorialState.status === "dismissed" &&
      appEntryState.isCreateTutorial()
    ) {
      finishTutorialWorkspace();
      appEntryState.skipToComplete();
    } else if (
      constructTutorialState.status === "completed" &&
      appEntryState.isCreateTutorial()
    ) {
      if (panelState.isExportPanelOpen) {
        restoreTutorialAfterViewerCloses = true;
      } else {
        finishTutorialWorkspace();
      }
      toast.success("Construct guide complete");
      appEntryState.completeEntry();
    }
  });

  $effect(() => {
    if (restoreTutorialAfterViewerCloses && !panelState.isExportPanelOpen) {
      finishTutorialWorkspace();
      constructTutorialState.reset();
    }
  });

  function setupEffectCoordinator(): void {
    if (!effectCoordinator || !services) return;

    if (effectCleanup) {
      effectCleanup();
      effectCleanup = null;
    }

    effectCleanup = effectCoordinator.setupEffects({
      getCreateModuleState: () => CreateModuleState,
      getConstructTabState: () => constructTabState,
      panelState,
      navigationState,
      layoutService: services.layoutService,
      NavigationSyncer: services.NavigationSyncer,
      getDeepLinker: () => deepLinkService,
      getStepOperator: () => services?.StepOperator ?? null,
      getAutosaver: () => autosaver,
      isServicesInitialized: () => servicesInitialized,
      onLayoutChange: (layout) => {
        shouldUseSideBySideLayout = layout;
        setSideBySideLayout(layout);
      },
      getShouldUseSideBySideLayout: () => shouldUseSideBySideLayout,
      setAnimatingStepNumber: (step) => {
        animatingStepNumber = step;
      },
      onCurrentWordChange: (word: string) => {
        currentDisplayWord = word;
        onCurrentWordChange?.(word);
      },
      onLetterSourcesChange: (sources: LetterSource[] | null) => {
        currentLetterSources = sources;
      },
      onTabAccessibilityChange,
      // NOTE: Panel height tracking moved to separate $effect in CreateModule
      // because element bindings happen AFTER onMount completes
    });
  }

  onMount(() => {
    bootProfiler.milestone("create:mounted");
    const finishActivation = bootProfiler.startSpan("create:activation");
    let checkIsMobile: (() => void) | null = null;

    // Hydrate the prop-unlock collection on entry so the redemption badge and
    // celebration reflect the user's pending picks immediately.
    void getPropUnlockManager().load();

    // Run async initialization in an IIFE
    (async () => {
      // Track if a deep link was processed (declared once for entire async scope)
      let hasDeepLink = false;

      try {
        const initStart = performance.now();
        initProgress = "Resolving services...";
        const { getCreateModuleInitializer } = await bootProfiler.measureAsync(
          "create:initializer-import",
          () =>
            import("$lib/features/create/shared/get-create-module-initializer")
        );
        const initService = getCreateModuleInitializer();

        initProgress = "Initializing workspace...";
        const result = await bootProfiler.measureAsync(
          "create:initialize",
          () => initService.initialize()
        );
        logger.log(
          `Create init took ${Math.round(performance.now() - initStart)}ms`
        );

        // Extract all services and state from initialization result
        services = {
          sequenceService: result.sequenceService,
          SequencePersister: result.SequencePersister,
          StartPositionManager: result.StartPositionManager,
          CreateModuleOrchestrator: result.CreateModuleOrchestrator,
          layoutService: result.layoutService,
          NavigationSyncer: result.NavigationSyncer,
          StepOperator: result.StepOperator,
          shareService: result.shareService,
        };

        CreateModuleState = result.CreateModuleState;
        constructTabState = result.constructTabState;

        // Extract UI coordination services from result (no manual resolution needed)
        handlers = result.handlers;
        effectCoordinator = result.effectCoordinator;
        deepLinkService = result.deepLinkService;
        panelPersistenceService = result.panelPersistenceService;

        // Ensure state is initialized before setting reference
        if (!CreateModuleState || !constructTabState) {
          throw new Error(
            "Failed to initialize CreateModuleState or constructTabState"
          );
        }

        sequenceTransformActions = createSequenceTransformActionDispatcher({
          getSequenceState: () =>
            CreateModuleState?.getActiveTabSequenceState() ?? null,
          getCreateMode: () => navigationState.activeTab,
          pushUndoSnapshot: (type) => CreateModuleState?.pushUndoSnapshot(type),
          hapticService: getHapticFeedback(),
          setGridRotationDirection,
        });

        // Set global reference for keyboard shortcuts
        setCreateModuleStateRef({
          CreateModuleState,
          constructTabState,
          panelState,
          executeSequenceAction: (action, options) =>
            sequenceTransformActions!.execute(action, options),
          requestClearSequence: () => handleClearSequence(),
        });

        servicesInitialized = true;

        // Resolve settings service for user preferences
        settingsService = settingsServiceSingleton;

        // Wire LOOP completion callback so the workspace header can trigger the flow
        panelState.setLoopCompletionCallback(handleLoopCompletionRequest);

        initService.configureEventCallbacks(
          CreateModuleState,
          panelState,
          (sequence, stepNumber) => {
            logConstructOptionApplied({ stepNumber });
            constructTutorialState.recordOptionApplied({
              stepNumber,
              letter: sequence.steps[stepNumber - 1]?.letter ?? null,
            });
          }
        );

        // Start panel persistence tracking (handles navigation changes, panel close detection)
        panelPersistenceCleanup = panelPersistenceService?.startTracking({
          panelState,
          canRestorePanels: () => CreateModuleState?.canAccessEditTab ?? false,
        });

        // The coordinator can mark the current draft dirty while persistence is
        // restoring, so give it the autosaver before any effects begin.
        autosaver = new Autosaver();

        // Start effect coordinator (manages all reactive effects)
        setupEffectCoordinator();

        // Load sequence from deep link or pending edit, then initialize persistence
        await tick(); // Ensure DOM is ready
        const loadResult = await bootProfiler.measureAsync(
          "create:restore-sequence",
          () =>
            initService.loadSequenceAndInitializePersistence(
              (sequence: any) =>
                CreateModuleState!.sequenceState.setCurrentSequence(sequence),
              () => CreateModuleState!.initializeWithPersistence()
            )
        );

        if (loadResult.sequenceLoaded) {
          // Navigate to target tab if specified (deep link only)
          if (loadResult.targetTab) {
            navigationState.setActiveTab(loadResult.targetTab);
          }

          // A deep-linked sequence already carries its start position. Bring
          // Construct's picker state into line with that sequence immediately,
          // otherwise the workspace asks for a start position the user has
          // already chosen and hides the available next pictographs.
          syncConstructWorkspaceUi();

          hasDeepLink = true;
        }

        // A browser/WebContent reload resumes the same draft and analytics
        // session. Explicitly loaded work gets a fresh identity instead.
        const sessionStart = await bootProfiler.measureAsync(
          "create:resolve-session",
          () => autosaver!.resolveSessionForStart(!loadResult.sequenceLoaded)
        );
        sessionManager = new SessionManager(sessionStart.sessionId);
        if (sessionStart.recovered) {
          try {
            await bootProfiler.measureAsync(
              "create:restore-session-metadata",
              () => sessionManager!.loadSession(sessionStart.sessionId)
            );
          } catch (sessionError) {
            logger.warn(
              "[CreateModule] Existing session metadata could not be restored:",
              sessionError
            );
          }
        }

        // The first non-empty autosave creates or resumes the Firestore session.
        // Opening and closing an untouched workspace leaves no empty cloud record.
        autosaver.startAutosave(
          () =>
            CreateModuleState?.isTutorialWorkspaceIsolated
              ? null
              : CreateModuleState?.sequenceState.currentSequence || null,
          sessionStart.sessionId,
          30000,
          (sequence) =>
            sessionManager?.recordAutosave(sequence.steps.length, sequence.name)
        );

        logger.success("Autosave started");
        logger.success("CreateModule initialized successfully");
        bootProfiler.milestone("create:workspace-initialized");

        // Restore previously open panel if returning to create module
        // Only restore if no deep link was processed (deep link takes priority)
        // AND there's actually a sequence to work with (canAccessEditTab)
        // AND the panel is supported for the current tab
        if (!hasDeepLink && CreateModuleState.canAccessEditTab) {
          const currentTab = navigationState.activeTab;
          const savedPanel = navigationState.getLastPanelForTab(
            "create",
            currentTab
          );
          if (
            savedPanel &&
            panelPersistenceService?.isPanelSupportedForTab(
              savedPanel as any,
              currentTab
            )
          ) {
            logger.log(
              `Restoring saved panel "${savedPanel}" for tab "create:${currentTab}"`
            );
            await tick();
            panelPersistenceService?.restoreSavedPanel(
              panelState,
              savedPanel as any
            );
          }
        }

        // First-time guided-build offer: only when the user landed on an empty
        // Create (no deep link, no restored work). isWorkspaceEmpty() counts a
        // start-position-only sequence as non-empty, so a guest who began a
        // build isn't interrupted. Skippable and self-suppressing after the
        // first decision (appEntryState persists it).
        if (!hasDeepLink && CreateModuleState.isWorkspaceEmpty()) {
          appEntryState.offerCreateTutorial();
        }

        // Detect if we're on mobile for responsive dialog rendering
        checkIsMobile = () => {
          isMobile = window.innerWidth < 768;
        };
        checkIsMobile();
        window.addEventListener("resize", checkIsMobile);
        finishActivation();
      } catch (err) {
        finishActivation("error");
        error =
          err instanceof Error
            ? err.message
            : "Failed to initialize CreateModule";
        console.error("CreateModule: Initialization error:", err);
      }
    })();

    // Return cleanup function synchronously (required for Svelte 5 onMount)
    return () => {
      finishActivation("cancelled");
      finishTutorialWorkspace();

      if (checkIsMobile) {
        window.removeEventListener("resize", checkIsMobile);
      }
      setCreateModuleStateRef(null);
      sequenceTransformActions = null;

      // Cleanup effect coordinator
      if (effectCleanup) {
        effectCleanup();
        effectCleanup = null;
      }

      // Cleanup panel persistence tracking
      if (panelPersistenceCleanup) {
        panelPersistenceCleanup();
        panelPersistenceCleanup = undefined;
      }

      // Cleanup panel height tracker
      if (panelHeightTrackerCleanup) {
        panelHeightTrackerCleanup();
        panelHeightTrackerCleanup = null;
      }

      // Cleanup session management
      autosaver?.stopAutosave();
      if (sessionManager?.getCurrentSession()) {
        void sessionManager.abandonSession().catch((sessionError) => {
          logger.warn("[CreateModule] Session cleanup failed:", sessionError);
        });
      }
    };
  });

  // ============================================================================
  // EVENT HANDLERS (Delegated to Services)
  // ============================================================================
  async function handleOptionSelected(option: PictographData): Promise<void> {
    if (panelState.workspacePlayback) return;
    if (!handlers) {
      error = "Handlers service not initialized";
      return;
    }

    // Enforce tier step cap before adding a new step to the sequence
    const currentSteps =
      CreateModuleState?.sequenceState.getCurrentSteps().length ?? 0;
    const maxSteps = authDrawerState.guestEncore.maxSteps(
      accessTier,
      CreateModuleState?.sequenceState.currentSequence?.id
    );
    if (currentSteps >= maxSteps) {
      showStepCapGate();
      return;
    }

    try {
      await handlers.handleOptionSelected(option);
      if (!appEntryState.isCreateTutorial()) {
        accountSetupState?.requestReminder();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to select option";
    }
  }

  function clearError() {
    error = null;
  }

  function handleCreateMethodSelected(methodId: string): void {
    handleSectionChange(methodId);
  }

  function handleOpenExportPanel() {
    if (!handlers) return;
    handlers.handleOpenExportPanel(panelState);
  }

  function handleClearSequence() {
    if (!handlers || !CreateModuleState || !constructTabState) return;

    // Skip confirmation if user has opted out (undo is always available)
    if (settingsService?.currentSettings?.skipClearConfirmation) {
      confirmClearSequence();
      return;
    }

    // Show confirmation dialog
    showClearSequenceConfirm = true;
  }

  async function confirmClearSequence() {
    if (!handlers || !CreateModuleState || !constructTabState) return;

    try {
      await handlers.handleClearSequence({
        CreateModuleState,
        constructTabState,
        panelState,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to clear sequence";
    } finally {
      showClearSequenceConfirm = false;
    }
  }

  function cancelClearSequence() {
    showClearSequenceConfirm = false;
  }

  function handleSkipClearConfirmationChange(checked: boolean) {
    if (checked && settingsService) {
      settingsService.updateSetting("skipClearConfirmation", true);
    }
  }

  // ============================================================================
  // LOOP COMPLETION HANDLERS
  // ============================================================================
  async function handleLoopCompletionRequest(loopType: LOOPType) {
    if (!CreateModuleState) return;

    const { getExtensionFlowCoordinator } =
      await import("$lib/features/create/shared/get-extension-flow-coordinator");
    const extensionFlowCoordinator = getExtensionFlowCoordinator();
    if (!extensionFlowCoordinator) return;

    const activeSeqState = CreateModuleState.getActiveTabSequenceState();
    const sequence = activeSeqState?.currentSequence;
    if (!sequence) return;

    pendingLoopComponentName = formatLOOPTypeForDisplay(loopType);

    const result = await extensionFlowCoordinator.startFlow(sequence);
    if (!result.canExtend || !result.analysis) {
      toast.warning("Cannot complete this LOOP");
      return;
    }

    const currentLen = sequence.steps?.length ?? 0;
    const extensionType = result.analysis.extensionType;
    if (extensionType === "half_rotation") {
      pendingLoopStepCount = currentLen;
    } else if (extensionType === "quarter_rotation") {
      pendingLoopStepCount = currentLen * 3;
    } else {
      pendingLoopStepCount = currentLen;
    }

    pendingLoopType = loopType;

    if (settingsService?.currentSettings?.skipLoopConfirmation) {
      confirmLoopCompletion();
      return;
    }

    showLoopConfirm = true;
  }

  async function confirmLoopCompletion() {
    if (!pendingLoopType || isApplyingLoop || !CreateModuleState) return;

    const { getExtensionFlowCoordinator } =
      await import("$lib/features/create/shared/get-extension-flow-coordinator");
    const extensionFlowCoordinator = getExtensionFlowCoordinator();
    if (!extensionFlowCoordinator) return;

    const activeSeqState = CreateModuleState.getActiveTabSequenceState();
    const sequence = activeSeqState?.currentSequence;
    if (!sequence) return;

    isApplyingLoop = true;
    showLoopConfirm = false;

    CreateModuleState.pushUndoSnapshot(UndoOperationType.EXTEND_SEQUENCE);

    const result = await extensionFlowCoordinator.applyLoop(
      sequence,
      pendingLoopType
    );

    if (result.success && result.sequence) {
      activeSeqState.setCurrentSequence(result.sequence);
      const hapticService = getHapticFeedback();
      hapticService?.trigger("success");
      toast.success(result.message);
    } else {
      const hapticService = getHapticFeedback();
      hapticService?.trigger("error");
      toast.warning(result.message);
    }

    isApplyingLoop = false;
    pendingLoopType = null;
  }

  function cancelLoopCompletion() {
    showLoopConfirm = false;
    pendingLoopType = null;
  }

  function handleSkipLoopConfirmationChange(checked: boolean) {
    if (checked && settingsService) {
      settingsService.updateSetting("skipLoopConfirmation", true);
    }
  }

  function handleOpenFilterPanel() {
    if (!handlers) return;
    handlers.handleOpenFilterPanel(panelState);
  }

  /**
   * Transfer sequence to Constructor workspace
   */
  async function transferSequenceToConstructor(sequence: any) {
    if (!services || !CreateModuleState) return;

    try {
      // Save the sequence to Constructor's localStorage key
      await services.SequencePersister.saveCurrentState({
        currentSequence: sequence,
        selectedStartPosition: sequence.steps[0] || null,
        hasStartPosition: sequence.steps.length > 0,
        activeBuildSection: "construct",
      });

      // Switch to Construct tab
      navigationState.setActiveTab("construct");
    } catch (error) {
      console.error("❌ Failed to transfer sequence to Constructor:", error);
    }
  }

  /**
   * Handle confirmation of sequence transfer
   */
  async function handleConfirmTransfer() {
    if (!sequenceToTransfer || !CreateModuleState) return;

    const currentSequence = CreateModuleState.sequenceState.currentSequence;
    if (currentSequence) {
      await transferSequenceToConstructor(currentSequence);
    }

    // Reset state
    showTransferConfirmation = false;
    sequenceToTransfer = null;
  }

  /**
   * Handle cancellation of sequence transfer
   */
  function handleCancelTransfer() {
    showTransferConfirmation = false;
    sequenceToTransfer = null;
  }

  // ============================================================================
  // PANEL HEIGHT TRACKER (Separate from effect coordinator to handle timing)
  // ============================================================================
  /**
   * Set up panel height tracker when elements become available.
   *
   * This runs in a separate $effect because toolPanelElement and buttonPanelElement
   * are bound AFTER onMount completes (element bindings happen after first render).
   *
   * The effect coordinator runs during onMount's async initialization, when elements
   * are still null, so we need to watch for when they become available.
   */
  $effect(() => {
    // Clean up previous tracker if it exists
    if (panelHeightTrackerCleanup) {
      panelHeightTrackerCleanup();
      panelHeightTrackerCleanup = null;
    }

    // Only set up tracker if at least one element is available
    if (toolPanelElement || buttonPanelElement) {
      panelHeightTrackerCleanup = createPanelHeightTracker({
        toolPanelElement,
        buttonPanelElement,
        panelState,
        // Playback owns the workspace while the tools collapse. Keeping their
        // viewport metrics current during that motion invalidates every overlay
        // for a panel the user cannot see.
        isToolPanelVisible: () => !panelState.workspacePlayback,
      });
    }
  });

  $effect(() => {
    if (
      CreateModuleState?.isPersistenceInitialized === true &&
      !CreateModuleState.canShowActionButtons() &&
      panelState.isSaveToLibraryPanelOpen
    ) {
      panelState.closeSaveToLibraryPanel();
    }
  });
</script>

{#snippet frontDoorSurface()}
  <CreateFrontDoor
    methods={availableCreateMethods}
    active={navigationState.isCreateFrontDoorOpen}
    source={navigationState.createFrontDoorSource}
    lastUsedMode={lastUsedCreateMode}
    onSelect={handleCreateMethodSelected}
  />
{/snippet}

{#snippet workspaceSurface()}
  <div class="create-workspace-source">
    <div class="create-workspace-body">
      {#if error}
        <ErrorBanner message={error} onDismiss={clearError} />
      {:else if CreateModuleState && constructTabState && services}
        <div class="create-tab">
          <StandardWorkspaceLayout
            {shouldUseSideBySideLayout}
            {CreateModuleState}
            {panelState}
            {currentDisplayWord}
            {currentLetterSources}
            {isInputMode}
            bind:animatingStepNumber
            bind:toolPanelRef
            bind:buttonPanelElement
            bind:toolPanelElement
            onClearSequence={handleClearSequence}
            onViewSequence={handleOpenExportPanel}
            onOptionSelected={handleOptionSelected}
            onOpenFilters={handleOpenFilterPanel}
            onCloseFilters={() => {
              panelState.closeFilterPanel();
            }}
          />
        </div>

        <!-- Video Record Coordinator (deferred until first opened) -->
        <LazyMount
          loader={() => import("./coordinators/VideoRecordCoordinator.svelte")}
          active={panelState.isVideoRecordPanelOpen}
        />

        <!-- Always-mounted launcher (light): owns deep-link open + view-sequence redirect.
       The heavy export/animation drawer host loads when requested. -->
        <SequenceDrawerLauncher />
        <LazyMount
          loader={() => import("./coordinators/SequenceDrawerHost.svelte")}
          active={panelState.isExportPanelOpen}
        />

        <!-- Sequence Actions Coordinator (deferred until first opened) -->
        <LazyMount
          loader={() =>
            import("./coordinators/SequenceActionsCoordinator.svelte")}
          active={panelState.isSequenceActionsPanelOpen}
        />

        <!-- Step Editor Coordinator - Opens when clicking a pictograph (deferred until first opened) -->
        <LazyMount
          loader={() => import("./coordinators/StepEditorCoordinator.svelte")}
          active={panelState.isStepEditorPanelOpen}
        />

        <!-- LOOP Coordinator -->
        <LOOPCoordinator />

        <!-- Start/End Options Coordinator -->
        <StartEndCoordinator />

        <!-- Save to Library Panel - Rendered at root level to avoid stacking context
       issues. Deferred until first opened; keep-alive preserves close animation. -->
        <LazyMount
          loader={() => import("./SaveToLibraryPanel.svelte")}
          active={panelState.isSaveToLibraryPanelOpen &&
            canShowSaveToLibraryPanel}
          props={{
            show:
              panelState.isSaveToLibraryPanelOpen && canShowSaveToLibraryPanel,
            word: currentDisplayWord,
            onClose: () => panelState.closeSaveToLibraryPanel(),
          }}
        />

        <!-- Sequence Transfer Confirmation Dialog -->
        <TransferConfirmDialog
          bind:isOpen={showTransferConfirmation}
          {isMobile}
          onConfirm={handleConfirmTransfer}
          onCancel={handleCancelTransfer}
        />

        <!-- Clear Sequence Confirmation Dialog -->
        <ConfirmDialog
          bind:isOpen={showClearSequenceConfirm}
          title="Clear Sequence?"
          message="This will remove all steps and the start position. Use undo to restore if needed."
          confirmText="Clear All"
          cancelText="Keep"
          variant="danger"
          showDontAskAgain={true}
          ghostConfirm={true}
          onConfirm={confirmClearSequence}
          onCancel={cancelClearSequence}
          onDontAskAgainChange={handleSkipClearConfirmationChange}
        />

        <!-- LOOP Completion Confirmation Dialog -->
        <ConfirmDialog
          bind:isOpen={showLoopConfirm}
          title="Apply {pendingLoopComponentName} LOOP?"
          message="This will add {pendingLoopStepCount} steps to your sequence."
          confirmText="Apply"
          cancelText="Cancel"
          variant="info"
          showDontAskAgain={true}
          onConfirm={confirmLoopCompletion}
          onCancel={cancelLoopCompletion}
          onDontAskAgainChange={handleSkipLoopConfirmationChange}
        />

        <!-- Prop unlock celebration - opens on milestone or via the prop-button
       redemption badge; renders above module content at the module root. -->
        <PropUnlockCelebration />
      {:else}
        <!-- Loading state while async initialization completes -->
        <div class="create-tab create-loading">
          <IndeterminateBar height={3} position="top" />
          {#if initProgress}
            <p class="init-status">{initProgress}</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<div class="create-module-stage">
  <DualSourceCrossfade
    active={navigationState.isCreateFrontDoorOpen ? "first" : "second"}
    first={frontDoorSurface}
    second={workspaceSurface}
    duration={DURATION.emphasis}
  />
</div>

<style>
  .create-module-stage,
  .create-workspace-source,
  .create-workspace-body {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .create-module-stage {
    overflow: hidden;
  }

  .create-workspace-source {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container-type: inline-size;
  }

  .create-workspace-body {
    flex: 1;
    height: auto;
    position: relative;
    overflow: hidden;
  }

  .create-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
    transition: background-color var(--duration-normal) ease-out;
  }

  .create-loading {
    align-items: center;
    justify-content: center;
  }

  .init-status {
    margin: 0;
    font-size: var(--font-size-sm, 13px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }
</style>
