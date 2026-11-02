<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { bootProfiler } from "#lib/shared/analytics/boot-profiler.js";
  // get-create-module-initializer (64-file subtree) and get-extension-flow-coordinator
  // (10-file subtree) are imported dynamically at their only call sites (onMount /
  // LOOP action) so they stay OUT of the Create module's eager first-paint graph.
  // See scripts/trace-create-three.cjs. getLibraryRepository stays static — it's
  // read synchronously by a context getter children rely on.
  import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";

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

  import { settingsService as settingsServiceSingleton } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { CREATE_TABS } from "#lib/shared/navigation/config/tab-definitions.js";
  import { handleSectionChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import type { BuildModeId } from "#lib/shared/foundation/ui/ui-types.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { setSideBySideLayout } from "#lib/shared/application/state/animation-visibility-state.svelte.js";
  import {
    bootScreenCovers,
    FIRST_VIEW_WAIT_MS,
    holdBootScreen,
    runAfterBootScreen,
  } from "#lib/shared/application/services/boot-screen.js";
  import { onMount, setContext, tick, untrack } from "svelte";
  import { goto, replaceState } from "$app/navigation";
  import ErrorBanner from "./ErrorBanner.svelte";
  import DraftRecovery from "./DraftRecovery.svelte";
  import { getSequencePersister } from "../get-sequence-persister";
  import {
    createDraftRecoveryController,
    draftMode,
    type DraftRecoveryController,
  } from "../state/create-module/draft-recovery-controller.svelte";
  import type { CreateModuleOrchestrators } from "../types/create-module-services";
  import type { CreateModuleInitializer } from "../services/create-module-initializer";
  import type { CreateModuleHandlers } from "../services/create-module-handlers";
  import type { CreateModuleEffectCoordinator } from "../services/create-module-effect-coordinator";
  import type { PanelPersister } from "../services/panel-persister.svelte";
  import type { createCreateModuleState as CreateModuleStateType } from "../state/create-module-state.svelte";
  import type { createConstructTabState as ConstructTabStateType } from "../state/construct-tab-state.svelte";
  import { createPanelCoordinationState } from "../state/panel-coordination-state.svelte";
  import { createMethodEntryState } from "../state/create-method-entry-state.svelte";
  import {
    CREATE_ENTRY_HOLD_CAP_MS,
    decideCreateEntrySource,
  } from "../services/create-method-entry-gate";
  import {
    isEntryLayerSettled,
    startCreateEntryTrace,
    type CreateEntryTrace,
  } from "../services/create-entry-trace";
  import {
    loadWorkspaceLayout as importWorkspaceLayout,
    warmCreateMethod,
    warmInIdleSequence,
    warmWorkspaceLayout,
  } from "./create-method-loaders";
  import { setCreateModuleStateRef } from "#lib/shared/create/state/create-module-state-ref.svelte.js";
  import type {
    IToolPanelMethods,
    OptionSelectedHandler,
  } from "../types/create-module-types";
  import TransferConfirmDialog from "./TransferConfirmDialog.svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import CreateFrontDoor from "./CreateFrontDoor.svelte";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { setCreateModuleContext } from "../context/create-module-context";
  import {
    createGridJoinController,
    setGridJoinContext,
  } from "#lib/shared/grid-join/grid-join-controller.js";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import LOOPCoordinator from "./coordinators/LOOPCoordinator.svelte";
  import StartEndCoordinator from "./coordinators/StartEndCoordinator.svelte";
  import SequenceDrawerLauncher from "./coordinators/SequenceDrawerLauncher.svelte";
  // Deferred (loaded on first open via LazyMount) — keeps their ~110-file
  // dependency subtrees out of the Create module's eager first-paint graph.
  // See scripts/trace-create-three.cjs for the deferral analysis.
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import IndeterminateBar from "#lib/shared/components/loading/IndeterminateBar.svelte";
  import { SessionManager } from "../services/session-manager.svelte";
  import { Autosaver } from "../services/autosaver";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    featureFlagService,
    featureFlagState,
  } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { appEntryState } from "#lib/shared/onboarding/state/app-entry-state.svelte.js";
  import {
    getMaxSteps,
    resolveAccessTier,
  } from "#lib/shared/auth/domain/access-tier.js";
  import { isPremiumOrAbove } from "#lib/shared/auth/domain/models/user-role.js";
  import {
    createPanelHeightTracker,
    type PanelHeightTrackerCleanup,
  } from "../state/managers/panel-height-tracker.svelte";
  import type { SettingsState } from "#lib/shared/settings/state/settings-state.svelte.js";
  import type { LetterSource } from "#lib/shared/create/domain/spell-models.js";
  import type { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import { loopTypeLabel } from "#lib/features/create/generate/components/loop-component-presentation.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { UndoOperationType, undoManager } from "../services/undo-manager";
  import PropUnlockCelebration from "#lib/shared/gamification/components/PropUnlockCelebration.svelte";
  import { getPropUnlockManager } from "#lib/shared/gamification/get-prop-unlock-manager.js";
  import { createConstructTutorialState } from "../../construct/tutorial/state/construct-tutorial-state.svelte";
  import { logConstructOptionApplied } from "../../construct/services/construct-analytics";
  import { tryGetAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import {
    createSequenceTransformActionDispatcher,
    type SequenceTransformActionDispatcher,
  } from "../services/sequence-transform-action-dispatcher";
  import { setGridRotationDirection } from "#lib/shared/pictograph/grid/state/grid-rotation-state.svelte.js";

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
  let draftRecovery: DraftRecoveryController | null = $state(null);
  let resolvingDraftRequest = $state(true);

  $effect(() => {
    if (!resolvingDraftRequest && !navigationState.isCreateFrontDoorOpen) {
      draftRecovery?.observeActiveMode();
    }
  });

  const autosaveMode = $derived(draftMode(navigationState.activeTab));
  const autosaveSessionId = $derived.by(() => draftRecovery?.status?.sessionId);
  const autosaveBlocked = $derived.by(() =>
    ["conflict", "recovery", "error"].includes(
      draftRecovery?.status?.status ?? "recovery"
    )
  );

  $effect(() => {
    const mode = autosaveMode;
    const sessionId = autosaveSessionId;
    const blocked = autosaveBlocked;
    const saver = autosaver;
    if (!mode || !saver || !sessionId) return;
    // Cloud/session tracking follows the same accepted local draft. A blocked
    // save must not publish an unresolved version under another draft's name.
    untrack(() => {
      saver.stopAutosave();
      if (blocked) return;
      if (sessionManager?.getSessionId() !== sessionId) {
        sessionManager = new SessionManager(sessionId);
      }
      saver.startAutosave(
        () =>
          CreateModuleState?.isTutorialWorkspaceIsolated
            ? null
            : (CreateModuleState?.getSequenceStateForTab(mode)
                .currentSequence ?? null),
        sessionId,
        30000,
        (sequence) =>
          sessionManager?.recordAutosave(sequence.steps.length, sequence.name)
      );
    });
    return () => saver.stopAutosave();
  });

  // Settings service for user preferences
  let settingsService: SettingsState | null = $state(null);

  let panelState = createPanelCoordinationState();
  const constructTutorialState = createConstructTutorialState();
  let animatingStepNumber = $state<number | null>(null);
  let shouldUseSideBySideLayout = $state<boolean>(false);
  let error = $state<string | null>(null);
  let servicesInitialized = $state<boolean>(false);
  let WorkspaceLayout = $state<
    (typeof import("./StandardWorkspaceLayout.svelte"))["default"] | null
  >(null);
  let workspaceLayoutError = $state<string | null>(null);
  let workspaceLayoutLoad: Promise<void> | null = null;

  // The layout's code can arrive while the front door is open, but the layout
  // itself mounts only once a workspace is wanted, so its panels never build
  // behind a board the visitor is still looking at.
  let workspaceWanted = $state(false);

  function loadWorkspaceLayout(): void {
    if (WorkspaceLayout || workspaceLayoutLoad) return;
    workspaceLayoutError = null;
    workspaceLayoutLoad = importWorkspaceLayout()
      .then(({ default: component }) => {
        WorkspaceLayout = component;
      })
      .catch((caught) => {
        console.error("CreateModule: Workspace layout failed to load:", caught);
        workspaceLayoutError = t("module_load_failed");
      })
      .finally(() => {
        workspaceLayoutLoad = null;
      });
  }

  // A direct method link loads its workspace alongside state restoration. The
  // front door gets its first paint before any editor code is requested.
  $effect(() => {
    if (!navigationState.isCreateFrontDoorOpen) {
      workspaceWanted = true;
      loadWorkspaceLayout();
    }
  });

  // While the board is open, warm what a tap will need: the layout, then the
  // method used last, then the other methods, in board order. One chunk per idle period, so the turning previews keep their
  // frames. A first visit has no last-used method, and a hover is far shorter
  // than a panel's fetch, so without the rest a newcomer's first tap would
  // still land on a spinner. Pointing at a card moves its method to the front
  // (warmCreateMethod via the board's onWarm).
  $effect(() => {
    if (!navigationState.isCreateFrontDoorOpen) return;
    const lastUsed = lastUsedCreateMode;
    const openable = releasedCreateMethods
      .map((method) => method.id)
      .filter((id) => id !== lastUsed);
    return untrack(() =>
      warmInIdleSequence([
        () => {
          loadWorkspaceLayout();
          return workspaceLayoutLoad ?? warmWorkspaceLayout();
        },
        ...[...(lastUsed ? [lastUsed] : []), ...openable].map(
          (id) => () => warmCreateMethod(id)
        ),
      ])
    );
  });

  // A tap on a method card keeps the board on screen until that method's
  // workspace has mounted and drawn, then crossfades once onto it.
  const methodEntry = createMethodEntryState();
  let entryTrace = $state.raw<CreateEntryTrace | null>(null);
  let entryCapReached = $state(false);
  let entryLayer = $state<HTMLElement | null>(null);

  const entryDecision = $derived.by(() => {
    void entryCapReached;
    const trace = entryTrace;
    return decideCreateEntrySource({
      doorOpen: navigationState.isCreateFrontDoorOpen,
      entering: trace !== null,
      panelReady: methodEntry.panelReady,
      picturesReady: methodEntry.picturesReady,
      elapsedMs: trace ? performance.now() - trace.tapAt : 0,
      capMs: CREATE_ENTRY_HOLD_CAP_MS,
    });
  });
  let enteredSource = $state<"door" | "workspace">("door");
  const crossfadeActive = $derived(
    entryDecision.source === "door" ? "first" : "second"
  );

  function beginMethodEntry(methodId: string): void {
    entryTrace?.cancel();
    methodEntry.begin(methodId);
    entryCapReached = false;
    entryTrace = startCreateEntryTrace(methodId, () => entryLayer);
  }

  // Timed from the tap, not from when this effect runs: mounting the workspace
  // can hold the thread for a few hundred milliseconds before effects flush.
  $effect(() => {
    const trace = entryTrace;
    if (!trace) return;
    const handle = setTimeout(
      () => (entryCapReached = true),
      Math.max(0, CREATE_ENTRY_HOLD_CAP_MS - (performance.now() - trace.tapAt))
    );
    return () => clearTimeout(handle);
  });

  $effect(() => {
    const trace = entryTrace;
    if (!trace) return;
    if (WorkspaceLayout && workspaceWanted) trace.stage("layout-ready");
    if (methodEntry.panelReady) trace.stage("panel-ready");
    if (methodEntry.picturesReady) trace.stage("pictures-ready");
  });

  // Once the panel is mounted, wait for the hidden layer to show the finished
  // method for two frames in a row: the frame that found it ready still has to
  // paint it.
  $effect(() => {
    const trace = entryTrace;
    const layer = entryLayer;
    if (!trace || !layer || !methodEntry.panelReady) return;
    let settledFrames = 0;
    let frame = requestAnimationFrame(function check() {
      settledFrames = isEntryLayerSettled(layer, trace.method)
        ? settledFrames + 1
        : 0;
      if (settledFrames >= 2) {
        methodEntry.markPicturesReady(trace.method);
        return;
      }
      frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    const decision = entryDecision;
    const trace = untrack(() => entryTrace);
    if (decision.source === "workspace" && enteredSource === "door") {
      trace?.swap(decision.cappedOut);
    }
    enteredSource = decision.source;
  });

  // Back on the board before the fade finished, the entry is abandoned.
  $effect(() => {
    if (navigationState.isCreateFrontDoorOpen) {
      untrack(() => {
        entryTrace?.cancel();
        entryTrace = null;
        methodEntry.finish();
      });
    }
  });

  function handleWorkspaceSettled(source: "first" | "second"): void {
    if (source !== "second" || !entryTrace) return;
    entryTrace.settled();
    entryTrace = null;
    methodEntry.finish();
  }

  // A visit that boots straight into a method keeps the boot screen up until
  // that method's panel and beat grid have mounted and drawn, the same
  // readiness a front-door tap waits for, so the screen hands over to a
  // finished workspace instead of a loading bar. Taken during init, before
  // ModuleRenderer releases its "module-view" hold, with the same first-view
  // wait.
  let bootEntryOpen = $state(false);
  let releaseBootEntryHold = (): void => {};
  let cancelBootEntryWatch = (): void => {};

  function finishBootEntry(): void {
    if (!bootEntryOpen) return;
    bootEntryOpen = false;
    releaseBootEntryHold();
    cancelBootEntryWatch();
    methodEntry.finish();
  }

  if (!navigationState.isCreateFrontDoorOpen && bootScreenCovers()) {
    bootEntryOpen = true;
    releaseBootEntryHold = holdBootScreen(
      "create-workspace",
      FIRST_VIEW_WAIT_MS
    );
    methodEntry.begin(navigationState.activeTab);
    // Capped out: the workspace finishes in view and its idle work resumes.
    cancelBootEntryWatch = runAfterBootScreen(() =>
      queueMicrotask(finishBootEntry)
    );
  }

  // A restored visit can settle on another method than the URL's first one.
  $effect(() => {
    const method = navigationState.activeTab;
    if (!bootEntryOpen) return;
    untrack(() => {
      if (method !== methodEntry.method) methodEntry.begin(method);
    });
  });

  // Nothing to wait for on the board, on an error, or once this unmounts.
  $effect(() => {
    if (
      bootEntryOpen &&
      (navigationState.isCreateFrontDoorOpen || error || workspaceLayoutError)
    ) {
      untrack(finishBootEntry);
    }
  });
  $effect(() => () => untrack(finishBootEntry));

  // Same two-frame check as a tap's entry: the frame that finds the method
  // drawn still has to paint it.
  $effect(() => {
    const layer = entryLayer;
    const method = methodEntry.method;
    if (!bootEntryOpen || !layer || !method || !methodEntry.panelReady) return;
    let settledFrames = 0;
    let frame = requestAnimationFrame(function check() {
      settledFrames = isEntryLayerSettled(layer, method)
        ? settledFrames + 1
        : 0;
      if (settledFrames >= 2) {
        bootProfiler.milestone("create:boot-entry-drawn", { method });
        finishBootEntry();
        return;
      }
      frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  });

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
  const releasedCreateMethods = $derived.by(() => {
    // Establish the same reactive flag dependency as the navigation surfaces.
    void featureFlagState.flagsVersion;
    return CREATE_TABS.filter(
      (tab) =>
        tab.metadata?.isCreationMethod === true &&
        featureFlagService.canAccessTab("create", tab.id)
    );
  });
  const lastUsedCreateMode = $derived(
    navigationState.hasRememberedCreateMode
      ? navigationState.currentCreateMode
      : null
  );

  // LOOP completion state
  let showLoopConfirm = $state(false);
  let pendingLoopType = $state<LOOPType | null>(null);
  let isApplyingLoop = $state(false);
  let pendingLoopStepCount = $state(0);
  const pendingLoopComponentName = $derived(loopTypeLabel(pendingLoopType));
  let isMobile = $state(false);
  let sequenceToTransfer: PictographData[] | null = $state(null);
  let toolPanelElement: HTMLElement | null = $state(null);
  let toolPanelRef: IToolPanelMethods | null = $state(null);
  let buttonPanelElement: HTMLElement | null = $state(null);
  let effectCleanup: (() => void) | null = null;
  let panelPersistenceCleanup: (() => void) | undefined = undefined;
  let panelHeightTrackerCleanup: PanelHeightTrackerCleanup | null = null;
  let currentDisplayWord = $state<string>(""); // Current word with contextual messages
  let currentLetterSources = $state<LetterSource[] | null>(null); // Letter sources for spell tab styling
  let isInputMode = $state(false); // Input mode - collapse workspace when word input is focused on mobile
  const canShowSaveToLibraryPanel = $derived.by(
    () =>
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

  // The sequence's join, for the right-click menus of the step cells and the
  // animation canvas. Changing it is an undoable sequence edit.
  setGridJoinContext(
    createGridJoinController({
      get: () =>
        sequenceGridJoin(CreateModuleState?.sequenceState.currentSequence),
      apply: (join) => {
        if (!CreateModuleState?.sequenceState.currentSequence) return;
        CreateModuleState.pushUndoSnapshot(UndoOperationType.SET_GRID_JOIN);
        CreateModuleState.sequenceState.setGridJoin(join);
      },
      gridMode: () =>
        CreateModuleState?.sequenceState.currentSequence?.gridMode,
    })
  );

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
    methodEntry,
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

    const startPlacement =
      constructTabState.sequenceState.selectedStartPlacement;

    constructTabState.setSelectedStartPlacement(startPlacement);
    if (startPlacement) {
      constructTabState.startPlacementStateService.setSelectedPlacement(
        startPlacement
      );
    } else {
      constructTabState.startPlacementStateService.clearSelectedPlacement();
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
    const flushDraft = () => {
      if (document.visibilityState === "hidden") draftRecovery?.flushPending();
    };
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!draftRecovery?.hasUnsavedChanges) return;
      draftRecovery.flushPending();
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", flushDraft);
    window.addEventListener("beforeunload", warnBeforeLeaving);

    // Hydrate the prop-unlock collection on entry so the redemption badge and
    // celebration reflect the user's pending picks immediately.
    void getPropUnlockManager().load();

    // Run async initialization in an IIFE
    (async () => {
      // Track if a deep link was processed (declared once for entire async scope)
      let hasDeepLink = false;

      try {
        const draftUrl = new URL(window.location.href);
        const requestedDraft = draftUrl.searchParams.get("draft");
        const requestedMode = draftMode(navigationState.activeTab);
        if (requestedDraft && requestedMode) {
          await getSequencePersister()
            .prepareDraftResume(requestedMode, requestedDraft)
            .catch(() => {
              // The recovery dialog reports storage failures after the editor
              // mounts, so a failed preload must not prevent editing.
            });
        }
        const initStart = performance.now();
        const { getCreateModuleInitializer } = await bootProfiler.measureAsync(
          "create:initializer-import",
          () =>
            import("#lib/features/create/shared/get-create-module-initializer.js")
        );
        const initService = getCreateModuleInitializer();
        getSequencePersister().setHistoryAdapter({
          capture: (mode) => undoManager.captureDraftHistory(mode),
          restore: (mode, sessionId, history) =>
            undoManager.restoreDraftHistory(mode, sessionId, history),
        });

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
          StartPlacementManager: result.StartPlacementManager,
          CreateModuleOrchestrator: result.CreateModuleOrchestrator,
          layoutService: result.layoutService,
          NavigationSyncer: result.NavigationSyncer,
          StepOperator: result.StepOperator,
          shareService: result.shareService,
        };

        CreateModuleState = result.CreateModuleState;
        constructTabState = result.constructTabState;
        draftRecovery = createDraftRecoveryController({
          persister: result.SequencePersister,
          getActiveMode: () => navigationState.activeTab as BuildModeId,
          getSequenceState: (mode) =>
            CreateModuleState!.getSequenceStateForTab(mode),
          onRestored: (mode) => {
            if (mode === "construct") syncConstructWorkspaceUi();
          },
          openDrafts: () => void goto("/browse/you/drafts"),
        });

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
          beginUndoSnapshot: (type, sourceState) =>
            CreateModuleState?.beginUndoSnapshotForSequenceState(
              type,
              sourceState
            ) ?? (() => {}),
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
          removeStep: (stepIndex) =>
            handlers?.handleRemoveStep(stepIndex, CreateModuleState),
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
              (sequence, mode) =>
                CreateModuleState!
                  .getSequenceStateForTab(
                    mode ?? (navigationState.activeTab as BuildModeId)
                  )
                  .setCurrentSequence(sequence),
              (skipRestore) =>
                CreateModuleState!.initializeWithPersistence(skipRestore)
            )
        );

        if (loadResult.sequenceLoaded) {
          // Navigate to target tab if specified (deep link only)
          if (loadResult.targetTab) {
            navigationState.setActiveTab(loadResult.targetTab);
          }

          // A deep-linked sequence already carries its start placement. Bring
          // Construct's picker state into line with that sequence immediately,
          // otherwise the workspace asks for a start placement the user has
          // already chosen and hides the available next pictographs.
          syncConstructWorkspaceUi();

          hasDeepLink = true;
        }

        if (requestedDraft && requestedMode) {
          hasDeepLink = true;
          await draftRecovery.resume(requestedMode, requestedDraft);
          // A reload should restore the resumed editor, not reopen an old version.
          draftUrl.searchParams.delete("draft");
          replaceState(draftUrl, {});
        }
        resolvingDraftRequest = false;

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

        // Detect if we're on mobile for responsive dialog rendering
        checkIsMobile = () => {
          isMobile = window.innerWidth < 768;
        };
        checkIsMobile();
        window.addEventListener("resize", checkIsMobile);
        finishActivation();
      } catch (err) {
        resolvingDraftRequest = false;
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
      document.removeEventListener("visibilitychange", flushDraft);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
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
      draftRecovery?.flushPending();
      draftRecovery?.dispose();
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
  // Refusals return false synchronously so the option picker stays on the step
  // it is showing instead of loading options for a step that was never added.
  const handleOptionSelected: OptionSelectedHandler = (option) => {
    if (panelState.workspacePlayback) return false;
    if (!handlers) {
      error = "Handlers service not initialized";
      return false;
    }

    // Enforce the step cap before adding a new step to the sequence. Every
    // tier shares the 64 ceiling, a hard engine limit, so the refusal is a
    // neutral note with no account ask.
    const currentSteps =
      CreateModuleState?.sequenceState.getCurrentSteps().length ?? 0;
    const maxSteps = getMaxSteps(accessTier);
    if (currentSteps >= maxSteps) {
      toast.info(`Sequences are capped at ${maxSteps} steps.`, 4000);
      return false;
    }

    return addOption(handlers, option);
  };

  async function addOption(
    handlers: CreateModuleHandlers,
    option: PictographData
  ): Promise<void> {
    try {
      await handlers.handleOptionSelected(option);
      if (!appEntryState.isCreateTutorial()) {
        accountSetupState?.requestReminder();
      }
    } catch (err) {
      error =
        err instanceof Error ? err.message : t("create_audit_select_error");
    }
  }

  function clearError() {
    error = null;
  }

  function handleCreateMethodSelected(methodId: string): void {
    beginMethodEntry(methodId);
    handleSectionChange(methodId);
  }

  function handleOpenSequenceViewer() {
    panelState.openSequenceViewer();
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
      error =
        err instanceof Error ? err.message : t("create_audit_clear_error");
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
      await import("#lib/features/create/shared/get-extension-flow-coordinator.js");
    const extensionFlowCoordinator = getExtensionFlowCoordinator();
    if (!extensionFlowCoordinator) return;

    const activeSeqState = CreateModuleState.getActiveTabSequenceState();
    const sequence = activeSeqState?.currentSequence;
    if (!sequence) return;

    const result = await extensionFlowCoordinator.startFlow(sequence);
    if (!result.canExtend || !result.analysis) {
      toast.warning(t("create_audit_loop_error"));
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
      await import("#lib/features/create/shared/get-extension-flow-coordinator.js");
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
        selectedStartPlacement: sequence.steps[0] || null,
        hasStartPlacement: sequence.steps.length > 0,
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
    const toolElement = toolPanelElement;
    const buttonElement = buttonPanelElement;

    // Creating the tracker immediately reads geometry and publishes panel
    // state. Only element replacement should re-run this owner; subscribing
    // its setup effect to those published values creates a feedback loop when
    // the first workspace mounts.
    untrack(() => {
      // Clean up previous tracker if it exists. One that still has the tool
      // panel is replaced, not removed, so the page keeps its metrics.
      if (panelHeightTrackerCleanup) {
        panelHeightTrackerCleanup({ keepMetrics: toolElement !== null });
        panelHeightTrackerCleanup = null;
      }

      // Only set up tracker if at least one element is available
      if (toolElement || buttonElement) {
        panelHeightTrackerCleanup = createPanelHeightTracker({
          toolPanelElement: toolElement,
          buttonPanelElement: buttonElement,
          panelState,
          // Playback owns the workspace while the tools collapse. Keeping their
          // viewport metrics current during that motion invalidates every overlay
          // for a panel the user cannot see.
          isToolPanelVisible: () => !panelState.workspacePlayback,
        });
      }
    });
  });

  // The save view only makes sense over a saveable sequence; leave it when
  // the sequence goes (Clear, undo past the first step, a tab with nothing).
  $effect(() => {
    if (
      CreateModuleState?.isPersistenceInitialized === true &&
      !canShowSaveToLibraryPanel &&
      panelState.isSaveToLibraryPanelOpen
    ) {
      panelState.closeSaveToLibraryPanel();
    }
  });
</script>

{#snippet frontDoorSurface()}
  <CreateFrontDoor
    methods={releasedCreateMethods}
    active={navigationState.isCreateFrontDoorOpen}
    source={navigationState.createFrontDoorSource}
    lastUsedMode={lastUsedCreateMode}
    enteringMethodId={entryTrace?.method ?? null}
    onWarm={warmCreateMethod}
    onSelect={handleCreateMethodSelected}
  />
{/snippet}

{#snippet workspaceSurface()}
  <div class="create-workspace-source" bind:this={entryLayer}>
    {#if draftRecovery}
      <DraftRecovery controller={draftRecovery} surface="status" />
    {/if}
    <div class="create-workspace-body">
      {#if error}
        <ErrorBanner message={error} onDismiss={clearError} />
      {:else if CreateModuleState && constructTabState && services}
        <div class="create-tab">
          {#if WorkspaceLayout && workspaceWanted}
            <WorkspaceLayout
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
              onViewSequence={handleOpenSequenceViewer}
              onOptionSelected={handleOptionSelected}
              onOpenFilters={handleOpenFilterPanel}
              onCloseFilters={() => {
                panelState.closeFilterPanel();
              }}
            />
          {:else if workspaceLayoutError}
            <!-- A failed import stays in the browser's module map until reload. -->
            <ErrorBanner
              message={workspaceLayoutError}
              onRetry={() => window.location.reload()}
              onDismiss={() => navigationState.openCreateFrontDoor()}
            />
          {:else}
            <div class="create-tab create-loading">
              <IndeterminateBar height={3} position="top" />
            </div>
          {/if}
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

        <!-- LOOP Coordinator -->
        <LOOPCoordinator />

        <!-- Start/End Options Coordinator -->
        <StartEndCoordinator />

        <!-- Save to Library and the step editor are modes of the workspace
             layout (the tool panel becomes SaveToLibraryView or the step
             editor; see CreationToolPanelSlot), not drawers mounted here. -->

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
          title={t("create_ui_clear_sequence")}
          message={t("create_audit_clear_message")}
          confirmText={t("create_audit_clear_all")}
          cancelText={t("create_audit_keep")}
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
          title="{t('create_audit_apply')} {pendingLoopComponentName} LOOP?"
          message={t("create_audit_loop_steps", {
            count: pendingLoopStepCount,
          })}
          confirmText={t("create_audit_apply")}
          cancelText={t("create_audit_cancel")}
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
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<div class="create-module-stage">
  <DualSourceCrossfade
    active={crossfadeActive}
    first={frontDoorSurface}
    second={workspaceSurface}
    duration={DURATION.emphasis}
    onsettled={handleWorkspaceSettled}
  />
</div>

{#if draftRecovery}
  <DraftRecovery controller={draftRecovery} surface="dialog" />
{/if}

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
    transition: background-color var(--duration-normal) var(--ease-standard-out);
  }

  .create-loading {
    align-items: center;
    justify-content: center;
  }
</style>
